/*
DungeonItems: scripted dungeon props such as chests.

Exports (window.DungeonItems):
- placeChestInStartRoom(ctx): places a single chest with starter loot in the player's starting room on floor 1.
  The chest is represented as a corpse-like container in ctx.corpses with { kind: "chest", x, y, loot, looted }.
*/
(function () {
  function pickPotion(rng) {
    // Simple weighted choice: lesser 0.5, average 0.35, strong 0.15
    const r = rng();
    if (r < 0.5) return { name: "lesser potion (+3 HP)", kind: "potion", heal: 3 };
    if (r < 0.85) return { name: "average potion (+6 HP)", kind: "potion", heal: 6 };
    return { name: "strong potion (+10 HP)", kind: "potion", heal: 10 };
  }

  function pickArmor(tier, rng) {
    // Choose one armor slot randomly
    const slots = ["head", "torso", "legs", "hands"];
    const i = Math.floor(rng() * slots.length);
    const slot = slots[i];
    if (window.Items && typeof Items.createEquipmentOfSlot === "function") {
      return Items.createEquipmentOfSlot(slot, tier, rng);
    }
    // Fallback simple armor
    const nameBy = {
      head: "helmet",
      torso: "leather armor",
      legs: "leg armor",
      hands: "gloves",
    };
    const name = nameBy[slot] || "armor";
    return { kind: "equip", slot, name: `iron ${name}`, def: 1.0, tier, decay: 10 };
  }

  function pickWeapon(tier, rng) {
    if (window.Items && typeof Items.createEquipmentOfSlot === "function") {
      return Items.createEquipmentOfSlot("hand", tier, rng);
    }
    // Fallback simple sword
    return { kind: "equip", slot: "hand", name: "iron sword", atk: 1.5, tier, decay: 8 };
  }

  function findSpotInStartRoom(ctx) {
    const r = ctx.startRoomRect;
    if (!r) return { x: ctx.player.x, y: ctx.player.y };
    // Prefer a tile near the player
    const prefers = [
      { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
      { dx: 1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 },
    ];
    for (const d of prefers) {
      const x = ctx.player.x + d.dx, y = ctx.player.y + d.dy;
      if (x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h) {
        if (ctx.inBounds(x, y) && ctx.map[y][x] === ctx.TILES.FLOOR &&
            !(ctx.player.x === x && ctx.player.y === y) &&
            !ctx.enemies.some(e => e.x === x && e.y === y)) {
          return { x, y };
        }
      }
    }
    // Otherwise scan the start room
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (ctx.inBounds(x, y) && ctx.map[y][x] === ctx.TILES.FLOOR &&
            !(ctx.player.x === x && ctx.player.y === y) &&
            !ctx.enemies.some(e => e.x === x && e.y === y)) {
          return { x, y };
        }
      }
    }
    // Fallback: player's tile (will be looted by moving off/on)
    return { x: ctx.player.x, y: ctx.player.y };
  }

  function placeChestInStartRoom(ctx) {
    // Only place for depth 1 and only if not already present
    if (!ctx || !ctx.startRoomRect) return;
    if (!Array.isArray(ctx.corpses)) ctx.corpses = [];
    const already = ctx.corpses.find(c => c && c.kind === "chest");
    if (already) return;

    const tier = 2; // starter chest tier (iron-ish)
    const rng = ctx.rng || Math.random;

    const potion = pickPotion(rng);
    const armor = pickArmor(tier, rng);
    const weapon = pickWeapon(tier, rng);

    const loot = [potion, armor, weapon];

    const spot = findSpotInStartRoom(ctx);
    ctx.corpses.push({
      kind: "chest",
      x: spot.x,
      y: spot.y,
      loot,
      looted: false,
    });

    // Announce in green
    if (typeof ctx.log === "function") {
      ctx.log("You notice a chest nearby.", "good");
    }
  }

  window.DungeonItems = {
    placeChestInStartRoom,
  };
})();