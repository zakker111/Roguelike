# Checkpoints
Checkpoint 1 — Medium-term architecture baselineDate: 2025-10-02
Summary
- Services added previously:  - rng_service.js, rng_compat.js
  - time_service.js (not fully wired)  - combat_engine.js (not wired yet)
  - equipment_decay.js (not wired yet)- New architecture scaffolding:
  - mode_manager.js  - managers/world_manager.js
  - managers/town_manager.js  - managers/dungeon_manager.js
- Runtime improvement:  - occupancy_grid.js integrated into AI (ctx.occupancy) and game movement (tryMovePlayer).
- Minimal integration changes in game.js:  - Uses window.RNG when available; seed handling via RNG.applySeed.
  - Rebuilds occupancy after enemy and NPC turns.  - Movement in town/dungeon uses occupancy grid for blocking checks.
Files at this checkpoint
- ai.js- game.js
- occupancy_grid.js- mode_manager.js
- managers/world_manager.js- managers/town_manager.js
- managers/dungeon_manager.js- rng_service.js
- rng_compat.js- time_service.js
- combat_engine.js
