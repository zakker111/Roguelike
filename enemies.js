/*
Enemy registry and helpers for Tiny Roguelike.
Attach as window.Enemies for use by game.js.

How to add a new enemy type
- Open this file and add a new entry inside TYPES with a unique key (e.g., "skeleton").
- Provide at minimum:
  - key: string identifier (same as the object key; used in logs/logic)
  - glyph: single-character string drawn on the map
  - color: CSS color for rendering
  - tier: 1, 2, or 3 (affects equipment drop tier)
  - blockBase: base chance to block (0.0–1.0 before modifiers)
  - weight(depth): function returning spawn weight at a given floor depth
  - hp(depth): function returning hit points at a given floor depth
  - atk(depth): function returning attack value at a given floor depth
  - xp(depth): function returning XP reward at a given floor depth
  - potionWeights: { lesser, average, strong } relative weights for potion drop quality
  - equipChance: chance (0.0–1.0) this enemy drops an equipment piece

Notes
- Spawning: pickType(depth, rng) uses weight(depth) across all TYPES to select what to spawn.
- Level scaling: levelFor(type, depth, rng) adds a small tier/jitter to depth.
- Damage scaling: damageMultiplier(level) is used in game.js for enemy damage.
- Block chance: enemyBlockChance uses blockBase adjusted by hit location.
- Loot integration in game.js:
  - equipTierFor(type) selects loot tier from this registry.
  - equipChanceFor(type) controls equipment drop chance.
  - potionWeightsFor(type) biases potion quality from this enemy.
- Simply defining a new TYPE here makes it available to spawning, rendering, and loot logic automatically.

Example template
{
  key: "skeleton",
  glyph: "s",
  color: "#cbd5e1",
  tier: 2,
  blockBase: 0.07,
  weight(depth) { return depth >= 2 ? 0.20 : 0.0; },
  hp(depth) { return 5 + Math.floor(depth * 0.7); },
  atk(depth) { return 2 + Math.floor(depth / 3); },
  xp(depth) { return 10 + depth; },
  potionWeights: { lesser: 0.55, average: 0.35, strong: 0.10 },
  equipChance: 0.50,
}
*/
(function () {
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  // Enemy type registry: define base stats, behavior weights, visuals
  const TYPES = {
    goblin: {
      key: "goblin",
      glyph: "g",
      color: "#8bd5a0",
      tier: 1,
      blockBase: 0.06,
      weight(depth) { return depth <= 2 ? 0.70 : 0.50; },
      hp(depth) { return 3 + Math.floor(depth / 2); },
      atk(depth) { return 1 + Math.floor(depth / 4); },
      xp(depth) { return 5 + Math.floor(depth / 2); },
      potionWeights: { lesser: 0.60, average: 0.30, strong: 0.10 },
      equipChance: 0.35,
    },
    troll: {
      key: "troll",
      glyph: "T",
      color: "#e0af68",
      tier: 2,
      blockBase: 0.08,
      weight(depth) { return depth <= 2 ? 0.25 : 0.35; },
      hp(depth) { return 6 + Math.floor(depth * 0.8); },
      atk(depth) { return 2 + Math.floor(depth / 3); },
      xp(depth) { return 12 + depth; },
      potionWeights: { lesser: 0.50, average: 0.35, strong: 0.15 },
      equipChance: 0.55,
    },
    ogre: {
      key: "ogre",
      glyph: "O",
      color: "#f7768e",
      tier: 3,
      blockBase: 0.10,
      weight(depth) { return depth <= 2 ? 0.05 : 0.15; },
      hp(depth) { return 10 + Math.floor(depth * 1.2); },
      atk(depth) { return 3 + Math.floor(depth / 2); },
      xp(depth) { return 20 + 2 * depth; },
      potionWeights: { lesser: 0.40, average: 0.35, strong: 0.25 },
      equipChance: 0.75,
    },
  };

  function listTypes() {
    return Object.keys(TYPES);
  }

  function getTypeDef(type) {
    return TYPES[type] || TYPES.goblin;
  }

  function colorFor(type) {
    return getTypeDef(type).color;
  }

  function glyphFor(type) {
    return getTypeDef(type).glyph;
  }

  function equipTierFor(type) {
    return getTypeDef(type).tier;
  }

  function equipChanceFor(type) {
    return getTypeDef(type).equipChance;
  }

  function potionWeightsFor(type) {
    return getTypeDef(type).potionWeights;
  }

  function pickType(depth, rng) {
    const entries = listTypes().map((k) => ({ key: k, w: getTypeDef(k).weight(depth) }));
    const total = entries.reduce((s, e) => s + e.w, 0);
    let r = (rng ? rng() : Math.random()) * total;
    for (const e of entries) {
      if (r < e.w) return e.key;
      r -= e.w;
    }
    return entries[0].key;
  }

  function levelFor(type, depth, rng) {
    const tierAdj = type === "ogre" ? 2 : type === "troll" ? 1 : 0;
    const jitter = rng && rng() < 0.35 ? 1 : 0;
    return Math.max(1, depth + tierAdj + jitter);
  }

  function damageMultiplier(level) {
    return 1 + 0.15 * Math.max(0, (level || 1) - 1);
  }

  function enemyBlockChance(enemy, loc) {
    const base = getTypeDef(enemy.type).blockBase;
    return clamp(base * (loc?.blockMod || 1.0), 0, 0.35);
  }

  function createEnemyAt(x, y, depth, rng) {
    const type = pickType(depth, rng);
    const t = getTypeDef(type);
    const level = levelFor(type, depth, rng);
    return {
      x, y,
      type,
      glyph: t.glyph,
      hp: t.hp(depth),
      atk: t.atk(depth),
      xp: t.xp(depth),
      level,
      announced: false,
    };
  }

  window.Enemies = {
    TYPES,
    listTypes,
    getTypeDef,
    colorFor,
    glyphFor,
    equipTierFor,
    equipChanceFor,
    potionWeightsFor,
    pickType,
    levelFor,
    damageMultiplier,
    enemyBlockChance,
    createEnemyAt,
  };
})();