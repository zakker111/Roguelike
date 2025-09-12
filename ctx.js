/*
Ctx: shared context factory so modules consume a single ctx object
instead of importing each other via window.*.

Exports (window.Ctx):
- create(base): returns a normalized ctx with consistent shape and optional module handles attached
- attachModules(ctx): attaches discovered module handles to the ctx (Enemies, Items, Player, UI, Logger, Loot, Dungeon, DungeonItems, FOV, AI, Input, Render)
Notes:
- This is a thin layer. It does not mutate the provided base, it returns a new object.
- Modules should read from ctx only; no direct window.* lookups are required if ctx is used consistently.
*/
(function () {
  function shallowClone(obj) {
    const out = {};
    for (const k in obj) out[k] = obj[k];
    return out;
  }

  function attachModules(ctx) {
    // Provide optional references so modules can avoid window lookups
    // Only attach if present in the page; safe to ignore otherwise.
    if (typeof window !== "undefined") {
      if (window.Enemies) ctx.Enemies = window.Enemies;
      if (window.Items) ctx.Items = window.Items;
      if (window.Player) ctx.Player = window.Player;
      if (window.UI) ctx.UI = window.UI;
      if (window.Logger) ctx.Logger = window.Logger;
      if (window.Loot) ctx.Loot = window.Loot;
      if (window.Dungeon) ctx.Dungeon = window.Dungeon;
      if (window.DungeonItems) ctx.DungeonItems = window.DungeonItems;
      if (window.FOV) ctx.FOV = window.FOV;
      if (window.AI) ctx.AI = window.AI;
      if (window.Input) ctx.Input = window.Input;
      if (window.Render) ctx.Render = window.Render;
      if (window.Tileset) ctx.Tileset = window.Tileset;
      if (window.Flavor) ctx.Flavor = window.Flavor;
    }
    return ctx;
  }

  function create(base) {
    const ctx = shallowClone(base || {});
    // Attach module handles as conveniences to discourage window.* usage in modules
    attachModules(ctx);
    // Optionally, freeze shallowly to prevent accidental mutation of the ctx contract by modules
    // Return non-frozen to keep flexibility; if desired, uncomment the next line:
    // return Object.freeze(ctx);
    return ctx;
  }

  window.Ctx = { create, attachModules };
})();