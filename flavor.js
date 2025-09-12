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

  /**
   * Log an optional flavor line for when the player hits an enemy.
   * ctx: { rng():fn, log(msg, type?):fn }
   * opts: { target:{type?}, loc:{part}, crit:boolean }
   */
  function logPlayerHit(ctx, opts) {
    if (!ctx || typeof ctx.log !== "function" || typeof ctx.rng !== "function") return;
    const target = opts && opts.target || {};
    const loc = opts && opts.loc || {};
    const crit = !!(opts && opts.crit);

    if (crit && loc.part === "head") {
      if (ctx.rng() < 0.6) {
        ctx.log(pick(ENEMY_HEAD_CRIT, ctx.rng), "notice");
      }
      return;
    }

    if ((target.type || "") === "goblin" && loc.part === "torso") {
      if (ctx.rng() < 0.6) {
        ctx.log(pick(ENEMY_GOBLIN_TORSO, ctx.rng), "info");
      }
      return;
    }
  }

  window.Flavor = { logHit, logPlayerHit };
})();