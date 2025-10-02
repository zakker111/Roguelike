/**
 * WorldManager: wraps overworld init and entry checks.
 *
 * Exports (window.WorldManager):
 * - init(ctx): sets ctx.world and overworld state
 * - isTownAt(ctx, x, y)
 * - isDungeonAt(ctx, x, y)
 * - enterTownIfOnTile(ctx)
 * - enterDungeonIfOnEntrance(ctx)
 */
(function () {
  function isTownAt(ctx, x, y) {
    const WT = (typeof window !== "undefined" && window.World && World.TILES) ? World.TILES : null;
    if (!WT || !ctx.world || !ctx.world.map) return false;
    return ctx.world.map[y] && ctx.world.map[y][x] === WT.TOWN;
  }

  function isDungeonAt(ctx, x, y) {
    const WT = (typeof window !== "undefined" && window.World && World.TILES) ? World.TILES : null;
    if (!WT || !ctx.world || !ctx.world.map) return false;
    return ctx.world.map[y] && ctx.world.map[y][x] === WT.DUNGEON;
  }

  function init(ctx) {
    if (!(window.World && typeof World.generate === "function")) {
      ctx.log && ctx.log("World module missing; generating dungeon instead.", "warn");
      ctx.mode = "dungeon";
      if (window.Dungeon && typeof Dungeon.generateLevel === "function") {
        Dungeon.generateLevel(ctx, ctx.depth || 1);
      }
      return;
    }
    const size = { width: ctx.MAP_COLS, height: ctx.MAP_ROWS };
    ctx.world = World.generate(ctx, size);
    const start = World.pickTownStart(ctx.world, ctx.rng);
    ctx.player.x = start.x; ctx.player.y = start.y;
    ctx.mode = "world";
    ctx.enemies = [];
    ctx.corpses = [];
    ctx.decals = [];
    ctx.npcs = [];
    ctx.shops = [];
    ctx.map = ctx.world.map;
    ctx.seen = Array.from({ length: ctx.map.length }, () => Array(ctx.map[0].length).fill(true));
    ctx.visible = Array.from({ length: ctx.map.length }, () => Array(ctx.map[0].length).fill(true));
    if (typeof ctx.updateCamera === "function") ctx.updateCamera();
    if (typeof ctx.recomputeFOV === "function") ctx.recomputeFOV();
    if (typeof ctx.updateUI === "function") ctx.updateUI();
    ctx.log && ctx.log("You arrive in the overworld. Towns: small (t), big (T), cities (C). Dungeons (D). Press Enter on a town/dungeon to enter.", "notice");
    try { if (window.UI && typeof UI.hideTownExitButton === "function") UI.hideTownExitButton(); } catch (_) {}
  }

  function enterTownIfOnTile(ctx) {
    if (ctx.mode !== "world" || !ctx.world) return false;
    if (isTownAt(ctx, ctx.player.x, ctx.player.y)) {
      ctx.worldReturnPos = { x: ctx.player.x, y: ctx.player.y };
      ctx.mode = "town";
      if (typeof ctx.generateTown === "function") {
        ctx.generateTown();
      }
      return true;
    }
    return false;
  }

  function enterDungeonIfOnEntrance(ctx) {
    if (ctx.mode !== "world" || !ctx.world) return false;
    if (isDungeonAt(ctx, ctx.player.x, ctx.player.y)) {
      ctx.cameFromWorld = true;
      ctx.worldReturnPos = { x: ctx.player.x, y: ctx.player.y };
      // Let game.js keep its current dungeon flow to avoid duplication
      if (typeof ctx._enterDungeonLegacy === "function") {
        return ctx._enterDungeonLegacy();
      }
      return true;
    }
    return false;
  }

  window.WorldManager = { init, isTownAt, isDungeonAt, enterTownIfOnTile, enterDungeonIfOnEntrance };
})();