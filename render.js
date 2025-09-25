/**
 * Render: draws tiles, corpses, enemies, and player with camera support.
 *
 * Exports (window.Render):
 * - draw(ctx): where ctx contains { ctx2d, TILE, ROWS, COLS, COLORS, TILES, map, seen, visible, player, enemies, corpses, camera? }
 *
 * Notes:
 * - Uses Tileset when available; falls back to colored rectangles and glyphs.
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
      map, seen, visible, player, enemies, corpses, decals, camera: camMaybe, mode, world, npcs, shops
    } = ctx;

    const enemyColor = (t) => (ctx.enemyColor ? ctx.enemyColor(t) : enemyColorFromModule(t, COLORS));
    const TS = (ctx.Tileset || (typeof window !== "undefined" ? window.Tileset : null));
    const tilesetReady = !!(TS && typeof TS.isReady === "function" && TS.isReady());
    const drawGrid = (typeof window !== "undefined" && typeof window.DRAW_GRID === "boolean") ? window.DRAW_GRID : true;

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

    // WORLD MODE RENDER
    if (mode === "world") {
      // lightweight palette for overworld
      const WCOL = {
        water: "#0a1b2a",
        river: "#0e2f4a",
        grass: "#10331a",
        forest: "#0d2615",
        swamp: "#1b2a1e",
        beach: "#b59b6a",
        desert: "#c2a36b",
        snow: "#b9c7d3",
        mountain: "#2f2f34",
        town: "#3a2f1b",
        dungeon: "#2a1b2a",
      };

      if (drawGrid) {
        ctx2d.strokeStyle = "rgba(122,162,247,0.05)";
      }

      const WT = (typeof window !== "undefined" && window.World && World.TILES) ? World.TILES : null;

      for (let y = startY; y <= endY; y++) {
        const row = map[y];
        for (let x = startX; x <= endX; x++) {
          const screenX = (x - startX) * TILE - tileOffsetX;
          const screenY = (y - startY) * TILE - tileOffsetY;
          const t = row[x];
          let fill = WCOL.grass;
          if (WT) {
            if (t === WT.WATER) fill = WCOL.water;
            else if (t === WT.RIVER) fill = WCOL.river;
            else if (t === WT.SWAMP) fill = WCOL.swamp;
            else if (t === WT.BEACH) fill = WCOL.beach;
            else if (t === WT.DESERT) fill = WCOL.desert;
            else if (t === WT.SNOW) fill = WCOL.snow;
            else if (t === WT.GRASS) fill = WCOL.grass;
            else if (t === WT.FOREST) fill = WCOL.forest;
            else if (t === WT.MOUNTAIN) fill = WCOL.mountain;
            else if (t === WT.TOWN) fill = WCOL.town;
            else if (t === WT.DUNGEON) fill = WCOL.dungeon;
          }
          ctx2d.fillStyle = fill;
          ctx2d.fillRect(screenX, screenY, TILE, TILE);
          if (drawGrid) ctx2d.strokeRect(screenX, screenY, TILE, TILE);

          // Overlay glyphs for special overworld tiles
          if (WT && t === WT.TOWN) {
            drawGlyphScreen(ctx2d, screenX, screenY, "T", "#d7ba7d", TILE);
          } else if (WT && t === WT.DUNGEON) {
            drawGlyphScreen(ctx2d, screenX, screenY, "D", "#c586c0", TILE);
          }
        }
      }

      // Biome label
      try {
        if (WT && typeof World.biomeName === "function") {
          const tile = map[player.y] && map[player.y][player.x];
          const name = World.biomeName(tile);
          ctx2d.fillStyle = "rgba(13,16,24,0.8)";
          ctx2d.fillRect(8, 8, 260, 26);
          ctx2d.fillStyle = "#e5e7eb";
          ctx2d.textAlign = "left";
          ctx2d.fillText(`Biome: ${name}`, 18, 8 + 13);
          ctx2d.textAlign = "center";
        }
      } catch (_) {}

      // Minimap (top-right)
      try {
        const mw = world && world.width ? world.width : (map[0] ? map[0].length : 0);
        const mh = world && world.height ? world.height : map.length;
        if (mw && mh) {
          const maxW = 200, maxH = 150;
          const scale = Math.max(1, Math.floor(Math.min(maxW / mw, maxH / mh)));
          const wpx = mw * scale, hpx = mh * scale;
          const pad = 8;
          const bx = cam.width - wpx - pad;
          const by = pad;

          // background
          ctx2d.fillStyle = "rgba(13,16,24,0.6)";
          ctx2d.fillRect(bx - 6, by - 6, wpx + 12, hpx + 12);

          // draw tiles
          for (let yy = 0; yy < mh; yy++) {
            const rowM = map[yy];
            for (let xx = 0; xx < mw; xx++) {
              const t = rowM[xx];
              let c = WCOL.grass;
              if (WT) {
                if (t === WT.WATER) c = WCOL.water;
                else if (t === WT.RIVER) c = WCOL.river;
                else if (t === WT.SWAMP) c = WCOL.swamp;
                else if (t === WT.BEACH) c = WCOL.beach;
                else if (t === WT.DESERT) c = WCOL.desert;
                else if (t === WT.SNOW) c = WCOL.snow;
                else if (t === WT.FOREST) c = WCOL.forest;
                else if (t === WT.MOUNTAIN) c = WCOL.mountain;
                else if (t === WT.DUNGEON) c = WCOL.dungeon;
                else if (t === WT.TOWN) c = WCOL.town;
              }
              ctx2d.fillStyle = c;
              ctx2d.fillRect(bx + xx * scale, by + yy * scale, scale, scale);
            }
          }

          // overlay towns and dungeons if available
          if (world && Array.isArray(world.towns)) {
            ctx2d.fillStyle = "#ffcc66";
            for (const t of world.towns) {
              ctx2d.fillRect(bx + t.x * scale, by + t.y * scale, Math.max(1, scale), Math.max(1, scale));
            }
          }
          if (world && Array.isArray(world.dungeons)) {
            ctx2d.fillStyle = "#c586c0";
            for (const d of world.dungeons) {
              ctx2d.fillRect(bx + d.x * scale, by + d.y * scale, Math.max(1, scale), Math.max(1, scale));
            }
          }

          // player marker
          ctx2d.fillStyle = "#ffffff";
          ctx2d.fillRect(bx + player.x * scale, by + player.y * scale, Math.max(1, scale), Math.max(1, scale));
        }
      } catch (_) {}

      // NPCs
      if (Array.isArray(npcs)) {
        for (const n of npcs) {
          if (n.x < startX || n.x > endX || n.y < startY || n.y > endY) continue;
          const screenX = (n.x - startX) * TILE - tileOffsetX;
          const screenY = (n.y - startY) * TILE - tileOffsetY;
          drawGlyphScreen(ctx2d, screenX, screenY, "n", "#b4f9f8", TILE);
        }
      }

      // player
      if (player.x >= startX && player.x <= endX && player.y >= startY && player.y <= endY) {
        const screenX = (player.x - startX) * TILE - tileOffsetX;
        const screenY = (player.y - startY) * TILE - tileOffsetY;
        drawGlyphScreen(ctx2d, screenX, screenY, "@", COLORS.player, TILE);
      }
      return;
    }

    // TOWN MODE RENDER
    if (mode === "town") {
      const TCOL = {
        wall: "#2f2b26",       // building
        floor: "#0f1620",      // street/plaza
        door: "#6f5b3e",
        shop: "#d7ba7d",
      };
      if (drawGrid) ctx2d.strokeStyle = "rgba(122,162,247,0.05)";

      for (let y = startY; y <= endY; y++) {
        const rowMap = map[y];
        for (let x = startX; x <= endX; x++) {
          const screenX = (x - startX) * TILE - tileOffsetX;
          const screenY = (y - startY) * TILE - tileOffsetY;
          const type = rowMap[x];
          let fill = TCOL.floor;
          if (type === TILES.WALL) fill = TCOL.wall;
          else if (type === TILES.DOOR) fill = TCOL.door;
          ctx2d.fillStyle = fill;
          ctx2d.fillRect(screenX, screenY, TILE, TILE);
          if (drawGrid) ctx2d.strokeRect(screenX, screenY, TILE, TILE);

          // shop glyph overlay if provided
          if (Array.isArray(shops) && shops.some(s => s.x === x && s.y === y)) {
            drawGlyphScreen(ctx2d, screenX, screenY, "S", TCOL.shop, TILE);
          }
        }
      }

      // draw props (wells, benches, lamps, stalls, fountain)
      if (Array.isArray(ctx.townProps)) {
        for (const p of ctx.townProps) {
          if (p.x < startX || p.x > endX || p.y < startY || p.y > endY) continue;
          const screenX = (p.x - startX) * TILE - tileOffsetX;
          const screenY = (p.y - startY) * TILE - tileOffsetY;
          let glyph = "?";
          let color = "#e5e7eb";
          if (p.type === "well") { glyph = "O"; color = "#7aa2f7"; }
          else if (p.type === "fountain") { glyph = "◌"; color = "#89ddff"; }
          else if (p.type === "bench") { glyph = "≡"; color = "#d7ba7d"; }
          else if (p.type === "lamp") { glyph = "†"; color = "#ffd166"; }
          else if (p.type === "stall") { glyph = "s"; color = "#b4f9f8"; }
          else if (p.type === "tree") { glyph = "♣"; color = "#84cc16"; }
          drawGlyphScreen(ctx2d, screenX, screenY, glyph, color, TILE);
        }
      }

      // draw NPCs
      if (Array.isArray(npcs)) {
        for (const n of npcs) {
          if (n.x < startX || n.x > endX || n.y < startY || n.y > endY) continue;
          const screenX = (n.x - startX) * TILE - tileOffsetX;
          const screenY = (n.y - startY) * TILE - tileOffsetY;
          drawGlyphScreen(ctx2d, screenX, screenY, "n", "#b4f9f8", TILE);
        }
      }

      // draw gate 'G' at townExitAt
      if (ctx.townExitAt) {
        const gx = ctx.townExitAt.x, gy = ctx.townExitAt.y;
        if (gx >= startX && gx <= endX && gy >= startY && gy <= endY) {
          const screenX = (gx - startX) * TILE - tileOffsetX;
          const screenY = (gy - startY) * TILE - tileOffsetY;
          drawGlyphScreen(ctx2d, screenX, screenY, "G", "#9ece6a", TILE);
        }
      }

      // player
      if (player.x >= startX && player.x <= endX && player.y >= startY && player.y <= endY) {
        const screenX = (player.x - startX) * TILE - tileOffsetX;
        const screenY = (player.y - startY) * TILE - tileOffsetY;
        drawGlyphScreen(ctx2d, screenX, screenY, "@", COLORS.player, TILE);
      }
      return;
    }

    // DUNGEON RENDER (default)
    // tiles within viewport range
    if (drawGrid) {
      ctx2d.strokeStyle = "rgba(122,162,247,0.05)";
    }
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
          ctx2d.fillStyle = COLORS.wallDark;
          ctx2d.fillRect(screenX, screenY, TILE, TILE);
          if (drawGrid) ctx2d.strokeRect(screenX, screenY, TILE, TILE);
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
        if (tilesetReady && typeof TS.draw === "function") {
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

        if (drawGrid) {
          ctx2d.strokeRect(screenX, screenY, TILE, TILE);
        }

        if (!vis && everSeen) {
          ctx2d.fillStyle = COLORS.dim;
          ctx2d.fillRect(screenX, screenY, TILE, TILE);
        }

        if (vis && type === TILES.STAIRS && !tilesetReady) {
          drawGlyphScreen(ctx2d, screenX, screenY, ">", "#d7ba7d", TILE);
        }
      }
    }

    // decals (e.g., blood stains) - draw before corpses/enemies so they appear under them
    if (decals && decals.length) {
      ctx2d.save();
      for (let i = 0; i < decals.length; i++) {
        const d = decals[i];
        const inView = (x, y) => x >= startX && x <= endX && y >= startY && y <= endY;
        if (!inView(d.x, d.y)) continue;
        const sx = (d.x - startX) * TILE - tileOffsetX;
        const sy = (d.y - startY) * TILE - tileOffsetY;
        const everSeen = seen[d.y] && seen[d.y][d.x];
        if (!everSeen) continue;
        const alpha = Math.max(0, Math.min(1, d.a || 0.2));
        if (alpha <= 0) continue;

        let usedTile = false;
        if (tilesetReady && TS) {
          const variant = ((d.x + d.y) % 3) + 1;
          const key = `decal.blood${variant}`;
          if (typeof TS.drawAlpha === "function") {
            usedTile = TS.drawAlpha(ctx2d, key, sx, sy, TILE, alpha);
          } else if (typeof TS.draw === "function") {
            const prev = ctx2d.globalAlpha;
            ctx2d.globalAlpha = alpha;
            usedTile = TS.draw(ctx2d, key, sx, sy, TILE);
            ctx2d.globalAlpha = prev;
          }
        }
        if (!usedTile) {
          const prev = ctx2d.globalAlpha;
          ctx2d.globalAlpha = alpha;
          ctx2d.fillStyle = "#7a1717";
          const r = Math.max(4, Math.min(TILE - 2, d.r || Math.floor(TILE * 0.4)));
          const cx = sx + TILE / 2;
          const cy = sy + TILE / 2;
          ctx2d.beginPath();
          ctx2d.arc(cx, cy, r, 0, Math.PI * 2);
          ctx2d.fill();
          ctx2d.globalAlpha = prev;
        }
      }
      ctx2d.restore();
    }

    // corpses and chests
    for (const c of corpses) {
      if (!visible[c.y] || !visible[c.y][c.x]) continue;
      if (c.x < startX || c.x > endX || c.y < startY || c.y > endY) continue;
      const screenX = (c.x - startX) * TILE - tileOffsetX;
      const screenY = (c.y - startY) * TILE - tileOffsetY;
      if (tilesetReady && TS.draw(ctx2d, c.kind === "chest" ? "chest" : "corpse", screenX, screenY, TILE)) {
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
      if (enemyKey && tilesetReady && TS.draw(ctx2d, enemyKey, screenX, screenY, TILE)) {
        // drawn via tileset
      } else {
        drawGlyphScreen(ctx2d, screenX, screenY, e.glyph || "e", enemyColor(e.type), TILE);
      }
    }

    // player
    if (player.x >= startX && player.x <= endX && player.y >= startY && player.y <= endY) {
      const screenX = (player.x - startX) * TILE - tileOffsetX;
      const screenY = (player.y - startY) * TILE - tileOffsetY;
      if (!(tilesetReady && TS.draw(ctx2d, "player", screenX, screenY, TILE))) {
        drawGlyphScreen(ctx2d, screenX, screenY, "@", COLORS.player, TILE);
      }
    }
  }

  window.Render = { draw };
})();