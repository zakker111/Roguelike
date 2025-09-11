/*
Items: data-driven equipment registry with deterministic RNG.

Exports (window.Items):
- createEquipment(tier, rng), createEquipmentOfSlot(slot, tier, rng)
- createByKey(key, tier, rng, overrides?), createNamed(config, rng)
- addType(slot, def), describe(item), initialDecay(tier, rng?), MATERIALS, TYPES

Notes:
- TYPES is a flat registry keyed by item key (similar to Enemies).
- weight can be a number or a function of tier.
*/
(function () {
  const round1 = (n) => Math.round(n * 10) / 10;

  /* MATERIALS: map numeric tier (1..3) to material name used by item name builders */
  const MATERIALS = {
    1: "rusty",
    2: "iron",
    3: "steel",
  };

  // Item types registry (flat, enemy-like), keyed by item key
  const TYPES = {
    sword: { key: "sword", slot: "hand", twoHanded: false,
      weight: 0.35,
      name: (mat) => `${mat} sword`,
      atkRange: { 1: [0.5, 2.4], 2: [1.2, 3.4], 3: [2.2, 4.0] } },

    axe: { key: "axe", slot: "hand", twoHanded: false,
      weight: 0.25,
      name: (mat) => `${mat} axe`,
      atkRange: { 1: [0.5, 2.4], 2: [1.2, 3.4], 3: [2.2, 4.0] },
      atkBonus: { 1: [0.0, 0.3], 2: [0.1, 0.5], 3: [0.2, 0.6] } },

    bow: { key: "bow", slot: "hand", twoHanded: false,
      weight: 0.20,
      name: (mat) => `${mat} bow`,
      atkRange: { 1: [0.6, 2.2], 2: [1.0, 3.0], 3: [2.0, 3.6] } },

    shield: { key: "shield", slot: "hand", twoHanded: false,
      weight: 0.15,
      name: (mat) => `${mat} shield`,
      defRange: { 1: [0.4, 2.0], 2: [1.2, 3.2], 3: [2.0, 4.0] } },

    two_handed_axe: { key: "two_handed_axe", slot: "hand", twoHanded: true,
      weight: 0.05,
      minTier: 2,
      name: (mat) => `${mat} two-handed axe`,
      atkRange: { 2: [2.6, 3.6], 3: [3.2, 4.0] } },

    helmet: { key: "helmet", slot: "head",
      weight: 1.0,
      name: (mat, tier) => tier >= 3 ? `${mat} great helm` : `${mat} helmet`,
      defRange: { 1: [0.2, 1.6], 2: [0.8, 2.8], 3: [1.6, 3.6] } },

    torso_armor: { key: "torso_armor", slot: "torso",
      weight: 1.0,
      name: (mat, tier) => tier >= 3 ? `${mat} plate armor` : (tier === 2 ? `${mat} chainmail` : `${mat} leather armor`),
      defRange: { 1: [0.6, 2.6], 2: [1.6, 3.6], 3: [2.4, 4.0] } },

    leg_armor: { key: "leg_armor", slot: "legs",
      weight: 1.0,
      name: (mat) => `${mat} leg armor`,
      defRange: { 1: [0.3, 1.8], 2: [1.0, 3.0], 3: [1.8, 3.8] } },

    gloves: { key: "gloves", slot: "hands",
      weight: 1.0,
      name: (mat, tier) => tier >= 2 ? `${mat} gauntlets` : `${mat} gloves`,
      defRange: { 1: [0.2, 1.2], 2: [0.8, 2.4], 3: [1.2, 3.0] },
      handAtkBonus: { 2: [0.1, 0.6], 3: [0.2, 1.0] },
      handAtkChance: 0.5 },

    // Example item template (for reference only; weight=0 prevents random spawns)
    example_item: {
      key: "example_item",        // Unique registry key used to look up this type (string)
      slot: "hand",               // Equipment slot ("hand" | "head" | "torso" | "legs" | "hands")
      weight: 0,                  // Spawn weight in random generation; 0 disables it. Can also be a function (tier) => number
      minTier: 1,                 // Minimum tier at which this item can appear (1..3)
      name: (mat, tier) => `${mat} spear`, // Display name builder; receives material ("rusty/iron/steel") and tier
      twoHanded: false,           // If true, item occupies both hands and equips to left+right together

      // Primary stat roll ranges per tier (inclusive). Omit if not applicable.
      atkRange: {                 // Attack stat range by tier; result is rounded to 1 decimal
        1: [0.7, 2.2],
        2: [1.4, 3.2],
        3: [2.2, 4.0]
      },
      // defRange: { 1:[min,max], 2:[min,max], 3:[min,max] }, // Optional defense ranges by tier

      // Optional additive bonus to attack after base roll; useful to bias certain types (e.g., axes).
      // atkBonus: { 2:[0.1,0.3], 3:[0.2,0.5] },

      // For "hands" slot only (gloves): optional small attack bonus and chance to apply.
      // handAtkBonus: { 2:[0.1,0.4], 3:[0.2,0.8] },
      // handAtkChance: 0.5,
    },
  };

  // SLOT_WEIGHTS: relative chance to pick each equipment slot when generating a random item.
  // Tuning these changes overall drop mix without touching per-type weights inside a slot.
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
  // Pick a value from a list of weighted entries.
  // Accepts objects of shape { value, w } or any object with a 'weight' property.
  // - If total weight <= 0, returns the first entry as a fallback (or its .value if present).
  function pickWeighted(entries, rng) {
    const total = entries.reduce((s, e) => s + (e.w || e.weight || 0), 0);
    if (total <= 0) return entries[0]?.value ?? entries[0] ?? null;
    let r = rng() * total;
    for (const e of entries) {
      const w = e.w || e.weight || 0;
      if (r < w) return e.value ?? e;
      r -= w;
    }
    return entries[0].value ?? entries[0];
  }

  // initialDecay: starting wear in percent for generated items.
  // Lower tiers begin more worn; higher tiers start closer to pristine.
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

  // Build a concrete item instance from a type definition at the given tier.
  // - Rolls stats from the tiered ranges (atkRange/defRange)
  // - Applies optional atkBonus biases per tier (e.g., axes lean higher)
  // - Applies optional small hand attack bonus for "hands" slot (gloves)
  // - Carries 'twoHanded' flag through for hand items that occupy both hands
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
    const defs = Object.values(TYPES).filter(d => d.slot === slot && (d.minTier || 1) <= tier);
    if (defs.length === 0) return null;
    const entries = defs.map(d => {
      const w = typeof d.weight === "function" ? d.weight(tier) : (d.weight || 1);
      return { value: d, w: Math.max(0, w) };
    });
    return pickWeighted(entries, rng);
  }

  // Create a random equipment piece for a specific slot at the given tier.
  // Respects per-type weights within that slot and minTier constraints.
  function createEquipmentOfSlot(slot, tier, rng) {
    const r = rng || Math.random;
    const def = pickTypeForSlot(slot, tier, r);
    if (!def) return null;
    return makeItemFromType(def, tier, r);
  }

  // Helpers mirroring Enemies API

  function listTypes() {
    return Object.keys(TYPES);
  }

  function getTypeDef(key) {
    return TYPES[key] || null;
  }

  function typesBySlot(slot) {
    return Object.values(TYPES).filter(t => t.slot === slot);
  }

  function pickType(slot, tier, rng) {
    const defs = typesBySlot(slot).filter(d => (d.minTier || 1) <= tier);
    if (defs.length === 0) return null;
    const entries = defs.map(d => {
      const w = typeof d.weight === "function" ? d.weight(tier) : (d.weight || 1);
      return { value: d, w: Math.max(0, w) };
    });
    return pickWeighted(entries, rng || Math.random);
  }

  // Create a random equipment piece at the given tier.
  // Steps:
  // 1) Pick a target slot using SLOT_WEIGHTS
  // 2) Pick a type within that slot based on per-type weights
  // 3) Roll stats and return the item
  // Includes robust fallbacks if the slot has no valid types at this tier.
  function createEquipment(tier, rng) {
    const r = rng || Math.random;
    const slot = pickSlot(r);
    const def = pickTypeForSlot(slot, tier, r);
    if (!def) {
      // Fallback: pick any available type
      const any = Object.values(TYPES).filter(d => (d.minTier || 1) <= tier);
      if (any.length) {
        const entries = any.map(d => {
          const w = typeof d.weight === "function" ? d.weight(tier) : (d.weight || 1);
          return { value: d, w: Math.max(0, w) };
        });
        const chosen = pickWeighted(entries, r);
        if (chosen) return makeItemFromType(chosen, tier, r);
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
    if (!slot) return false;
    const clean = Object.assign({}, def, { slot });
    if (typeof clean.weight !== "number" && typeof clean.weight !== "function") clean.weight = 1.0;
    if (!clean.key) clean.key = (clean.name && String(clean.name)) || `custom_${Date.now().toString(36)}`;
    TYPES[clean.key] = clean;
    return true;
  }

  function findTypeByKey(key) {
    return TYPES[key] || null;
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

  // Create a deterministic, named equipment item from a minimal config.
  // Useful for scripted rewards, shops, or testing without touching the registry.
  // - slot: one of "hand","head","torso","legs","hands"
  // - tier: 1..3 (clamped); influences default material/decay and stat expectations
  // - name: optional custom display name
  // - atk/def: optional numeric stats (rounded to 1 decimal)
  // - twoHanded: if true and slot is "hand", the item will occupy left+right hands
  // - decay: optional starting wear percent; if omitted, derived from tier
  function createNamed(config, rng) {
    if (!config || typeof config !== "object") return null;
    const { slot, tier, name } = config;
    // Validate against allowed equipment slots instead of the TYPES registry keys
    const VALID_SLOTS = new Set(["hand","head","torso","legs","hands"]);
    if (!slot || !VALID_SLOTS.has(slot)) return null;
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

  window.Items = {
    // creation
    initialDecay,
    createEquipment,
    createEquipmentOfSlot,
    createByKey,
    createNamed,
    // registry mgmt
    addType,
    // symmetry helpers (enemy-like)
    listTypes,
    getTypeDef,
    typesBySlot,
    pickType,
    // misc
    describe,
    MATERIALS,
    TYPES,
  };
})();