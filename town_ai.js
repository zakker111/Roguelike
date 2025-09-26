/**
 * TownAI: handles town NPC population and behavior.
 * Exports (window.TownAI):
 *  - populateTown(ctx): spawn shopkeepers, residents, pets, greeters
 *  - townNPCsAct(ctx): per-turn movement and routines
 *  - configure(opts): override movement tunables at runtime
 *  - getConfig(): snapshot of current config
 */
(function () {
  function randInt(ctx, a, b) { return Math.floor(ctx.rng() * (b - a + 1)) + a; }
  const manhattan = (typeof window !== "undefined" && window.PlayerUtils && typeof PlayerUtils.manhattan === "function")
    ? PlayerUtils.manhattan
    : function (ax, ay, bx, by) { return Math.abs(ax - bx) + Math.abs(ay - by); };

  // ---- Tunables (exposed) ----
  const _defaults = {
    petSkipProb: 0.4,                 // probability to skip pet movement per tick
    shopkeeperIdleSkipProb: 0.6,      // probability shopkeeper skips idle jiggle
    residentAtTargetSkipProb: 0.5,    // probability resident skips micro-move when at target
    genericSkipProb: 0.1,             // probability generic NPC skips acting
    doorNudgeOnBlock: true,           // nudge when door-step into interior fails
    pathFailNudge: true               // nudge when pathfinding step fails
  };
  let _cfg = Object.assign({}, _defaults);
  function configure(opts) {
    if (!opts || typeof opts !== "object") return;
    _cfg = Object.assign(_cfg, opts);
  }
  function getConfig() {
    return Object.assign({}, _cfg);
  }

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

  function stepTowards(ctx, occ, n, tx, ty) {
    if (typeof tx !== "number" || typeof ty !== "number") return false;
    const { map, player } = ctx;
    const rows = map.length, cols = map[0] ? map[0].length : 0;
    const inB = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows;
    const start = { x: n.x, y: n.y };
    const goal = { x: tx, y: ty };

    const dirs4 = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
    // Direct adjacent
    for (const d of dirs4) {
      const nx = n.x + d.dx, ny = n.y + d.dy;
      if (nx === goal.x && ny === goal.y && isWalkTown(ctx, nx, ny) && !occ.has(`${nx},${ny}`) && !(player.x === nx && player.y === ny)) {
        occ.delete(`${n.x},${n.y}`); n.x = nx; n.y = ny; occ.add(`${nx},${ny}`); return true;
      }
    }

    const q = [];
    const seenB = new Set();
    const prev = new Map();
    const key = (x, y) => `${x},${y}`;
    q.push(start);
    seenB.add(key(start.x, start.y));
    let found = null;
    const MAX_NODES = 1200;

    let nodes = 0;
    while (q.length && nodes < MAX_NODES) {
      nodes++;
      const cur = q.shift();
      if (cur.x === goal.x && cur.y === goal.y) { found = cur; break; }
      for (const d of dirs4) {
        const nx = cur.x + d.dx, ny = cur.y + d.dy;
        const k = key(nx, ny);
        if (!inB(nx, ny)) continue;
        if (seenB.has(k)) continue;
        if (!isWalkTown(ctx, nx, ny)) continue;
        if (player.x === nx && player.y === ny) continue;
        if (occ.has(k) && !(nx === goal.x && ny === goal.y)) continue;
        seenB.add(k);
        prev.set(k, cur);
        q.push({ x: nx, y: ny });
      }
    }

    if (!found) {
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

    // Reconstruct first step
    let cur = found;
    let back = prev.get(key(cur.x, cur.y));
    while (back && !(back.x === start.x && back.y === start.y)) {
      cur = back;
      back = prev.get(key(cur.x, cur.y));
    }
    if (cur && isWalkTown(ctx, cur.x, cur.y) && !(ctx.player.x === cur.x && ctx.player.y === cur.y) && !occ.has(key(cur.x, cur.y))) {
      occ.delete(`${n.x},${n.y}`);
      n.x = cur.x; n.y = cur.y;
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
      // If outside the building, aim for the door first
      const insideNow = insideBuilding(building, n.x, n.y);
      if (!insideNow) {
        const door = building.door || nearestFreeAdjacent(ctx, building.x + ((building.w / 2) | 0), building.y, null);
        if (door) {
          if (n.x === door.x && n.y === door.y) {
            // Step just inside
            const inSpot = nearestFreeAdjacent(ctx, door.x, door.y, building) || targetInside || { x: door.x, y: door.y };
            if (!stepTowards(ctx, occ, n, inSpot.x, inSpot.y)) {
              // small nudge to avoid being stuck on door tile
              if (_cfg.doorNudgeOnBlock) {
                stepTowards(ctx, occ, n, n.x + randInt(ctx, -1, 1), n.y + randInt(ctx, -1, 1));
              }
            }
            return true;
          }
          stepTowards(ctx, occ, n, door.x, door.y);
          return true;
        }
      } else {
        // Already inside: go to targetInside or nearest free interior tile
        const inSpot = (targetInside && isFreeTile(ctx, targetInside.x, targetInside.y))
          ? targetInside
          : nearestFreeAdjacent(ctx, targetInside ? targetInside.x : n.x, targetInside ? targetInside.y : n.y, building);
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
        if (ctx.rng() &lt; _cfg.petSkipProb) continue; // configurable movement frequency
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

        // idle jiggle (configurable)
        if (ctx.rng() &lt; _cfg.shopkeeperIdleSkipProb) continue;
        stepTowards(ctx, occ, n, n.x + randInt(ctx, -1, 1), n.y + randInt(ctx, -1, 1));
        continue;
      }

      // Residents: sleep system
      if (n.isResident) {
        if (n._sleeping) {
          if (phase === "morning") n._sleeping = false;
          else continue;
        }
        if (phase === "evening") {
          if (n._home && n._home.building) {
            const sleepTarget = n._home.bed ? { x: n._home.bed.x, y: n._home.bed.y } : { x: n._home.x, y: n._home.y };
            // If at sleep target, go to sleep
            if (n.x === sleepTarget.x && n.y === sleepTarget.y) {
              n._sleeping = true;
              continue;
            }
            // Otherwise route via door and inside
            if (routeIntoBuilding(ctx, occ, n, n._home.building, sleepTarget)) continue;
          }
        } else if (phase === "day") {
          const target = n._work || (ctx.townPlaza ? { x: ctx.townPlaza.x, y: ctx.townPlaza.y } : null);
          if (target) {
            if (n.x === target.x && n.y === target.y) {
              if (ctx.rng() &lt; _cfg.residentAtTargetSkipProb) continue; // configurable micro-move frequency
              stepTowards(ctx, occ, n, n.x + randInt(ctx, -1, 1), n.y + randInt(ctx, -1, 1));
              continue;
            }
            if (!stepTowards(ctx, occ, n, target.x, target.y)) {
              // fallback nudge on path failure
              if (_cfg.pathFailNudge) {
                stepTowards(ctx, occ, n, n.x + randInt(ctx, -1, 1), n.y + randInt(ctx, -1, 1));
              }
            }
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

      // Generic NPCs (configurable activity)
      if (ctx.rng() &lt; _cfg.genericSkipProb) continue;
      let target = null;
      if (phase === "morning") target = n._home ? { x: n._home.x, y: n._home.y } : null;
      else if (phase === "day") target = (n._work || ctx.townPlaza);
      else target = (ctx.tavern && n._likesTavern) ? { x: ctx.tavern.door.x, y: ctx.tavern.door.y }
                                                   : (n._home ? { x: n._home.x, y: n._home.y } : null);
      if (!target) {
        stepTowards(ctx, occ, n, n.x + randInt(ctx, -1, 1), n.y + randInt(ctx, -1, 1));
        continue;
      }
      if (!stepTowards(ctx, occ, n, target.x, target.y)) {
        // fallback nudge on path failure
        if (_cfg.pathFailNudge) {
          stepTowards(ctx, occ, n, n.x + randInt(ctx, -1, 1), n.y + randInt(ctx, -1, 1));
        }
      }
    }
  }

  window.TownAI = {
    populateTown,
    townNPCsAct,
    configure,
    getConfig
  };
})();