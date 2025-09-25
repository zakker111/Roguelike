/**
 * Flavor: lightweight combat flavor messages.
 *
 * Exports (window.Flavor):
 * - logHit(ctx, { attacker, loc, crit })
 * - logPlayerHit(ctx, { target, loc, crit, dmg })
 * - onBlock(ctx, { side, attacker, defender, loc })  // optional hook used by AI; safe no-op if omitted
 * - announceFloorEnemyCount(ctx)
 *
 * Behavior:
 * - Occasionally logs an extra flavor line when the player is hit or when the player hits an enemy,
 *   based on hit location and whether it was a critical.
 * - Uses ctx.rng for determinism and ctx.log for output.
 */
(function () {
  function pick(arr, rng) {
    const r = rng || Math.random;
    return arr[Math.floor(r() * arr.length)];
  }

  // Simple flavor pools
  const HEAD_CRIT = [
    "A brutal crack to the skull; your ears ring.",
    "You take a hard hit to the head; your ears ring.",
  ];

  const TORSO_STING_PLAYER = [
    "A sharp jab to your ribs knocks the wind out.",
    "You clutch your ribs; the hit steals your breath.",
  ];

  const BLOOD_SPILL = [
    "Blood spills across the floor.",
    "Dark blood splashes on the stone.",
    "A stain spreads underfoot.",
  ];

  /**
   * Log an optional flavor line for an enemy hit against the player.
   * ctx: { rng():fn, log(msg, type?):fn }
   * opts: { attacker:{type?}, loc:{part}, crit:boolean }
   */
  function logHit(ctx, opts) {
    if (!ctx || typeof ctx.log !== "function" || typeof ctx.rng !== "function") return;
    const attacker = (opts && opts.attacker) || {};
    const loc = (opts && opts.loc) || {};
    const crit = !!(opts && opts.crit);

    // Prioritize memorable moments
    if (crit && loc.part === "head") {
      if (ctx.rng() < 0.6) {
        ctx.log(pick(HEAD_CRIT, ctx.rng), "flavor");
      }
      return;
    }

    if (loc.part === "torso") {
      if (ctx.rng() < 0.5) {
        ctx.log(pick(TORSO_STING_PLAYER, ctx.rng), "info");
      }
      return;
    }
  }

  // --- Player hitting enemies ---
  const ENEMY_TORSO_STING = [
    "You jab its ribs; it wheezes.",
    "A punch to its ribs knocks the wind out.",
  ];

  /**
   * Log an optional flavor line for when the player hits an enemy.
   * ctx: { rng():fn, log(msg, type?):fn }
   * opts: { target:{type?}, loc:{part}, crit:boolean, dmg:number }
   */
  function logPlayerHit(ctx, opts) {
    if (!ctx || typeof ctx.log !== "function" || typeof ctx.rng !== "function") return;
    const target = (opts && opts.target) || {};
    const loc = (opts && opts.loc) || {};
    const crit = !!(opts && opts.crit);
    const dmg = (opts && typeof opts.dmg === "number") ? opts.dmg : null;

    // Blood spill flavor (pairs with decals). Keep brief and not on every hit.
    if (dmg != null && dmg > 0) {
      const p = crit ? 0.5 : 0.25; // higher chance on crits
      if (ctx.rng() < p) {
        ctx.log(pick(BLOOD_SPILL, ctx.rng), "flavor");
      }
    }

    // Strong crit to head -> yellow notice, include enemy and location
    if (crit && loc.part === "head") {
      if (ctx.rng() < 0.6) {
        const name = (target && target.type) ? target.type : "enemy";
        const variants = [
          `A clean crack to the ${name}'s head; it reels.`,
          `Your strike slams the ${name}'s head; it staggers.`,
        ];
        ctx.log(pick(variants, ctx.rng), "notice");
      }
      return;
    }

    // Good damage (more frequent): absolute >= 2.0 -> green "good"
    if (!crit && dmg != null && dmg >= 2.0) {
      if (ctx.rng() < 0.8) {
        const name = (target && target.type) ? target.type : "enemy";
        const part = (loc && loc.part) ? loc.part : "body";
        const variants = [
          `A heavy blow to the ${name}'s ${part}!`,
          `A solid hit to the ${name}'s ${part}!`,
          `A telling strike to the ${name}'s ${part}!`,
        ];
        ctx.log(pick(variants, ctx.rng), "good");
      }
      // continue; allow location-specific line below
    }

    if (loc.part === "torso") {
      if (ctx.rng() < 0.5) {
        ctx.log(pick(ENEMY_TORSO_STING, ctx.rng), "info");
      }
      return;
    }
  }

  /**
   * Optional hook: flavor line on blocks (player or enemy).
   * ctx: { rng():fn, log(msg,type?):fn }
   * opts: { side:"player"|"enemy", attacker?, defender?, loc?:{part} }
   */
  function onBlock(ctx, opts) {
    if (!ctx || typeof ctx.log !== "function" || typeof ctx.rng !== "function") return;
    const side = (opts && opts.side) || "player";
    const loc = (opts && opts.loc) || {};
    const part = loc.part || "attack";

    // keep rare to avoid spam
    if (ctx.rng() < 0.3) {
      if (side === "player") {
        const variants = [
          `You deflect the ${part}.`,
          `You turn aside the blow to your ${part}.`,
        ];
        ctx.log(pick(variants, ctx.rng), "block");
      } else {
        const variants = [
          `It deflects your strike to the ${part}.`,
          `Your blow glances off its ${part}.`,
        ];
        ctx.log(pick(variants, ctx.rng), "block");
      }
    }
  }

  /**
   * Announce total enemies present on the floor (once per floor start).
   * Always logs a concise summary using ctx.enemies.length.
   * ctx: { enemies:Array, log:fn }
   */
  function announceFloorEnemyCount(ctx) {
    if (!ctx || typeof ctx.log !== "function" || !Array.isArray(ctx.enemies)) return;
    const n = ctx.enemies.length | 0;
    if (n <= 0) {
      ctx.log("You sense no enemies on this floor.", "notice");
    } else if (n === 1) {
      ctx.log("You sense 1 enemy on this floor.", "notice");
    } else {
      ctx.log(`You sense ${n} enemies on this floor.`, "notice");
    }
  }

  window.Flavor = { logHit, logPlayerHit, onBlock, announceFloorEnemyCount };
})();