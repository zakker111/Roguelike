/** 
 * Game: main loop, world state, combat, FOV/render orchestration, and glue.
 *
 * Responsibilities:
 * - Manage map, entities, player, RNG, and turn sequence
 * - Handle movement, bump-to-attack, blocks/crits/body-part, damage/DR, equipment decay
 * - Orchestrate FOV and drawing; bridge to UI and modules via ctx
 * - GOD toggles: always-crit (with forced body-part)
 *
 * Notes:
 * - Uses Ctx.create(base) to provide a normalized ctx to modules.
 * - Randomness is deterministic via mulberry32; helpers (randInt, randFloat, chance) built over it.
 */
(() => {
  // BEGIN pasted original root game.js content