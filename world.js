/**
 * World: expanded overworld with multiple biomes, rivers, towns, and dungeon entrances.
 *
 * Exports (window.World):
 * - TILES: { WATER, GRASS, FOREST, MOUNTAIN, TOWN, DUNGEON, SWAMP, RIVER, BEACH, DESERT, SNOW }
 * - generate(ctx, opts?): returns { map, width, height, towns:[{x,y}], dungeons:[{x,y}] }
 * - isWalkable(tile): returns boolean
 * - pickTownStart(world, rng): returns a {x,y} start at/near a town
 * - biomeName(tile): returns a human-readable biome string
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
    BEACH: 8,
    DESERT: 9,
    SNOW: 10,
  };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function isWalkable(tile) {
    // Non-walkable: deep water, rivers, steep mountains
    return tile !== TILES.WATER && tile !== TILES.RIVER && tile !== TILES.MOUNTAIN;
  }

  function inBounds(x, y, w, h) {
    return x >= 0 && y >= 0 && x < w && y < h;
  }

  function biomeName(tile) {
    switch (tile) {
      case TILES.WATER: return "Ocean/Lake";
      case TILES.RIVER: return "River";
      case TILES.BEACH: return "Beach";
      case TILES.SWAMP: return "Swamp";
      case TILES.FOREST: return "Forest";
      case TILES.MOUNTAIN: return "Mountain";
      case TILES.DESERT: return "Desert";
      case TILES.SNOW: return "Snow";
      case TILES.GRASS: return "Plains";
      case TILES.TOWN: return "Town";
      case TILES.DUNGEON: return "Dungeon";
      default: return "Unknown";
    }
  }

  function generate(ctx, opts = {}) {
    const rng = (ctx && typeof ctx.rng === "function") ? ctx.rng : Math.random;
    const width = clamp((opts.width | 0) || 120, 48, 512);
    const height = clamp((opts.height | 0) || 80, 48, 512);
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

    // Mountain ridges (simple random walks)
    const ridges = 2 + ((rng() * 3) | 0);
    for (let i = 0; i < ridges; i++) {
      let x = (rng() * width) | 0;
      let y = (rng() * height) | 0;
      let dx = rng() < 0.5 ? 1 : -1;
      let dy = rng() < 0.5 ? 1 : -1;
      let steps = 120 + ((rng() * 180) | 0);
      while (steps-- > 0 && inBounds(x, y, width, height)) {
        map[y][x] = TILES.MOUNTAIN;
        if (rng() < 0.4 && inBounds(x + 1, y, width, height)) map[y][x + 1] = TILES.MOUNTAIN;
        if (rng() < 0.4 && inBounds(x, y + 1, width, height)) map[y + 1][x] = TILES.MOUNTAIN;
        if (rng() < 0.08) dx = -dx;
        if (rng() < 0.08) dy = -dy;
        x += dx; y += dy;
      }
    }

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

    // Swamps and beaches near water/river
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const t = map[y][x];
        let nearWater = false;
        for (let dy = -1; dy <= 1 && !nearWater; dy++) {
          for (let dx = -1; dx <= 1 && !nearWater; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx, ny = y + dy;
            if (!inBounds(nx, ny, width, height)) continue;
            const n = map[ny][nx];
            if (n === TILES.WATER || n === TILES.RIVER) nearWater = true;
          }
        }
        if (t === TILES.GRASS && nearWater) {
          // Mix of swamp and beach along shores
          if (rng() < 0.35) map[y][x] = TILES.SWAMP;
          else if (rng() < 0.55) map[y][x] = TILES.BEACH;
        }
        if (t === TILES.FOREST && nearWater && rng() < 0.15) {
          map[y][x] = TILES.GRASS; // thin forests right at the shore
        }
      }
    }

    // Climate-based conversion to DESERT and SNOW on plains
    for (let y = 0; y < height; y++) {
      const temp = 1 - (y / (height - 1)); // top cold (1->0 reversed later)
      const temperature = 1 - temp; // top cold ~0, bottom hot ~1
      for (let x = 0; x < width; x++) {
        if (map[y][x] !== TILES.GRASS) continue;
        // moisture proxy: any water within radius 4
        let moist = 0;
        for (let ry = -4; ry <= 4; ry++) {
          for (let rx = -4; rx <= 4; rx++) {
            const nx = x + rx, ny = y + ry;
            if (!inBounds(nx, ny, width, height)) continue;
            const nt = map[ny][nx];
            if (nt === TILES.WATER || nt === TILES.RIVER || nt === TILES.SWAMP) { moist++; }
          }
        }
        const moisture = Math.min(1, moist / 40);
        if (temperature > 0.65 && moisture < 0.15 && rng() < 0.9) {
          map[y][x] = TILES.DESERT;
        } else if (temperature < 0.25 && moisture < 0.6 && rng() < 0.9) {
          map[y][x] = TILES.SNOW;
        }
      }
    }

    // Carve a few towns (prefer near water/river or beach)
    const towns = [];
    const dungeons = [];
    const wantTowns = 8 + ((rng() * 4) | 0);
    const wantDungeons = 10 + ((rng() * 6) | 0);

    function placeWithPredicate(n, predicate, write) {
      let placed = 0, attempts = 0, maxAttempts = n * 400;
      while (placed < n && attempts++ < maxAttempts) {
        const x = (rng() * width) | 0;
        const y = (rng() * height) | 0;
        if (predicate(x, y)) {
          write(x, y);
          placed++;
        }
      }
    }

    placeWithPredicate(
      wantTowns,
      (x, y) => {
        const t = map[y][x];
        if (t !== TILES.GRASS && t !== TILES.BEACH) return false;
        // prefer near water or river
        for (let dy = -5; dy <= 5; dy++) {
          for (let dx = -5; dx <= 5; dx++) {
            const nx = x + dx, ny = y + dy;
            if (!inBounds(nx, ny, width, height)) continue;
            const n = map[ny][nx];
            if (n === TILES.WATER || n === TILES.RIVER || n === TILES.BEACH) {
              return true;
            }
          }
        }
        return rng() < 0.08; // small chance elsewhere
      },
      (x, y) => { map[y][x] = TILES.TOWN; towns.push({ x, y }); }
    );

    placeWithPredicate(
      wantDungeons,
      (x, y) => {
        const t = map[y][x];
        if (t === TILES.FOREST || t === TILES.MOUNTAIN) return true;
        if (t === TILES.GRASS) return rng() < 0.05;
        return false;
      },
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

  window.World = { TILES, generate, isWalkable, pickTownStart, biomeName };
})();