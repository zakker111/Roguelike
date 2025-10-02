/**
 * Actions: context-sensitive actions (interact/loot/descend) orchestrated via ctx.
 * Lightweight facade; returns true if it handled the action, else false to allow fallback.
 *
 * API:
 *   Actions.doAction(ctx) -> handled:boolean
 *   Actions.loot(ctx) -> handled:boolean
 *   Actions.descend(ctx) -> handled:boolean
 */
(function () {
  function doAction(ctx) {
    // For now, leave handling to the game's fallback; return false.
    return false;
  }
  function loot(ctx) {
    return false;
  }
  function descend(ctx) {
    // In dungeons we show the guidance, but allow fallback to handle text
    return false;
  }
  window.Actions = { doAction, loot, descend };
})();