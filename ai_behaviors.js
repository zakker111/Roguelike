/**
 * AIBehaviors: per-enemy-type behavior tunables.
 *
 * Exports (window.AIBehaviors):
 * - get(type): returns behavior config for type or a default
 *
 * Behavior config shape:
 * {
 *   shoutChance: number (0..1)           // base chance per turn to shout (if cooldown allows)
 *   shoutCooldownMin: number             // min cooldown turns after shouting
 *   shoutCooldownMax: number             // max cooldown turns after shouting
 *   perTurnShoutBudget: number           // max shouts allowed across all enemies per turn
 *   adjacentAttackChance: number|null    // if set, chance to attack when adjacent (otherwise default 100%)
 * }
 */
(function () {
  const DEFAULTS = {
    shoutChance: 0.0,
    shoutCooldownMin: 0,
    shoutCooldownMax: 0,
    perTurnShoutBudget: 0,
    adjacentAttackChance: null,
  };

  const MAP = {
    mime_ghost: {
      shoutChance: 0.06,
      shoutCooldownMin: 6,
      shoutCooldownMax: 12,
      perTurnShoutBudget: 1,
      adjacentAttackChance: 0.35,
    },
  };

  function get(type) {
    return Object.assign({}, DEFAULTS, MAP[type] || DEFAULTS);
  }

  window.AIBehaviors = { get };
})();