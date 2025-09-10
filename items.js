/*
Items module for Tiny Roguelike.

Goals:
- Central place to define equipment categories and stat ranges per tier
- Easy to add new items by editing CATEGORY_GENERATORS or MATERIALS
- Provide helpers used by the game for creation and display

API (window.Items):
- initialDecay(tier) -> number (0..100)
- createEquipment(tier, rng) -> item
- describe(item) -> string

Conventions:
- Tiers: 1 (rusty), 2 (iron), 3 (steel)
- Equipment kinds: weapon, offhand, head, torso, legs, hands
- Item shape:
  { kind: "equip", slot, name, tier, decay, atk?, def? }
*/
(function () {
  const round1 = (n) => Math.round(n * 10) / 10;

  const MATERIALS = {
    1: "rusty",
    2: "iron",
    3: "steel",
  };

  // Decay: lower tiers start with more wear
  function initialDecay(tier) {
    if (tier <= 1) return randFloat(Math.random, 10, 35, 0);
    if (tier === 2) return randFloat(Math.random, 5, 20, 0);
    return randFloat(Math.random, 0, 10, 0);
  }

  function randFloat(rng, min, max, decimals = 1) {
    const v = min + rng() * (max - min);
    const p = Math.pow(10, decimals);
    return Math.round(v * p) / p;
  }

  function pick(arr, rng) {
    return arr[Math.floor(rng() * arr.length)];
  }

  const CATEGORY_GENERATORS = {
    weapon: (tier, rng) => {
      const material = MATERIALS[tier] || "iron";
      const type = pick(["sword", "axe", "bow"], rng);
      const ranges = tier === 1 ? [0.5, 2.4] : tier === 2 ? [1.2, 3.4] : [2.2, 4.0];
      let atk = randFloat(rng, ranges[0], ranges[1], 1);
      if (type === "axe") atk = Math.min(4.0, round1(atk + randFloat(rng, 0.1, 0.5, 1)));
      return { kind: "equip", slot: "weapon", name: `${material} ${type}`, atk, tier, decay: initialDecay(tier) };
    },

    offhand: (tier, rng) => {
      const material = MATERIALS[tier] || "iron";
      const ranges = tier === 1 ? [0.4, 2.0] : tier === 2 ? [1.2, 3.2] : [2.0, 4.0];
      const def = randFloat(rng, ranges[0], ranges[1], 1);
      return { kind: "equip", slot: "offhand", name: `${material} shield`, def, tier, decay: initialDecay(tier) };
    },

    head: (tier, rng) => {
      const material = MATERIALS[tier] || "iron";
      const ranges = tier === 1 ? [0.2, 1.6] : tier === 2 ? [0.8, 2.8] : [1.6, 3.6];
      const def = randFloat(rng, ranges[0], ranges[1], 1);
      const name = tier >= 3 ? `${material} great helm` : `${material} helmet`;
      return { kind: "equip", slot: "head", name, def, tier, decay: initialDecay(tier) };
    },

    torso: (tier, rng) => {
      const material = MATERIALS[tier] || "iron";
      const ranges = tier === 1 ? [0.6, 2.6] : tier === 2 ? [1.6, 3.6] : [2.4, 4.0];
      const def = randFloat(rng, ranges[0], ranges[1], 1);
      const name = tier >= 3 ? `${material} plate armor` : (tier === 2 ? `${material} chainmail` : `${material} leather armor`);
      return { kind: "equip", slot: "torso", name, def, tier, decay: initialDecay(tier) };
    },

    legs: (tier, rng) => {
      const material = MATERIALS[tier] || "iron";
      const ranges = tier === 1 ? [0.3, 1.8] : tier === 2 ? [1.0, 3.0] : [1.8, 3.8];
      const def = randFloat(rng, ranges[0], ranges[1], 1);
      return { kind: "equip", slot: "legs", name: `${material} leg armor`, def, tier, decay: initialDecay(tier) };
    },

    hands: (tier, rng) => {
      const material = MATERIALS[tier] || "iron";
      const ranges = tier === 1 ? [0.2, 1.2] : tier === 2 ? [0.8, 2.4] : [1.2, 3.0];
      const def = randFloat(rng, ranges[0], ranges[1], 1);
      const name = tier >= 2 ? `${material} gauntlets` : `${material} gloves`;
      const drop = { kind: "equip", slot: "hands", name, def, tier, decay: initialDecay(tier) };
      if (tier >= 2 && Math.random() < 0.5) {
        const atk = tier === 2 ? randFloat(Math.random, 0.1, 0.6, 1) : randFloat(Math.random, 0.2, 1.0, 1);
        drop.atk = atk;
      }
      return drop;
    },
  };

  const CATEGORIES = Object.keys(CATEGORY_GENERATORS);

  function rollCategory(rng) {
    return CATEGORIES[Math.floor(rng() * CATEGORIES.length)];
  }

  function createEquipment(tier, rng) {
    const cat = rollCategory(rng || Math.random);
    return CATEGORY_GENERATORS[cat](tier, rng || Math.random);
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

  window.Items = {
    initialDecay,
    createEquipment,
    describe,
    MATERIALS,
  };
})();