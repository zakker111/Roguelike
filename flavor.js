/*
Flavor: lightweight combat flavor messages.

Exports (window.Flavor):
- logHit(ctx, { attacker, loc, crit })

Behavior:
- Occasionally logs an extra flavor line when the player is hit by an enemy,
  based on hit location and whether it was a critical.
- Uses ctx.rng for determinism and ctx.log for output.
*/
(function () {
  function pick(arr, rng) {
    const r = rng || Math.random;
    return arr[Math.floor(r() * arr.length)];
  }

  // Simple flavor pools
  const HEAD_CRIT = [
    "A brutal crack to the skull; your ears ring.",
    "You take a hard hit to the head; your ears ring."
  ];

  const GOBLIN_TORSO = [
    "The goblin jabs your ribs; you gasp for air.",
    "A sharp jab to your ribs knocks the wind out."
  ];

  /**
   * Log an optional flavor line for an enemy hit against the player.
   * ctx: { rng():fn, log(msg, type?):fn }
   * opts: { attacker:{type?}, loc:{part}, crit:boolean }
   */
  function logHit(ctx, opts) {
    if (!ctx || typeof ctx.log !== "function" || typeof ctx.rng !== "function") return;
    const attacker = opts && opts.attacker || {};
    const loc = opts && opts.loc || {};
    const crit = !!(opts && opts.crit);

    // Prioritize memorable moments
    if (crit && loc.part === "head") {
      if (ctx.rng() < 0.6) {
        ctx.log(pick(HEAD_CRIT, ctx.rng), "notice");
      }
      return;
    }

    if ((attacker.type || "") === "goblin" && loc.part === "torso") {
      if (ctx.rng() < 0.6) {
        ctx.log(pick(GOBLIN_TORSO, ctx.rng), "info");
      }
      return;
    }
  }

  // --- Player hitting enemies ---
  const ENEMY_HEAD_CRIT = [
    "A clean crack to the skull; it reels.",
    "Your strike slams its head; it staggers."
  ];

  const ENEMY_GOBLIN_TORSO = [
    "You jab the goblin's ribs; it wheezes.",
    "A punch to its ribs knocks the wind from the goblin."
  ];

  const GOOD_HIT_GENERIC = [
    "A heavy blow!",
    "A solid hit!",
    "A telling strike!"
  ];

  /**
   * Log an optional flavor line for when the player hits an enemy.
   * ctx: { rng():fn, log(msg, type?):fn }
   * opts: { target:{type?}, loc:{part}, crit:boolean, dmg:number }
   */
  function logPlayerHit(ctx, opts) {
    if (!ctx || typeof ctx.log !== "function" || typeof ctx.rng !== "function") return;
    const target = opts && opts.target || {};
    const loc = opts && opts.loc || {};
    const crit = !!(opts && opts.crit);
    const dmg = (opts && typeof opts.dmg === "number") ? opts.dmg : null;

    // Strong crit to head -> yellow notice
    if (crit && loc.part === "head") {
      if (ctx.rng() < 0.6) {
        ctx.log(pick(ENEMY_HEAD_CRIT, ctx.rng), "notice");
      }
      return;
    }

    // Good damage threshold (absolute, simple): >= 3.0 -> green "good"
    if (!crit && dmg != null && dmg >= 3.0) {
      if (ctx.rng() < 0.7) {
        ctx.log(pick(GOOD_HIT_GENERIC, ctx.rng), "good");
      }
      // continue; allow location/type-specific variants below via early return
    }

    if ((target.type || "") === "goblin" && loc.part === "torso") {
      if (ctx.rng() < 0.6) {
        ctx.log(pick(ENEMY_GOBLIN_TORSO, ctx.rng), "info");
      }
      return;
    }
  }
      return;
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

  window.Flavor = { logHit, logPlayerHit, announceFloorEnemyCount };
})();