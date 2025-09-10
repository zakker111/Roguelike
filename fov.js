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
    const radiusSq = fovRadius * fovRadius;

    function isTransparent(x, y) {
      if (!ctx.inBounds(x, y)) return false;
      return map[y][x] !== TILES.WALL;
    }

    function los(x0, y0, x1, y1) {
      let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
      let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
      let err = dx + dy, e2;

      while (true) {
        if (!(x0 === player.x && y0 === player.y)) {
          if (!isTransparent(x0, y0)) return false;
        }
        if (x0 === x1 && y0 === y1) break;
        e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
      return true;
    }

    for (let y = Math.max(0, player.y - fovRadius); y <= Math.min(ROWS - 1, player.y + fovRadius); y++) {
      for (let x = Math.max(0, player.x - fovRadius); x <= Math.min(COLS - 1, player.x + fovRadius); x++) {
        const dx = x - player.x;
        const dy = y - player.y;
        if (dx * dx + dy * dy <= radiusSq && los(player.x, player.y, x, y)) {
          visible[y][x] = true;
          ctx.seen[y][x] = true;
        }
      }
    }

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