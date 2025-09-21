/**
 * Status effects: small, short-lived combat statuses.
 *
 * Exports (window.Status):
 * - applyLimpToEnemy(ctx, enemy, durationTurns)
 * - applyDazedToPlayer(ctx, durationTurns)
 * - tick(ctx): per-turn updates (currently only player dazed)
 *
 * Notes:
 * - Limp is applied to enemies by setting enemy.immobileTurns (AI respects it).
 * - Dazed is applied to the player by setting ctx.player.dazedTurns; the player's action checks this and may skip a turn.
 */
(function () {
  function capName(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function applyLimpToEnemy(ctx, enemy, duration) {
    if (!enemy) return;
    const d = Math.max(1, duration | 0);
    enemy.immobileTurns = Math.max(enemy.immobileTurns || 0, d);
    try {
      ctx.log(`${capName(enemy.type || "enemy")} staggers; its legs are crippled and it can't move for ${d} turn${d > 1 ? "s" : ""}.`, "notice");
    } catch (_) {}
  }

  function applyDazedToPlayer(ctx, duration) {
    if (!ctx || !ctx.player) return;
    const d = Math.max(1, duration | 0);
    ctx.player.dazedTurns = Math.max(ctx.player.dazedTurns || 0, d);
    try {
      ctx.log(`You are dazed and might lose your next action${d > 1 ? "s" : ""}.`, "warn");
    } catch (_) {}
  }

  function tick(ctx) {
    if (ctx && ctx.player && ctx.player.dazedTurns && ctx.player.dazedTurns > 0) {
      ctx.player.dazedTurns -= 1;
      if (ctx.player.dazedTurns < 0) ctx.player.dazedTurns = 0;
    }
  }

  window.Status = { applyLimpToEnemy, applyDazedToPlayer, tick };
})();