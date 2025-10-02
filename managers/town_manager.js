/**
 * TownManager: wraps town interactions and movement rules.
 *
 * Exports (window.TownManager):
 * - interact(ctx): props, NPC talk, shop
 * - ensureSpawnClear(ctx)
 * - exit(ctx): request leave
 * - isNPCBlocked(ctx, x, y)
 */
(function () {
  function isNPCBlocked(ctx, x, y) {
    if (ctx.occupancy && typeof ctx.occupancy.hasNPC === "function") {
      return ctx.occupancy.hasNPC(x, y);
    }
    const npcs = ctx.npcs || [];
    return npcs.some(n => n.x === x && n.y === y);
  }

  function interact(ctx) {
    // Delegate to existing functions if present
    if (typeof ctx.interactTownProps === "function" && ctx.interactTownProps()) return true;
    if (typeof ctx.talkNearbyNPC === "function" && ctx.talkNearbyNPC()) return true;
    ctx.log && ctx.log("Nothing to do here.");
    return false;
  }

  function ensureSpawnClear(ctx) {
    if (typeof ctx.ensureTownSpawnClear === "function") {
      ctx.ensureTownSpawnClear();
      return true;
    }
    return false;
  }

  function exit(ctx) {
    if (typeof ctx.requestLeaveTown === "function") {
      ctx.requestLeaveTown();
      return true;
    }
    return false;
  }

  window.TownManager = { interact, ensureSpawnClear, exit, isNPCBlocked };
})();