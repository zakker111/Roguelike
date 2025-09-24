

/**
 * Game: main loop, world state, combat, FOV/render orchestration, and glue.
 *
 * Responsibilities:
 * - Manage map, entities, player, RNG, and turn sequence
 * - Handle movement, bump-to-attack, blocks/crits/body-part, damage/DR, equipment decay
 * - Orchestrate FOV and drawing; bridge to UI and modules via ctx
 * - GOD toggles: always-crit (with forced body-part)
 *
 * Notes:
 * - Uses Ctx.create(base) to provide a normalized ctx to modules.
 * - Randomness is deterministic via mulberry32; helpers (randInt, randFloat, chance) built over it.
 */
(() => {
  const TILE = 32;
  const COLS = 30;
  const ROWS = 20;
  
  const MAP_COLS = 60;
  const MAP_ROWS = 40;

  const FOV_DEFAULT = 8;
  let fovRadius = FOV_DEFAULT;

  
  const camera = {
    x: 0,
    y: 0,
    width: COLS * TILE,
    height: ROWS * TILE,
  };

  
  const TILES = {
    WALL: 0,
    FLOOR: 1,
    DOOR: 2,
    STAIRS: 3,
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

  
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  
  let map = [];
  let seen = [];
  let visible = [];
  let player = (window.Player && typeof Player.createInitial === "function")
    ? Player.createInitial()
    : { x: 0, y: 0, hp: 40, maxHp: 40, inventory: [], atk: 1, xp: 0, level: 1, xpNext: 20, equipment: { left: null, right: null, head: null, torso: null, legs: null, hands: null } };
  let enemies = [];
  let corpses = [];
  // Visual decals like blood stains on the floor; array of { x, y, a (alpha 0..1), r (radius px) }
  let decals = [];
  let floor = 1;
  window.floor = floor;
  // RNG: allow persisted seed for reproducibility; default to time-based if none
  let currentSeed = (typeof localStorage !== "undefined" && localStorage.getItem("SEED")) ? Number(localStorage.getItem("SEED")) >>> 0 : null;
  let rng = mulberry32((currentSeed == null ? (Date.now() % 0xffffffff) : currentSeed) >>> 0);
  let isDead = false;
  let startRoomRect = null;
  // GOD toggles
  let alwaysCrit = (typeof window !== "undefined" && typeof window.ALWAYS_CRIT === "boolean") ? !!window.ALWAYS_CRIT : false;
  let forcedCritPart = (typeof window !== "undefined" && typeof window.ALWAYS_CRIT_PART === "string") ? window.ALWAYS_CRIT_PART : (typeof localStorage !== "undefined" ? (localStorage.getItem("ALWAYS_CRIT_PART") || "") : "");

  
  function getCtx() {
    const base = {
      rng,
      ROWS, COLS, MAP_ROWS, MAP_COLS, TILE, TILES,
      player, enemies, corpses, decals, map, seen, visible,
      floor, depth: floor,
      fovRadius,
      requestDraw,
      log,
      isWalkable, inBounds,
      // Prefer modules to use ctx.utils.*; keep these for backward use and fallbacks.
      round1, randInt, chance, randFloat,
      enemyColor, describeItem,
      setFovRadius,
      getPlayerAttack, getPlayerDefense, getPlayerBlockChance,
      enemyThreatLabel,
      // Needed by loot and UI flows
      updateUI: () => updateUI(),
      initialDecay: (tier) => initialDecay(tier),
      equipIfBetter: (item) => equipIfBetter(item),
      addPotionToInventory: (heal, name) => addPotionToInventory(heal, name),
      renderInventory: () => renderInventoryPanel(),
      showLoot: (list) => showLootPanel(list),
      hideLoot: () => hideLootPanel(),
      turn: () => turn(),
      // Combat helpers
      rollHitLocation,
      critMultiplier,
      enemyDamageAfterDefense,
      enemyDamageMultiplier,
      // Visual decals
      addBloodDecal: (x, y, mult) => addBloodDecal(x, y, mult),
      // Decay and side effects
      decayBlockingHands,
      decayEquipped,
      rerenderInventoryIfOpen,
      onPlayerDied: () => {
        isDead = true;
        updateUI();
        log("You die. Press R or Enter to restart.", "bad");
        showGameOver();
      },
      onEnemyDied: (enemy) => killEnemy(enemy),
    };

    if (window.Ctx && typeof Ctx.create === "function") {
      const ctx = Ctx.create(base);
      // enemy factory prefers ctx.Enemies handle, falling back gracefully
      ctx.enemyFactory = (x, y, depth) => {
        const EM = ctx.Enemies || (typeof window !== "undefined" ? window.Enemies : null);
        if (EM && typeof EM.createEnemyAt === "function") {
          return EM.createEnemyAt(x, y, depth, rng);
        }
        return { x, y, type: "goblin", glyph: "g", hp: 3, atk: 1, xp: 5, level: depth, announced: false };
      };
      if (window.DEV && ctx && ctx.utils) {
        try {
          console.debug("[DEV] ctx created:", {
            utils: Object.keys(ctx.utils),
            los: !!(ctx.los || ctx.LOS),
            modules: {
              Enemies: !!ctx.Enemies, Items: !!ctx.Items, Player: !!ctx.Player,
              UI: !!ctx.UI, Logger: !!ctx.Logger, Loot: !!ctx.Loot,
              Dungeon: !!ctx.Dungeon, DungeonItems: !!ctx.DungeonItems,
              FOV: !!ctx.FOV, AI: !!ctx.AI, Input: !!ctx.Input,
              Render: !!ctx.Render, Tileset: !!ctx.Tileset, Flavor: !!ctx.Flavor
            }
          });
        } catch (_) {}
      }
      return ctx;
    }

    // Fallback without Ctx: include a local enemyFactory using window.Enemies if present
    base.enemyFactory = (x, y, depth) => {
      if (typeof window !== "undefined" && window.Enemies && typeof window.Enemies.createEnemyAt === "function") {
        return window.Enemies.createEnemyAt(x, y, depth, rng);
      }
      return { x, y, type: "goblin", glyph: "g", hp: 3, atk: 1, xp: 5, level: depth, announced: false };
    };
    return base;
  }

  function mulberry32(a) {
    return function() {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const randInt = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
  const chance = (p) => rng() < p;
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
  const round1 = (window.PlayerUtils && typeof PlayerUtils.round1 === "function")
    ? PlayerUtils.round1
    : (n) => Math.round(n * 10) / 10;

  // Decay helpers
  function initialDecay(tier) {
    if (window.Items && typeof Items.initialDecay === "function") {
      return Items.initialDecay(tier);
    }
    
    if (tier <= 1) return randFloat(10, 35, 0);
    if (tier === 2) return randFloat(5, 20, 0);
    return randFloat(0, 10, 0);
  }

  function rerenderInventoryIfOpen() {
    if (window.UIBridge && typeof UIBridge.isInventoryOpen === "function" && UIBridge.isInventoryOpen()) {
      renderInventoryPanel();
    } else if (window.UI && UI.isInventoryOpen && UI.isInventoryOpen()) {
      renderInventoryPanel();
    }
  }

  function decayEquipped(slot, amount) {
    if (window.Player && typeof Player.decayEquipped === "function") {
      Player.decayEquipped(player, slot, amount, {
        log,
        updateUI,
        onInventoryChange: () => rerenderInventoryIfOpen(),
      });
      return;
    }
    
    const it = player.equipment?.[slot];
    if (!it) return;
    const before = it.decay || 0;
    it.decay = Math.min(100, round1(before + amount));
    if (it.decay >= 100) {
      log(`${capitalize(it.name)} breaks and is destroyed.`, "bad");
      // Optional flavor for breakage
      try {
        if (window.Flavor && typeof Flavor.onBreak === "function") {
          Flavor.onBreak(getCtx(), { side: "player", slot, item: it });
        }
      } catch (_) {}
      player.equipment[slot] = null;
      updateUI();
      rerenderInventoryIfOpen();
    } else if (Math.floor(before) !== Math.floor(it.decay)) {
      rerenderInventoryIfOpen();
    }
  }

  
  function getPlayerAttack() {
    if (window.Player && typeof Player.getAttack === "function") {
      return Player.getAttack(player);
    }
    let bonus = 0;
    const eq = player.equipment || {};
    if (eq.left && typeof eq.left.atk === "number") bonus += eq.left.atk;
    if (eq.right && typeof eq.right.atk === "number") bonus += eq.right.atk;
    if (eq.hands && typeof eq.hands.atk === "number") bonus += eq.hands.atk;
    const levelBonus = Math.floor((player.level - 1) / 2);
    return round1(player.atk + bonus + levelBonus);
  }

  
  function getPlayerDefense() {
    if (window.Player && typeof Player.getDefense === "function") {
      return Player.getDefense(player);
    }
    let def = 0;
    const eq = player.equipment || {};
    if (eq.left && typeof eq.left.def === "number") def += eq.left.def;
    if (eq.right && typeof eq.right.def === "number") def += eq.right.def;
    if (eq.head && typeof eq.head.def === "number") def += eq.head.def;
    if (eq.torso && typeof eq.torso.def === "number") def += eq.torso.def;
    if (eq.legs && typeof eq.legs.def === "number") def += eq.legs.def;
    if (eq.hands && typeof eq.hands.def === "number") def += eq.hands.def;
    return round1(def);
  }

  function describeItem(item) {
    // Single source of truth: prefer Player.describeItem, then Items.describe
    if (window.Player && typeof Player.describeItem === "function") {
      return Player.describeItem(item);
    }
    if (window.Items && typeof Items.describe === "function") {
      return Items.describe(item);
    }
    // Minimal fallback
    if (!item) return "";
    return item.name || "item";
  }

  
  function rollHitLocation() {
    if (window.Combat && typeof Combat.rollHitLocation === "function") {
      return Combat.rollHitLocation(rng);
    }
    const r = rng();
    if (r < 0.50) return { part: "torso", mult: 1.0, blockMod: 1.0, critBonus: 0.00 };
    if (r < 0.65) return { part: "head",  mult: 1.1, blockMod: 0.85, critBonus: 0.15 };
    if (r < 0.80) return { part: "hands", mult: 0.9, blockMod: 0.75, critBonus: -0.05 };
    return { part: "legs", mult: 0.95, blockMod: 0.75, critBonus: -0.03 };
  }

  function critMultiplier() {
    if (window.Combat && typeof Combat.critMultiplier === "function") {
      return Combat.critMultiplier(rng);
    }
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
    const eq = player.equipment || {};
    const leftDef = (eq.left && typeof eq.left.def === "number") ? eq.left.def : 0;
    const rightDef = (eq.right && typeof eq.right.def === "number") ? eq.right.def : 0;
    const handDef = Math.max(leftDef, rightDef);
    const base = 0.08 + handDef * 0.06;
    return Math.max(0, Math.min(0.6, base * (loc?.blockMod || 1.0)));
  }

  // Enemy damage after applying player's defense with diminishing returns and a chip-damage floor
  function enemyDamageAfterDefense(raw) {
    const def = getPlayerDefense();
    
    const DR = Math.max(0, Math.min(0.85, def / (def + 6)));
    const reduced = raw * (1 - DR);
    return Math.max(0.1, round1(reduced));
  }

  
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

  
  function setFovRadius(r) {
    const clamped = Math.max(3, Math.min(14, r));
    if (clamped !== fovRadius) {
      fovRadius = clamped;
      log(`FOV radius set to ${fovRadius}.`);
      recomputeFOV();
      requestDraw();
    }
  }
  function adjustFov(delta) {
    setFovRadius(fovRadius + delta);
  }

  
  function addPotionToInventory(heal = 3, name = `potion (+${heal} HP)`) {
    if (window.Player && typeof Player.addPotion === "function") {
      Player.addPotion(player, heal, name);
      return;
    }
    const existing = player.inventory.find(i => i.kind === "potion" && (i.heal ?? 3) === heal);
    if (existing) {
      existing.count = (existing.count || 1) + 1;
    } else {
      player.inventory.push({ kind: "potion", heal, count: 1, name });
    }
  }

  function drinkPotionByIndex(idx) {
    if (window.Player && typeof Player.drinkPotionByIndex === "function") {
      Player.drinkPotionByIndex(player, idx, {
        log,
        updateUI,
        renderInventory: () => renderInventoryPanel(),
      });
      return;
    }
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
      player.inventory.splice(idx, 1);
    }
    updateUI();
    renderInventoryPanel();
  }

  
  function equipIfBetter(item) {
    if (window.Player && typeof Player.equipIfBetter === "function") {
      return Player.equipIfBetter(player, item, {
        log,
        updateUI,
        renderInventory: () => renderInventoryPanel(),
        describeItem: (it) => describeItem(it),
      });
    }
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
      renderInventoryPanel();
      return true;
    }
    return false;
  }

  
  function log(msg, type = "info") {
    if (window.Logger && typeof Logger.log === "function") {
      Logger.log(msg, type);
      return;
    }
    // Fallback (in case logger.js isn't loaded)
    const el = document.getElementById("log");
    if (!el) return;
    const div = document.createElement("div");
    div.className = `entry ${type}`;
    div.textContent = msg;
    el.prepend(div);
    const MAX = 60;
    while (el.childNodes.length > MAX) {
      el.removeChild(el.lastChild);
    }
  }

  
  
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
      // Clear decals on new floor
      decals = [];
      
      recomputeFOV();
      updateCamera();
      
      if (inBounds(player.x, player.y) && !visible[player.y][player.x]) {
        try { log("FOV sanity check: player tile not visible after gen; recomputing.", "warn"); } catch (_) {}
        recomputeFOV();
        if (inBounds(player.x, player.y)) {
          visible[player.y][player.x] = true;
          seen[player.y][player.x] = true;
        }
      }
      if (window.DEV) {
        try {
          const visCount = enemies.filter(e => inBounds(e.x, e.y) && visible[e.y][e.x]).length;
          log(`[DEV] Enemies spawned: ${enemies.length}, visible now: ${visCount}.`, "notice");
        } catch (_) {}
      }
      updateUI();
      log(`You descend to floor ${depth}.`);
      requestDraw();
      return;
    }
    
    map = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLS).fill(TILES.FLOOR));
    // Ensure a staircase exists in the fallback map
    const sy = Math.max(1, MAP_ROWS - 2), sx = Math.max(1, MAP_COLS - 2);
    if (map[sy] && typeof map[sy][sx] !== "undefined") {
      map[sy][sx] = TILES.STAIRS;
    }
    enemies = [];
    corpses = [];
    decals = [];
    recomputeFOV();
    updateCamera();
    updateUI();
    log(`You descend to floor ${depth}.`);
    requestDraw();
  }

  function inBounds(x, y) {
    const mh = map.length || MAP_ROWS;
    const mw = map[0] ? map[0].length : MAP_COLS;
    return x >= 0 && y >= 0 && x < mw && y < mh;
  }

  function isWalkable(x, y) {
    if (!inBounds(x, y)) return false;
    const t = map[y][x];
    return t === TILES.FLOOR || t === TILES.DOOR || t === TILES.STAIRS;
  }

  

  
  function createEnemyAt(x, y, depth) {
    if (window.Enemies && typeof Enemies.createEnemyAt === "function") {
      return Enemies.createEnemyAt(x, y, depth, rng);
    }
    // Fallback (shouldn't happen if enemies.js is loaded)
    const type = "goblin";
    const level = enemyLevelFor(type, depth);
    return { x, y, type, glyph: "g", hp: 3, atk: 1, xp: 5, level, announced: false };
  }

  
  
  function ensureVisibilityShape() {
    const rows = map.length;
    const cols = map[0] ? map[0].length : 0;
    const shapeOk = Array.isArray(visible) && visible.length === rows && (rows === 0 || (visible[0] && visible[0].length === cols));
    if (!shapeOk) {
      visible = Array.from({ length: rows }, () => Array(cols).fill(false));
    }
    const seenOk = Array.isArray(seen) && seen.length === rows && (rows === 0 || (seen[0] && seen[0].length === cols));
    if (!seenOk) {
      seen = Array.from({ length: rows }, () => Array(cols).fill(false));
    }
  }

  function recomputeFOV() {
    ensureVisibilityShape();
    if (window.FOV && typeof FOV.recomputeFOV === "function") {
      const ctx = getCtx();
      ctx.seen = seen;
      ctx.visible = visible;
      FOV.recomputeFOV(ctx);
      visible = ctx.visible;
      seen = ctx.seen;
      return;
    }
    // Fallback: reveal player tile at least
    if (inBounds(player.x, player.y)) {
      visible[player.y][player.x] = true;
      seen[player.y][player.x] = true;
    }
  }

  
  function updateCamera() {
    // Center camera on player
    const mapCols = map[0] ? map[0].length : COLS;
    const mapRows = map ? map.length : ROWS;
    const mapWidth = mapCols * TILE;
    const mapHeight = mapRows * TILE;

    const targetX = player.x * TILE + TILE / 2 - camera.width / 2;
    const targetY = player.y * TILE + TILE / 2 - camera.height / 2;

    camera.x = Math.max(0, Math.min(targetX, Math.max(0, mapWidth - camera.width)));
    camera.y = Math.max(0, Math.min(targetY, Math.max(0, mapHeight - camera.height)));
  }

  
  function getRenderCtx() {
    return {
      ctx2d: ctx,
      TILE, ROWS, COLS, COLORS, TILES,
      map, seen, visible,
      player, enemies, corpses, decals,
      camera,
      enemyColor: (t) => enemyColor(t),
    };
  }

  
  let needsDraw = true;
  function requestDraw() { needsDraw = true; }
  function draw() {
    if (!needsDraw) return;
    if (window.Render && typeof Render.draw === "function") {
      Render.draw(getRenderCtx());
    }
    needsDraw = false;
  }

  

  function descendIfPossible() {
    hideLootPanel();
    const here = map[player.y][player.x];
    // Restrict descending to STAIRS tile only for clarity
    if (here === TILES.STAIRS) {
      floor += 1;
      window.floor = floor;
      generateLevel(floor);
    } else {
      log("You need to stand on the staircase (brown tile marked with '>') to descend.");
    }
  }

  function setupInput() {
    if (window.Input && typeof Input.init === "function") {
      Input.init({
        // state queries
        isDead: () => isDead,
        isInventoryOpen: () => {
          if (window.UIBridge && typeof UIBridge.isInventoryOpen === "function") return UIBridge.isInventoryOpen();
          return !!(window.UI && UI.isInventoryOpen && UI.isInventoryOpen());
        },
        isLootOpen: () => {
          if (window.UIBridge && typeof UIBridge.isLootOpen === "function") return UIBridge.isLootOpen();
          return !!(window.UI && UI.isLootOpen && UI.isLootOpen());
        },
        isGodOpen: () => {
          if (window.UIBridge && typeof UIBridge.isGodOpen === "function") return UIBridge.isGodOpen();
          return !!(window.UI && UI.isGodOpen && UI.isGodOpen());
        },
        // actions
        onRestart: () => restartGame(),
        onShowInventory: () => showInventoryPanel(),
        onHideInventory: () => hideInventoryPanel(),
        onHideLoot: () => hideLootPanel(),
        onHideGod: () => { if (window.UIBridge && typeof UIBridge.hideGod === "function") UIBridge.hideGod(); else if (window.UI && UI.hideGod) UI.hideGod(); requestDraw(); },
        onShowGod: () => {
          if (window.UIBridge && typeof UIBridge.setGodFov === "function") UIBridge.setGodFov(fovRadius);
          if (window.UIBridge && typeof UIBridge.showGod === "function") UIBridge.showGod();
          else if (window.UI && typeof UI.showGod === "function") UI.showGod();
          requestDraw();
        },
        onMove: (dx, dy) => tryMovePlayer(dx, dy),
        onWait: () => turn(),
        onLoot: () => lootCorpse(),
        onDescend: () => descendIfPossible(),
        adjustFov: (delta) => adjustFov(delta),
      });
    }
  }

  
  // Visual: add or strengthen a blood decal at tile (x,y)
  function addBloodDecal(x, y, mult = 1.0) {
    if (!inBounds(x, y)) return;
    // Merge on same tile
    const d = decals.find(d => d.x === x && d.y === y);
    const baseA = 0.16 + rng() * 0.18; // 0.16..0.34
    const baseR = Math.floor(TILE * (0.32 + rng() * 0.20)); // radius px
    if (d) {
      d.a = Math.min(0.9, d.a + baseA * mult);
      d.r = Math.max(d.r, baseR);
    } else {
      decals.push({ x, y, a: Math.min(0.9, baseA * mult), r: baseR });
      // Cap total decals to avoid unbounded growth
      if (decals.length > 240) decals.splice(0, decals.length - 240);
    }
  }

  function tryMovePlayer(dx, dy) {
    if (isDead) return;
    // Dazed: skip action if dazedTurns > 0
    if (player.dazedTurns && player.dazedTurns > 0) {
      player.dazedTurns -= 1;
      log("You are dazed and lose your action this turn.", "warn");
      turn();
      return;
    }
    const nx = player.x + dx;
    const ny = player.y + dy;
    if (!inBounds(nx, ny)) return;

    
    const enemy = enemies.find(e => e.x === nx && e.y === ny);
    if (enemy) {
      const ctx = getCtx();
      const res = (window.CombatCore && typeof CombatCore.playerAttackEnemy === "function")
        ? CombatCore.playerAttackEnemy(ctx, enemy, { forcedCritPart: (alwaysCrit && forcedCritPart) ? forcedCritPart : "" })
        : null;
      // Fallback to previous inline logic if CombatCore is unavailable
      if (!res) {
        let loc = rollHitLocation();
        if (alwaysCrit && forcedCritPart) {
          const profiles = {
            torso: { part: "torso", mult: 1.0, blockMod: 1.0, critBonus: 0.00 },
            head:  { part: "head",  mult: 1.1, blockMod: 0.85, critBonus: 0.15 },
            hands: { part: "hands", mult: 0.9, blockMod: 0.75, critBonus: -0.05 },
            legs:  { part: "legs",  mult: 0.95, blockMod: 0.75, critBonus: -0.03 },
          };
          if (profiles[forcedCritPart]) loc = profiles[forcedCritPart];
        }
        if (rng() < getEnemyBlockChance(enemy, loc)) {
          log(`${capitalize(enemy.type || "enemy")} blocks your attack to the ${loc.part}.`, "block");
          decayAttackHands(true);
          decayEquipped("hands", randFloat(0.2, 0.7, 1));
          turn();
          return;
        }
        let dmg = getPlayerAttack() * loc.mult;
        let isCrit = false;
        const critChance = Math.max(0, Math.min(0.6, 0.12 + loc.critBonus));
        if (alwaysCrit || rng() < critChance) {
          isCrit = true;
          dmg *= critMultiplier();
        }
        dmg = Math.max(0, round1(dmg));
        enemy.hp -= dmg;
        if (dmg > 0) {
          addBloodDecal(enemy.x, enemy.y, isCrit ? 1.6 : 1.0);
        }
        if (isCrit) log(`Critical! You hit the ${enemy.type || "enemy"}'s ${loc.part} for ${dmg}.`, "crit");
        else log(`You hit the ${enemy.type || "enemy"}'s ${loc.part} for ${dmg}.`);
        { const ctx2 = getCtx(); if (ctx2.Flavor && typeof ctx2.Flavor.logPlayerHit === "function") ctx2.Flavor.logPlayerHit(ctx2, { target: enemy, loc, crit: isCrit, dmg }); }
        if (isCrit && loc.part === "legs" && enemy.hp > 0) {
          if (window.Status && typeof Status.applyLimpToEnemy === "function") {
            Status.applyLimpToEnemy(getCtx(), enemy, 2);
          } else {
            enemy.immobileTurns = Math.max(enemy.immobileTurns || 0, 2);
            log(`${capitalize(enemy.type || "enemy")} staggers; its legs are crippled and it can't move for 2 turns.`, "notice");
          }
        }
        if (isCrit && enemy.hp > 0 && window.Status && typeof Status.applyBleedToEnemy === "function") {
          Status.applyBleedToEnemy(getCtx(), enemy, 2);
        }
        if (enemy.hp <= 0) {
          killEnemy(enemy);
        }
        decayAttackHands();
        decayEquipped("hands", randFloat(0.3, 1.0, 1));
      }
      turn();
      return;
    }

    if (isWalkable(nx, ny) && !enemies.some(e => e.x === nx && e.y === ny)) {
      player.x = nx;
      player.y = ny;
      updateCamera();
      turn();
    }
  }

  
  function generateLoot(source) {
    if (window.Loot && typeof Loot.generate === "function") {
      return Loot.generate(getCtx(), source);
    }
    return [];
  }

  
  function lootCorpse() {
    if (isDead) return;
    if (window.Loot && typeof Loot.lootHere === "function") {
      Loot.lootHere(getCtx());
      return;
    }
  }

  function showLootPanel(list) {
    if (window.UIBridge && typeof UIBridge.showLoot === "function") {
      UIBridge.showLoot(list);
      requestDraw();
      return;
    }
    if (window.UI && typeof UI.showLoot === "function") {
      UI.showLoot(list);
      requestDraw();
    }
  }

  function hideLootPanel() {
    if (window.UIBridge && typeof UIBridge.hideLoot === "function") {
      UIBridge.hideLoot();
      requestDraw();
      return;
    }
    if (window.UI && typeof UI.hideLoot === "function") {
      UI.hideLoot();
      requestDraw();
      return;
    }
    const panel = document.getElementById("loot-panel");
    if (!panel) return;
    panel.hidden = true;
    requestDraw();
  }

  // GOD mode actions
  function godHeal() {
    const prev = player.hp;
    player.hp = player.maxHp;
    if (player.hp > prev) {
      log(`GOD: You are fully healed (${player.hp.toFixed(1)}/${player.maxHp.toFixed(1)} HP).`, "good");
    } else {
      log(`GOD: HP already full (${player.hp.toFixed(1)}/${player.maxHp.toFixed(1)}).`, "warn");
    }
    updateUI();
    requestDraw();
  }

  function godSpawnStairsHere() {
    if (!inBounds(player.x, player.y)) {
      log("GOD: Cannot place stairs out of bounds.", "warn");
      return;
    }
    map[player.y][player.x] = TILES.STAIRS;
    seen[player.y][player.x] = true;
    visible[player.y][player.x] = true;
    log("GOD: Stairs appear beneath your feet.", "notice");
    requestDraw();
  }

  function godSpawnItems(count = 3) {
    const created = [];
    for (let i = 0; i < count; i++) {
      let it = null;
      
      if (window.Items && typeof Items.createEquipment === "function") {
        const tier = Math.min(3, Math.max(1, Math.floor((floor + 1) / 2)));
        it = Items.createEquipment(tier, rng);
      } else if (window.DungeonItems && DungeonItems.lootFactories && typeof DungeonItems.lootFactories === "object") {
        
        const keys = Object.keys(DungeonItems.lootFactories);
        if (keys.length > 0) {
          const k = keys[randInt(0, keys.length - 1)];
          try { it = DungeonItems.lootFactories[k](getCtx(), { tier: 2 }); } catch (_) {}
        }
      }
      if (!it) {
        
        if (rng() < 0.5) it = { kind: "equip", slot: "hand", name: "debug sword", atk: 1.5, tier: 2, decay: initialDecay(2) };
        else it = { kind: "equip", slot: "torso", name: "debug armor", def: 1.0, tier: 2, decay: initialDecay(2) };
      }
      player.inventory.push(it);
      created.push(describeItem(it));
    }
    if (created.length) {
      log(`GOD: Spawned ${created.length} item${created.length > 1 ? "s" : ""}:`);
      created.forEach(n => log(`- ${n}`));
      updateUI();
      renderInventoryPanel();
      requestDraw();
    }
  }

  /**
   * Spawn one or more enemies near the player (debug/GOD).
   * - Chooses a free FLOOR tile within a small radius; falls back to any free floor tile.
   * - Creates enemy via ctx.enemyFactory or Enemies.createEnemyAt.
   * - Applies small randomized jitters to hp/atk for variety (deterministic via rng).
   */
  function godSpawnEnemyNearby(count = 1) {
    const isFreeFloor = (x, y) => {
      if (!inBounds(x, y)) return false;
      if (map[y][x] !== TILES.FLOOR) return false;
      if (player.x === x && player.y === y) return false;
      if (enemies.some(e => e.x === x && e.y === y)) return false;
      return true;
    };

    const pickNearby = () => {
      const maxAttempts = 60;
      for (let i = 0; i < maxAttempts; i++) {
        const dx = randInt(-5, 5);
        const dy = randInt(-5, 5);
        const x = player.x + dx;
        const y = player.y + dy;
        if (isFreeFloor(x, y)) return { x, y };
      }
      // fallback: any free floor
      const free = [];
      for (let y = 0; y < map.length; y++) {
        for (let x = 0; x < (map[0] ? map[0].length : 0); x++) {
          if (isFreeFloor(x, y)) free.push({ x, y });
        }
      }
      if (free.length === 0) return null;
      return free[randInt(0, free.length - 1)];
    };

    const ctx = getCtx();
    const spawned = [];
    for (let i = 0; i < count; i++) {
      const spot = pickNearby();
      if (!spot) break;
      const makeEnemy = (ctx.enemyFactory || ((x, y, depth) => createEnemyAt(x, y, depth)));
      const e = makeEnemy(spot.x, spot.y, floor);

      // Jitter stats a bit for flavor
      if (typeof e.hp === "number" && rng() < 0.7) {
        const mult = 0.85 + rng() * 0.5; // 0.85..1.35
        e.hp = Math.max(1, Math.round(e.hp * mult));
      }
      if (typeof e.atk === "number" && rng() < 0.7) {
        const multA = 0.85 + rng() * 0.5;
        e.atk = Math.max(0.1, round1(e.atk * multA));
      }
      e.announced = false;
      enemies.push(e);
      spawned.push(e);
      log(`GOD: Spawned ${capitalize(e.type || "enemy")} Lv ${e.level || 1} at (${e.x},${e.y}).`, "notice");
    }
    if (spawned.length > 0) {
      requestDraw();
    } else {
      log("GOD: No free space to spawn an enemy nearby.", "warn");
    }
  }

  // Find the nearest enemy to the player (Manhattan distance), preferring adjacent.
  function findNearestEnemy() {
    if (!enemies || enemies.length === 0) return null;
    let best = null;
    let bestDist = Infinity;
    for (const e of enemies) {
      const d = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
      if (d < bestDist) { bestDist = d; best = e; }
      if (d === 1) { bestDist = d; best = e; break; }
    }
    return best;
  }

  
  function renderInventoryPanel() {
    // Keep totals in sync
    updateUI();
    if (window.UIBridge && typeof UIBridge.renderInventory === "function") {
      UIBridge.renderInventory(player, describeItem);
      return;
    }
    if (window.UI && typeof UI.renderInventory === "function") {
      UI.renderInventory(player, describeItem);
    }
  }

  function showInventoryPanel() {
    renderInventoryPanel();
    if (window.UIBridge && typeof UIBridge.showInventory === "function") {
      UIBridge.showInventory();
    } else if (window.UI && typeof UI.showInventory === "function") {
      UI.showInventory();
    } else if (invPanel) {
      invPanel.hidden = false;
    }
    requestDraw();
  }

  function hideInventoryPanel() {
    if (window.UIBridge && typeof UIBridge.hideInventory === "function") {
      UIBridge.hideInventory();
      requestDraw();
      return;
    }
    if (window.UI && typeof UI.hideInventory === "function") {
      UI.hideInventory();
      requestDraw();
      return;
    }
    if (!invPanel) return;
    invPanel.hidden = true;
    requestDraw();
  }

  function equipItemByIndex(idx) {
    if (window.Player && typeof Player.equipItemByIndex === "function") {
      Player.equipItemByIndex(player, idx, {
        log,
        updateUI,
        renderInventory: () => renderInventoryPanel(),
        describeItem: (it) => describeItem(it),
      });
      return;
    }
    if (!player.inventory || idx < 0 || idx >= player.inventory.length) return;
    const item = player.inventory[idx];
    if (!item || item.kind !== "equip") {
      log("That item cannot be equipped.");
      return;
    }
    const slot = item.slot || "hand";
    const prev = player.equipment[slot];
    player.inventory.splice(idx, 1);
    player.equipment[slot] = item;
    const statStr = ("atk" in item) ? `+${item.atk} atk` : ("def" in item) ? `+${item.def} def` : "";
    log(`You equip ${item.name} (${slot}${statStr ? ", " + statStr : ""}).`);
    if (prev) {
      player.inventory.push(prev);
      log(`You stow ${describeItem(prev)} into your inventory.`);
    }
    updateUI();
    renderInventoryPanel();
  }

  function equipItemByIndexHand(idx, hand) {
    if (window.Player && typeof Player.equipItemByIndex === "function") {
      Player.equipItemByIndex(player, idx, {
        log,
        updateUI,
        renderInventory: () => renderInventoryPanel(),
        describeItem: (it) => describeItem(it),
        preferredHand: hand,
      });
      return;
    }
    // fallback to generic equip if Player module missing
    equipItemByIndex(idx);
  }

  function unequipSlot(slot) {
    if (window.Player && typeof Player.unequipSlot === "function") {
      Player.unequipSlot(player, slot, {
        log,
        updateUI,
        renderInventory: () => renderInventoryPanel(),
      });
      return;
    }
    // fallback
    const eq = player.equipment || {};
    const valid = ["left","right","head","torso","legs","hands"];
    if (!valid.includes(slot)) return;
    if ((slot === "left" || slot === "right") && eq.left && eq.right && eq.left === eq.right && eq.left.twoHanded) {
      const item = eq.left;
      eq.left = null; eq.right = null;
      player.inventory.push(item);
      log(`You unequip ${describeItem(item)} (two-handed).`);
      updateUI(); renderInventoryPanel();
      return;
    }
    const it = eq[slot];
    if (!it) return;
    eq[slot] = null;
    player.inventory.push(it);
    log(`You unequip ${describeItem(it)} from ${slot}.`);
    updateUI(); renderInventoryPanel();
  }

  

  function showGameOver() {
    if (window.UIBridge && typeof UIBridge.showGameOver === "function") {
      UIBridge.showGameOver(player, floor);
      requestDraw();
      return;
    }
    if (window.UI && typeof UI.showGameOver === "function") {
      UI.showGameOver(player, floor);
      requestDraw();
      return;
    }
    const panel = document.getElementById("gameover-panel");
    const summary = document.getElementById("gameover-summary");
    const gold = (player.inventory.find(i => i.kind === "gold")?.amount) || 0;
    if (summary) {
      summary.textContent = `You died on floor ${floor} (Lv ${player.level}). Gold: ${gold}. XP: ${player.xp}/${player.xpNext}.`;
    }
    if (panel) panel.hidden = false;
    requestDraw();
  }

  // GOD: always-crit toggle
  function setAlwaysCrit(v) {
    alwaysCrit = !!v;
    try { window.ALWAYS_CRIT = alwaysCrit; localStorage.setItem("ALWAYS_CRIT", alwaysCrit ? "1" : "0"); } catch (_) {}
    log(`GOD: Always Crit ${alwaysCrit ? "enabled" : "disabled"}.`, alwaysCrit ? "good" : "warn");
  }

  // GOD: set forced crit body part for player attacks
  function setCritPart(part) {
    const valid = new Set(["torso","head","hands","legs",""]);
    const p = valid.has(part) ? part : "";
    forcedCritPart = p;
    try {
      window.ALWAYS_CRIT_PART = p;
      if (p) localStorage.setItem("ALWAYS_CRIT_PART", p);
      else localStorage.removeItem("ALWAYS_CRIT_PART");
    } catch (_) {}
    if (p) log(`GOD: Forcing crit hit location: ${p}.`, "notice");
    else log("GOD: Cleared forced crit hit location.", "notice");
  }

  // GOD: apply a deterministic RNG seed and regenerate current floor
  function applySeed(seedUint32) {
    const s = (Number(seedUint32) >>> 0);
    currentSeed = s;
    try { localStorage.setItem("SEED", String(s)); } catch (_) {}
    rng = mulberry32(s);
    log(`GOD: Applied seed ${s}. Regenerating floor ${floor}...`, "notice");
    generateLevel(floor);
    requestDraw();
    try {
      if (window.UI && typeof UI.updateStats === "function" && typeof UI.init === "function") {
        // Update the GOD seed UI helper text
        const el = document.getElementById("god-seed-help");
        if (el) el.textContent = `Current seed: ${s}`;
        const input = document.getElementById("god-seed-input");
        if (input && !input.value) input.value = String(s);
      }
    } catch (_) {}
  }

  // GOD: reroll seed using current time
  function rerollSeed() {
    const s = (Date.now() % 0xffffffff) >>> 0;
    applySeed(s);
  }

  function hideGameOver() {
    if (window.UIBridge && typeof UIBridge.hideGameOver === "function") {
      UIBridge.hideGameOver();
      return;
    }
    if (window.UI && typeof UI.hideGameOver === "function") {
      UI.hideGameOver();
      return;
    }
    const panel = document.getElementById("gameover-panel");
    if (panel) panel.hidden = true;
  }

  function restartGame() {
    hideGameOver();
    floor = 1;
    window.floor = floor;
    isDead = false;
    generateLevel(floor);
  }

  
  function gainXP(amount) {
    if (window.Player && typeof Player.gainXP === "function") {
      Player.gainXP(player, amount, { log, updateUI });
      return;
    }
    player.xp += amount;
    log(`You gain ${amount} XP.`);
    while (player.xp >= player.xpNext) {
      player.xp -= player.xpNext;
      player.level += 1;
      player.maxHp += 2;
      player.hp = player.maxHp;
      if (player.level % 2 === 0) player.atk += 1;
      player.xpNext = Math.floor(player.xpNext * 1.3 + 10);
      log(`You are now level ${player.level}. Max HP increased.`, "good");
    }
    updateUI();
  }

  function killEnemy(enemy) {
    const name = capitalize(enemy.type || "enemy");
    log(`${name} dies.`, "bad");
    const loot = generateLoot(enemy);
    corpses.push({ x: enemy.x, y: enemy.y, loot, looted: loot.length === 0 });
    gainXP(enemy.xp || 5);
    enemies = enemies.filter(e => e !== enemy);
  }

  
  function updateUI() {
    if (window.UIBridge && typeof UIBridge.updateStats === "function") {
      UIBridge.updateStats(player, floor, getPlayerAttack, getPlayerDefense);
      return;
    }
    if (window.UI && typeof UI.updateStats === "function") {
      UI.updateStats(player, floor, getPlayerAttack, getPlayerDefense);
      return;
    }
    // Fallback if UI module not loaded
    const hpEl = document.getElementById("health");
    const floorEl = document.getElementById("floor");
    const gold = (player.inventory.find(i => i.kind === "gold")?.amount) || 0;
    if (hpEl) hpEl.textContent = `HP: ${player.hp.toFixed(1)}/${player.maxHp.toFixed(1)}  Gold: ${gold}`;
    if (floorEl) floorEl.textContent = `Floor: ${floor}  Lv: ${player.level}  XP: ${player.xp}/${player.xpNext}`;
  }

  
  function enemiesAct() {
    if (window.AI && typeof AI.enemiesAct === "function") {
      AI.enemiesAct(getCtx());
    }
    // No fallback here: AI behavior is defined in ai.js
  }

  function occupied(x, y) {
    if (player.x === x && player.y === y) return true;
    return enemies.some(e => e.x === x && e.y === y);
  }

  
  function turn() {
    if (isDead) return;
    // If you have a timed equipment decay helper, call it; otherwise skip
    if (typeof decayEquippedOverTime === "function") {
      try { decayEquippedOverTime(); } catch (_) {}
    }
    enemiesAct();
    // Status effects tick (bleed, dazed, etc.)
    try {
      if (window.Status && typeof Status.tick === "function") {
        Status.tick(getCtx());
      }
    } catch (_) {}
    // Visual: decals fade each turn (keep deterministic, no randomness here)
    if (decals && decals.length) {
      for (let i = 0; i < decals.length; i++) {
        decals[i].a *= 0.92; // exponential fade
      }
      decals = decals.filter(d => d.a > 0.04);
    }
    recomputeFOV();
    updateUI();
    requestDraw();
    // decay corpse flags
    if (corpses.length > 50) corpses = corpses.slice(-50);
  }

  // Main animation loop
  function loop() {
    draw();
    requestAnimationFrame(loop);
  }

  
  if (window.UI && typeof UI.init === "function") {
      UI.init();
      const handlerPayload = {
        onEquip: (idx) => equipItemByIndex(idx),
        onEquipHand: (idx, hand) => equipItemByIndexHand(idx, hand),
        onUnequip: (slot) => unequipSlot(slot),
        onDrink: (idx) => drinkPotionByIndex(idx),
        onRestart: () => restartGame(),
        onGodHeal: () => godHeal(),
        onGodSpawn: () => godSpawnItems(),
        onGodSetFov: (v) => setFovRadius(v),
        onGodSpawnEnemy: () => godSpawnEnemyNearby(),
        onGodSpawnStairs: () => godSpawnStairsHere(),
        onGodSetAlwaysCrit: (v) => setAlwaysCrit(v),
        onGodSetCritPart: (part) => setCritPart(part),
        onGodApplySeed: (seed) => applySeed(seed),
        onGodRerollSeed: () => rerollSeed(),
        onGodApplyBleedPlayer: (dur=2) => {
          try { if (window.Status && typeof Status.applyBleedToPlayer === "function") Status.applyBleedToPlayer(getCtx(), dur); } catch (_) {}
          requestDraw();
        },
        onGodApplyDazedPlayer: (dur=2) => {
          try { if (window.Status && typeof Status.applyDazedToPlayer === "function") Status.applyDazedToPlayer(getCtx(), dur); } catch (_) {}
          requestDraw();
        },
        onGodApplyBleedEnemy: (dur=2) => {
          const e = findNearestEnemy();
          if (e && window.Status && typeof Status.applyBleedToEnemy === "function") {
            try { Status.applyBleedToEnemy(getCtx(), e, dur); } catch (_) {}
          } else {
            log("No enemy found nearby to apply Bleed.", "warn");
          }
          requestDraw();
        },
        onGodApplyLimpEnemy: (dur=2) => {
          const e = findNearestEnemy();
          if (e && window.Status && typeof Status.applyLimpToEnemy === "function") {
            try { Status.applyLimpToEnemy(getCtx(), e, dur); } catch (_) {}
          } else {
            log("No enemy found nearby to apply Limp.", "warn");
          }
          requestDraw();
        },
        onGodClearStatuses: () => {
          // Clear player statuses
          player.bleedTurns = 0;
          player.dazedTurns = 0;
          // Clear enemies statuses
          enemies.forEach(e => { e.bleedTurns = 0; e.immobileTurns = 0; });
          log("GOD: Cleared all statuses on player and enemies.", "notice");
          requestDraw();
        },
      };
      if (window.UIBridge && typeof UIBridge.setHandlers === "function") {
        UIBridge.setHandlers(handlerPayload);
      } else if (typeof UI.setHandlers === "function") {
        UI.setHandlers(handlerPayload);
      }
    };
    return eq.left && eq.right && eq.left === eq.right && eq.left.twoHanded;
  }

  function decayAttackHands(light = false) {
    const ctx = getCtx();
    if (window.CombatCore && typeof CombatCore.decayAttackHands === "function") {
      CombatCore.decayAttackHands(ctx, light);
      return;
    }
    const eq = player.equipment || {};
    const amtMain = light ? randFloat(0.6, 1.6, 1) : randFloat(1.0, 2.2, 1);
    if (usingTwoHanded()) {
      if (eq.left) decayEquipped("left", amtMain);
      if (eq.right) decayEquipped("right", amtMain);
      return;
    }
    const leftAtk = (eq.left && typeof eq.left.atk === "number") ? eq.left.atk : 0;
    const rightAtk = (eq.right && typeof eq.right.atk === "number") ? eq.right.atk : 0;
    if (leftAtk >= rightAtk && leftAtk > 0) {
      decayEquipped("left", amtMain);
    } else if (rightAtk > 0) {
      decayEquipped("right", amtMain);
    } else if (eq.left) {
      decayEquipped("left", amtMain);
    } else if (eq.right) {
      decayEquipped("right", amtMain);
    }
  }

  function decayBlockingHands() {
    const eq = player.equipment || {};
    const amt = randFloat(0.6, 1.6, 1);
    if (usingTwoHanded()) {
      // Two-handed: same object on both hands; decaying both sides doubles the wear when blocking.
      if (eq.left) decayEquipped("left", amt);
      if (eq.right) decayEquipped("right", amt);
      return;
    }
    const leftDef = (eq.left && typeof eq.left.def === "number") ? eq.left.def : 0;
    const rightDef = (eq.right && typeof eq.right.def === "number") ? eq.right.def : 0;
    if (rightDef >= leftDef && eq.right) {
      decayEquipped("right", amt);
    } else if (eq.left) {
      decayEquipped("left", amt);
    }
  }

  
  generateLevel(floor);
  setupInput();
  loop();
})();