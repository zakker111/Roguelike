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

  function createInitial() {
    return {
      x: 0, y: 0,
      hp: 10, maxHp: 10,
      inventory: [],
      atk: 1,
      xp: 0, level: 1, xpNext: 20,
      equipment: { weapon: null, offhand: null, head: null, torso: null, legs: null, hands: null },
    };
  }

  function getAttack(player) {
    let bonus = 0;
    const eq = player.equipment || {};
    if (eq.weapon && typeof eq.weapon.atk === "number") bonus += eq.weapon.atk;
    if (eq.hands && typeof eq.hands.atk === "number") bonus += eq.hands.atk;
    const levelBonus = Math.floor((player.level - 1) / 2);
    return round1(player.atk + bonus + levelBonus);
  }

  function getDefense(player) {
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
    const slot = item.slot;
    const prev = player.equipment[slot];
    // remove from inventory
    player.inventory.splice(idx, 1);
    // equip
    player.equipment[slot] = item;
    const statStr = ("atk" in item) ? `+${item.atk} atk` : ("def" in item) ? `+${item.def} def` : "";
    if (hooks.log) hooks.log(`You equip ${item.name} (${slot}${statStr ? ", " + statStr : ""}).`);
    // return previous to inventory
    if (prev) {
      player.inventory.push(prev);
      if (hooks.log) hooks.log(`You stow ${describeItem(prev)} into your inventory.`);
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

  window.Player = {
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
  };
})();