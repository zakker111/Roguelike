/**
 * World: simple overworld with towns and dungeon entrances.
 *
 * Exports (window.World):
 * - TILES: { WATER, GRASS, FOREST, MOUNTAIN, TOWN, DUNGEON }
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
  };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function isWalkable(tile) {
    // Non-walkable: water and steep mountains
    return tile !== TILES.WATER && tile !== TILES.MOUNTAIN;
  }

  function generate(ctx, opts = {}) {
    const rng = (ctx && typeof ctx.rng === "function") ? ctx.rng : Math.random;
    const width = clamp((opts.width | 0) || 64, 24, 256);
    const height = clamp((opts.height | 0) || 64, 24, 256);
    const map = Array.from({ length: height }, () => Array(width).fill(TILES.GRASS));

    // Scatter noise: water blobs, forests, mountains
    const blobs = Math.floor((width * height) / 400);
    function scatter(kind, count, radius) {
      for (let i = 0; i < count; i++) {
        const cx = (rng() * width) | 0;
        const cy = (rng() * height) | 0;
        const r = radius + (rng() * radius);
        for (let y = Math.max(0, cy - r | 0); y < Math.min(height, cy + r | 0); y++) {
          for (let x = Math.max(0, cx - r | 0); x < Math.min(width, cx + r | 0); x++) {
            const dx = x - cx, dy = y - cy;
            if (dx * dx + dy * dy <= r * r && rng() < 0.7) {
              map[y][x] = kind;
            }
          }
        }
      }
    }

    scatter(TILES.WATER, Math.max(2, blobs | 0), 5);
    scatter(TILES.FOREST, Math.max(3, blobs * 2 | 0), 4);
    scatter(TILES.MOUNTAIN, Math.max(2, blobs | 0), 3);

    // Carve a few towns on grass near edges or center-ish
    const towns = [];
    const dungeons = [];
    const wantTowns = 4 + ((rng() * 3) | 0);
    const wantDungeons = 6 + ((rng() * 4) | 0);

    function placeWithPredicate(n, predicate, write) {
      let placed = 0, attempts = 0, maxAttempts = n * 200;
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