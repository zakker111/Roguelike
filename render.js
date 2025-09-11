/*
Render: draws tiles, glyph overlays, corpses, enemies, and player.

Exports (window.Render):
- draw(ctx) where ctx contains ctx2d, TILE/ROWS/COLS/COLORS/TILES, map/seen/visible, player/enemies/corpses.
*/
(function () {
  function enemyColorFromModule(type, COLORS) {
    if (window.Enemies && typeof Enemies.colorFor === "function") {
      return Enemies.colorFor(type);
    }
    // fallback to generic enemy color
    return COLORS.enemy || "#f7768e";
  }

  function drawGlyph(ctx2d, TILE, x, y, ch, color) {
    const cx = x * TILE + TILE / 2;
    const cy = y * TILE + TILE / 2;

    // subtle tile highlight
    ctx2d.fillStyle = "rgba(122,162,247,0.06)";
    ctx2d.fillRect(x * TILE, y * TILE, TILE, TILE);

    ctx2d.fillStyle = color;
    ctx2d.fillText(ch, cx, cy + 1);
  }

  function draw(ctx) {
    const {
      ctx2d, TILE, ROWS, COLS, COLORS, TILES,
      map, seen, visible, player, enemies, corpses
    } = ctx;

    const enemyColor = (t) => (ctx.enemyColor ? ctx.enemyColor(t) : enemyColorFromModule(t, COLORS));

    ctx2d.clearRect(0, 0, COLS * TILE, ROWS * TILE);

    // Set text properties once per frame
    ctx2d.font = "bold 20px JetBrains Mono, monospace";
    ctx2d.textAlign = "center";
    ctx2d.textBaseline = "middle";

    // tiles
    for (let y = 0; y < ROWS; y++) {
      const rowMap = map[y];
      const rowSeen = seen[y];
      const rowVis = visible[y];
      for (let x = 0; x < COLS; x++) {
        const screenX = x * TILE;
        const screenY = y * TILE;
        const vis = rowVis[x];
        const everSeen = rowSeen[x];

        // If tile has never been seen, render as unknown to avoid revealing layout
        if (!everSeen) {
          ctx2d.fillStyle = COLORS.wallDark;
          ctx2d.fillRect(screenX, screenY, TILE, TILE);
          // Skip grid lines on unseen tiles for a tiny perf win
          continue;
        }

        const type = rowMap[x];
        let fill;
        if (type === TILES.WALL) fill = vis ? COLORS.wall : COLORS.wallDark;
        else if (type === TILES.STAIRS) fill = vis ? "#3a2f1b" : "#241e14";
        else if (type === TILES.DOOR) fill = vis ? "#3a2f1b" : "#241e14";
        else fill = vis ? COLORS.floorLit : COLORS.floor;

        ctx2d.fillStyle = fill;
        ctx2d.fillRect(screenX, screenY, TILE, TILE);

        // subtle grid
        ctx2d.strokeStyle = "rgba(122,162,247,0.05)";
        ctx2d.strokeRect(screenX, screenY, TILE, TILE);

        if (!vis && everSeen) {
          ctx2d.fillStyle = COLORS.dim;
          ctx2d.fillRect(screenX, screenY, TILE, TILE);
        }
      }
    }

    // staircase glyphs (">") overlay for visible stairs only
    for (let y = 0; y < ROWS; y++) {
      const rowMap = map[y];
      const rowVis = visible[y];
      for (let x = 0; x < COLS; x++) {
        const t = rowMap[x];
        if (rowVis[x] && t === TILES.STAIRS) {
          drawGlyph(ctx2d, TILE, x, y, ">", "#d7ba7d");
        }
      }
    }

    // corpses and chests
    for (const c of corpses) {
      if (!visible[c.y][c.x]) continue;
      if (c.kind === "chest") {
        // rectangular glyph
        drawGlyph(ctx2d, TILE, c.x, c.y, "▯", c.looted ? "#8b7355" : "#d7ba7d");
      } else {
        drawGlyph(ctx2d, TILE, c.x, c.y, "%", c.looted ? COLORS.corpseEmpty : COLORS.corpse);
      }
    }

    // enemies
    for (const e of enemies) {
      if (!visible[e.y][e.x]) continue;
      drawGlyph(ctx2d, TILE, e.x, e.y, e.glyph || "e", enemyColor(e.type));
    }

    // player
    drawGlyph(ctx2d, TILE, player.x, player.y, "@", COLORS.player);
  }

  window.Render = { draw };
})();