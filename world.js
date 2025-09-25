/**
 * World: simple overworld with towns and dungeon entrances.
 *
 * Exports (window.World):
 * - TILES: { WATER, GRASS, FOREST, MOUNTAIN, TOWN, DUNGEON, SWAMP, RIVER }
 * - generate(ctx, opts?): returns { map, width, height, towns:[{x,y}], dungeons:[{x,y}] }
 * - isWalkable(tile): returns boolean
 * - pickTownStart(world, rng): returns a {x,y} start at/near a town
 */
(function () {
  const TILES = {
    WATER: 0,
    GRASS: 1,
    FOREST: 2,
    MOUNTAIN: 3,
    TOWN: 4,
    DUNGEON: 5,
    SWAMP: 6,
    RIVER: 7,
  };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function isWalkable(tile) {
    // Non-walkable: deep water, steep mountains
    if (tile === TILES.WATER || tile === TILES.MOUNTAIN) return false;
    // Swamp and river are walkable for now (could be slowed later)
    return true;
  }

  function inBounds(x, y, w, h) {
    return x >= 0 && y >= 0 && x < w && y < h;
  }

  function generate(ctx, opts = {}) {
    const rng = (ctx && typeof ctx.rng === "function") ? ctx.rng : Math.random;
    const width = clamp((opts.width | 0) || 96, 32, 512);
    const height = clamp((opts.height | 0) || 96, 32, 512);
    const map = Array.from({ length: height }, () => Array(width).fill(TILES.GRASS));

    // Scatter noise: lakes, forests, mountains
    const blobs = Math.floor((width * height) / 450);
    function scatter(kind, count, radius) {
      for (let i = 0; i < count; i++) {
        const cx = (rng() * width) | 0;
        const cy = (rng() * height) | 0;
        const r = (radius | 0) + ((rng() * radius) | 0);
        for (let y = Math.max(0, (cy - r) | 0); y < Math.min(height, (cy + r) | 0); y++) {
          for (let x = Math.max(0, (cx - r) | 0); x < Math.min(width, (cx + r) | 0); x++) {
            const dx = x - cx, dy = y - cy;
            if (dx * dx + dy * dy <= r * r && rng() < 0.7) {
              map[y][x] = kind;
            }
          }
        }
      }
    }

    scatter(TILES.WATER, Math.max(3, blobs | 0), 6);
    scatter(TILES.FOREST, Math.max(4, (blobs * 2) | 0), 5);
    scatter(TILES.MOUNTAIN, Math.max(3, blobs | 0), 4);

    // Extra small forest patches for individual trees feel
    scatter(TILES.FOREST, Math.max(6, (blobs * 2) | 0), 2);

    // Carve rivers: meandering paths from one edge to another
    const riverCount = 2 + ((rng() * 3) | 0);
    for (let r = 0; r < riverCount; r++) {
      // pick start at a random edge
      let x, y, dir;
      const edge = (rng() * 4) | 0;
      if (edge === 0) { x = 0; y = (rng() * height) | 0; dir = { dx: 1, dy: 0 }; }
      else if (edge === 1) { x = width - 1; y = (rng() * height) | 0; dir = { dx: -1, dy: 0 }; }
      else if (edge === 2) { x = (rng() * width) | 0; y = 0; dir = { dx: 0, dy: 1 }; }
      else { x = (rng() * width) | 0; y = height - 1; dir = { dx: 0, dy: -1 }; }

      let steps = (width + height) * 2;
      let meander = 0;
      while (steps-- > 0 && inBounds(x, y, width, height)) {
        // carve river tile and slight banks
        map[y][x] = TILES.RIVER;
        if (rng() < 0.35) {
          if (inBounds(x + 1, y, width, height)) map[y][x + 1] = TILES.RIVER;
          if (inBounds(x - 1, y, width, height)) map[y][x - 1] = TILES.RIVER;
        }

        // meander turn
        if (rng() < 0.18 || meander > 6) {
          meander = 0;
          if (dir.dx !== 0) dir = { dx: 0, dy: rng() < 0.5 ? 1 : -1 };
          else dir = { dx: rng() < 0.5 ? 1 : -1, dy: 0 };
        } else {
          meander++;
        }

        // bias slightly toward map center to avoid hugging edges forever
        const cx = width / 2, cy = height / 2;
        if (rng() < 0.15) {
          dir.dx += Math.sign(cx - x) * (rng() < 0.5 ? 1 : 0);
          dir.dy += Math.sign(cy - y) * (rng() < 0.5 ? 1 : 0);
          dir.dx = Math.max(-1, Math.min(1, dir.dx | 0));
          dir.dy = Math.max(-1, Math.min(1, dir.dy | 0));
          if (dir.dx === 0 && dir.dy === 0) dir.dx = 1;
        }

        x += dir.dx;
        y += dir.dy;
      }
    }

    // Swamps: grass tiles adjacent to water/river become swamp with some chance
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (map[y][x] !== TILES.GRASS) continue;
        let nearWet = false;
        for (let dy = -1; dy <= 1 && !nearWet; dy++) {
          for (let dx = -1; dx <= 1 && !nearWet; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx, ny = y + dy;
            if (!inBounds(nx, ny, width, height)) continue;
            const t = map[ny][nx];
            if (t === TILES.WATER || t === TILES.RIVER) nearWet = true;
          }
        }
        if (nearWet && rng() < 0.35) {
          map[y][x] = TILES.SWAMP;
        }
      }
    }

    // Carve a few towns on grass near edges or center-ish
    const towns = [];
    const dungeons = [];
    const wantTowns = 6 + ((rng() * 4) | 0);
    const wantDungeons = 8 + ((rng() * 4) | 0);

    function placeWithPredicate(n, predicate, write) {
      let placed = 0, attempts = 0, maxAttempts = n * 300;
      while (placed < n && attempts++ < maxAttempts) {
        const x = (rng() * width) | 0;
        const y = (rng() * height) | 0;
        if (predicate(x, y)) {
          write(x, y);
          placed++;
        }
      }
    }

    placeWithPredicate(wantTowns,
      (x, y) => map[y][x] === TILES.GRASS,
      (x, y) => { map[y][x] = TILES.TOWN; towns.push({ x, y }); }
    );

    placeWithPredicate(wantDungeons,
      (x, y) => map[y][x] === TILES.FOREST || map[y][x] === TILES.GRASS,
      (x, y) => { map[y][x] = TILES.DUNGEON; dungeons.push({ x, y }); }
    );

    return { map, width, height, towns, dungeons };
  }

  function pickTownStart(world, rng) {
    const r = typeof rng === "function" ? rng : Math.random;
    if (world.towns && world.towns.length) {
      return world.towns[(r() * world.towns.length) | 0];
    }
    // fallback to first walkable tile
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        if (isWalkable(world.map[y][x])) return { x, y };
      }
    }
    return { x: 1, y: 1 };
  }

  window.World = { TILES, generate, isWalkable, pickTownStart };
})();