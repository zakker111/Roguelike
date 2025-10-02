/**
 * CombatEngine: centralized combat math helpers.
 *
 * Exports (window.CombatEngine):
 * - rollHitLocation(rng)
 * - critMultiplier(rng)
 * - getPlayerBlockChance(ctx, loc)   // respects Player or Stats if available
 * - enemyDamageAfterDefense(ctx, raw)
 * - enemyBlockChance(enemy, loc)     // uses Enemies if available for consistency
 */
(function () {
  function rollHitLocation(rng) {
    const r = (typeof rng === "function") ? rng() : Math.random();
    if (r < 0.50) return { part: "torso", mult: 1.0, blockMod: 1.0, critBonus: 0.00 };
    if (r < 0.65) return { part: "head",  mult: 1.1, blockMod: 0.85, critBonus: 0.15 };
    if (r < 0.80) return { part: "hands", mult: 0.9, blockMod: 0.75, critBonus: -0.05 };
    return { part: "legs",  mult: 0.95, blockMod: 0.75, critBonus: -0.03 };
  }

  function critMultiplier(rng) {
    const r = (typeof rng === "function") ? rng() : Math.random();
    return 1.6 + r * 0.4;
  }

  function getPlayerBlockChance(ctx, loc) {
    try {
      if (window.Combat && typeof Combat.getPlayerBlockChance === "function") {
        return Combat.getPlayerBlockChance(ctx, loc);
      }
      if (window.Stats && typeof Stats.getPlayerBlockChance === "function") {
        return Stats.getPlayerBlockChance(ctx, loc);
      }
    } catch (_) {}
    // Fallback mirrors game.js logic
    const p = ctx.player || {};
    const eq = p.equipment || {};
    const leftDef = (eq.left && typeof eq.left.def === "number") ? eq.left.def : 0;
    const rightDef = (eq.right && typeof eq.right.def === "number") ? eq.right.def : 0;
    const handDef = Math.max(leftDef, rightDef);
    const base = 0.08 + handDef * 0.06;
    return Math.max(0, Math.min(0.6, base * (loc?.blockMod || 1.0)));
  }

  function enemyDamageAfterDefense(ctx, raw) {
    try {
      if (window.Combat && typeof Combat.enemyDamageAfterDefense === "function") {
        return Combat.enemyDamageAfterDefense(ctx, raw);
      }
    } catch (_) {}
    // Fallback mirrors game.js getPlayerDefense -> DR -> floor
    let def = 0;
    try {
      if (window.Stats && typeof Stats.getPlayerDefense === "function") {
        def = Stats.getPlayerDefense(ctx);
      } else if (window.Player && typeof Player.getDefense === "function") {
        def = Player.getDefense(ctx.player);
      } else {
        const eq = (ctx.player && ctx.player.equipment) || {};
        if (eq.left && typeof eq.left.def === "number") def += eq.left.def;
        if (eq.right && typeof eq.right.def === "number") def += eq.right.def;
        if (eq.head && typeof eq.head.def === "number") def += eq.head.def;
        if (eq.torso && typeof eq.torso.def === "number") def += eq.torso.def;
        if (eq.legs && typeof eq.legs.def === "number") def += eq.legs.def;
        if (eq.hands && typeof eq.hands.def === "number") def += eq.hands.def;
      }
    } catch (_) {}
    const DR = Math.max(0, Math.min(0.85, def / (def + 6)));
    const reduced = raw * (1 - DR);
    return Math.max(0.1, Math.round(reduced * 10) / 10);
  }

  function enemyBlockChance(enemy, loc) {
    try {
      if (window.Enemies && typeof Enemies.enemyBlockChance === "function") {
        return Enemies.enemyBlockChance(enemy, loc);
      }
    } catch (_) {}
    // Minimal fallback
    const base = enemy.type === "ogre" ? 0.10 : enemy.type === "troll" ? 0.08 : 0.06;
    return Math.max(0, Math.min(0.35, base * (loc?.blockMod || 1.0)));
  }

  window.CombatEngine = {
    rollHitLocation,
    critMultiplier,
    getPlayerBlockChance,
    enemyDamageAfterDefense,
    enemyBlockChance,
  };
})();