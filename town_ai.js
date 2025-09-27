/**
 * TownAI: handles town NPC population and behavior.
 * Exports (window.TownAI):
 *  - populateTown(ctx): spawn shopkeepers, residents, pets, greeters
 *  - townNPCsAct(ctx): per-turn movement and routines
 */
(function () {
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
    if (Array.isArray(townProps) && townProps.some(p => p.x === x && p.y === y)) return false;
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

  // If the intended target tile is occupied by an interior prop (e.g., bed),
  // pick the nearest free interior tile adjacent to it within the same building.
  function adjustInteriorTarget(ctx, building, target) {
    if (!target || !building) return target;
    // If target is already free, keep it
    if (isFreeTile(ctx, target.x, target.y) && insideBuilding(building, target.x, target.y)) return target;
    const alt = nearestFreeAdjacent(ctx, target.x, target.y, building);
    return alt || target;
  }

  // Pre-planning A* used for path debug and stable routing
  function computePath(ctx, occ, sx, sy, tx, ty) {
    const { map, player } = ctx;
    const rows = map.length, cols = map[0] ? map[0].length : 0;
    const inB = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;
    const dirs4 = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
    const startKey = (x, y) => `${x},${y}`;
    const h = (x, y) => Math.abs(x - tx) + Math.abs(y - ty);

    const open = []; // min-heap substitute: small graphs, array+sort is fine
    const gScore = new Map();
    const fScore = new Map();
    const cameFrom = new Map();
    const startK = startKey(sx, sy);
    gScore.set(startK, 0);
    fScore.set(startK, h(sx, sy));
    open.push({ x: sx, y: sy, f: fScore.get(startK) });

    const MAX_VISITS = 4000;
    const visited = new Set();

    function pushOpen(x, y, f) {
      open.push({ x, y, f });
    }

    function popOpen() {
      open.sort((a, b) => a.f - b.f || h(a.x, a.y) - h(b.x, b.y));
      return open.shift();
    }

    let found = null;
    while (open.length && visited.size < MAX_VISITS) {
      const cur = popOpen();
      const ck = startKey(cur.x, cur.y);
      if (visited.has(ck)) continue;
      visited.add(ck);
      if (cur.x === tx && cur.y === ty) { found = cur; break; }

      for (const d of dirs4) {
        const nx = cur.x + d.dx, ny = cur.y + d.dy;
        if (!inB(nx, ny)) continue;
        if (!isWalkTown(ctx, nx, ny)) continue;
        if (player.x === nx && player.y === ny) continue;

        const nk = startKey(nx, ny);
        // Allow goal even if currently occupied; otherwise avoid occupied nodes
        if (occ.has(nk) && !(nx === tx && ny === ty)) continue;

        const tentativeG = (gScore.get(ck) ?? Infinity) + 1;
        if (tentativeG < (gScore.get(nk) ?? Infinity)) {
          cameFrom.set(nk, { x: cur.x, y: cur.y });
          gScore.set(nk, tentativeG);
          const f = tentativeG + h(nx, ny);
          fScore.set(nk, f);
          pushOpen(nx, ny, f);
        }
      }
    }

    if (!found) return null;

    // Reconstruct path
    const path = [];
    let cur = { x: found.x, y: found.y };
    while (cur) {
      path.push({ x: cur.x, y: cur.y });
      const prev = cameFrom.get(startKey(cur.x, cur.y));
      cur = prev ? { x: prev.x, y: prev.y } : null;
    }
    path.reverse();
    return path;
  }

  function stepTowards(ctx, occ, n, tx, ty) {
    if (typeof tx !== "number" || typeof ty !== "number") return false;

    // Consume existing plan if valid and targeted to the same goal
    if (n._plan && n._planGoal && n._planGoal.x === tx && n._planGoal.y === ty) {
      // Ensure current position matches first node
      if (n._plan.length && (n._plan[0].x !== n.x || n._plan[0].y !== n.y)) {
        // Resync by searching for current position within plan
        const idx = n._plan.findIndex(p => p.x === n.x && p.y === n.y);
        if (idx >= 0) n._plan = n._plan.slice(idx);
        else n._plan = null;
      }
      if (n._plan && n._plan.length >= 2) {
        const next = n._plan[1];
        const keyNext = `${next.x},${next.y}`;
        if (isWalkTown(ctx, next.x, next.y) && !occ.has(keyNext) && !(ctx.player.x === next.x && ctx.player.y === next.y)) {
          if (typeof window !== "undefined" && window.DEBUG_TOWN_PATHS) {
            n._debugPath = n._plan.slice(0);
          } else {
            n._debugPath = null;
          }
          occ.delete(`${n.x},${n.y}`); n.x = next.x; n.y = next.y; occ.add(`${n.x},${n.y}`);
          return true;
        } else {
          // Blocked: force replan below
          n._plan = null;
        }
      } else if (n._plan && n._plan.length === 1) {
        // Already at goal
        if (typeof window !== "undefined" && window.DEBUG_TOWN_PATHS) n._debugPath = n._plan.slice(0);
        return false;
      }
    }

    // No valid plan; compute new plan
    const full = computePath(ctx, occ, n.x, n.y, tx, ty);
    if (full && full.length >= 2) {
      n._plan = full;
      n._planGoal = { x: tx, y: ty };
      if (typeof window !== "undefined" && window.DEBUG_TOWN_PATHS) n._debugPath = full.slice(0);
      const next = full[1];
      const keyNext = `${next.x},${next.y}`;
      if (isWalkTown(ctx, next.x, next.y) && !occ.has(keyNext) && !(ctx.player.x === next.x && ctx.player.y === next.y)) {
        occ.delete(`${n.x},${n.y}`); n.x = next.x; n.y = next.y; occ.add(`${n.x},${n.y}`);
        return true;
      }
      // If first step blocked right away, drop plan and try nudge
      n._plan = null; n._planGoal = null;
    }

    // Fallback: greedy nudge step
    const dirs4 = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
    const dirs = dirs4.slice().sort((a, b) =>
      (Math.abs((n.x + a.dx) - tx) + Math.abs((n.y + a.dy) - ty)) -
      (Math.abs((n.x + b.dx) - tx) + Math.abs((n.y + b.dy) - ty))
    );
    for (const d of dirs) {
      const nx = n.x + d.dx, ny = n.y + d.dy;
      if (!isWalkTown(ctx, nx, ny)) continue;
      if (ctx.player.x === nx && ctx.player.y === ny) continue;
      if (occ.has(`${nx},${ny}`)) continue;
      if (typeof window !== "undefined" && window.DEBUG_TOWN_PATHS) {
        n._debugPath = [{ x: n.x, y: n.y }, { x: nx, y: ny }];
      } else {
        n._debugPath = null;
      }
      n._plan = null; n._planGoal = null;
      occ.delete(`${n.x},${n.y}`); n.x = nx; n.y = ny; occ.add(`${nx},${ny}`);
      return true;
    }
    n._debugPath = null;
    n._plan = null; n._planGoal = null;
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
    const { map, townProps, rng } = ctx;
    const spots = [];
    for (let y = b.y + 1; y < b.y + b.h - 1; y++) {
      for (let x = b.x + 1; x < b.x + b.w - 1; x++) {
        if (map[y][x] !== ctx.TILES.FLOOR) continue;
        if (townProps.some(p => p.x === x && p.y === y)) continue;
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

    // Residents
    (function spawnResidents() {
      if (!Array.isArray(townBuildings) || townBuildings.length === 0) return;
      const targetFraction = 0.6;
      const shuffled = townBuildings.slice();
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1)); const t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
      }
      const pickCount = Math.min(shuffled.length, Math.max(4, Math.floor(shuffled.length * targetFraction)));
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
        const residentCount = Math.max(1, Math.min(3, Math.floor(area / 30))) + (rng() < 0.4 ? 1 : 0);
        const bedList = bedsFor(ctx, b);
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
          let sleepSpot = null;
          if (bedList.length) {
            const bidx = randInt(ctx, 0, bedList.length - 1);
            sleepSpot = { x: bedList[bidx].x, y: bedList[bidx].y };
          }
          npcs.push({
            x: pos.x, y: pos.y,
            name: rng() < 0.2 ? `Child` : `Resident`,
            lines: linesHome,
            isResident: true,
            _home: { building: b, x: pos.x, y: pos.y, door: { x: b.door.x, y: b.door.y }, bed: sleepSpot },
            _work: errand,
          });
        }
      }

      for (const b of remaining) {
        if (rng() < 0.45) {
          const pos = randomInteriorSpot(ctx, b);
          if (!pos) continue;
          if (npcs.some(n => n.x === pos.x && n.y === pos.y)) continue;
          npcs.push({
            x: pos.x, y: pos.y,
            name: `Resident`,
            lines: linesHome,
            isResident: true,
            _home: { building: b, x: pos.x, y: pos.y, door: { x: b.door.x, y: b.door.y }, bed: null },
            _work: (rng() < 0.5 && shops && shops.length) ? { x: shops[0].x, y: shops[0].y }
                  : (townPlaza ? { x: townPlaza.x, y: townPlaza.y } : null),
          });
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

    const occ = new Set();
    occ.add(`${player.x},${player.y}`);
    for (const n of npcs) occ.add(`${n.x},${n.y}`);
    if (Array.isArray(townProps)) for (const p of townProps) occ.add(`${p.x},${p.y}`);

    const t = ctx.time;
    const minutes = t ? (t.hours * 60 + t.minutes) : 12 * 60;
    const phase = (t && t.phase === "night") ? "evening"
                : (t && t.phase === "dawn") ? "morning"
                : (t && t.phase === "dusk") ? "evening"
                : "day";

    // Shuffle iteration
    const order = npcs.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(ctx.rng() * (i + 1));
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }

    function routeIntoBuilding(ctx, occ, n, building, targetInside) {
      // Adjust unreachable interior targets (like beds) to a free adjacent tile
      const adjTarget = targetInside ? adjustInteriorTarget(ctx, building, targetInside) : null;

      // If outside the building, aim for the door first
      const insideNow = insideBuilding(building, n.x, n.y);
      if (!insideNow) {
        const door = building.door || nearestFreeAdjacent(ctx, building.x + ((building.w / 2) | 0), building.y, null);
        if (door) {
          if (n.x === door.x && n.y === door.y) {
            // Step just inside to a free interior tile (planned)
            const inSpot = nearestFreeAdjacent(ctx, door.x, door.y, building) || adjTarget || { x: door.x, y: door.y };
            stepTowards(ctx, occ, n, inSpot.x, inSpot.y);
            return true;
          }
          // Plan/step toward the door, persist plan across turns
          stepTowards(ctx, occ, n, door.x, door.y);
          return true;
        }
      } else {
        // Already inside: go to targetInside or nearest free interior tile
        const inSpot = (adjTarget && isFreeTile(ctx, adjTarget.x, adjTarget.y))
          ? adjTarget
          : nearestFreeAdjacent(ctx, adjTarget ? adjTarget.x : n.x, adjTarget ? adjTarget.y : n.y, building);
        if (inSpot) {
          stepTowards(ctx, occ, n, inSpot.x, inSpot.y);
          return true;
        }
      }
      return false;
    }

    for (const idx of order) {
      const n = npcs[idx];
      ensureHome(ctx, n);

      // Pets
      if (n.isPet) {
        if (ctx.rng() < 0.6) continue;
        stepTowards(ctx, occ, n, n.x + randInt(ctx, -1, 1), n.y + randInt(ctx, -1, 1));
        continue;
      }

      // Shopkeepers with schedule
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
          const sleepTarget = n._home.bed ? { x: n._home.bed.x, y: n._home.bed.y } : { x: n._home.x, y: n._home.y };
          handled = routeIntoBuilding(ctx, occ, n, n._home.building, sleepTarget);
        }

        if (handled) continue;

        // idle jiggle
        if (ctx.rng() < 0.9) continue;
      }

      // Residents: sleep system
      if (n.isResident) {
        const eveKickIn = minutes >= 17 * 60 + 30; // start pushing home a bit before dusk
        if (n._sleeping) {
          if (phase === "morning") n._sleeping = false;
          else continue;
        }
        if (phase === "evening" || eveKickIn) {
          if (n._home && n._home.building) {
            const bedSpot = n._home.bed ? { x: n._home.bed.x, y: n._home.bed.y } : null;
            const sleepTarget = bedSpot ? bedSpot : { x: n._home.x, y: n._home.y };
            // If at, or adjacent to, the bed spot (or home spot if no bed), go to sleep
            const atExact = (n.x === sleepTarget.x && n.y === sleepTarget.y);
            const nearBed = bedSpot ? (manhattan(n.x, n.y, bedSpot.x, bedSpot.y) === 1) : false;
            if (atExact || nearBed) {
              n._sleeping = true;
              continue;
            }
            // Otherwise route via door and inside (target adjusted to nearest free interior tile)
            if (routeIntoBuilding(ctx, occ, n, n._home.building, sleepTarget)) continue;
          }
          // If no home data for some reason, stop wandering at evening
          continue;
        } else if (phase === "day") {
          const target = n._work || (ctx.townPlaza ? { x: ctx.townPlaza.x, y: ctx.townPlaza.y } : null);
          if (target) {
            if (n.x === target.x && n.y === target.y) {
              if (ctx.rng() < 0.9) continue;
              stepTowards(ctx, occ, n, n.x + randInt(ctx, -1, 1), n.y + randInt(ctx, -1, 1));
              continue;
            }
            stepTowards(ctx, occ, n, target.x, target.y);
            continue;
          }
        } else if (phase === "morning") {
          if (n._home && n._home.building) {
            const homeTarget = { x: n._home.x, y: n._home.y };
            if (routeIntoBuilding(ctx, occ, n, n._home.building, homeTarget)) continue;
          }
        }
        stepTowards(ctx, occ, n, n.x + randInt(ctx, -1, 1), n.y + randInt(ctx, -1, 1));
        continue;
      }

      // Generic NPCs
      if (ctx.rng() < 0.25) continue;
      let target = null;
      if (phase === "morning") target = n._home ? { x: n._home.x, y: n._home.y } : null;
      else if (phase === "day") target = (n._work || ctx.townPlaza);
      else target = (ctx.tavern && n._likesTavern) ? { x: ctx.tavern.door.x, y: ctx.tavern.door.y }
                                                   : (n._home ? { x: n._home.x, y: n._home.y } : null);
      if (!target) {
        stepTowards(ctx, occ, n, n.x + randInt(ctx, -1, 1), n.y + randInt(ctx, -1, 1));
        continue;
      }
      stepTowards(ctx, occ, n, target.x, target.y);
    }
  }

  window.TownAI = {
    populateTown,
    townNPCsAct,
  };
})();