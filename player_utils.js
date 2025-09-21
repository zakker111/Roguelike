/**
 * PlayerUtils: small shared helpers for player-related math.
 *
 * Exports (window.PlayerUtils):
 * - round1(n): rounds to 1 decimal place
 * - clamp(v, min, max): clamps v into [min,max]
 */
(function () {
  function round1(n) {
    return Math.round(n * 10) / 10;
  }
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }
  window.PlayerUtils = { round1, clamp };
})();