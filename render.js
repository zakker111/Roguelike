/*
Render: draws tiles, glyph overlays, corpses, enemies, and player with camera support.

Exports (window.Render):
- draw(ctx) where ctx contains ctx2d, TILE/ROWS/COLS/COLORS/TILES, map/seen/visible, player/enemies/corpses, camera?
*/
(function () {
  function enemyColorFromModule(type, COLORS) {
    if (window.Enemies && typeof Enemies.colorFor === "function") {
      return Enemies.colorFor(type);
    }
    // fallback to generic enemy color
    return COLORS.enemy || "#f7768e";
  }

  function drawGlyphScreen(ctx2d, x, y, ch, color, TILE) {
    const half = TILE / 2;
    ctx2d.fillStyle = color;
    ctx2d.fillText(ch, x + half, y + half + 1);
  }

  function draw(ctx) {
    const {
      ctx2d, TILE, ROWS, COLS, COLORS, TILES,
      map, seen, visible, player, enemies, corpses, camera: camMaybe
    } = ctx;

    if (typeof window !== "undefined" && window.DEV) {
      try {
        const mapRows = map.length;
        const mapCols = map[0] ? map[0].length : 0;
        const visEnemies = (enemies || []).filter(e => visible[e.y] && visible[e.y][e.x]).length;
        console.debug("[DEV] draw() map:", mapCols, "x", mapRows, "player:", player.x, player.y, "enemies:", (enemies||[]).length, "visible enemies:", visEnemies);
      } catch (_) {}
    }

    const enemyColor = (t) => (ctx.enemyColor ? ctx.enemyColor(t) : enemyColorFromModule(t, COLORS));
    const TS = (ctx.Tileset || (typeof window !== "undefined" ? window.Tileset : null));

    const cam = camMaybe || { x: 0, y: 0, width: COLS * TILE, height: ROWS * TILE };
    const tileOffsetX = cam.x % TILE;
    const tileOffsetY = cam.y % TILE;
    const startX = Math.max(0, Math.floor(cam.x / TILE));
    const startY = Math.max(0, Math.floor(cam.y / TILE));
    const mapRows = map.length;
    const mapCols = map[0] ? map[0].length : 0;
    const endX = Math.min(mapCols - 1, startX + COLS - 1);
    const endY = Math.min(mapRows - 1, startY + ROWS - 1);

    ctx2d.clearRect(0, 0, cam.width, cam.height);

    // Set text properties once per frame
    ctx2d.font = "bold 20px JetBrains Mono, monospace";
    ctx2d.textAlign = "center";
    ctx2d.textBaseline = "middle";

    // tiles within viewport range
    for (let y = startY; y <= endY; y++) {
      const rowMap = map[y];
      const rowSeen = seen[y] || [];
      const rowVis = visible[y] || [];
      for (let x = startX; x <= endX; x++) {
        const screenX = (x - startX) * TILE - tileOffsetX;
        const screenY = (y - startY) * TILE - tileOffsetY;
        const vis = !!rowVis[x];
        const everSeen = !!rowSeen[x];

        // If tile has never been seen, render as unknown to avoid revealing layout
        if (!everSeen) {
          // If tileset exists, we still hide unknown tiles to avoid revealing layout
          ctx2d.fillStyle = COLORS.wallDark;
          ctx2d.fillRect(screenX, screenY, TILE, TILE);
          continue;
        }

        // draw base tile via tileset if available, else by color
        const type = rowMap[x];
        let key = "floor";
        if (type === TILES.WALL) key = "wall";
        else if (type === TILES.STAIRS) key = "stairs";
        else if (type === TILES.DOOR) key = "door";
        else key = "floor";

        let drawn = false;
        if (TS && typeof TS.draw === "function") {
          drawn = TS.draw(ctx2d, key, screenX, screenY, TILE);
        }
        if (!drawn) {
          let fill;
          if (type === TILES.WALL) fill = vis ? COLORS.wall : COLORS.wallDark;
          else if (type === TILES.STAIRS) fill = vis ? "#3a2f1b" : "#241e14";
          else if (type === TILES.DOOR) fill = vis ? "#3a2f1b" : "#241e14";
          else fill = vis ? COLORS.floorLit : COLORS.floor;
          ctx2d.fillStyle = fill;
          ctx2d.fillRect(screenX, screenY, TILE, TILE);
        }

        // subtle grid
        ctx2d.strokeStyle = "rgba(122,162,247,0.05)";
        ctx2d.strokeRect(screenX, screenY, TILE, TILE);

        // FOV dim overlay for seen-but-not-visible tiles
        if (!vis && everSeen) {
          ctx2d.fillStyle = COLORS.dim;
          ctx2d.fillRect(screenX, screenY, TILE, TILE);
        }

        // staircase glyph overlay when visible (only if we didn't render via tileset)
        if (vis && type === TILES.STAIRS && (!TS || !TS.isReady())) {
          drawGlyphScreen(ctx2d, screenX, screenY, ">", "#d7ba7d", TILE);
        }
      }
    }

    // corpses and chests
    for (const c of corpses) {
      if (!visible[c.y] || !visible[c.y][c.x]) continue;
      if (c.x < startX || c.x > endX || c.y < startY || c.y > endY) continue;
      const screenX = (c.x - startX) * TILE - tileOffsetX;
      const screenY = (c.y - startY) * TILE - tileOffsetY;
      if (TS && TS.draw(ctx2d, c.kind === "chest" ? "chest" : "corpse", screenX, screenY, TILE)) {
        // drawn from tileset
      } else {
        if (c.kind === "chest") {
          drawGlyphScreen(ctx2d, screenX, screenY, "▯", c.looted ? "#8b7355" : "#d7ba7d", TILE);
        } else {
          drawGlyphScreen(ctx2d, screenX, screenY, "%", c.looted ? COLORS.corpseEmpty : COLORS.corpse, TILE);
        }
      }
    }

    // enemies
    for (const e of enemies) {
      if (!visible[e.y] || !visible[e.y][e.x]) continue;
      if (e.x < startX || e.x > endX || e.y < startY || e.y > endY) continue;
      const screenX = (e.x - startX) * TILE - tileOffsetX;
      const screenY = (e.y - startY) * TILE - tileOffsetY;
      const enemyKey = e.type ? `enemy.${e.type}` : null;
      if (enemyKey && TS && TS.draw(ctx2d, enemyKey, screenX, screenY, TILE)) {
        // drawn via tileset
      } else {
        drawGlyphScreen(ctx2d, screenX, screenY, e.glyph || "e", enemyColor(e.type), TILE);
      }
    }

    // player
    if (player.x >= startX && player.x <= endX && player.y >= startY && player.y <= endY) {
      const screenX = (player.x - startX) * TILE - tileOffsetX;
      const screenY = (player.y - startY) * TILE - tileOffsetY;
      if (!(TS && TS.draw(ctx2d, "player", screenX, screenY, TILE))) {
        drawGlyphScreen(ctx2d, screenX, screenY, "@", COLORS.player, TILE);
      }
    }
  }

  window.Render = { draw };
})();