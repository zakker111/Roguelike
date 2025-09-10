/*
Items module for Tiny Roguelike.

Goal:
- Clean, data-driven registry similar to enemies.js (clear attributes, weights, ranges)
- Deterministic RNG (rng passed through everywhere)
- Simple extension API to add specific named items or new item types

API (window.Items):
- initialDecay(tier, rng?) -> number (0..100)
- createEquipment(tier, rng) -> item { kind:"equip", slot, name, tier, decay, atk?, def?, twoHanded? }
- createEquipmentOfSlot(slot, tier, rng)
- createByKey(key, tier, rng, overrides?) -> create an item by registry key
- createNamed(config, rng) -> create from explicit config (slot, name, tier, atk/def/twoHanded/decay?)
- addType(slot, def) -> void (extend the registry)
- describe(item) -> string
- MATERIALS, TYPES (exported for extension)

Conventions:
- Tiers: 1 (rusty), 2 (iron), 3 (steel)
- Slots: "hand" (left/right), "head", "torso", "legs", "hands"

Quick guide (examples):
- Add a new randomizable type to the registry:
  // At runtime (anywhere after items.js is loaded):
  // Items.addType("hand", {
  //   key: "rapier",
  //   weight: 0.18,
  //   name: (mat) => `${mat} rapier`,
  //   atkRange: { 1:[0.8,2.6], 2:[1.6,3.6], 3:[2.6,4.0] }
  // });

- Create a specific item by key (from the registry):
  // const it = Items.createByKey("rapier", 3, rng, { name: "Master's Rapier" });

- Create a one-off named item (no registry entry):
  // const excalibur = Items.createNamed({ slot:"hand", tier:3, name:"Excalibur", atk:4.0 });

Type schema (for addType):
{
  key: "unique_key",
  slot: "hand"|"head"|"torso"|"legs"|"hands",
  weight: 0.0..1.0,
  minTier?: 1|2|3,
  name: (material, tier) => string  OR  string,
  atkRange?: {1:[min,max],2:[min,max],3:[min,max]},
  defRange?: {1:[min,max],2:[min,max],3:[min,max]},
  atkBonus?: {1:[min,max],2:[min,max],3:[min,max]},
  twoHanded?: boolean,
  // gloves-specific (optional):
  handAtkBonus?: {2:[min,max],3:[min,max]},
  handAtkChance?: 0.0..1.0
}
*/
(function () {
  const round1 = (n) => Math.round(n * 10) / 10;

  const MATERIALS = {
    1: "rusty",
    2: "iron",
    3: "steel",
  };

  // Registry for item types with stat ranges and spawn weights per slot
  // atkRange/defRange per tier expressed as [min,max]
  const TYPES = {
    hand: [
      { key: "sword", name: (mat) => `${mat} sword`, slot: "hand", twoHanded: false,
        weight: 0.35,
        atkRange: { 1: [0.5, 2.4], 2: [1.2, 3.4], 3: [2.2, 4.0] } },
      { key: "axe", name: (mat) => `${mat} axe`, slot: "hand", twoHanded: false,
        weight: 0.25,
        atkRange: { 1: [0.5, 2.4], 2: [1.2, 3.4], 3: [2.2, 4.0] },
        atkBonus: { 1: [0.0, 0.3], 2: [0.1, 0.5], 3: [0.2, 0.6] } },
      { key: "bow", name: (mat) => `${mat} bow`, slot: "hand", twoHanded: false,
        weight: 0.20,
        atkRange: { 1: [0.6, 2.2], 2: [1.0, 3.0], 3: [2.0, 3.6] } },
      { key: "shield", name: (mat) => `${mat} shield`, slot: "hand", twoHanded: false,
        weight: 0.15,
        defRange: { 1: [0.4, 2.0], 2: [1.2, 3.2], 3: [2.0, 4.0] } },
      { key: "two_handed_axe", name: (mat) => `${mat} two-handed axe`, slot: "hand", twoHanded: true,
        weight: 0.05,
        minTier: 2,
        atkRange: { 2: [2.6, 3.6], 3: [3.2, 4.0] } },
    ],
    head: [
      { key: "helmet", slot: "head", weight: 1.0,
        name: (mat, tier) => tier >= 3 ? `${mat} great helm` : `${mat} helmet`,
        defRange: { 1: [0.2, 1.6], 2: [0.8, 2.8], 3: [1.6, 3.6] } },
    ],
    torso: [
      { key: "torso_armor", slot: "torso", weight: 1.0,
        name: (mat, tier) => tier >= 3 ? `${mat} plate armor` : (tier === 2 ? `${mat} chainmail` : `${mat} leather armor`),
        defRange: { 1: [0.6, 2.6], 2: [1.6, 3.6], 3: [2.4, 4.0] } },
    ],
    legs: [
      { key: "leg_armor", slot: "legs", weight: 1.0,
        name: (mat) => `${mat} leg armor`,
        defRange: { 1: [0.3, 1.8], 2: [1.0, 3.0], 3: [1.8, 3.8] } },
    ],
    hands: [
      { key: "gloves", slot: "hands", weight: 1.0,
        name: (mat, tier) => tier >= 2 ? `${mat} gauntlets` : `${mat} gloves`,
        defRange: { 1: [0.2, 1.2], 2: [0.8, 2.4], 3: [1.2, 3.0] },
        // chance to also carry small atk on higher tiers
        handAtkBonus: { 2: [0.1, 0.6], 3: [0.2, 1.0] },
        handAtkChance: 0.5 },
    ],
  };

  // Slot distribution weights when rolling a random equipment piece
  const SLOT_WEIGHTS = {
    hand: 0.38,
    head: 0.14,
    torso: 0.18,
    legs: 0.16,
    hands: 0.14,
  };

  function randFloat(rng, min, max, decimals = 1) {
    const v = min + rng() * (max - min);
    const p = Math.pow(10, decimals);
    return Math.round(v * p) / p;
  }
  function pickWeighted(entries, rng) {
    const total = entries.reduce((s, e) => s + (e.w || e.weight || 0), 0);
    let r = rng() * total;
    for (const e of entries) {
      const w = e.w || e.weight || 0;
      if (r < w) return e.value ?? e;
      r -= w;
    }
    return entries[0].value ?? entries[0];
  }

  // Decay: lower tiers start with more wear
  function initialDecay(tier, rng = Math.random) {
    if (tier <= 1) return randFloat(rng, 10, 35, 0);
    if (tier === 2) return randFloat(rng, 5, 20, 0);
    return randFloat(rng, 0, 10, 0);
  }

  function pickSlot(rng) {
    const entries = Object.keys(SLOT_WEIGHTS).map(k => ({ value: k, w: SLOT_WEIGHTS[k] }));
    return pickWeighted(entries, rng);
  }

  function rollStatFromRange(rng, ranges, tier, decimals = 1) {
    const r = ranges?.[tier];
    if (!r) return 0;
    return randFloat(rng, r[0], r[1], decimals);
  }

  function makeItemFromType(def, tier, rng) {
    const material = MATERIALS[tier] || "iron";
    const name = typeof def.name === "function" ? def.name(material, tier) : (def.name || (material + " item"));
    const item = {
      kind: "equip",
      slot: def.slot,
      name,
      tier,
      decay: initialDecay(tier, rng),
    };

    if (def.atkRange) {
      let atk = rollStatFromRange(rng, def.atkRange, tier, 1);
      if (def.atkBonus && def.atkBonus[tier]) {
        atk = Math.min(4.0, round1(atk + randFloat(rng, def.atkBonus[tier][0], def.atkBonus[tier][1], 1)));
      }
      if (atk > 0) item.atk = atk;
    }
    if (def.defRange) {
      const defVal = rollStatFromRange(rng, def.defRange, tier, 1);
      if (defVal > 0) item.def = defVal;
    }
    if (def.slot === "hands" && def.handAtkBonus && def.handAtkBonus[tier]) {
      const chance = typeof def.handAtkChance === "number" ? def.handAtkChance : 0.5;
      if (rng() < chance) {
        const [minB, maxB] = def.handAtkBonus[tier];
        item.atk = (item.atk || 0) + randFloat(rng, minB, maxB, 1);
        item.atk = round1(Math.min(4.0, item.atk));
      }
    }
    if (def.twoHanded) {
      item.twoHanded = true;
    }
    return item;
  }

  function pickTypeForSlot(slot, tier, rng) {
    const defs = (TYPES[slot] || []).filter(d => (d.minTier || 1) <= tier);
    if (defs.length === 0) return null;
    const entries = defs.map(d => ({ value: d, w: d.weight || 1 }));
    return pickWeighted(entries, rng);
  }

  function createEquipmentOfSlot(slot, tier, rng) {
    const r = rng || Math.random;
    const def = pickTypeForSlot(slot, tier, r);
    if (!def) return null;
    return makeItemFromType(def, tier, r);
  }

  function createEquipment(tier, rng) {
    const r = rng || Math.random;
    const slot = pickSlot(r);
    const def = pickTypeForSlot(slot, tier, r);
    if (!def) {
      // Fallback: pick any available slot/type
      for (const s of Object.keys(TYPES)) {
        const d = pickTypeForSlot(s, tier, r);
        if (d) return makeItemFromType(d, tier, r);
      }
      // Ultimate fallback: a simple iron sword
      return { kind: "equip", slot: "hand", name: "iron sword", tier: 2, atk: 1.5, decay: initialDecay(2, r) };
    }
    return makeItemFromType(def, tier, r);
  }

  function describe(item) {
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

  // Extension helpers

  function addType(slot, def) {
    if (!slot || !TYPES[slot]) return false;
    const clean = Object.assign({}, def, { slot });
    if (typeof clean.weight !== "number" || clean.weight <= 0) clean.weight = 1.0;
    if (!clean.key) clean.key = (clean.name && String(clean.name)) || `custom_${Date.now().toString(36)}`;
    TYPES[slot].push(clean);
    return true;
  }

  function findTypeByKey(key) {
    for (const slot of Object.keys(TYPES)) {
      const t = TYPES[slot].find(d => d.key === key);
      if (t) return t;
    }
    return null;
  }

  function createByKey(key, tier, rng, overrides) {
    const def = findTypeByKey(key);
    const r = rng || Math.random;
    if (!def) return null;
    const item = makeItemFromType(def, tier, r);
    if (overrides && typeof overrides === "object") {
      for (const k of Object.keys(overrides)) {
        item[k] = overrides[k];
      }
    }
    return item;
  }

  // Create an item directly from a minimal config (slot, name, tier, atk/def)
  // Example:
  //   Items.createNamed({ slot: "hand", tier: 3, name: "Excalibur", atk: 4.0, twoHanded: false }, rng)
  function createNamed(config, rng) {
    if (!config || typeof config !== "object") return null;
    const { slot, tier, name } = config;
    if (!slot || !TYPES[slot]) return null;
    const t = Math.max(1, Math.min(3, tier || 1));
    const r = rng || Math.random;
    const item = {
      kind: "equip",
      slot,
      name: name || `${MATERIALS[t] || "iron"} item`,
      tier: t,
      decay: typeof config.decay === "number" ? config.decay : initialDecay(t, r),
    };
    if (typeof config.atk === "number") item.atk = round1(config.atk);
    if (typeof config.def === "number") item.def = round1(config.def);
    if (config.twoHanded) item.twoHanded = true;
    return item;
  }

  // --- Example additions (can be removed safely) ---
  // They demonstrate how to add new types and how they appear in random generation.

  // Example type: a nimble rapier with higher base atk range (hand slot)
  addType("hand", {
    key: "rapier",
    weight: 0.12,
    name: (mat) => `${mat} rapier`,
    atkRange: { 1: [0.8, 2.6], 2: [1.6, 3.6], 3: [2.6, 4.0] },
  });

  // Example type: thorn gauntlets that can occasionally deal damage (hands slot)
  addType("hands", {
    key: "thorn_gauntlets",
    weight: 0.08,
    name: (mat) => `${mat} thorn gauntlets`,
    defRange: { 2: [0.8, 2.2], 3: [1.2, 2.8] },
    handAtkBonus: { 2: [0.1, 0.4], 3: [0.2, 0.8] },
    handAtkChance: 0.45,
    minTier: 2,
  });
  // --- End examples ---

  window.Items = {
    initialDecay,
    createEquipment,
    createEquipmentOfSlot,
    createByKey,
    createNamed,
    addType,
    describe,
    MATERIALS,
    TYPES,
  };
})();