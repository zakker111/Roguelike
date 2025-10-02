/**
 * DungeonManager: wraps dungeon generation and persistence hooks.
 *
 * Exports (window.DungeonManager):
 * - generate(ctx, depth)
 * - returnToWorldIfAtExit(ctx)
 */
(function () {
  function generate(ctx, depth) {
    if (window.Dungeon && typeof Dungeon.generateLevel === "function") {
      Dungeon.generateLevel(ctx, depth);
      return true;
    }
    return false;
  }

  function returnToWorldIfAtExit(ctx) {
    if (typeof ctx.returnToWorldIfAtExit === "function") {
      return ctx.returnToWorldIfAtExit();
    }
    return false;
  }

  window.DungeonManager = { generate, returnToWorldIfAtExit };
})();