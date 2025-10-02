/**
 * Town: generation and helpers behind a module facade.
 *
 * API:
 *   Town.generate(ctx) -> handled:boolean (true if it generated town and mutated ctx)
 *   Town.ensureSpawnClear(ctx) -> handled:boolean
 *   Town.spawnGateGreeters(ctx, count) -> handled:boolean
 *   Town.interactProps(ctx) -> handled:boolean
 *
 * Note: This module is initially a facade returning false to allow the existing game.js
 *       implementation to act as a fallback. It can be expanded to move the full logic.
 */
(function () {
  function generate(ctx) { return false; }
  function ensureSpawnClear(ctx) { return false; }
  function spawnGateGreeters(ctx, count = 4) { return false; }
  function interactProps(ctx) { return false; }

  window.Town = { generate, ensureSpawnClear, spawnGateGreeters, interactProps };
})();