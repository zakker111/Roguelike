/**
 * DungeonState: persistence helpers for dungeon maps keyed by overworld entrance.
 *
 * API:
 *   DungeonState.key(x, y) -> "x,y"
 *   DungeonState.save(ctx)
 *   DungeonState.load(ctx, x, y) -> true/false
 *   DungeonState.returnToWorldIfAtExit(ctx) -> true/false
 */
(function () {
  function key(x, y) { return `${x},${y}`; }

  function save(ctx) {
    if (!ctx) return;
    if (ctx.mode !== "dungeon" || !ctx.dungeonInfo || !ctx.dungeonExitAt) return;
    const k = key(ctx.dungeonInfo.x, ctx.dungeonInfo.y);
    if (!ctx._dungeonStates) ctx._dungeonStates = Object.create(null);
    ctx._dungeonStates[k] = {
      map: ctx.map,
      seen: ctx.seen,
      visible: ctx.visible,
      enemies: ctx.enemies,
      corpses: ctx.corpses,
      decals: ctx.decals,
      dungeonExitAt: { x: ctx.dungeonExitAt.x, y: ctx.dungeonExitAt.y },
      info: ctx.dungeonInfo,
      level: ctx.floor
    };
  }

  function load(ctx, x, y) {
    if (!ctx) return false;
    const k = key(x, y);
    const st = ctx._dungeonStates && ctx._dungeonStates[k];
    if (!st) return false;

    ctx.mode = "dungeon";
    ctx.dungeonInfo = st.info || { x, y, level: st.level || 1, size: "medium" };
    ctx.floor = st.level || 1;
    if (typeof window !== "undefined") window.floor = ctx.floor;

    ctx.map = st.map;
    ctx.seen = st.seen;
    ctx.visible = st.visible;
    ctx.enemies = st.enemies;
    ctx.corpses = st.corpses;
    ctx.decals = st.decals || [];
    ctx.dungeonExitAt = st.dungeonExitAt || { x, y };

    // Place player at the entrance hole
    ctx.player.x = ctx.dungeonExitAt.x;
    ctx.player.y = ctx.dungeonExitAt.y;

    // Ensure entrance tile is STAIRS
    if (ctx.inBounds(ctx.dungeonExitAt.x, ctx.dungeonExitAt.y)) {
      ctx.map[ctx.dungeonExitAt.y][ctx.dungeonExitAt.x] = ctx.TILES.STAIRS;
      if (ctx.visible[ctx.dungeonExitAt.y]) ctx.visible[ctx.dungeonExitAt.y][ctx.dungeonExitAt.x] = true;
      if (ctx.seen[ctx.dungeonExitAt.y]) ctx.seen[ctx.dungeonExitAt.y][ctx.dungeonExitAt.x] = true;
    }

    ctx.recomputeFOV();
    ctx.updateCamera();
    ctx.updateUI();
    ctx.log(`You re-enter the dungeon (Difficulty ${ctx.floor}${ctx.dungeonInfo.size ? ", " + ctx.dungeonInfo.size : ""}).`, "notice");
    ctx.requestDraw();
    return true;
  }

  function returnToWorldIfAtExit(ctx) {
    if (!ctx) return false;
    if (ctx.mode !== "dungeon" || !ctx.cameFromWorld || !ctx.world) return false;
    if (ctx.floor !== 1) return false;
    const ex = ctx.dungeonExitAt && ctx.dungeonExitAt.x;
    const ey = ctx.dungeonExitAt && ctx.dungeonExitAt.y;
    if (typeof ex !== "number" || typeof ey !== "number") return false;
    if (ctx.player.x === ex && ctx.player.y === ey) {
      ctx.mode = "world";
      ctx.enemies = [];
      ctx.corpses = [];
      ctx.decals = [];
      ctx.map = ctx.world.map;
      if (ctx.worldReturnPos) {
        ctx.player.x = ctx.worldReturnPos.x;
        ctx.player.y = ctx.worldReturnPos.y;
      }
      ctx.recomputeFOV();
      ctx.updateCamera();
      ctx.updateUI();
      ctx.log("You return to the overworld.", "notice");
      ctx.requestDraw();
      return true;
    }
    ctx.log("Return to the dungeon entrance to go back to the overworld.", "info");
    return false;
  }

  window.DungeonState = { key, save, load, returnToWorldIfAtExit };
})();