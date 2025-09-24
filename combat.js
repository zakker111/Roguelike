/**
 * CombatCore: core combat routines extracted from game.js.
 *
 * Exports (window.CombatCore):
 * - playerAttackEnemy(ctx, enemy): resolves player's bump-attack against an adjacent enemy
 * - enemyAttackPlayer(ctx, enemy): resolves enemy's adjacent attack against the player
 * - decayAttackHands(ctx, light?): applies wear to equipped hand items after an attack or block
 *
 * Notes:
 * - Uses helpers provided on ctx: rollHitLocation, critMultiplier, enemyDamageAfterDefense,
 *   getPlayerAttack, getPlayerDefense, getPlayerBlockChance, getEnemyBlockChance, decayEquipped,
 *   addBloodDecal, Flavor, Status, log, onEnemyDied, onPlayerDied, rng, utils.
 * - Keeps behavior identical to previous implementation in game.js/ai.js.
 */
(function () {
  function decayAttackHands(ctx, light = false) {
    const player = ctx.player;
    const eq = player.equipment || {};
    const U = (ctx.utils || {});
    const randFloat = typeof U.randFloat === "function"
      ? U.randFloat
      : (min, max, decimals = 1) => {
          const v = min + ctx.rng() * (max - min);
          const p = Math.pow(10, decimals);
          return Math.round(v * p) / p;
        };
    const amtMain = light ? randFloat(0.6, 1.6, 1) : randFloat(1.0, 2.2, 1);

    const usingTwoHanded = !!(eq.left && eq.right && eq.left === eq.right && eq.left.twoHanded);
    if (usingTwoHanded) {
      if (eq.left) ctx.decayEquipped("left", amtMain);
      if (eq.right) ctx.decayEquipped("right", amtMain);
      return;
    }
    const leftAtk = (eq.left && typeof eq.left.atk === "number") ? eq.left.atk : 0;
    const rightAtk = (eq.right && typeof eq.right.atk === "number") ? eq.right.atk : 0;
    if (leftAtk >= rightAtk && leftAtk > 0) {
      if (eq.left) ctx.decayEquipped("left", amtMain);
    } else if (rightAtk > 0) {
      if (eq.right) ctx.decayEquipped("right", amtMain);
    } else if (eq.left) {
      ctx.decayEquipped("left", amtMain);
    } else if (eq.right) {
      ctx.decayEquipped("right", amtMain);
    }
  }

  function playerAttackEnemy(ctx, enemy, opts) {
    const rng = ctx.rng;
    const U = ctx.utils || {};
    const round1 = U.round1 || ((n) => Math.round(n * 10) / 10);
    const capitalize = U.capitalize || (s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
    const randFloat = U.randFloat || ((min, max, decimals = 1) => {
      const v = min + rng() * (max - min);
      const p = Math.pow(10, decimals);
      return Math.round(v * p) / p;
    });

    // Hit location (respect forced crit part via opts if present)
    let loc = ctx.rollHitLocation();
    if (opts && opts.forcedCritPart) {
      const profiles = {
        torso: { part: "torso", mult: 1.0, blockMod: 1.0, critBonus: 0.00 },
        head:  { part: "head",  mult: 1.1, blockMod: 0.85, critBonus: 0.15 },
        hands: { part: "hands", mult: 0.9, blockMod: 0.75, critBonus: -0.05 },
        legs:  { part: "legs",  mult: 0.95, blockMod: 0.75, critBonus: -0.03 },
      };
      if (profiles[opts.forcedCritPart]) loc = profiles[opts.forcedCritPart];
    }

    // Enemy block
    if (rng() < ctx.getEnemyBlockChance(enemy, loc)) {
      ctx.log(`${capitalize(enemy.type || "enemy")} blocks your attack to the ${loc.part}.`, "block");
      decayAttackHands(ctx, true);
      ctx.decayEquipped("hands", randFloat(0.2, 0.7, 1));
      return { blocked: true };
    }

    // Damage calc
    let dmg = ctx.getPlayerAttack() * loc.mult;
    let isCrit = false;
    const alwaysCrit = !!(typeof window !== "undefined" && window.ALWAYS_CRIT);
    const forcedCritPart = (typeof window !== "undefined" && typeof window.ALWAYS_CRIT_PART === "string") ? window.ALWAYS_CRIT_PART : "";
    const critChance = Math.max(0, Math.min(0.6, 0.12 + loc.critBonus));
    if (alwaysCrit || rng() < critChance) {
      isCrit = true;
      dmg *= ctx.critMultiplier();
    }
    dmg = Math.max(0, round1(dmg));
    enemy.hp -= dmg;

    // Decal on enemy tile
    if (dmg > 0 && typeof ctx.addBloodDecal === "function") {
      try { ctx.addBloodDecal(enemy.x, enemy.y, isCrit ? 1.6 : 1.0); } catch (_) {}
    }

    // Logs + flavor
    if (isCrit) ctx.log(`Critical! You hit the ${enemy.type || "enemy"}'s ${loc.part} for ${dmg}.`, "crit");
    else ctx.log(`You hit the ${enemy.type || "enemy"}'s ${loc.part} for ${dmg}.`);
    if (ctx.Flavor && typeof ctx.Flavor.logPlayerHit === "function") {
      try { ctx.Flavor.logPlayerHit(ctx, { target: enemy, loc, crit: isCrit, dmg }); } catch (_) {}
    }

    // Status effects
    if (isCrit && loc.part === "legs" && enemy.hp > 0) {
      if (typeof window !== "undefined" && window.Status && typeof Status.applyLimpToEnemy === "function") {
        Status.applyLimpToEnemy(ctx, enemy, 2);
      } else {
        enemy.immobileTurns = Math.max(enemy.immobileTurns || 0, 2);
        ctx.log(`${capitalize(enemy.type || "enemy")} staggers; its legs are crippled and it can't move for 2 turns.`, "notice");
      }
    }
    if (isCrit && enemy.hp > 0 && typeof window !== "undefined" && window.Status && typeof Status.applyBleedToEnemy === "function") {
      try { Status.applyBleedToEnemy(ctx, enemy, 2); } catch (_) {}
    }

    // Death
    if (enemy.hp <= 0 && typeof ctx.onEnemyDied === "function") {
      ctx.onEnemyDied(enemy);
    }

    // Decay
    decayAttackHands(ctx);
    ctx.decayEquipped("hands", randFloat(0.3, 1.0, 1));

    return { blocked: false, crit: isCrit, dmg, loc };
  }

  function enemyAttackPlayer(ctx, enemy) {
    const rng = ctx.rng;
    const U = ctx.utils || {};
    const randFloat = U.randFloat || ((min, max, decimals = 1) => {
      const v = min + rng() * (max - min);
      const p = Math.pow(10, decimals);
      return Math.round(v * p) / p;
    });
    const Cap = U.capitalize || (s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

    const loc = ctx.rollHitLocation();

    // Player attempts to block
    if (rng() < ctx.getPlayerBlockChance(loc)) {
      ctx.log(`You block the ${enemy.type || "enemy"}'s attack to your ${loc.part}.`, "block");
      if (ctx.Flavor && typeof ctx.Flavor.onBlock === "function") {
        try { ctx.Flavor.onBlock(ctx, { side: "player", attacker: enemy, defender: ctx.player, loc }); } catch (_) {}
      }
      ctx.decayBlockingHands();
      ctx.decayEquipped("hands", randFloat(0.3, 1.0, 1));
      return { blocked: true };
    }

    // Damage calc
    let raw = enemy.atk * (ctx.enemyDamageMultiplier ? ctx.enemyDamageMultiplier(enemy.level) : (1 + 0.15 * Math.max(0, (enemy.level || 1) - 1))) * (loc.mult || 1);
    let isCrit = false;
    const critChance = Math.max(0, Math.min(0.5, 0.10 + (loc.critBonus || 0)));
    if (rng() < critChance) {
      isCrit = true;
      raw *= (ctx.critMultiplier ? ctx.critMultiplier() : (1.6 + rng() * 0.4));
    }
    const dmg = ctx.enemyDamageAfterDefense(raw);
    ctx.player.hp -= dmg;

    // Decal on player tile
    if (dmg > 0 && typeof ctx.addBloodDecal === "function") {
      try { ctx.addBloodDecal(ctx.player.x, ctx.player.y, isCrit ? 1.4 : 1.0); } catch (_) {}
    }

    // Logs
    if (isCrit) ctx.log(`Critical! ${Cap(enemy.type)} hits your ${loc.part} for ${dmg}.`, "crit");
    else ctx.log(`${Cap(enemy.type)} hits your ${loc.part} for ${dmg}.`);
    if (ctx.Flavor && typeof ctx.Flavor.logHit === "function") {
      try { ctx.Flavor.logHit(ctx, { attacker: enemy, loc, crit: isCrit, dmg }); } catch (_) {}
    }

    // Status effects on player
    if (isCrit && loc.part === "head" && typeof window !== "undefined" && window.Status && typeof Status.applyDazedToPlayer === "function") {
      const dur = (rng ? (1 + Math.floor(rng() * 2)) : 1); // 1-2 turns
      try { Status.applyDazedToPlayer(ctx, dur); } catch (_) {}
    }
    if (isCrit && typeof window !== "undefined" && window.Status && typeof Status.applyBleedToPlayer === "function") {
      try { Status.applyBleedToPlayer(ctx, 2); } catch (_) {}
    }

    // Item decay on being hit (only struck location)
    const critWear = isCrit ? 1.6 : 1.0;
    let wear = 0.5;
    if (loc.part === "torso") wear = randFloat(0.8, 2.0, 1);
    else if (loc.part === "head") wear = randFloat(0.3, 1.0, 1);
    else if (loc.part === "legs") wear = randFloat(0.4, 1.3, 1);
    else if (loc.part === "hands") wear = randFloat(0.3, 1.0, 1);
    ctx.decayEquipped(loc.part, wear * critWear);

    // Death
    if (ctx.player.hp <= 0) {
      ctx.player.hp = 0;
      if (typeof ctx.onPlayerDied === "function") ctx.onPlayerDied();
      return { killedPlayer: true, crit: isCrit, dmg };
    }

    return { blocked: false, crit: isCrit, dmg, loc };
  }

  window.CombatCore = { playerAttackEnemy, enemyAttackPlayer, decayAttackHands };
})();