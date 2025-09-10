/*
Dungeon generation: rooms, corridors, player/exit placement, and enemy spawns.

API:
- Dungeon.generateLevel(ctx, depth)
  Mutates ctx fields:
   - map, seen, visible, enemies, corpses, isDead, startRoomRect
   - player position and (on depth===1) resets player stats/equipment/inventory
   - places a staircase 'DOOR' tile in the last room
  ctx needs:
    ROWS, COLS, TILES
    player, enemies, corpses
    randInt(min,max), chance(p), rng()
    enemyFactory(x,y,depth) -> enemy (defaults to Enemies.createEnemyAt)
    log(), updateUI()
*/
(function () {
  function generateLevel(ctx, depth) {
    const { ROWS, COLS, TILES, player } = ctx;

    // Init arrays/state
    ctx.map = Array.from({ length: ROWS }, () => Array(COLS).fill(TILES.WALL));
    ctx.seen = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    ctx.visible = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    ctx.enemies = [];
    ctx.corpses = [];
    ctx.isDead = false;

    // Carve rooms
    const rooms = [];
    const roomAttempts = 80;
    for (let i = 0; i < roomAttempts; i++) {
      const w = ctx.randInt(4, 9);
      const h = ctx.randInt(3, 7);
      const x = ctx.randInt(1, COLS - w - 2);
      const y = ctx.randInt(1, ROWS - h - 2);
      const rect = { x, y, w, h };
      if (rooms.every(r => !intersect(rect, r))) {
        rooms.push(rect);
        carveRoom(ctx.map, TILES, rect);
      }
    }
    rooms.sort((a, b) => a.x - b.x);

    // Connect with corridors
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

    // Place player at first room center
    const start = center(rooms[0] || { x: 2, y: 2, w: 1, h: 1 });
    player.x = start.x;
    player.y = start.y;
    ctx.startRoomRect = rooms[0] || { x: start.x, y: start.y, w: 1, h: 1 };

    // Reset player at floor 1
    if (depth === 1) {
      player.maxHp = 15;
      player.hp = player.maxHp;
      player.inventory = [];
      player.atk = 1;
      player.xp = 0;
      player.level = 1;
      player.xpNext = 20;
      player.equipment = { weapon: null, offhand: null, head: null, torso: null, legs: null, hands: null };
    }

    // Place staircase (as DOOR) in last room
    const end = center(rooms[rooms.length - 1] || { x: COLS - 3, y: ROWS - 3, w: 1, h: 1 });
    ctx.map[end.y][end.x] = TILES.DOOR;

    // Spawn enemies
    const enemyCount = 8 + Math.floor(depth * 1.5);
    const makeEnemy = ctx.enemyFactory || defaultEnemyFactory;
    for (let i = 0; i < enemyCount; i++) {
      const p = randomFloor(ctx, rooms);
      ctx.enemies.push(makeEnemy(p.x, p.y, depth, ctx.rng));
    }

    if (ctx.recomputeFOV) ctx.recomputeFOV();
    if (ctx.updateUI) ctx.updateUI();
    if (ctx.log) ctx.log(`You descend to floor ${depth}.`);
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
    const { COLS, ROWS, TILES, player } = ctx;
    let x, y;
    do {
      x = ctx.randInt(1, COLS - 2);
      y = ctx.randInt(1, ROWS - 2);
    } while (!(ctx.inBounds(x, y) && ctx.map[y][x] === TILES.FLOOR) ||
             (x === player.x && y === player.y) ||
             (ctx.startRoomRect && inRect(x, y, ctx.startRoomRect)) ||
             ctx.enemies.some(e => e.x === x && e.y === y));
    return { x, y };
  }

  function defaultEnemyFactory(x, y, depth, rng) {
    if (window.Enemies && Enemies.createEnemyAt) {
      return Enemies.createEnemyAt(x, y, depth, rng);
    }
    return { x, y, type: "goblin", glyph: "g", hp: 3, atk: 1, xp: 5, level: depth, announced: false };
  }

  window.Dungeon = { generateLevel };
})();