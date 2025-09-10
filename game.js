/*
Tiny Roguelike - main game logic

Overview
- Procedural dungeon: rooms + corridors, stairs, enemies (goblins, trolls, ogres)
- Turn-based: your actions advance enemies
- FOV: simple ray cast with memory of explored tiles
- Looting: gold, potions, and randomized equipment (0.0–4.0 atk/def scale)
- Equipment decay: each equippable item has a decay %, reaching 100% destroys the item.
  Equipped items gain decay when used (weapon/hands on attack) or when you are hit (armor/offhand).
  Hover an inventory item to see its current decay value.
- Inventory: I to open; click items to equip; auto-equip if strictly better on loot
- Movement: Numpad (7/8/9/4/6/1/2/3), wait: Numpad5, G: loot, N: descend when on '>'

Rendering layers (in order)
1) Tiles
2) Stair glyphs
3) Corpses
4) Enemies
5) Player
*/

(() => {
  // Constants
  const TILE = 32;
  const COLS = 30;
  const ROWS = 20;
  const FOV_DEFAULT = 8;
  let fovRadius = FOV_DEFAULT;

  // Tile enums
  const TILES = {
    WALL: 0,
    FLOOR: 1,
    DOOR: 2,
  };

  const COLORS = {
    wall: "#1b1f2a",
    wallDark: "#131722",
    floor: "#0f1320",
    floorLit: "#0f1628",
    player: "#9ece6a",
    enemy: "#f7768e",
    enemyGoblin: "#8bd5a0",
    enemyTroll: "#e0af68",
    enemyOgre: "#f7768e",
    item: "#7aa2f7",
    corpse: "#c3cad9",
    corpseEmpty: "#6b7280",
    dim: "rgba(13, 16, 24, 0.75)"
  };

  // DOM
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  // State
  let map = [];
  let seen = []; // explored tiles
  let visible = []; // currently visible
  let player = { x: 0, y: 0, hp: 10, maxHp: 10, inventory: [], atk: 1, xp: 0, level: 1, xpNext: 20, equipment: { weapon: null, offhand: null, head: null, torso: null, legs: null, hands: null } };
  let enemies = [];
  let corpses = [];
  let floor = 1;
  let rng = mulberry32(Date.now() % 0xffffffff);
  let isDead = false;
  let startRoomRect = null;

  // Build a lightweight context object for modules
  function getCtx() {
    return {
      // dims and enums
      ROWS, COLS, TILES,
      // state
      player, map, seen, visible, enemies, corpses,
      startRoomRect,
      // visibility
      fovRadius,
      // utils
      rng, randInt, chance,
      inBounds, isWalkable,
      // hooks
      log, enemyThreatLabel,
      // module callbacks
      recomputeFOV: () => recomputeFOV(),
      updateUI: () => updateUI(),
      // expose tile enum for fov transparency checks
      TILES,
      // enemy factory
      enemyFactory: (x, y, depth) => {
        if (window.Enemies && Enemies.createEnemyAt) {
          return Enemies.createEnemyAt(x, y, depth, rng);
        }
        return { x, y, type: "goblin", glyph: "g", hp: 3, atk: 1, xp: 5, level: depth, announced: false };
      }
    };
  }

  // Utils
  function mulberry32(a) {
    return function() {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const randInt = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
  const chance = p => rng() < p;
  const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const enemyColor = (type) => {
    if (window.Enemies && typeof Enemies.colorFor === "function") {
      return Enemies.colorFor(type);
    }
    return COLORS.enemy;
  };
  const randFloat = (min, max, decimals = 1) => {
    const v = min + rng() * (max - min);
    const p = Math.pow(10, decimals);
    return Math.round(v * p) / p;
  };
  const round1 = (n) => Math.round(n * 10) / 10;

  // Decay helpers
  function initialDecay(tier) {
    // Start items with some wear; higher tiers start in better condition
    if (tier <= 1) return randFloat(10, 35, 0);
    if (tier === 2) return randFloat(5, 20, 0);
    return randFloat(0, 10, 0); // tier 3 (steel)
  }

  function rerenderInventoryIfOpen() {
    if (window.UI && UI.isInventoryOpen && UI.isInventoryOpen()) {
      renderInventoryPanel();
    }
  }

  function decayEquipped(slot, amount) {
    const it = player.equipment?.[slot];
    if (!it) return;
    const before = it.decay || 0;
    it.decay = Math.min(100, round1(before + amount));
    if (it.decay >= 100) {
      log(`${capitalize(it.name)} breaks and is destroyed.`);
      player.equipment[slot] = null;
      updateUI();
      rerenderInventoryIfOpen();
    } else if (Math.floor(before) !== Math.floor(it.decay)) {
      // Optional: could log small updates; keeping quiet to avoid spam
      rerenderInventoryIfOpen();
    }
  }

  /*
   Computes total player attack:
   - Base attack + level bonus
   - Equipment bonuses (weapon, optionally hands)
   - Uses fractional values (0.0–4.0 scale per item); rounded to 1 decimal for display/consistency
  */
  function getPlayerAttack() {
    let bonus = 0;
    const eq = player.equipment || {};
    if (eq.weapon && typeof eq.weapon.atk === "number") bonus += eq.weapon.atk;
    if (eq.hands && typeof eq.hands.atk === "number") bonus += eq.hands.atk;
    const levelBonus = Math.floor((player.level - 1) / 2);
    return round1(player.atk + bonus + levelBonus);
  }

  /*
   Computes total player defense:
   - Sum of all equipped defensive slots (offhand, head, torso, legs, hands)
   - Fractional values (0.0–4.0 scale per item), rounded to 1 decimal
  */
  function getPlayerDefense() {
    let def = 0;
    const eq = player.equipment || {};
    if (eq.offhand && typeof eq.offhand.def === "number") def += eq.offhand.def;
    if (eq.head && typeof eq.head.def === "number") def += eq.head.def;
    if (eq.torso && typeof eq.torso.def === "number") def += eq.torso.def;
    if (eq.legs && typeof eq.legs.def === "number") def += eq.legs.def;
    if (eq.hands && typeof eq.hands.def === "number") def += eq.hands.def;
    return round1(def);
  }

  function describeItem(item) {
    if (!item) return "";
    if (item.kind === "equip") {
      const parts = [];
      if ("atk" in item) parts.push(`+${Number(item.atk).toFixed(1)} atk`);
      if ("def" in item) parts.push(`+${Number(item.def).toFixed(1)} def`);
      return `${item.name}${parts.length ? " (" + parts.join(", ") + ")" : ""}`;
    }
    if (item.kind === "potion") {
      const heal = item.heal ?? 3;
      const base = item.name || `potion (+${heal} HP)`;
      const count = item.count && item.count > 1 ? ` x${item.count}` : "";
      return `${base}${count}`;
    }
    return item.name || "item";
  }

  // Combat helpers: hit locations, crits, blocks
  function rollHitLocation() {
    const r = rng();
    if (r < 0.50) return { part: "torso", mult: 1.0, blockMod: 1.0, critBonus: 0.00 };
    if (r < 0.65) return { part: "head",  mult: 1.1, blockMod: 0.85, critBonus: 0.15 };
    if (r < 0.80) return { part: "hands", mult: 0.9, blockMod: 0.75, critBonus: -0.05 };
    return { part: "legs", mult: 0.95, blockMod: 0.75, critBonus: -0.03 };
  }

  function critMultiplier() {
    // 1.6 - 2.0x
    return 1.6 + rng() * 0.4;
  }

  function getEnemyBlockChance(enemy, loc) {
    if (window.Enemies && typeof Enemies.enemyBlockChance === "function") {
      return Enemies.enemyBlockChance(enemy, loc);
    }
    const base = enemy.type === "ogre" ? 0.10 : enemy.type === "troll" ? 0.08 : 0.06;
    return Math.max(0, Math.min(0.35, base * (loc?.blockMod || 1.0)));
  }

  function getPlayerBlockChance(loc) {
    const off = player.equipment?.offhand;
    const offDef = (off && typeof off.def === "number") ? off.def : 0;
    const base = 0.08 + offDef * 0.06; // shield helps a lot
    return Math.max(0, Math.min(0.6, base * (loc?.blockMod || 1.0)));
  }

  // Enemy damage after applying player's defense with diminishing returns and a chip-damage floor
  function enemyDamageAfterDefense(raw) {
    const def = getPlayerDefense();
    // Diminishing returns: as defense grows, reduction approaches a cap
    const DR = Math.max(0, Math.min(0.85, def / (def + 6))); // cap at 85% reduction
    const reduced = raw * (1 - DR);
    return Math.max(0.1, round1(reduced)); // always at least 0.1 damage if not blocked
  }

  // Enemy level and danger helpers
  function enemyLevelFor(type, depth) {
    if (window.Enemies && typeof Enemies.levelFor === "function") {
      return Enemies.levelFor(type, depth, rng);
    }
    const tier = type === "ogre" ? 2 : (type === "troll" ? 1 : 0);
    const jitter = rng() < 0.35 ? 1 : 0;
    return Math.max(1, depth + tier + jitter);
  }

  function enemyDamageMultiplier(level) {
    if (window.Enemies && typeof Enemies.damageMultiplier === "function") {
      return Enemies.damageMultiplier(level);
    }
    return 1 + 0.15 * Math.max(0, (level || 1) - 1);
  }

  // Classify enemy danger based on level difference vs player
  function enemyThreatLabel(enemy) {
    const diff = (enemy.level || 1) - (player.level || 1);
    let label = "moderate";
    let tone = "info";
    if (diff <= -2) { label = "weak"; tone = "good"; }
    else if (diff === -1) { label = "weak"; tone = "good"; }
    else if (diff === 0) { label = "moderate"; tone = "info"; }
    else if (diff === 1) { label = "strong"; tone = "warn"; }
    else if (diff >= 2) { label = "deadly"; tone = "warn"; }
    return { label, tone, diff };
  }

  // FOV adjustment helpers
  function setFovRadius(r) {
    const clamped = Math.max(3, Math.min(14, r));
    if (clamped !== fovRadius) {
      fovRadius = clamped;
      log(`FOV radius set to ${fovRadius}.`);
      recomputeFOV();
      draw();
    }
  }
  function adjustFov(delta) {
    setFovRadius(fovRadius + delta);
  }

  // Potion helpers (stacking + consumption)
  function addPotionToInventory(heal = 3, name = `potion (+${heal} HP)`) {
    const existing = player.inventory.find(i => i.kind === "potion" && (i.heal ?? 3) === heal);
    if (existing) {
      existing.count = (existing.count || 1) + 1;
    } else {
      player.inventory.push({ kind: "potion", heal, count: 1, name });
    }
  }

  function drinkPotionByIndex(idx) {
    if (!player.inventory || idx < 0 || idx >= player.inventory.length) return;
    const it = player.inventory[idx];
    if (!it || it.kind !== "potion") return;

    const heal = it.heal ?? 3;
    const prev = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + heal);
    const gained = player.hp - prev;
    if (gained > 0) {
      log(`You drink a potion and restore ${gained.toFixed(1)} HP (HP ${player.hp.toFixed(1)}/${player.maxHp.toFixed(1)}).`, "good");
    } else {
      log(`You drink a potion but feel no different (HP ${player.hp.toFixed(1)}/${player.maxHp.toFixed(1)}).`, "warn");
    }

    if (it.count && it.count > 1) {
      it.count -= 1;
    } else {
      // remove from inventory
      player.inventory.splice(idx, 1);
    }
    updateUI();
    renderInventoryPanel();
  }

  /*
   Auto-equip helper used on loot:
   - Compares new item to current slot via a simple score (atk + def)
   - Equips if strictly better; logs the change
  */
  function equipIfBetter(item) {
    if (!item || item.kind !== "equip") return false;
    const slot = item.slot;
    const current = player.equipment[slot];
    const newScore = (item.atk || 0) + (item.def || 0);
    const curScore = current ? ((current.atk || 0) + (current.def || 0)) : -Infinity;
    const better = !current || newScore > curScore + 1e-9;

    if (better) {
      player.equipment[slot] = item;
      const parts = [];
      if ("atk" in item) parts.push(`+${Number(item.atk).toFixed(1)} atk`);
      if ("def" in item) parts.push(`+${Number(item.def).toFixed(1)} def`);
      const statStr = parts.join(", ");
      log(`You equip ${item.name} (${slot}${statStr ? ", " + statStr : ""}).`);
      updateUI();
      return true;
    }
    return false;
  }

  /*
   Prepend a message to the on-screen log as a colored entry.
   Types: info (default), crit, block, death, good, warn
  */
  function log(msg, type = "info") {
    if (window.Logger && typeof Logger.log === "function") {
      Logger.log(msg, type);
      return;
    }
    // Fallback (in case logger.js isn't loaded)
    const div = document.createElement("div");
    div.className = `entry ${type}`;
    div.textContent = msg;
    logEl?.prepend(div);
    const MAX = 60;
    while (logEl && logEl.childNodes.length > MAX) {
      logEl.removeChild(logEl.lastChild);
    }
  }

  // Map generation: random rooms + corridors
  /*
   Generates a new floor:
   - clears visibility, enemies, corpses and resets death flag
   - carves non-overlapping rooms, connects them with corridors
   - places player in first room; stairs (>) in last room
   - spawns enemies with depth-scaled stats/types
   - recomputes FOV and updates UI/log
  */
  function generateLevel(depth = 1) {
    if (window.Dungeon && typeof Dungeon.generateLevel === "function") {
      const ctx = getCtx();
      ctx.startRoomRect = startRoomRect;
      Dungeon.generateLevel(ctx, depth);
      // Sync back references mutated by the module
      map = ctx.map;
      seen = ctx.seen;
      visible = ctx.visible;
      enemies = ctx.enemies;
      corpses = ctx.corpses;
      startRoomRect = ctx.startRoomRect;
      // Now run post-gen steps in this orchestrator
      recomputeFOV();
      updateUI();
      log(`You descend to floor ${depth}.`);
      return;
    }
    // Fallback simple level if module missing
    map = Array.from({ length: ROWS }, () => Array(COLS).fill(TILES.FLOOR));
    enemies = [];
    corpses = [];
    recomputeFOV();
    updateUI();
    log(`You descend to floor ${depth}.`);
  }

  function inBounds(x, y) {
    return x >= 0 && y >= 0 && x < COLS && y < ROWS;
  }

  function isWalkable(x, y) {
    if (!inBounds(x, y)) return false;
    return map[y][x] === TILES.FLOOR || map[y][x] === TILES.DOOR;
  }

  /*
   Factory for enemies at (x,y) for a given depth.
   - Chooses type based on depth (weighted goblin/troll/ogre)
   - Sets glyph, hp/atk and XP reward
  */
  function createEnemyAt(x, y, depth) {
    if (window.Enemies && typeof Enemies.createEnemyAt === "function") {
      return Enemies.createEnemyAt(x, y, depth, rng);
    }
    // Fallback (shouldn't happen if enemies.js is loaded)
    const type = "goblin";
    const level = enemyLevelFor(type, depth);
    return { x, y, type, glyph: "g", hp: 3, atk: 1, xp: 5, level, announced: false };
  }

  // Field of view using simple ray casting within radius
  /*
   Recomputes visibility around the player using Bresenham-style line of sight.
   - Only non-wall tiles are transparent
   - Stores both current visibility and "seen" memory for fog-of-war
  */
  function recomputeFOV() {
    if (window.FOV && typeof FOV.recomputeFOV === "function") {
      const ctx = getCtx();
      ctx.seen = seen;
      ctx.visible = visible;
      FOV.recomputeFOV(ctx);
      // pull back arrays (replaced in module)
      visible = ctx.visible;
      seen = ctx.seen;
      return;
    }
    // Fallback: do nothing if module missing
  }

  // Rendering
  function getRenderCtx() {
    return {
      ctx2d: ctx,
      TILE, ROWS, COLS, COLORS, TILES,
      map, seen, visible,
      player, enemies, corpses,
      enemyColor: (t) => enemyColor(t),
    };
  }

  function draw() {
    if (window.Render && typeof Render.draw === "function") {
      Render.draw(getRenderCtx());
      return;
    }
    // Fallback: no-op if renderer missing
  }

  /*
   Input handling:
   - Movement: Numpad 7/8/9/4/6/1/2/3 (diagonals allowed), 5 to wait
   - G: loot corpse on the current tile (also closes loot panel if open)
   - N: descend stairs when on '>' tile
   - I: open/close inventory (blocks other input while open)
   - When dead: only R/Enter to restart
  */
  const KEY_DIRS = {
    Numpad8: {x:0,y:-1}, Numpad2: {x:0,y:1}, Numpad4: {x:-1,y:0}, Numpad6: {x:1,y:0},
    Numpad7: {x:-1,y:-1}, Numpad9: {x:1,y:-1}, Numpad1: {x:-1,y:1}, Numpad3: {x:1,y:1},
  };

  window.addEventListener("keydown", (e) => {
    // When dead, only allow restart
    if (isDead) {
      if (e.key && (e.key.toLowerCase() === "r" || e.key === "Enter")) {
        e.preventDefault();
        restartGame();
      }
      return;
    }

    // If inventory panel is open, only allow closing with I/Escape; block other input
    if ((window.UI && UI.isInventoryOpen && UI.isInventoryOpen()) || (invPanel && !invPanel.hidden)) {
      if (e.key && (e.key.toLowerCase() === "i" || e.key === "Escape")) {
        e.preventDefault();
        hideInventoryPanel();
      } else {
        e.preventDefault();
      }
      return;
    }

    // Toggle inventory with I
    if (e.key && e.key.toLowerCase() === "i") {
      e.preventDefault();
      showInventoryPanel();
      return;
    }

    // Adjust FOV with [ and ] (or -/+), including numpad add/subtract
    if (e.code === "BracketLeft" || e.key === "[" || e.code === "Minus" || e.code === "NumpadSubtract" || e.key === "-") {
      e.preventDefault();
      adjustFov(-1);
      return;
    }
    if (e.code === "BracketRight" || e.key === "]" || e.code === "Equal" || e.code === "NumpadAdd" || e.key === "=") {
      e.preventDefault();
      adjustFov(1);
      return;
    }

    const key = e.code; // use code to detect numpad reliably
    if (KEY_DIRS[key]) {
      e.preventDefault();
      const d = KEY_DIRS[key];
      tryMovePlayer(d.x, d.y);
      return;
    }
    if (key === "Numpad5") {
      e.preventDefault();
      turn(); // wait a turn
      return;
    }
    if (e.key && e.key.toLowerCase() === "g") {
      e.preventDefault();
      hideLootPanel();
      lootCorpse();
      return;
    }
    if (e.key && e.key.toLowerCase() === "n") {
      e.preventDefault();
      hideLootPanel();
      // descend if on door
      if (map[player.y][player.x] === TILES.DOOR) {
        floor += 1;
        generateLevel(floor);
      } else {
        log("You need to stand on the staircase (brown tile marked with '>') to descend.");
      }
      return;
    }

    // close loot panel on any other key
    if (window.UI && UI.isLootOpen && UI.isLootOpen()) {
      hideLootPanel();
    }
  });

  /*
   Attempts to move the player by (dx,dy):
   - If an enemy occupies the destination, perform a melee attack using total attack
   - Otherwise, move into walkable tiles (floors/doors) if not occupied
   - Any action consumes a turn (enemies then act, FOV updates, redraw)
  */
  function tryMovePlayer(dx, dy) {
    if (isDead) return;
    const nx = player.x + dx;
    const ny = player.y + dy;
    if (!inBounds(nx, ny)) return;

    // attack if enemy there
    const enemy = enemies.find(e => e.x === nx && e.y === ny);
    if (enemy) {
      const loc = rollHitLocation();

      // Enemy attempts to block
      if (rng() < getEnemyBlockChance(enemy, loc)) {
        log(`${capitalize(enemy.type || "enemy")} blocks your attack to the ${loc.part}.`, "block");
        // Still incur a bit of wear on your gear
        decayEquipped("weapon", randFloat(0.6, 1.6, 1));
        decayEquipped("hands", randFloat(0.2, 0.7, 1));
        turn();
        return;
      }

      // Compute damage with location/crit
      let dmg = getPlayerAttack() * loc.mult;
      let isCrit = false;
      const critChance = Math.max(0, Math.min(0.6, 0.12 + loc.critBonus));
      if (rng() < critChance) {
        isCrit = true;
        dmg *= critMultiplier();
      }
      dmg = Math.max(0, round1(dmg));
      enemy.hp -= dmg;

      if (isCrit) {
        log(`Critical! You hit the ${enemy.type || "enemy"}'s ${loc.part} for ${dmg}.`, "crit");
      } else {
        log(`You hit the ${enemy.type || "enemy"}'s ${loc.part} for ${dmg}.`);
      }

      if (enemy.hp <= 0) {
        log(`${capitalize(enemy.type || "enemy")} dies.`, "death");
        // leave corpse with loot
        const loot = generateLoot(enemy);
        corpses.push({ x: enemy.x, y: enemy.y, loot, looted: loot.length === 0 });
        // award xp
        gainXP(enemy.xp || 5);
        enemies = enemies.filter(e => e !== enemy);
      }

      // Item decay on use (weapon/hands)
      decayEquipped("weapon", randFloat(1.0, 2.2, 1));
      decayEquipped("hands", randFloat(0.3, 1.0, 1));
      turn();
      return;
    }

    if (isWalkable(nx, ny) && !enemies.some(e => e.x === nx && e.y === ny)) {
      player.x = nx;
      player.y = ny;
      turn();
    }
  }

  /*
   Loot generation from a defeated enemy:
   - Always: some gold (scaled by enemy XP) and a chance for a small potion
   - Sometimes: a piece of equipment; stronger enemies have higher chances and tiers
   Equipment stats use a 0.0–4.0 scale (floats with 1 decimal) and are tier-biased:
   - Tier 1 (rusty): weaker ranges
   - Tier 2 (iron): mid ranges
   - Tier 3 (steel): strong ranges
  */
  function generateLoot(source) {
    const drops = [];
    // base coins scale slightly with source strength
    const baseCoins = randInt(1, 6);
    const bonus = source ? Math.floor((source.xp || 0) / 10) : 0;
    const coins = baseCoins + bonus;
    drops.push({ name: `${coins} gold`, kind: "gold", amount: coins });

    // Potions: lesser/average/strong; any enemy can drop one
    if (chance(0.35)) {
      drops.push(pickPotion(source));
    }

    // chance to drop equipment (higher for stronger enemies)
    const type = source?.type || "goblin";
    const tier = (window.Enemies && Enemies.equipTierFor) ? Enemies.equipTierFor(type) : (type === "ogre" ? 3 : (type === "troll" ? 2 : 1));
    const equipChance = (window.Enemies && Enemies.equipChanceFor) ? Enemies.equipChanceFor(type) : (type === "ogre" ? 0.75 : (type === "troll" ? 0.55 : 0.35));
    if (chance(equipChance)) {
      drops.push(pickEquipment(tier));
    }
    return drops;

    function pickPotion(source) {
      const t = source?.type || "goblin";
      let wL = 0.6, wA = 0.3, wS = 0.1;
      if (window.Enemies && Enemies.potionWeightsFor) {
        const w = Enemies.potionWeightsFor(t) || {};
        wL = typeof w.lesser === "number" ? w.lesser : wL;
        wA = typeof w.average === "number" ? w.average : wA;
        wS = typeof w.strong === "number" ? w.strong : wS;
      } else {
        if (t === "troll") { wL = 0.5; wA = 0.35; wS = 0.15; }
        if (t === "ogre") { wL = 0.4; wA = 0.35; wS = 0.25; }
      }
      const r = rng();
      if (r < wL) return { name: "lesser potion (+3 HP)", kind: "potion", heal: 3 };
      if (r < wL + wA) return { name: "average potion (+6 HP)", kind: "potion", heal: 6 };
      return { name: "strong potion (+10 HP)", kind: "potion", heal: 10 };
    }

    function pickEquipment(tier) {
      const material = tier === 1 ? "rusty" : tier === 2 ? "iron" : "steel";
      const categories = ["weapon", "offhand", "head", "torso", "legs", "hands"];
      const cat = categories[randInt(0, categories.length - 1)];

      if (cat === "weapon") {
        const w = ["sword", "axe", "bow"][randInt(0, 2)];
        // 0.0 - 4.0 scale, tier influences the range upwards
        const ranges = tier === 1 ? [0.5, 2.4] : tier === 2 ? [1.2, 3.4] : [2.2, 4.0];
        let atk = randFloat(ranges[0], ranges[1], 1);
        // axes slightly stronger on average
        if (w === "axe") atk = Math.min(4.0, round1(atk + randFloat(0.1, 0.5, 1)));
        return { kind: "equip", slot: "weapon", name: `${material} ${w}`, atk, tier, decay: initialDecay(tier) };
      }

      if (cat === "offhand") {
        const ranges = tier === 1 ? [0.4, 2.0] : tier === 2 ? [1.2, 3.2] : [2.0, 4.0];
        const def = randFloat(ranges[0], ranges[1], 1);
        return { kind: "equip", slot: "offhand", name: `${material} shield`, def, tier, decay: initialDecay(tier) };
      }

      if (cat === "head") {
        const ranges = tier === 1 ? [0.2, 1.6] : tier === 2 ? [0.8, 2.8] : [1.6, 3.6];
        const def = randFloat(ranges[0], ranges[1], 1);
        const name = tier >= 3 ? `${material} great helm` : `${material} helmet`;
        return { kind: "equip", slot: "head", name, def, tier, decay: initialDecay(tier) };
      }

      if (cat === "torso") {
        const ranges = tier === 1 ? [0.6, 2.6] : tier === 2 ? [1.6, 3.6] : [2.4, 4.0];
        const def = randFloat(ranges[0], ranges[1], 1);
        const name = tier >= 3 ? `${material} plate armor` : (tier === 2 ? `${material} chainmail` : `${material} leather armor`);
        return { kind: "equip", slot: "torso", name, def, tier, decay: initialDecay(tier) };
      }

      if (cat === "legs") {
        const ranges = tier === 1 ? [0.3, 1.8] : tier === 2 ? [1.0, 3.0] : [1.8, 3.8];
        const def = randFloat(ranges[0], ranges[1], 1);
        return { kind: "equip", slot: "legs", name: `${material} leg armor`, def, tier, decay: initialDecay(tier) };
      }

      if (cat === "hands") {
        const ranges = tier === 1 ? [0.2, 1.2] : tier === 2 ? [0.8, 2.4] : [1.2, 3.0];
        const def = randFloat(ranges[0], ranges[1], 1);
        const name = tier >= 2 ? `${material} gauntlets` : `${material} gloves`;
        const drop = { kind: "equip", slot: "hands", name, def, tier, decay: initialDecay(tier) };
        // Chance for offensive gauntlets
        if (tier >= 2 && chance(0.5)) {
          const atk = tier === 2 ? randFloat(0.1, 0.6, 1) : randFloat(0.2, 1.0, 1);
          drop.atk = atk;
        }
        return drop;
      }

      // fallback
      const atk = randFloat(0.8 + 0.4 * (tier - 1), 2.4 + 0.8 * (tier - 1), 1);
      return { kind: "equip", slot: "weapon", name: `${material} sword`, atk, tier, decay: initialDecay(tier) };
    }
  }

  /*
   Loots a corpse on the current tile:
   - Transfers gold to a stack, potions auto-consume, equipment auto-equips if better
   - Shows a loot panel listing what was obtained
   - Consumes a turn
  */
  function lootCorpse() {
    if (isDead) return;

    const here = corpses.filter(c => c.x === player.x && c.y === player.y);
    if (here.length === 0) {
      log("There is no corpse here to loot.");
      return;
    }
    // find first corpse here that still has loot
    const corpse = here.find(c => c.loot && c.loot.length > 0);
    if (!corpse) {
      // mark all as looted to fade them visually
      here.forEach(c => c.looted = true);
      log("All corpses here have nothing of value.");
      return;
    }

    // transfer loot to inventory
    const acquired = [];
    for (const item of corpse.loot) {
      if (item.kind === "equip") {
        const equipped = equipIfBetter(item);
        acquired.push(equipped ? `equipped ${describeItem(item)}` : describeItem(item));
        if (!equipped) {
          player.inventory.push(item);
        }
      } else if (item.kind === "gold") {
        const existing = player.inventory.find(i => i.kind === "gold");
        if (existing) existing.amount += item.amount;
        else player.inventory.push({ kind: "gold", amount: item.amount, name: "gold" });
        acquired.push(item.name);
      } else if (item.kind === "potion") {
        const heal = item.heal || 3;
        if (player.hp >= player.maxHp) {
          addPotionToInventory(heal, item.name);
          acquired.push(`${item.name}`);
        } else {
          const before = player.hp;
          player.hp = Math.min(player.maxHp, player.hp + heal);
          const gained = player.hp - before;
          log(`You drink a potion and restore ${gained.toFixed(1)} HP (HP ${player.hp.toFixed(1)}/${player.maxHp.toFixed(1)}).`, "good");
          acquired.push(item.name);
        }
      } else {
        player.inventory.push(item);
        acquired.push(item.name);
      }
    }
    updateUI();
    corpse.loot = [];
    corpse.looted = true;

    showLootPanel(acquired);
    log(`You loot: ${acquired.join(", ")}.`);
    turn(); // looting consumes a turn
  }

  function showLootPanel(list) {
    if (window.UI && typeof UI.showLoot === "function") {
      UI.showLoot(list);
      return;
    }
    if (!lootPanel) return;
    lootList.innerHTML = "";
    list.forEach(name => {
      const li = document.createElement("li");
      li.textContent = name;
      lootList.appendChild(li);
    });
    lootPanel.hidden = false;
  }

  function hideLootPanel() {
    if (window.UI && typeof UI.hideLoot === "function") {
      UI.hideLoot();
      return;
    }
    if (!lootPanel) return;
    lootPanel.hidden = true;
  }

  // Inventory & Equipment panel
  function renderInventoryPanel() {
    if (window.UI && typeof UI.renderInventory === "function") {
      // Keep totals in sync
      updateUI();
      UI.renderInventory(player, describeItem);
    }
  }

  function showInventoryPanel() {
    renderInventoryPanel();
    if (window.UI && typeof UI.showInventory === "function") {
      UI.showInventory();
    } else if (invPanel) {
      invPanel.hidden = false;
    }
  }

  function hideInventoryPanel() {
    if (window.UI && typeof UI.hideInventory === "function") {
      UI.hideInventory();
      return;
    }
    if (!invPanel) return;
    invPanel.hidden = true;
  }

  function equipItemByIndex(idx) {
    if (!player.inventory || idx < 0 || idx >= player.inventory.length) return;
    const item = player.inventory[idx];
    if (!item || item.kind !== "equip") {
      log("That item cannot be equipped.");
      return;
    }
    const slot = item.slot;
    const prev = player.equipment[slot];
    // remove from inventory
    player.inventory.splice(idx, 1);
    // equip
    player.equipment[slot] = item;
    const statStr = ("atk" in item) ? `+${item.atk} atk` : ("def" in item) ? `+${item.def} def` : "";
    log(`You equip ${item.name} (${slot}${statStr ? ", " + statStr : ""}).`);
    // return previous to inventory
    if (prev) {
      player.inventory.push(prev);
      log(`You stow ${describeItem(prev)} into your inventory.`);
    }
    updateUI();
    renderInventoryPanel();
  }

  

  function showGameOver() {
    if (window.UI && typeof UI.showGameOver === "function") {
      UI.showGameOver(player, floor);
      return;
    }
    if (lootPanel && !lootPanel.hidden) hideLootPanel();
    if (!gameOverPanel) return;
    const gold = (player.inventory.find(i => i.kind === "gold")?.amount) || 0;
    if (gameOverSummary) {
      gameOverSummary.textContent = `You died on floor ${floor} (Lv ${player.level}). Gold: ${gold}. XP: ${player.xp}/${player.xpNext}.`;
    }
    gameOverPanel.hidden = false;
  }

  function hideGameOver() {
    if (window.UI && typeof UI.hideGameOver === "function") {
      UI.hideGameOver();
      return;
    }
    if (!gameOverPanel) return;
    gameOverPanel.hidden = true;
  }

  function restartGame() {
    hideGameOver();
    floor = 1;
    isDead = false;
    generateLevel(floor);
  }

  /*
   XP and leveling:
   - Gain XP on kills; when threshold reached, level up
   - Level up: +Max HP, full heal, +Atk every other level, next threshold increases
  */
  function gainXP(amount) {
    player.xp += amount;
    log(`You gain ${amount} XP.`);
    while (player.xp >= player.xpNext) {
      player.xp -= player.xpNext;
      player.level += 1;
      player.maxHp += 2;
      player.hp = player.maxHp;
      if (player.level % 2 === 0) player.atk += 1;
      player.xpNext = Math.floor(player.xpNext * 1.3 + 10);
      log(`You are now level ${player.level}. Max HP increased.`);
    }
    updateUI();
  }

  /*
   Refreshes small UI labels in the top panel:
   - HP and Gold on the left, Floor / Level / XP on the right
  */
  function updateUI() {
    if (window.UI && typeof UI.updateStats === "function") {
      UI.updateStats(player, floor, getPlayerAttack, getPlayerDefense);
      return;
    }
    // Fallback if UI module not loaded
    const gold = (player.inventory.find(i => i.kind === "gold")?.amount) || 0;
    hpEl.textContent = `HP: ${player.hp.toFixed(1)}/${player.maxHp.toFixed(1)}  Gold: ${gold}`;
    floorEl.textContent = `Floor: ${floor}  Lv: ${player.level}  XP: ${player.xp}/${player.xpNext}`;
  }

  /*
   Enemy AI:
   - If adjacent: attack (damage reduced by your total defense)
   - If within sense range: greedy step toward player with simple fallback wiggle
   - Otherwise: small chance to wander
  */
  function enemiesAct() {
    const senseRange = 8;
    for (const e of enemies) {
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const dist = Math.abs(dx) + Math.abs(dy);

      // attack if adjacent
      if (Math.abs(dx) + Math.abs(dy) === 1) {
        const loc = rollHitLocation();

        // Player attempts to block with offhand/position
        if (rng() < getPlayerBlockChance(loc)) {
          log(`You block the ${e.type || "enemy"}'s attack to your ${loc.part}.`, "block");
          // Blocking uses gear
          decayEquipped("offhand", randFloat(0.6, 1.6, 1));
          decayEquipped("hands", randFloat(0.3, 1.0, 1));
          continue;
        }

        // Compute damage with location and crit; then reduce by defense
        let raw = e.atk * enemyDamageMultiplier(e.level) * loc.mult;
        let isCrit = false;
        const critChance = Math.max(0, Math.min(0.5, 0.10 + loc.critBonus));
        if (rng() < critChance) {
          isCrit = true;
          raw *= critMultiplier();
        }
        const dmg = enemyDamageAfterDefense(raw);
        player.hp -= dmg;
        if (isCrit) {
          log(`Critical! ${capitalize(e.type || "enemy")} hits your ${loc.part} for ${dmg}.`, "crit");
        } else {
          log(`${capitalize(e.type || "enemy")} hits your ${loc.part} for ${dmg}.`);
        }

        // Item decay on being hit (armor/offhand/hands)
        decayEquipped("offhand", randFloat(0.6, 1.6, 1));
        decayEquipped("torso", randFloat(0.8, 2.0, 1));
        decayEquipped("head", randFloat(0.3, 1.0, 1));
        decayEquipped("legs", randFloat(0.4, 1.3, 1));
        decayEquipped("hands", randFloat(0.3, 1.0, 1));
        if (player.hp <= 0) {
          player.hp = 0;
          isDead = true;
          updateUI();
          log("You die. Press R or Enter to restart.", "death");
          showGameOver();
          // stop further AI this turn
          return;
        }
        continue;
      }

      if (dist <= senseRange) {
        // try step closer; prefer axis with greater delta
        const sx = dx === 0 ? 0 : dx > 0 ? 1 : -1;
        const sy = dy === 0 ? 0 : dy > 0 ? 1 : -1;

        const tryDirs = Math.abs(dx) > Math.abs(dy) ? [{x:sx,y:0},{x:0,y:sy}] : [{x:0,y:sy},{x:sx,y:0}];
        let moved = false;
        for (const d of tryDirs) {
          const nx = e.x + d.x;
          const ny = e.y + d.y;
          if (isWalkable(nx, ny) && !occupied(nx, ny)) {
            e.x = nx; e.y = ny; moved = true; break;
          }
        }
        if (!moved) {
          // try alternate directions (simple wiggle)
          const alt = [{x:-1,y:0},{x:1,y:0},{x:0,y:-1},{x:0,y:1}];
          for (const d of alt) {
            const nx = e.x + d.x;
            const ny = e.y + d.y;
            if (isWalkable(nx, ny) && !occupied(nx, ny)) { e.x = nx; e.y = ny; break; }
          }
        }
      } else if (chance(0.3)) {
        // random wander
        const dirs = [{x:-1,y:0},{x:1,y:0},{x:0,y:-1},{x:0,y:1}];
        const d = dirs[randInt(0, dirs.length - 1)];
        const nx = e.x + d.x, ny = e.y + d.y;
        if (isWalkable(nx, ny) && !occupied(nx, ny)) { e.x = nx; e.y = ny; }
      }
    }
  }

  function occupied(x, y) {
    if (player.x === x && player.y === y) return true;
    return enemies.some(e => e.x === x && e.y === y);
  }

  /*
   One full game turn after a player action:
   - Enemies take their actions
   - Recompute field of view
   - Update UI and redraw the scene
  */
  function turn() {
    enemiesAct();
    recomputeFOV();
    updateUI();
    draw();
  }

  // Game loop (only needed for animations; we redraw on each turn anyway)
  /*
   Lightweight animation loop:
   - Keeps the canvas fresh and responsive to hover effects or future animations
   - Core redraws happen during turns; this is a safety net
  */
  function loop() {
    draw();
    requestAnimationFrame(loop);
  }

  // Initialize modules
  if (window.UI && typeof UI.init === "function") {
    UI.init();
    if (typeof UI.setHandlers === "function") {
      UI.setHandlers({
        onEquip: (idx) => equipItemByIndex(idx),
        onDrink: (idx) => drinkPotionByIndex(idx),
        onRestart: () => restartGame(),
      });
    }
  }

  // Start
  generateLevel(floor);
  loop();
})();