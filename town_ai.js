/**
 * TownAI: handles town NPC population and behavior.
 * Exports (window.TownAI):
 *  - populateTown(ctx): spawn shopkeepers, residents, pets, greeters
 *  - townNPCsAct(ctx): per-turn movement and routines
 *  - ensureTownSpawnClear(ctx): nudge player to nearest free tile when entering town
 *  - spawnGateGreeters(ctx, count): place greeters around town gate
 *  - talkNearbyNPC(ctx): have the closest adjacent NPC speak; returns true if someone talked
 *  - isFreeTownFloor(ctx, x, y): utility used by placement helpers
 */
(function () {
  // Processing configuration: control per-turn behavior to balance performance and movement
  let processing = { enabled: true, mode: "all", modulo: 1, maxPerTurn: Infinity };

  function randInt(ctx, a, b) { return Math.floor(ctx.rng() * (b - a + 1)) + a; }
  function manhattan(ax, ay, bx, by) { return Math.abs(ax - bx) + Math.abs(ay - by); }

  // ---- Schedules ----
  function inWindow(start, end, m, dayMinutes) {
    return (end > start) ? (m >= start && m < end) : (m >= start || m < end);
  }
  function isOpenAt(shop, minutes, dayMinutes) {
    if (!shop || typeof shop.openMin !== "number" || typeof shop.closeMin !== "number") return false;
    const o = shop.openMin, c = shop.closeMin;
    if (o === c) return false;
    return inWindow(o, c, minutes, dayMinutes);
  }

  // ---- Movement/pathing ----
  function isWalkTown(ctx, x, y) {
    const { map, TILES } = ctx;
    if (y < 0 || y >= map.length) return false;
    if (x < 0 || x >= (map[0] ? map[0].length : 0)) return false;
    const t = map[y][x];
    return t === TILES.FLOOR || t === TILES.DOOR;
  }

  function insideBuilding(b, x, y) {
    return x > b.x && x < b.x + b.w - 1 && y > b.y && y < b.y + b.h - 1;
  }

  function isFreeTile(ctx, x, y) {
    if (!isWalkTown(ctx, x, y)) return false;
    const { player, npcs, townProps } = ctx;
    if (player.x === x && player.y === y) return false;
    if (Array.isArray(npcs) && npcs.some(n => n.x === x && n.y === y)) return false;
    // Street props (benches, stalls, lamps, trees, signs, well, fountain) are blocking;
    // interior furniture is non-blocking for movement.
    const blockingTypes = new Set(["well","fountain","bench","lamp","stall","tree"]);
    if (Array.isArray(townProps) && townProps.some(p => p.x === x && p.y === y && blockingTypes.has(p.type))) return false;
    return true;
  }

  // Interior-only free check: ignores props and requires being inside the building
  function isFreeTileInterior(ctx, x, y, building) {
    if (!isWalkTown(ctx, x, y)) return false;
    if (!insideBuilding(building, x, y)) return false;
    const { player, npcs } = ctx;
    if (player.x === x && player.y === y) return false;
    if (Array.isArray(npcs) && npcs.some(n => n.x === x && n.y === y)) return false;
    return true;
  }

  function nearestFreeAdjacent(ctx, x, y, constrainToBuilding = null) {
    const dirs = [{dx:0,dy:0},{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1},{dx:1,dy:1},{dx:1,dy:-1},{dx:-1,dy:1},{dx:-1,dy:-1}];
    for (const d of dirs) {
      const nx = x + d.dx, ny = y + d.dy;
      if (constrainToBuilding && !insideBuilding(constrainToBuilding, nx, ny)) continue;
      if (isFreeTile(ctx, nx, ny)) return { x: nx, y: ny };
    }
    return null;
  }

  function stepTowards(ctx, occ, n, tx, ty) {
    if (typeof tx !== "number" || typeof ty !== "number") return false;
    const { map, player } = ctx;
    const rows = map.length, cols = map[0] ? map[0].length : 0;
    const inB = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;
    const start = { x: n.x, y: n.y };
    const goal = { x: tx, y: ty };

    const dirs4 = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
    const key = (x, y) => `${x},${y}`;
    const h = (x, y) => Math.abs(x - goal.x) + Math.abs(y - goal.y);

    // If direct adjacent to goal and free, take it immediately
    for (const d of dirs4) {
      const nx = n.x + d.dx, ny = n.y + d.dy;
      if (nx === goal.x && ny === goal.y && isWalkTown(ctx, nx, ny) && !occ.has(`${nx},${ny}`) && !(player.x === nx && player.y === ny)) {
        occ.delete(`${n.x},${n.y}`); n.x = nx; n.y = ny; occ.add(`${nx},${ny}`); return true;
      }
    }

    // A* search
    const MAX_NODES = 4000;
    const open = [{ x: start.x, y: start.y, g: 0, f: h(start.x, start.y) }];
    const cameFrom = new Map();
    const gScore = new Map();
    gScore.set(key(start.x, start.y), 0);
    const inOpen = new Set([key(start.x, start.y)]);
    const closed = new Set();

    let found = null;
    let nodes = 0;

    while (open.length && nodes < MAX_NODES) {
      nodes++;
      // Pick node with lowest f (simple linear scan)
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) bestIdx = i;
      }
      const current = open.splice(bestIdx, 1)[0];
      inOpen.delete(key(current.x, current.y));
      const ck = key(current.x, current.y);
      if (closed.has(ck)) continue;
      closed.add(ck);

      if (current.x === goal.x && current.y === goal.y) { found = current; break; }

      for (const d of dirs4) {
        const nx = current.x + d.dx, ny = current.y + d.dy;
        const nk = key(nx, ny);
        if (!inB(nx, ny)) continue;
        if (!isWalkTown(ctx, nx, ny)) continue;
        if (player.x === nx && player.y === ny) continue;
        // Allow stepping onto occupied goal, otherwise respect occ
        if (occ.has(nk) && !(nx === goal.x && ny === goal.y)) continue;

        const tentativeG = (gScore.get(ck) ?? Infinity) + 1;
        if (tentativeG >= (gScore.get(nk) ?? Infinity)) continue;

        cameFrom.set(nk, { x: current.x, y: current.y });
        gScore.set(nk, tentativeG);
        const f = tentativeG + h(nx, ny);

        // Prefer doors by slightly reducing heuristic near building borders
        let bias = 0;
        try {
          // If moving into a DOOR tile, reduce f to prioritize it
          if (map[ny][nx] === ctx.TILES.DOOR) bias = -0.2;
        } catch (_) {}
        const node = { x: nx, y: ny, g: tentativeG, f: f + bias };

        if (!inOpen.has(nk)) { open.push(node); inOpen.add(nk); }
      }
    }

    if (!found) {
      // Greedy fallback
      const dirs = dirs4.slice().sort((a, b) =>
        (Math.abs((n.x + a.dx) - tx) + Math.abs((n.y + a.dy) - ty)) -
        (Math.abs((n.x + b.dx) - tx) + Math.abs((n.y + b.dy) - ty))
      );
      for (const d of dirs) {
        const nx = n.x + d.dx, ny = n.y + d.dy;
        if (!isWalkTown(ctx, nx, ny)) continue;
        if (ctx.player.x === nx && ctx.player.y === ny) continue;
        if (occ.has(`${nx},${ny}`)) continue;
        occ.delete(`${n.x},${n.y}`); n.x = nx; n.y = ny; occ.add(`${nx},${ny}`); return true;
      }
      return false;
    }

    // Reconstruct first step from cameFrom
    let stepX = found.x, stepY = found.y;
    let prevKey = cameFrom.get(key(stepX, stepY));
    while (prevKey && !(prevKey.x === start.x && prevKey.y === start.y)) {
      stepX = prevKey.x; stepY = prevKey.y;
      prevKey = cameFrom.get(key(stepX, stepY));
    }

    if (isWalkTown(ctx, stepX, stepY) && !(ctx.player.x === stepX && ctx.player.y === stepY) && !occ.has(key(stepX, stepY))) {
      occ.delete(`${n.x},${n.y}`);
      n.x = stepX; n.y = stepY;
      occ.add(`${n.x},${n.y}`);
      return true;
    }
    return false;
  }

  // ---- Populate helpers ----
  function isFreeTownFloor(ctx, x, y) {
    const { map, TILES, player, npcs, townProps } = ctx;
    if (y < 0 || y >= map.length) return false;
    if (x < 0 || x >= (map[0] ? map[0].length : 0)) return false;
    if (map[y][x] !== TILES.FLOOR && map[y][x] !== TILES.DOOR) return false;
    if (x === player.x && y === player.y) return false;
    if (Array.isArray(npcs) && npcs.some(n => n.x === x && n.y === y)) return false;
    if (Array.isArray(townProps) && townProps.some(p => p.x === x && p.y === y)) return false;
    return true;
  }

  function randomInteriorSpot(ctx, b) {
    const { map, rng } = ctx;
    const spots = [];
    for (let y = b.y + 1; y < b.y + b.h - 1; y++) {
      for (let x = b.x + 1; x < b.x + b.w - 1; x++) {
        // Must be floor and inside building; ignore interior furniture (non-blocking)
        if (map[y][x] !== ctx.TILES.FLOOR) continue;
        if (!isFreeTileInterior(ctx, x, y, b)) continue;
        spots.push({ x, y });
      }
    }
    if (!spots.length) return null;
    return spots[Math.floor(rng() * spots.length)];
  }

  function addProp(ctx, x, y, type, name) {
    const { map, townProps, TILES } = ctx;
    if (x <= 0 || y <= 0 || y >= map.length - 1 || x >= (map[0] ? map[0].length : 0) - 1) return false;
    if (map[y][x] !== TILES.FLOOR) return false;
    if (townProps.some(p => p.x === x && p.y === y)) return false;
    townProps.push({ x, y, type, name });
    return true;
  }

  function addSignNear(ctx, x, y, text) {
    const dirs = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
    for (const d of dirs) {
      const sx = x + d.dx, sy = y + d.dy;
      if (addProp(ctx, sx, sy, "sign", text)) return true;
    }
    return false;
  }

  function bedsFor(ctx, building) {
    return (ctx.townProps || []).filter(p =>
      p.type === "bed" &&
      p.x > building.x && p.x < building.x + building.w - 1 &&
      p.y > building.y && p.y < building.y + building.h - 1
    );
  }

  // Ensure at least one bed exists inside the building; return a bed spot
  function ensureBedInBuilding(ctx, building) {
    let beds = bedsFor(ctx, building);
    if (beds.length > 0) {
      const b = beds[Math.floor(ctx.rng() * beds.length)];
      return { x: b.x, y: b.y };
    }
    // Create a bed on a free interior tile (ignore furniture; we only need a floor and interior)
    const spot = randomInteriorSpot(ctx, building);
    if (spot && addProp(ctx, spot.x, spot.y, "bed", "Bed")) {
      return { x: spot.x, y: spot.y };
    }
    // Fallback: try neighbors inside building border
    const door = building.door || { x: building.x + ((building.w / 2) | 0), y: building.y };
    const adj = [{dx:0,dy:1},{dx:0,dy:-1},{dx:1,dy:0},{dx:-1,dy:0}];
    for (const d of adj) {
      const x = door.x + d.dx, y = door.y + d.dy;
      if (isFreeTileInterior(ctx, x, y, building) && addProp(ctx, x, y, "bed", "Bed")) {
        return { x, y };
      }
    }
    // As last resort, return center interior tile (may overlap furniture visually but is non-blocking for movement)
    const cx = Math.max(building.x + 1, Math.min(building.x + building.w - 2, (building.x + (building.w / 2)) | 0));
    const cy = Math.max(building.y + 1, Math.min(building.y + building.h - 2, (building.y + (building.h / 2)) | 0));
    if (addProp(ctx, cx, cy, "bed", "Bed")) return { x: cx, y: cy };
    return { x: cx, y: cy };
  }

  // After population, make sure each resident has a unique bed in their building.
  function ensureBedsForResidents(ctx) {
    const byBuilding = new Map();
    for (const n of ctx.npcs) {
      if (!n.isResident || !n._home || !n._home.building) continue;
      const b = n._home.building;
      const key = `${b.x},${b.y},${b.w},${b.h}`;
      if (!byBuilding.has(key)) byBuilding.set(key, { building: b, residents: [], beds: bedsFor(ctx, b).map(p => ({ x: p.x, y: p.y })) });
      byBuilding.get(key).residents.push(n);
    }

    for (const [key, group] of byBuilding.entries()) {
      const { building, residents } = group;
      let bedList = group.beds;

      // Ensure enough beds (>= residents count)
      while (bedList.length < residents.length) {
        const spot = randomInteriorSpot(ctx, building);
        if (!spot) break;
        if (!ctx.townProps.some(p => p.x === spot.x && p.y === spot.y)) {
          if (addProp(ctx, spot.x, spot.y, "bed", "Bed")) {
            bedList.push({ x: spot.x, y: spot.y });
          }
        } else {
          // Try a neighbor inside
          const adj = [{dx:0,dy:1},{dx:0,dy:-1},{dx:1,dy:0},{dx:-1,dy:0}];
          for (const d of adj) {
            const x = spot.x + d.dx, y = spot.y + d.dy;
            if (isFreeTileInterior(ctx, x, y, building) && !ctx.townProps.some(p => p.x === x && p.y === y)) {
              if (addProp(ctx, x, y, "bed", "Bed")) { bedList.push({ x, y }); break; }
            }
          }
        }
        // Safety: avoid infinite loops
        if (bedList.length >= residents.length) break;
      }

      // Assign unique beds to residents
      const shuffledBeds = bedList.slice();
      for (let i = shuffledBeds.length - 1; i > 0; i--) {
        const j = Math.floor(ctx.rng() * (i + 1)); const t = shuffledBeds[i]; shuffledBeds[i] = shuffledBeds[j]; shuffledBeds[j] = t;
      }
      for (let i = 0; i < residents.length; i++) {
        const n = residents[i];
        const bed = shuffledBeds[i % shuffledBeds.length] || ensureBedInBuilding(ctx, building);
        n._home.bed = { x: bed.x, y: bed.y };
      }
    }
  }

  function populateTown(ctx) {
    const { shops, npcs, townBuildings, townPlaza, rng } = ctx;

    // Shopkeepers with homes and signs
    (function spawnShopkeepers() {
      if (!Array.isArray(shops) || shops.length === 0) return;
      const keeperLines = ["We open on schedule.","Welcome in!","Back soon."];
      for (const s of shops) {
        addSignNear(ctx, s.x, s.y, s.name || "Shop");
        // choose spawn near door
        let spot = { x: s.x, y: s.y };
        const neigh = [
          { dx: 0, dy: 0 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
          { dx: 1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 },
        ];
        for (const d of neigh) {
          const nx = s.x + d.dx, ny = s.y + d.dy;
          if (isFreeTownFloor(ctx, nx, ny)) { spot = { x: nx, y: ny }; break; }
        }
        if (npcs.some(n => n.x === spot.x && n.y === spot.y)) continue;

        const livesInShop = rng() < 0.4 && s.building;
        let home = null;
        if (livesInShop && s.building) {
          const h = randomInteriorSpot(ctx, s.building) || s.inside || { x: s.x, y: s.y };
          home = { building: s.building, x: h.x, y: h.y, door: { x: s.x, y: s.y } };
        } else if (Array.isArray(townBuildings) && townBuildings.length) {
          const b = townBuildings[randInt(ctx, 0, townBuildings.length - 1)];
          const pos = randomInteriorSpot(ctx, b) || { x: b.door.x, y: b.door.y };
          home = { building: b, x: pos.x, y: pos.y, door: { x: b.door.x, y: b.door.y } };
        }

        npcs.push({
          x: spot.x, y: spot.y,
          name: s.name ? `${s.name} Keeper` : "Shopkeeper",
          lines: keeperLines,
          isShopkeeper: true,
          _work: { x: s.x, y: s.y },
          _workInside: s.inside || { x: s.x, y: s.y },
          _shopRef: s,
          _home: home,
          _livesAtShop: !!livesInShop,
        });
      }
    })();

    // Residents (initial pass)
    (function spawnResidents() {
      if (!Array.isArray(townBuildings) || townBuildings.length === 0) return;
      // Increase initial coverage to make towns feel lively
      const targetFraction = 0.85;
      const shuffled = townBuildings.slice();
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1)); const t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
      }
      const pickCount = Math.min(shuffled.length, Math.max(6, Math.floor(shuffled.length * targetFraction)));
      const picked = shuffled.slice(0, pickCount);
      const remaining = shuffled.slice(pickCount);
      const linesHome = ["Home sweet home.","A quiet day indoors.","Just tidying up."];

      const benches = (ctx.townProps || []).filter(p => p.type === "bench");
      const pickBenchNearPlaza = () => {
        if (!benches.length) return null;
        const candidates = benches.slice().sort((a, b) =>
          manhattan(a.x, a.y, townPlaza.x, townPlaza.y) - manhattan(b.x, b.y, townPlaza.x, townPlaza.y));
        return candidates[0] || null;
      };
      const pickRandomShopDoor = () => {
        if (!shops || !shops.length) return null;
        const s = shops[randInt(ctx, 0, shops.length - 1)];
        return { x: s.x, y: s.y };
      };

      for (const b of picked) {
        const area = b.w * b.h;
        // More residents per larger building, up to 4, with a 50% chance of +1
        const residentCount = Math.max(1, Math.min(4, Math.floor(area / 24))) + (rng() < 0.5 ? 1 : 0);
        for (let i = 0; i < residentCount; i++) {
          const pos = randomInteriorSpot(ctx, b);
          if (!pos) continue;
          if (npcs.some(n => n.x === pos.x && n.y === pos.y)) continue;
          let errand = null;
          if (rng() < 0.5) {
            const pb = pickBenchNearPlaza();
            if (pb) errand = { x: pb.x, y: pb.y };
          } else {
            const sd = pickRandomShopDoor();
            if (sd) errand = sd;
          }
          // Ensure a bed exists and assign it
          const sleepSpot = ensureBedInBuilding(ctx, b);
          npcs.push({
            x: pos.x, y: pos.y,
            name: rng() < 0.25 ? `Child` : `Resident`,
            lines: linesHome,
            isResident: true,
            _homebound: rng() < 0.6, // increase fraction that prefer staying inside
            _homeToday: rng() < 0.25, // some choose to stay home today
            _home: { building: b, x: pos.x, y: pos.y, door: { x: b.door.x, y: b.door.y }, bed: sleepSpot },
            _work: errand,
          });
        }
      }

      // Remaining buildings: higher chance of at least one occupant
      for (const b of remaining) {
        if (rng() < 0.7) {
          const pos = randomInteriorSpot(ctx, b);
          if (!pos) continue;
          if (npcs.some(n => n.x === pos.x && n.y === pos.y)) continue;
          const sleepSpot = ensureBedInBuilding(ctx, b);
          npcs.push({
            x: pos.x, y: pos.y,
            name: `Resident`,
            lines: linesHome,
            isResident: true,
            _homebound: rng() < 0.6,
            _homeToday: rng() < 0.25,
            _home: { building: b, x: pos.x, y: pos.y, door: { x: b.door.x, y: b.door.y }, bed: sleepSpot },
            _work: (rng() < 0.5 && shops && shops.length) ? { x: shops[0].x, y: shops[0].y }
                  : (townPlaza ? { x: townPlaza.x, y: townPlaza.y } : null),
          });
        }
      }
    })();

    // Ensure occupancy: add at least one resident to every building
    (function ensureOccupantsPerBuilding() {
      if (!Array.isArray(townBuildings) || townBuildings.length === 0) return;
      const linesHome = ["Home sweet home.","A quiet day indoors.","Just tidying up."];
      function buildingKey(b) { return `${b.x},${b.y},${b.w},${b.h}`; }
      for (const b of townBuildings) {
        const key = buildingKey(b);
        const occupants = npcs.filter(n => n.isResident && n._home && n._home.building && buildingKey(n._home.building) === key);
        if (occupants.length === 0) {
          const pos = randomInteriorSpot(ctx, b) || { x: Math.max(b.x + 1, Math.min(b.x + b.w - 2, b.door.x)), y: Math.max(b.y + 1, Math.min(b.y + b.h - 2, b.door.y)) };
          if (!pos) continue;
          if (npcs.some(n => n.x === pos.x && n.y === pos.y)) continue;
          let errand = null;
          if (townPlaza && rng() < 0.5) errand = { x: townPlaza.x, y: townPlaza.y };
          else if (shops && shops.length) {
            const s = shops[randInt(ctx, 0, shops.length - 1)];
            errand = { x: s.x, y: s.y };
          }
          const bedSpot = ensureBedInBuilding(ctx, b);
          npcs.push({
            x: pos.x, y: pos.y,
            name: `Resident`,
            lines: linesHome,
            isResident: true,
            _homebound: true, // guaranteed occupant tends to stay inside
            _home: { building: b, x: pos.x, y: pos.y, door: { x: b.door.x, y: b.door.y }, bed: bedSpot },
            _work: errand,
          });
        } else {
          // For large buildings, ensure multiple occupants (and enough beds)
          const area = b.w * b.h;
          const target = Math.max(1, Math.min(4, Math.floor(area / 28)));
          while (occupants.length < target) {
            const pos2 = randomInteriorSpot(ctx, b);
            if (!pos2) break;
            if (npcs.some(n => n.x === pos2.x && n.y === pos2.y)) break;
            const bedSpot2 = ensureBedInBuilding(ctx, b);
            npcs.push({
              x: pos2.x, y: pos2.y,
              name: `Resident`,
              lines: linesHome,
              isResident: true,
              _homebound: rng() < 0.6,
              _home: { building: b, x: pos2.x, y: pos2.y, door: { x: b.door.x, y: b.door.y }, bed: bedSpot2 },
              _work: (townPlaza && rng() < 0.4) ? { x: townPlaza.x, y: townPlaza.y } : null,
            });
            occupants.push(true);
          }
        }
      }
    })();

    // Pets
    (function spawnPets() {
      const maxCats = 2, maxDogs = 2;
      const namesCat = ["Cat","Mittens","Whiskers"];
      const namesDog = ["Dog","Rover","Buddy"];
      function placeFree() {
        for (let t = 0; t < 200; t++) {
          const x = randInt(ctx, 2, ctx.map[0].length - 3);
          const y = randInt(ctx, 2, ctx.map.length - 3);
          if (isFreeTownFloor(ctx, x, y)) return { x, y };
        }
        return null;
      }
      for (let i = 0; i < maxCats; i++) {
        const spot = placeFree(); if (!spot) break;
        ctx.npcs.push({ x: spot.x, y: spot.y, name: namesCat[i % namesCat.length], lines: ["Meow."], isPet: true, kind: "cat" });
      }
      for (let i = 0; i < maxDogs; i++) {
        const spot = placeFree(); if (!spot) break;
        ctx.npcs.push({ x: spot.x, y: spot.y, name: namesDog[i % namesDog.length], lines: ["Woof."], isPet: true, kind: "dog" });
      }
    })();

    // Finalize: ensure unique beds assigned per resident
    ensureBedsForResidents(ctx);
  }

  function ensureHome(ctx, n) {
    if (n._home) return;
    const { townBuildings, shops, townPlaza } = ctx;
    if (!Array.isArray(townBuildings) || townBuildings.length === 0) return;
    const b = townBuildings[randInt(ctx, 0, townBuildings.length - 1)];
    const pos = randomInteriorSpot(ctx, b) || { x: b.door.x, y: b.door.y };
    n._home = { building: b, x: pos.x, y: pos.y, door: { x: b.door.x, y: b.door.y } };
    if (shops && shops.length && ctx.rng() < 0.6) {
      const s = shops[randInt(ctx, 0, shops.length - 1)];
      n._work = { x: s.x, y: s.y };
    } else if (townPlaza) {
      n._work = {
        x: Math.max(1, Math.min(ctx.map[0].length - 2, townPlaza.x + randInt(ctx, -2, 2))),
        y: Math.max(1, Math.min(ctx.map.length - 2, townPlaza.y + randInt(ctx, -2, 2))),
      };
    }
  }

  function townNPCsAct(ctx) {
    const { npcs, player, townProps } = ctx;
    if (!Array.isArray(npcs) || npcs.length === 0) return;
    if (!processing.enabled) return;

    const occ = new Set();
    occ.add(`${player.x},${player.y}`);
    for (const n of npcs) occ.add(`${n.x},${n.y}`);
    // Only street props block movement; interior furniture should not block.
    const blockingProps = new Set(["well","fountain","bench","lamp","stall","tree"]);
    if (Array.isArray(townProps)) {
      for (const p of townProps) {
        if (blockingProps.has(p.type)) occ.add(`${p.x},${p.y}`);
      }
    }

    // Night-time routing: build a relaxed occupancy that ignores other NPCs to let residents thread through crowds
    const occRelaxed = new Set();
    occRelaxed.add(`${player.x},${player.y}`);
    if (Array.isArray(townProps)) {
      for (const p of townProps) {
        if (blockingProps.has(p.type)) occRelaxed.add(`${p.x},${p.y}`);
      }
    }

    const t = ctx.time;
    const minutes = t ? (t.hours * 60 + t.minutes) : 12 * 60;
    const phase = (t && t.phase === "night") ? "evening"
                : (t && t.phase === "dawn") ? "morning"
                : (t && t.phase === "dusk") ? "evening"
                : "day";

    // Shuffle iteration and batch to avoid heavy CPU on large towns
    // Choose a subset of NPCs to process this turn, based on processing.mode
    const tick = ctx.townTick || 0;
    const order = npcs.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(ctx.rng() * (i + 1));
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    let selected = [];
    if (processing.mode === "all") {
      selected = order;
    } else if (processing.mode === "modulo") {
      const m = Math.max(1, processing.modulo | 0);
      selected = order.filter(i => (i % m) === (tick % m));
    } else if (processing.mode === "random") {
      const count = Math.min(order.length, isFinite(processing.maxPerTurn) ? processing.maxPerTurn : Math.ceil(order.length * 0.35));
      selected = order.slice(0, count);
    } else {
      selected = order;
    }
    const maxProcess = Math.min(selected.length, isFinite(processing.maxPerTurn) ? processing.maxPerTurn : selected.length);
    let processed = 0;

    // Snapshot positions for movement diagnostics
    const beforePos = new Map();
    for (const idx of selected) {
      const n = npcs[idx];
      beforePos.set(idx, { x: n.x, y: n.y });
    }

    function routeIntoBuilding(ctx, occ, n, building, targetInside) {
      // If outside the building, aim for the door first
      const insideNow = insideBuilding(building, n.x, n.y);
      if (!insideNow) {
        const door = building.door || nearestFreeAdjacent(ctx, building.x + ((building.w / 2) | 0), building.y, null);
        if (door) {
          // If on the door, step one tile inside using interior-aware free check
          if (n.x === door.x && n.y === door.y) {
            // Prefer targetInside if valid; else pick nearest interior free tile adjacent to door
            let inSpot = null;
            if (targetInside && isFreeTileInterior(ctx, targetInside.x, targetInside.y, building)) {
              inSpot = targetInside;
            } else {
              const adj = [{dx:0,dy:1},{dx:0,dy:-1},{dx:1,dy:0},{dx:-1,dy:0}];
              for (const d of adj) {
                const ix = door.x + d.dx, iy = door.y + d.dy;
                if (isFreeTileInterior(ctx, ix, iy, building)) { inSpot = { x: ix, y: iy }; break; }
              }
              if (!inSpot) {
                // fallback: nearestFreeAdjacent constrained to building interior
                inSpot = nearestFreeAdjacent(ctx, door.x, door.y, building);
              }
            }
            if (inSpot) {
              stepTowards(ctx, occ, n, inSpot.x, inSpot.y);
              return true;
            }
          }
          // Otherwise, move toward the door
          stepTowards(ctx, occ, n, door.x, door.y);
          return true;
        }
      } else {
        // Already inside: go to targetInside or nearest free interior tile
        let inSpot = null;
        if (targetInside && isFreeTileInterior(ctx, targetInside.x, targetInside.y, building)) {
          inSpot = targetInside;
        } else {
          inSpot = nearestFreeAdjacent(ctx, targetInside ? targetInside.x : n.x, targetInside ? targetInside.y : n.y, building);
        }
        if (inSpot) {
          stepTowards(ctx, occ, n, inSpot.x, inSpot.y);
          return true;
        }
      }
      return false;
    }

    // Helper: aggressively move resident home in evening/night with multiple steps per turn
    function forceHomeProgress(ctx, occSet, n, maxSteps = 5) {
      if (!(n._home && n._home.building)) return false;
      const sleepTarget = n._home.bed ? { x: n._home.bed.x, y: n._home.bed.y } : { x: n._home.x, y: n._home.y };
      for (let s = 0; s < maxSteps; s++) {
        if (n.x === sleepTarget.x && n.y === sleepTarget.y) { n._sleeping = true; return true; }
        // Step via door if outside; otherwise toward target
        if (!insideBuilding(n._home.building, n.x, n.y)) {
          if (!routeIntoBuilding(ctx, occSet, n, n._home.building, sleepTarget)) {
            // If routeIntoBuilding fails, try a straight step toward door or target
            const door = n._home.door || { x: n._home.building.x + ((n._home.building.w / 2) | 0), y: n._home.building.y };
            stepTowards(ctx, occSet, n, door.x, door.y);
          }
        } else {
          // Inside: use relaxed occupancy; if very close, try a final step aggressively
          const close = Math.abs(n.x - sleepTarget.x) + Math.abs(n.y - sleepTarget.y) <= 2;
          if (!stepTowards(ctx, occSet, n, sleepTarget.x, sleepTarget.y) && close) {
            // Try again ignoring other NPC occupancy by crafting a minimal occ that only blocks player and street props
            const occInsideRelaxed = new Set();
            occInsideRelaxed.add(`${ctx.player.x},${ctx.player.y}`);
            const blockingProps = new Set(["well","fountain","bench","lamp","stall","tree"]);
            for (const p of (ctx.townProps || [])) {
              if (blockingProps.has(p.type)) occInsideRelaxed.add(`${p.x},${p.y}`);
            }
            stepTowards(ctx, occInsideRelaxed, n, sleepTarget.x, sleepTarget.y);
          }
        }
      }
      return true;
    }

    for (const idx of selected) {
      if (processed++ >= maxProcess) break;
      const n = npcs[idx];
      ensureHome(ctx, n);

      // Pets: simple jiggle
      if (n.isPet) {
        if (ctx.rng() < 0.6) continue;
        stepTowards(ctx, occ, n, n.x + randInt(ctx, -1, 1), n.y + randInt(ctx, -1, 1));
        continue;
      }

      // Shopkeepers follow shop schedule
      if (n.isShopkeeper) {
        const shop = n._shopRef || null;
        const o = shop ? shop.openMin : 8 * 60;
        const c = shop ? shop.closeMin : 18 * 60;
        const arriveStart = (o - 60 + 1440) % 1440;
        const leaveEnd = (c + 30) % 1440;
        const shouldBeAtWorkZone = inWindow(arriveStart, leaveEnd, minutes, 1440);
        const openNow = isOpenAt(shop, minutes, 1440);

        let handled = false;
        if (shouldBeAtWorkZone) {
          if (openNow && n._workInside && shop && shop.building) {
            handled = routeIntoBuilding(ctx, occ, n, shop.building, n._workInside);
          } else if (n._work) {
            handled = stepTowards(ctx, occ, n, n._work.x, n._work.y);
          }
        } else if (n._home && n._home.building) {
          // Off hours: go home, via door then inside
          handled = forceHomeProgress(ctx, occRelaxed, n, 3);
        }
        if (handled) continue;
        if (ctx.rng() < 0.9) continue;
      }

      // Residents: homebound + sleep system
      if (n.isResident) {
        const hasHome = !!(n._home && n._home.building);
        const insideNow = hasHome ? insideBuilding(n._home.building, n.x, n.y) : false;

        // If sleeping, only wake in morning
        if (n._sleeping) {
          if (phase === "morning") n._sleeping = false;
          else continue;
        }

        if (hasHome && (phase === "evening" || phase === "night")) {
          forceHomeProgress(ctx, occRelaxed, n, 5);
          continue;
        } else if (phase === "day") {
          // Some residents choose to stay home today: route inside and idle
          if (n._homeToday && hasHome) {
            const homeTarget = n._home.bed ? { x: n._home.bed.x, y: n._home.bed.y } : { x: n._home.x, y: n._home.y };
            if (!insideNow) {
              if (routeIntoBuilding(ctx, occ, n, n._home.building, homeTarget)) continue;
            } else {
              if (ctx.rng() < 0.6) stepTowards(ctx, occ, n, homeTarget.x, homeTarget.y);
              continue;
            }
          }

          const target = n._work || (ctx.townPlaza ? { x: ctx.townPlaza.x, y: ctx.townPlaza.y } : null);
          const stayInside = n._homebound && hasHome && insideNow && ctx.rng() < 0.9;
          if (stayInside) {
            if (ctx.rng() < 0.4) stepTowards(ctx, occ, n, n._home.x, n._home.y);
            continue;
          }
          if (target) {
            if (n.x === target.x && n.y === target.y) {
              if (ctx.rng() < 0.85) continue;
              stepTowards(ctx, occ, n, n.x + randInt(ctx, -1, 1), n.y + randInt(ctx, -1, 1));
              continue;
            }
            stepTowards(ctx, occ, n, target.x, target.y);
            continue;
          }
        } else if (phase === "morning") {
          if (hasHome) {
            const homeTarget = { x: n._home.x, y: n._home.y };
            if (n._homebound && insideNow) {
              if (ctx.rng() < 0.4) stepTowards(ctx, occ, n, homeTarget.x, homeTarget.y);
              continue;
            }
            if (routeIntoBuilding(ctx, occ, n, n._home.building, homeTarget)) continue;
          }
        }

        // default small wander (prefer interior if homebound and inside)
        if (n._homebound && hasHome && insideNow) {
          const goal = { x: n._home.x, y: n._home.y };
          if (ctx.rng() < 0.5) stepTowards(ctx, occ, n, goal.x, goal.y);
          continue;
        }
        stepTowards(ctx, occ, n, n.x + randInt(ctx, -1, 1), n.y + randInt(ctx, -1, 1));
        continue;
      }

      // Generic NPCs
      if (ctx.rng() < 0.25) continue;
      let target = null;
      if (phase === "morning") target = n._home ? { x: n._home.x, y: n._home.y } : null;
      else if (phase === "day") target = (n._work || ctx.townPlaza);
      else {
        // evening/night: bias to home over tavern
        target = (n._home ? { x: n._home.x, y: n._home.y } : (ctx.tavern && n._likesTavern) ? { x: ctx.tavern.door.x, y: ctx.tavern.door.y } : null);
      }
      if (!target) {
        stepTowards(ctx, occ, n, n.x + randInt(ctx, -1, 1), n.y + randInt(ctx, -1, 1));
        continue;
      }
      stepTowards(ctx, (phase === "evening" || phase === "night") ? occRelaxed : occ, n, target.x, target.y);
    }

    // Movement diagnostics and fallback: ensure at least some visible motion
    let moved = 0;
    for (const idx of selected) {
      const prev = beforePos.get(idx);
      const cur = npcs[idx];
      if (!prev || !cur) continue;
      if (prev.x !== cur.x || prev.y !== cur.y) moved++;
    }
    // DEV log
    if (typeof window !== "undefined" && window.DEV && ctx && typeof ctx.log === "function") {
      try { ctx.log(`[TownAI] tick ${tick} phase=${phase}: moved ${moved}/${selected.length} npcs.`, "info"); } catch (_) {}
    }
    // Fallback: if nothing moved for this batch, nudge a small random subset to avoid apparent stalling
    if (moved === 0 && selected.length > 0) {
      const fallbackCount = Math.min(20, selected.length);
      for (let i = 0; i < fallbackCount; i++) {
        const idx = selected[i];
        const n = npcs[idx];
        // Prefer tiny jiggle within building if homebound and inside, else random small step
        const jig = (dx,dy) => stepTowards(ctx, occ, n, n.x + dx, n.y + dy);
        if (n.isResident && n._home && insideBuilding(n._home.building, n.x, n.y)) {
          jig(randInt(ctx, -1, 1), randInt(ctx, -1, 1));
        } else {
          jig(randInt(ctx, -1, 1), randInt(ctx, -1, 1));
        }
      }
    }
  }

  // Per-turn toggles and entry priming
  function setPerTurnEnabled(v) { processing.enabled = !!v; }
  function setProcessingMode(mode = "all", modulo = 3, maxPerTurn = Infinity) {
    processing.mode = mode;
    processing.modulo = modulo;
    processing.maxPerTurn = maxPerTurn;
  }

  function primeTownOnEntry(ctx, ticks = 8) {
    // Ensure homes exist
    for (const n of (ctx.npcs || [])) ensureHome(ctx, n);
    // Run a few act cycles to disperse crowds and settle initial positions
    const prev = { enabled: processing.enabled, mode: processing.mode, modulo: processing.modulo, maxPerTurn: processing.maxPerTurn };
    processing.enabled = true;
    processing.mode = "all";
    processing.maxPerTurn = Infinity;
    for (let i = 0; i < ticks; i++) {
      townNPCsAct(ctx);
      ctx.townTick = (ctx.townTick || 0) + 1;
    }
    processing.enabled = prev.enabled;
    processing.mode = prev.mode;
    processing.modulo = prev.modulo;
    processing.maxPerTurn = prev.maxPerTurn;
  }

  window.TownAI = {
    populateTown,
    townNPCsAct,
    ensureTownSpawnClear,
    spawnGateGreeters,
    talkNearbyNPC,
    isFreeTownFloor,
    selfCheck,
    setPerTurnEnabled,
    primeTownOnEntry,
    setProcessingMode,
  };
})();