/*
Dungeon: rooms, corridors, player/exit placement, enemy spawns.

Exports (window.Dungeon):
- generateLevel(ctx, depth): mutates ctx.map/seen/visible/enemies/corpses/startRoomRect and positions player.
*/
(function () {
  function generateLevel(ctx, depth) {
    const { ROWS, COLS, MAP_ROWS, MAP_COLS, TILES, player } = ctx;
    const rRows = (typeof MAP_ROWS === "number" && MAP_ROWS > 0) ? MAP_ROWS : ROWS;
    const rCols = (typeof MAP_COLS === "number" && MAP_COLS > 0) ? MAP_COLS : COLS;

    // Init arrays/state
    ctx.map = Array.from({ length: rRows }, () => Array(rCols).fill(TILES.WALL));
    ctx.seen = Array.from({ length: rRows }, () => Array(rCols).fill(false));
    ctx.visible = Array.from({ length: rRows }, () => Array(rCols).fill(false));
    ctx.enemies = [];
    ctx.corpses = [];
    ctx.isDead = false;

    
    const rooms = [];
    const roomAttempts = 80;
    for (let i = 0; i < roomAttempts; i++) {
      const w = ctx.randInt(4, 9);
      const h = ctx.randInt(3, 7);
      const x = ctx.randInt(1, rCols - w - 2);
      const y = ctx.randInt(1, rRows - h - 2);
      const rect = { x, y, w, h };
      if (rooms.every(r => !intersect(rect, r))) {
        rooms.push(rect);
        carveRoom(ctx.map, TILES, rect);
      }
    }
    
    if (rooms.length === 0) {
      const w = Math.min(9, Math.max(4, Math.floor(rCols / 5) || 6));
      const h = Math.min(7, Math.max(3, Math.floor(rRows / 5) || 4));
      const x = Math.max(1, Math.min(rCols - w - 2, Math.floor(rCols / 2 - w / 2)));
      const y = Math.max(1, Math.min(rRows - h - 2, Math.floor(rRows / 2 - h / 2)));
      const rect = { x, y, w, h };
      rooms.push(rect);
      carveRoom(ctx.map, TILES, rect);
    }
    rooms.sort((a, b) => a.x - b.x);

    
    for (let i = 1; i < rooms.length; i++) {
      const a = center(rooms[i - 1]);
      const b = center(rooms[i]);
      if (ctx.chance(0.5)) {
        hCorridor(ctx.map, TILES, a.x, b.x, a.y);
        vCorridor(ctx.map, TILES, a.y, b.y, b.x);
      } else {
        vCorridor(ctx.map, TILES, a.y, b.y, a.x);
        hCorridor(ctx.map, TILES, a.x, b.x, b.y);
      }
    }

    
    const extra = Math.max(0, Math.floor(rooms.length * 0.3));
    for (let n = 0; n < extra; n++) {
      const i = ctx.randInt(0, rooms.length - 1);
      const j = ctx.randInt(0, rooms.length - 1);
      if (i === j) continue;
      const a = center(rooms[i]);
      const b = center(rooms[j]);
      if (ctx.chance(0.5)) {
        hCorridor(ctx.map, TILES, a.x, b.x, a.y);
        vCorridor(ctx.map, TILES, a.y, b.y, b.x);
      } else {
        vCorridor(ctx.map, TILES, a.y, b.y, a.x);
        hCorridor(ctx.map, TILES, a.x, b.x, b.y);
      }
    }

    
    const start = center(rooms[0] || { x: 2, y: 2, w: 1, h: 1 });
    ctx.startRoomRect = rooms[0] || { x: start.x, y: start.y, w: 1, h: 1 };

    
    if (depth === 1) {
      const PlayerMod = (ctx.Player || (typeof window !== "undefined" ? window.Player : null));
      if (PlayerMod && typeof PlayerMod.resetFromDefaults === "function") {
        PlayerMod.resetFromDefaults(ctx.player);
      } else if (PlayerMod && typeof PlayerMod.createInitial === "function") {
        const init = PlayerMod.createInitial();
        Object.assign(ctx.player, init);
      } else {
        Object.assign(ctx.player, {
          hp: 40, maxHp: 40, inventory: [], atk: 1, xp: 0, level: 1, xpNext: 20,
          equipment: { left: null, right: null, head: null, torso: null, legs: null, hands: null }
        });
      }
      ctx.player.x = start.x;
      ctx.player.y = start.y;

      
      const DI = (ctx.DungeonItems || (typeof window !== "undefined" ? window.DungeonItems : null));
      if (DI && typeof DI.placeChestInStartRoom === "function") {
        DI.placeChestInStartRoom(ctx);
      }
    } else {
      
      player.x = start.x;
      player.y = start.y;
    }

    
    let endRoomIndex = rooms.length - 1;
    if (rooms.length > 1 && ctx.startRoomRect) {
      const sc = center(ctx.startRoomRect);
      const endC = center(rooms[endRoomIndex]);
      if (inRect(endC.x, endC.y, ctx.startRoomRect)) {
        
        let best = endRoomIndex;
        let bestD = -1;
        for (let k = 0; k < rooms.length; k++) {
          const c = center(rooms[k]);
          if (inRect(c.x, c.y, ctx.startRoomRect)) continue;
          const d = Math.abs(c.x - sc.x) + Math.abs(c.y - sc.y);
          if (d > bestD) { bestD = d; best = k; }
        }
        endRoomIndex = best;
      }
    }
    const end = center(rooms[endRoomIndex] || { x: rCols - 3, y: rRows - 3, w: 1, h: 1 });
    const STAIRS = typeof TILES.STAIRS === "number" ? TILES.STAIRS : TILES.DOOR;
    ctx.map[end.y][end.x] = STAIRS;

    // Ensure at least one staircase exists as a safety net
    let stairsCount = 0;
    for (let yy = 1; yy < rRows - 1; yy++) {
      for (let xx = 1; xx < rCols - 1; xx++) {
        if (ctx.map[yy][xx] === STAIRS) stairsCount++;
      }
    }
    if (stairsCount === 0) {
      // Place fallback stairs far from the player and outside the start room when possible
      let best = null, bestD = -1;
      for (let yy = 1; yy < rRows - 1; yy++) {
        for (let xx = 1; xx < rCols - 1; xx++) {
          if (ctx.map[yy][xx] !== TILES.FLOOR) continue;
          if (ctx.startRoomRect && inRect(xx, yy, ctx.startRoomRect)) continue;
          const d = Math.abs(xx - ctx.player.x) + Math.abs(yy - ctx.player.y);
          if (d > bestD) { bestD = d; best = { x: xx, y: yy }; }
        }
      }
      if (!best) best = { x: Math.max(1, rCols - 2), y: Math.max(1, rRows - 2) };
      ctx.map[best.y][best.x] = STAIRS;
    }

    
    const enemyCount = 8 + Math.floor(depth * 1.5);
    const makeEnemy = ctx.enemyFactory || defaultEnemyFactory;
    for (let i = 0; i < enemyCount; i++) {
      const p = randomFloor(ctx, rooms);
      ctx.enemies.push(makeEnemy(p.x, p.y, depth, ctx.rng));
    }
  }

  function carveRoom(map, TILES, { x, y, w, h }) {
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        map[j][i] = TILES.FLOOR;
      }
    }
  }

  function hCorridor(map, TILES, x1, x2, y) {
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
      map[y][x] = TILES.FLOOR;
    }
  }

  function vCorridor(map, TILES, y1, y2, x) {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      map[y][x] = TILES.FLOOR;
    }
  }

  function intersect(a, b) {
    return !(
      a.x + a.w <= b.x ||
      b.x + b.w <= a.x ||
      a.y + a.h <= b.y ||
      b.y + b.h <= a.y
    );
  }

  function center(r) {
    return { x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) };
  }

  function inRect(x, y, r) {
    if (!r) return false;
    return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
  }

  function randomFloor(ctx, rooms) {
    const { MAP_COLS, MAP_ROWS, COLS, ROWS, TILES, player } = ctx;
    const rCols = (typeof MAP_COLS === "number" && MAP_COLS > 0) ? MAP_COLS : COLS;
    const rRows = (typeof MAP_ROWS === "number" && MAP_ROWS > 0) ? MAP_ROWS : ROWS;
    let x, y;
    let tries = 0;
    do {
      x = ctx.randInt(1, rCols - 2);
      y = ctx.randInt(1, rRows - 2);
      tries++;
      if (tries > 500) {
        // Scan for any suitable floor tile as a safe fallback
        for (let yy = 1; yy < rRows - 1; yy++) {
          for (let xx = 1; xx < rCols - 1; xx++) {
            if (!ctx.inBounds(xx, yy)) continue;
            if (ctx.map[yy][xx] !== TILES.FLOOR) continue;
            if ((xx === player.x && yy === player.y)) continue;
            if (ctx.startRoomRect && inRect(xx, yy, ctx.startRoomRect)) continue;
            if (ctx.enemies.some(e => e.x === xx && e.y === yy)) continue;
            return { x: xx, y: yy };
          }
        }
        // Last resort: try neighbors around the player (avoid player's tile)
        const neigh = [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1},{x:1,y:1},{x:1,y:-1},{x:-1,y:1},{x:-1,y:-1}];
        for (const d of neigh) {
          const xx = player.x + d.x, yy = player.y + d.y;
          if (!ctx.inBounds(xx, yy)) continue;
          if (ctx.map[yy][xx] !== TILES.FLOOR) continue;
          if (ctx.startRoomRect && inRect(xx, yy, ctx.startRoomRect)) continue;
          if (ctx.enemies.some(e => e.x === xx && e.y === yy)) continue;
          return { x: xx, y: yy };
        }
        // Final fallback: any floor tile that's not the player's tile
        for (let yy = 1; yy < rRows - 1; yy++) {
          for (let xx = 1; xx < rCols - 1; xx++) {
            if (!ctx.inBounds(xx, yy)) continue;
            if (ctx.map[yy][xx] !== TILES.FLOOR) continue;
            if ((xx === player.x && yy === player.y)) continue;
            return { x: xx, y: yy };
          }
        }
        // Give up: place one step to the right if in bounds
        return { x: Math.min(rCols - 2, Math.max(1, player.x + 1)), y: Math.min(rRows - 2, Math.max(1, player.y)) };
      }
    } while (!(ctx.inBounds(x, y) && ctx.map[y][x] === TILES.FLOOR) ||
             (x === player.x && y === player.y) ||
             (ctx.startRoomRect && inRect(x, y, ctx.startRoomRect)) ||
             ctx.enemies.some(e => e.x === x && e.y === y));
    return { x, y };
  }

  function defaultEnemyFactory(x, y, depth, rng) {
    const EM = (typeof window !== "undefined" ? window.Enemies : null);
    if (EM && typeof EM.createEnemyAt === "function") {
      return EM.createEnemyAt(x, y, depth, rng);
    }
    return { x, y, type: "goblin", glyph: "g", hp: 3, atk: 1, xp: 5, level: depth, announced: false };
  }

  window.Dungeon = { generateLevel };
})();