// Main entry for browser (ES module). Imports side-effect modules to preserve current behavior.

// Mirror preference for side log visibility (from index.html inline)
(function () {
  try {
    var el = document.getElementById("log-right");
    if (el && window.LOG_MIRROR === false) {
      el.style.display = "none";
    }
  } catch (_) {}
})();

// Load modules in the same order as previous script tags
import "../core/ctx.js";
import "../world/world.js";
import "../world/los.js";
import "../entities/enemies.js";
import "../world/fov.js";
import "../dungeon.js";
import "../ui/logger.js";

// Initialize logger (previously inline in index.html)
try {
  if (window.Logger && typeof window.Logger.init === "function") {
    window.Logger.init(undefined, 80);
  }
} catch (_) {}

import "../ui/ui.js";
import "../ui/tileset.js";
import "../ui/render.js";
import "../entities/player_utils.js";
import "../entities/player_equip.js";
import "../entities/player.js";

// Central RNG service must load before items/game to avoid duplicate PRNG implementations
import "../core/rng_service.js";

import "../entities/items.js";
import "../dungeon_items.js";
import "../entities/loot.js";
import "../combat_utils.js";
import "../combat.js";
import "../stats.js";
import "../status_effects.js";
import "../flavor.js";
import "../utils.js";
import "../ai.js";
import "../core/input.js";
import "../town_ai.js";

// New modularized helpers
import "../decals.js";
import "../dungeon_state.js";
import "../god.js";
import "../actions.js";
import "../town_gen.js";
import "../core/game.js";