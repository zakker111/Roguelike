/*
FOV module: recompute line-of-sight and explored memory.

API:
- FOV.recomputeFOV(ctx)
  ctx needs:
    ROWS, COLS, fovRadius
    player {x,y}
    map (2D of TILES)
    visible (2D boolean) [will be overwritten]
    seen (2D boolean)    [will be updated]
    inBounds(x,y)
    TILES enum
    enemies []
    enemyThreatLabel(e) -> {label, tone}
    log(msg, tone)
*/
(function () {
  function recomputeFOV(ctx) {
    const { ROWS, COLS, fovRadius, player, map, TILES } = ctx;
    const visible = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
    const radius = Math.max(1, fovRadius);

    function isTransparent(x, y) {
      if (!ctx.inBounds(x, y)) return false;
      return map[y][x] !== TILES.WALL;
    }

    // Symmetrical shadowcasting (RogueBasin-style)
    function castLight(cx, cy, row, start, end, radius, xx, xy, yx, yy) {
      if (start < end) return;
      const radius2 = radius * radius;

      for (let i = row; i <= radius; i++) {
        let dx = -i - 1;
        let dy = -i;
        let blocked = false;
        let newStart = 0.0;

        while (dx <= 0) {
          dx += 1;

          const X = cx + dx * xx + dy * yx;
          const Y = cy + dx * xy + dy * yy;

          const lSlope = (dx - 0.5) / (dy + 0.5);
          const rSlope = (dx + 0.5) / (dy - 0.5);

          if (start < rSlope) continue;
          if (end > lSlope) break;

          if (!ctx.inBounds(X, Y)) continue;

          const dist2 = dx * dx + dy * dy;
          if (dist2 <= radius2) {
            visible[Y][X] = true;
            ctx.seen[Y][X] = true;
          }

          if (blocked) {
            if (!isTransparent(X, Y)) {
              newStart = rSlope;
            } else {
              blocked = false;
              start = newStart;
            }
          } else {
            if (!isTransparent(X, Y) && i < radius) {
              blocked = true;
              castLight(cx, cy, i + 1, start, lSlope, radius, xx, xy, yx, yy);
              newStart = rSlope;
            }
          }
        }
        if (blocked) break;
      }
    }

    // Always see your own tile
    if (ctx.inBounds(player.x, player.y)) {
      visible[player.y][player.x] = true;
      ctx.seen[player.y][player.x] = true;
    }

    castLight(player.x, player.y, 1, 1.0, 0.0, radius, 1, 0, 0, 1);   // E-NE
    castLight(player.x, player.y, 1, 1.0, 0.0, radius, 1, 0, 0, -1);  // E-SE
    castLight(player.x, player.y, 1, 1.0, 0.0, radius, -1, 0, 0, 1);  // W-NW
    castLight(player.x, player.y, 1, 1.0, 0.0, radius, -1, 0, 0, -1); // W-SW
    castLight(player.x, player.y, 1, 1.0, 0.0, radius, 0, 1, 1, 0);   // S-SE
    castLight(player.x, player.y, 1, 1.0, 0.0, radius, 0, 1, -1, 0);  // S-SW
    castLight(player.x, player.y, 1, 1.0, 0.0, radius, 0, -1, 1, 0);  // N-NE
    castLight(player.x, player.y, 1, 1.0, 0.0, radius, 0, -1, -1, 0); // N-NW

    ctx.visible = visible;

    // Announce newly visible enemies with a simple danger rating
    for (const e of ctx.enemies) {
      if (ctx.inBounds(e.x, e.y) && ctx.visible[e.y][e.x] && !e.announced) {
        const { label, tone } = ctx.enemyThreatLabel(e);
        ctx.log(`You spot a ${capitalize(e.type || "enemy")} Lv ${e.level || 1} (${label}).`, tone);
        e.announced = true;
      }
    }
  }

  // local helper for message formatting
  function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  window.FOV = { recomputeFOV };
})();