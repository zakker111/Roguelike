/*
Player module for Tiny Roguelike.

Responsibilities:
- Create initial player state
- Compute attack/defense totals
- Inventory helpers (describe items, add potions, drink, equip)
- Equipment decay handling
- XP and leveling

All functions are pure over the player object where possible; side-effects like UI/logging
are done through hooks passed as parameters.

API (window.Player):
- createInitial() -> player
- getAttack(player) -> number
- getDefense(player) -> number
- describeItem(item) -> string
- addPotion(player, heal, name?)
- drinkPotionByIndex(player, idx, { log, updateUI, renderInventory })
- equipIfBetter(player, item, { log, updateUI }) -> boolean
- equipItemByIndex(player, idx, { log, updateUI, renderInventory, describeItem })
- decayEquipped(player, slot, amount, { log, updateUI, onInventoryChange })
- gainXP(player, amount, { log, updateUI })
*/
(function () {
  const round1 = (n) => Math.round(n * 10) / 10;

  // Editable defaults for new game. Change these to customize starting attributes.
  const DEFAULT_EQUIPMENT = { left: null, right: null, head: null, torso: null, legs: null, hands: null };
  const defaults = {
    x: 0,
    y: 0,
    hp: 20,
    maxHp: 20,
    atk: 1,
    level: 1,
    xp: 0,
    xpNext: 20,
    inventory: [],
    equipment: { ...DEFAULT_EQUIPMENT },
  };

  function clone(obj) {
    return obj ? JSON.parse(JSON.stringify(obj)) : obj;
  }

  function normalize(p) {
    if (typeof p.maxHp !== "number" || p.maxHp <= 0) p.maxHp = 10;
    if (typeof p.hp !== "number") p.hp = p.maxHp;
    if (p.hp > p.maxHp) p.maxHp = p.hp;
    if (p.hp < 0) p.hp = 0;
    if (typeof p.level !== "number" || p.level < 1) p.level = 1;
    if (typeof p.atk !== "number") p.atk = 1;
    if (typeof p.xp !== "number") p.xp = 0;
    if (typeof p.xpNext !== "number" || p.xpNext <= 0) p.xpNext = 20;
    if (!Array.isArray(p.inventory)) p.inventory = [];
    const eq = p.equipment && typeof p.equipment === "object" ? p.equipment : {};
    p.equipment = Object.assign({ ...DEFAULT_EQUIPMENT }, eq);
    return p;
  }

  function createInitial() {
    // Build from defaults with deep clones to avoid sharing references
    const p = normalize({
      x: defaults.x,
      y: defaults.y,
      hp: defaults.hp,
      maxHp: defaults.maxHp,
      atk: defaults.atk,
      level: defaults.level,
      xp: defaults.xp,
      xpNext: defaults.xpNext,
      inventory: clone(defaults.inventory) || [],
      equipment: clone(defaults.equipment) || { ...DEFAULT_EQUIPMENT },
    });
    return p;
  }

  // Normalize user-provided/default values to a valid starting state
  function normalize(p) {
    if (typeof p.maxHp !== "number" || p.maxHp <= 0) p.maxHp = 10;
    if (typeof p.hp !== "number") p.hp = p.maxHp;
    if (p.hp > p.maxHp) p.maxHp = p.hp;
    if (p.hp < 0) p.hp = 0;
    if (typeof p.level !== "number" || p.level < 1) p.level = 1;
    if (typeof p.atk !== "number") p.atk = 1;
    if (typeof p.xp !== "number") p.xp = 0;
    if (typeof p.xpNext !== "number" || p.xpNext <= 0) p.xpNext = 20;
    if (!p.inventory) p.inventory = [];
    if (!p.equipment) p.equipment = { left: null, right: null, head: null, torso: null, legs: null, hands: null };
    return p;
  }

  // Public: change defaults at runtime (e.g., from console: Player.defaults.hp = 50; then restart)
  function getDefaults() {
    return defaults;
  }

  function createInitial() {
    // Build from defaults, clone to avoid accidental mutations leaking into defaults
    const p = normalize({
      x: defaults.x,
      y: defaults.y,
      hp: defaults.hp,
      maxHp: defaults.maxHp,
      atk: defaults.atk,
      level: defaults.level,
      xp: defaults.xp,
      xpNext: defaults.xpNext,
      inventory: clone(defaults.inventory),
      equipment: clone(defaults.equipment) || { left: null, right: null, head: null, torso: null, legs: null, hands: null },
    });
    return p;
  }

  function getAttack(player) {
    let bonus = 0;
    const eq = player.equipment || {};
    if (eq.left && typeof eq.left.atk === "number") bonus += eq.left.atk;
    if (eq.right && typeof eq.right.atk === "number") bonus += eq.right.atk;
    if (eq.hands && typeof eq.hands.atk === "number") bonus += eq.hands.atk;
    const levelBonus = Math.floor((player.level - 1) / 2);
    return round1(player.atk + bonus + levelBonus);
  }

  function getDefense(player) {
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

  function addPotion(player, heal = 3, name = `potion (+${heal} HP)`) {
    const existing = player.inventory.find(i => i.kind === "potion" && (i.heal ?? 3) === heal);
    if (existing) {
      existing.count = (existing.count || 1) + 1;
    } else {
      player.inventory.push({ kind: "potion", heal, count: 1, name });
    }
  }

  function drinkPotionByIndex(player, idx, hooks = {}) {
    if (!player.inventory || idx < 0 || idx >= player.inventory.length) return;
    const it = player.inventory[idx];
    if (!it || it.kind !== "potion") return;

    const heal = it.heal ?? 3;
    const prev = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + heal);
    const gained = player.hp - prev;
    if (hooks.log) {
      if (gained > 0) hooks.log(`You drink a potion and restore ${gained.toFixed(1)} HP (HP ${player.hp.toFixed(1)}/${player.maxHp.toFixed(1)}).`, "good");
      else hooks.log(`You drink a potion but feel no different (HP ${player.hp.toFixed(1)}/${player.maxHp.toFixed(1)}).`, "warn");
    }

    if (it.count && it.count > 1) {
      it.count -= 1;
    } else {
      player.inventory.splice(idx, 1);
    }
    if (hooks.updateUI) hooks.updateUI();
    if (hooks.renderInventory) hooks.renderInventory();
  }

  function equipIfBetter(player, item, hooks = {}) {
    if (!item || item.kind !== "equip") return false;

    // Two-handed constraint
    const twoH = !!item.twoHanded;

    // Hand items: slot can be "hand" or legacy "weapon"/"offhand"
    const isHandItem = item.slot === "hand" || item.slot === "weapon" || item.slot === "offhand" || item.slot === "left" || item.slot === "right";

    if (isHandItem) {
      const eq = player.equipment;
      // If currently holding a two-handed item and the new one isn't strictly better, keep it
      const holdingTwoH = eq.left && eq.right && eq.left === eq.right && eq.left.twoHanded;

      const score = (it) => (it ? (it.atk || 0) + (it.def || 0) : 0);

      if (twoH) {
        // Equip to both hands, stow previous ones
        const prevL = eq.left, prevR = eq.right;
        eq.left = item;
        eq.right = item;
        if (hooks.log) {
          const parts = [];
          if ("atk" in item) parts.push(`+${Number(item.atk).toFixed(1)} atk`);
          if ("def" in item) parts.push(`+${Number(item.def).toFixed(1)} def`);
          const statStr = parts.join(", ");
          hooks.log(`You equip ${item.name} (two-handed${statStr ? ", " + statStr : ""}).`);
        }
        if (prevL && prevL !== item) player.inventory.push(prevL);
        if (prevR && prevR !== item) player.inventory.push(prevR);
        if (hooks.updateUI) hooks.updateUI();
        return true;
      }

      // One-handed item: prefer empty hand, else replace worse hand
      if (!eq.left && !eq.right) {
        eq.left = item;
      } else if (!eq.left) {
        if (holdingTwoH) {
          // replace two-handed with one-handed in left, stow previous
          player.inventory.push(eq.left); // same object as right
          eq.right = null;
          eq.left = item;
        } else {
          eq.left = item;
        }
      } else if (!eq.right) {
        if (holdingTwoH) {
          player.inventory.push(eq.right);
          eq.left = item;
          eq.right = null;
        } else {
          eq.right = item;
        }
      } else {
        // both occupied: replace worse
        const worse = score(eq.left) <= score(eq.right) ? "left" : "right";
        player.inventory.push(eq[worse]);
        eq[worse] = item;
      }

      if (hooks.log) {
        const parts = [];
        if ("atk" in item) parts.push(`+${Number(item.atk).toFixed(1)} atk`);
        if ("def" in item) parts.push(`+${Number(item.def).toFixed(1)} def`);
        const statStr = parts.join(", ");
        hooks.log(`You equip ${item.name} (${statStr || "hand item"}).`);
      }
      if (hooks.updateUI) hooks.updateUI();
      return true;
    }

    // Non-hand items: standard slot replace if better
    const slot = item.slot;
    const current = player.equipment[slot];
    const newScore = (item.atk || 0) + (item.def || 0);
    const curScore = current ? ((current.atk || 0) + (current.def || 0)) : -Infinity;
    const better = !current || newScore > curScore + 1e-9;

    if (better) {
      player.equipment[slot] = item;
      if (hooks.log) {
        const parts = [];
        if ("atk" in item) parts.push(`+${Number(item.atk).toFixed(1)} atk`);
        if ("def" in item) parts.push(`+${Number(item.def).toFixed(1)} def`);
        const statStr = parts.join(", ");
        hooks.log(`You equip ${item.name} (${slot}${statStr ? ", " + statStr : ""}).`);
      }
      if (hooks.updateUI) hooks.updateUI();
      return true;
    }
    return false;
  }

  function equipItemByIndex(player, idx, hooks = {}) {
    if (!player.inventory || idx < 0 || idx >= player.inventory.length) return;
    const item = player.inventory[idx];
    if (!item || item.kind !== "equip") {
      if (hooks.log) hooks.log("That item cannot be equipped.");
      return;
    }
    // remove from inventory first
    player.inventory.splice(idx, 1);

    const eq = player.equipment;
    const twoH = !!item.twoHanded;
    const preferredHand = hooks.preferredHand === "left" || hooks.preferredHand === "right" ? hooks.preferredHand : null;

    if ((item.slot === "hand" || item.slot === "weapon" || item.slot === "offhand" || item.slot === "left" || item.slot === "right")) {
      if (twoH) {
        const prevL = eq.left, prevR = eq.right;
        eq.left = item; eq.right = item;
        if (hooks.log) {
          const parts = [];
          if ("atk" in item) parts.push(`+${Number(item.atk).toFixed(1)} atk`);
          if ("def" in item) parts.push(`+${Number(item.def).toFixed(1)} def`);
          const statStr = parts.join(", ");
          hooks.log(`You equip ${item.name} (two-handed${statStr ? ", " + statStr : ""}).`);
        }
        if (prevL && prevL !== item) player.inventory.push(prevL);
        if (prevR && prevR !== item) player.inventory.push(prevR);
      } else if (preferredHand) {
        // respect user's choice
        const other = preferredHand === "left" ? "right" : "left";
        // detect two-handed holding BEFORE changing a hand
        const wasTwoHanded = !!(eq.left && eq.right && eq.left === eq.right && eq.left.twoHanded);
        const prev = eq[preferredHand];

        // equip into chosen hand
        eq[preferredHand] = item;

        if (hooks.log) {
          const parts = [];
          if ("atk" in item) parts.push(`+${Number(item.atk).toFixed(1)} atk`);
          if ("def" in item) parts.push(`+${Number(item.def).toFixed(1)} def`);
          const statStr = parts.join(", ");
          hooks.log(`You equip ${item.name} (${preferredHand}${statStr ? ", " + statStr : ""}).`);
        }

        if (prev) player.inventory.push(prev);

        // If previously two-handed, free the other hand and return the old two-handed item
        if (wasTwoHanded) {
          if (eq[other]) player.inventory.push(eq[other]);
          eq[other] = null;
        }
      } else {
        // no preference -> use auto-placement/better logic
        equipIfBetter(player, item, hooks);
      }
    } else {
      // Non-hand items -> simple replacement logic
      const slot = item.slot;
      const prev = eq[slot];
      eq[slot] = item;
      if (hooks.log) {
        const parts = [];
        if ("atk" in item) parts.push(`+${Number(item.atk).toFixed(1)} atk`);
        if ("def" in item) parts.push(`+${Number(item.def).toFixed(1)} def`);
        const statStr = parts.join(", ");
        hooks.log(`You equip ${item.name} (${slot}${statStr ? ", " + statStr : ""}).`);
      }
      if (prev) player.inventory.push(prev);
    }

    if (hooks.updateUI) hooks.updateUI();
    if (hooks.renderInventory) hooks.renderInventory();
  }

  function decayEquipped(player, slot, amount, hooks = {}) {
    const it = player.equipment?.[slot];
    if (!it) return;
    const before = it.decay || 0;
    it.decay = Math.min(100, round1(before + amount));
    if (it.decay >= 100) {
      if (hooks.log) hooks.log(`${(it.name || "Item")[0].toUpperCase()}${(it.name || "Item").slice(1)} breaks and is destroyed.`);
      player.equipment[slot] = null;
      if (hooks.updateUI) hooks.updateUI();
      if (hooks.onInventoryChange) hooks.onInventoryChange();
    } else if (Math.floor(before) !== Math.floor(it.decay)) {
      if (hooks.onInventoryChange) hooks.onInventoryChange();
    }
  }

  function gainXP(player, amount, hooks = {}) {
    player.xp += amount;
    if (hooks.log) hooks.log(`You gain ${amount} XP.`);
    while (player.xp >= player.xpNext) {
      player.xp -= player.xpNext;
      player.level += 1;
      player.maxHp += 2;
      player.hp = player.maxHp;
      if (player.level % 2 === 0) player.atk += 1;
      player.xpNext = Math.floor(player.xpNext * 1.3 + 10);
      if (hooks.log) hooks.log(`You are now level ${player.level}. Max HP increased.`);
    }
    if (hooks.updateUI) hooks.updateUI();
  }

  function unequipSlot(player, slot, hooks = {}) {
    if (!player || !player.equipment) return;
    const eq = player.equipment;
    const valid = ["left","right","head","torso","legs","hands"];
    if (!valid.includes(slot)) return;

    // Handle two-handed case if unequipping either hand and both reference same item
    if ((slot === "left" || slot === "right") && eq.left && eq.right && eq.left === eq.right && eq.left.twoHanded) {
      const item = eq.left;
      eq.left = null; eq.right = null;
      player.inventory.push(item);
      if (hooks.log) hooks.log(`You unequip ${describeItem(item)} (two-handed).`);
      if (hooks.updateUI) hooks.updateUI();
      if (hooks.renderInventory) hooks.renderInventory();
      return;
    }

    const it = eq[slot];
    if (!it) return;
    eq[slot] = null;
    player.inventory.push(it);
    if (hooks.log) hooks.log(`You unequip ${describeItem(it)} from ${slot}.`);
    if (hooks.updateUI) hooks.updateUI();
    if (hooks.renderInventory) hooks.renderInventory();
  }

  // Apply current defaults to an existing player (used when starting a new game)
  function resetFromDefaults(player) {
    const fresh = normalize({
      x: defaults.x,
      y: defaults.y,
      hp: defaults.hp,
      maxHp: defaults.maxHp,
      atk: defaults.atk,
      level: defaults.level,
      xp: defaults.xp,
      xpNext: defaults.xpNext,
      inventory: clone(defaults.inventory) || [],
      equipment: clone(defaults.equipment) || {},
    });
    for (const k of Object.keys(fresh)) {
      player[k] = Array.isArray(fresh[k]) ? fresh[k].slice() :
                  (fresh[k] && typeof fresh[k] === "object" ? JSON.parse(JSON.stringify(fresh[k])) : fresh[k]);
    }
    forceUpdate(player);
    return player;
  }

  // Force HUD refresh and broadcast a change event
  function forceUpdate(player) {
    if (window.UI && typeof UI.updateStats === "function") {
      UI.updateStats(player, window.floor || 1, getAttack.bind(null, player), getDefense.bind(null, player));
    }
    window.dispatchEvent(new CustomEvent("player:changed", { detail: { player } }));
  }

  window.Player = {
    // configuration
    defaults,
    normalize,
    resetFromDefaults,
    forceUpdate,
    // core API
    createInitial,
    getAttack,
    getDefense,
    describeItem,
    addPotion,
    drinkPotionByIndex,
    equipIfBetter,
    equipItemByIndex,
    decayEquipped,
    gainXP,
    unequipSlot,
  };
})();