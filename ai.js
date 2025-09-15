/*
AI: enemy perception and movement + attack routine.

Exports (window.AI):
- enemiesAct(ctx): runs one AI turn for all enemies

ctx contract (minimal):
{
  // state
  player, enemies, map, TILES,
  // geometry
  ROWS, COLS, inBounds, isWalkable,
  // rng utils
  rng, randInt, chance,
  // combat helpers and effects
  rollHitLocation(), critMultiplier(), getPlayerBlockChance(loc),
  enemyDamageAfterDefense(raw), randFloat(min,max,dec),
  decayBlockingHands(), decayEquipped(slot, amt),
  // UI/log
  log(msg, type?), updateUI(),
  // lifecycle
  onPlayerDied(), // called when HP <= 0
}
*/
(function () {
  function tileTransparent(ctx, x, y) {
    if (!ctx.inBounds(x, y)) return false;
    return ctx.map[y][x] !== ctx.TILES.WALL;
  }

  function hasLOS(ctx, x0, y0, x1, y1) {
    // Bresenham; check transparency on cells along the line excluding the start, including last step before target.
    let dx = Math.abs(x1 - x0), sx = x0 &lt; x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0), sy = y0 &lt; y1 ? 1 : -1;
    let err = dx + dy, e2;
    while (!(x0 === x1 &amp;&amp; y0 === y1)) {
      e2 = 2 * err;
      if (e2 &gt;= dy) { err += dy; x0 += sx; }
      if (e2 &lt;= dx) { err += dx; y0 += sy; }
      // If we've reached the target, stop (do not require transparency on target cell)
      if (x0 === x1 &amp;&amp; y0 === y1) break;
      if (!tileTransparent(ctx, x0, y0)) return false;
    }
    return true;
  }

  function enemiesAct(ctx) {
    const { player, enemies } = ctx;
    const senseRange = 8;

    // O(1) occupancy for this turn
    const occ = new Set(enemies.map(en => `${en.x},${en.y}`));
    const isFree = (x, y) => ctx.isWalkable(x, y) && !occ.has(`${x},${y}`) && !(player.x === x && player.y === y);

    for (const e of enemies) {
      const dx = player.x - e.x;
      const dy = player.y - e.y;
      const dist = Math.abs(dx) + Math.abs(dy);

      // attack if adjacent
      if (Math.abs(dx) + Math.abs(dy) === 1) {
        const loc = ctx.rollHitLocation();

        // Player attempts to block with hand/position
        if (ctx.rng() < ctx.getPlayerBlockChance(loc)) {
          ctx.log(`You block the ${e.type || "enemy"}'s attack to your ${loc.part}.`, "block");
          // Optional flavor for blocks
          if (ctx.Flavor && typeof ctx.Flavor.onBlock === "function") {
            ctx.Flavor.onBlock(ctx, { side: "player", attacker: e, defender: player, loc });
          }
          // Blocking uses gear
          ctx.decayBlockingHands();
          ctx.decayEquipped("hands", ctx.randFloat(0.3, 1.0, 1));
          continue;
        }

        // Compute damage with location and crit; then reduce by defense
        let raw = e.atk * (ctx.enemyDamageMultiplier ? ctx.enemyDamageMultiplier(e.level) : (1 + 0.15 * Math.max(0, (e.level || 1) - 1))) * (loc.mult || 1);
        let isCrit = false;
        const critChance = Math.max(0, Math.min(0.5, 0.10 + (loc.critBonus || 0)));
        if (ctx.rng() < critChance) {
          isCrit = true;
          raw *= (ctx.critMultiplier ? ctx.critMultiplier() : (1.6 + ctx.rng() * 0.4));
        }
        const dmg = ctx.enemyDamageAfterDefense(raw);
        player.hp -= dmg;
        if (isCrit) ctx.log(`Critical! ${cap(e.type)} hits your ${loc.part} for ${dmg}.`, "crit");
        else ctx.log(`${cap(e.type)} hits your ${loc.part} for ${dmg}.`);
        if (ctx.Flavor && typeof ctx.Flavor.logHit === "function") {
          ctx.Flavor.logHit(ctx, { attacker: e, loc, crit: isCrit, dmg });
        }

        // Item decay on being hit (only struck location)
        const critWear = isCrit ? 1.6 : 1.0;
        let wear = 0.5;
        if (loc.part === "torso") wear = ctx.randFloat(0.8, 2.0, 1);
        else if (loc.part === "head") wear = ctx.randFloat(0.3, 1.0, 1);
        else if (loc.part === "legs") wear = ctx.randFloat(0.4, 1.3, 1);
        else if (loc.part === "hands") wear = ctx.randFloat(0.3, 1.0, 1);
        ctx.decayEquipped(loc.part, wear * critWear);
        if (player.hp <= 0) {
          player.hp = 0;
          if (typeof ctx.onPlayerDied === "function") ctx.onPlayerDied();
          return;
        }
        continue;
      }

      if (dist <= senseRange) {
        // Prefer to chase if LOS; otherwise attempt a cautious step toward the player
        const canSee = hasLOS(ctx, e.x, e.y, player.x, player.y);
        const sx = dx === 0 ? 0 : dx > 0 ? 1 : -1;
        const sy = dy === 0 ? 0 : dy > 0 ? 1 : -1;

        const primary = Math.abs(dx) > Math.abs(dy) ? [{x:sx,y:0},{x:0,y:sy}] : [{x:0,y:sy},{x:sx,y:0}];
        const tryDirs = canSee ? primary : primary; // same order; LOS just raises certainty

        let moved = false;
        for (const d of tryDirs) {
          const nx = e.x + d.x;
          const ny = e.y + d.y;
          if (isFree(nx, ny)) {
            occ.delete(`${e.x},${e.y}`);
            e.x = nx; e.y = ny;
            occ.add(`${e.x},${e.y}`);
            moved = true; break;
          }
        }
        if (!moved) {
          // try alternate directions (simple wiggle)
          const alt = [{x:-1,y:0},{x:1,y:0},{x:0,y:-1},{x:0,y:1}];
          for (const d of alt) {
            const nx = e.x + d.x;
            const ny = e.y + d.y;
            if (isFree(nx, ny)) {
              occ.delete(`${e.x},${e.y}`);
              e.x = nx; e.y = ny;
              occ.add(`${e.x},${e.y}`);
              moved = true;
              break;
            }
          }
        }
      } else if (ctx.chance(0.6)) {
        // random wander (more likely when far away)
        const dirs = [{x:-1,y:0},{x:1,y:0},{x:0,y:-1},{x:0,y:1}];
        const d = dirs[ctx.randInt(0, dirs.length - 1)];
        const nx = e.x + d.x, ny = e.y + d.y;
        if (isFree(nx, ny)) {
          occ.delete(`${e.x},${e.y}`);
          e.x = nx; e.y = ny;
          occ.add(`${e.x},${e.y}`);
        }
      }
    }
  }

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  window.AI = {
    enemiesAct,
  };
})();