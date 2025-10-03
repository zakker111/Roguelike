Project script folder structure

This directory introduces a clean structure for organizing the game's JavaScript files. No files have been moved automatically—you can manually relocate scripts into the folders below when ready.

Structure overview:
- core/ — Engine bootstrap, shared infrastructure, app lifecycle
- ai/ — NPC and enemy AI logic and behaviors
- combat/ — Combat systems, utilities, damage, status effects
- dungeon/ — Dungeon generation, state, items, and related logic
- entities/ — Entity definitions, equipment, and behaviors
- town/ — Town generation and town-specific AI/logic
- world/ — Overworld generation, occupancy grids, world state
- ui/ — UI code, HUD, overlays, DOM bindings, decals
- utils/ — General utilities, helpers, constants
- services/ — Time, schedulers, and service-like modules
- mechanics/ — Game mechanics like stats, effects, decay
- rendering/ — Rendering helpers, visuals, and decal utilities

Suggested file destinations:
- actions.js → core/ or utils/ (depending on generality)
- ai.js → ai/
- combat.js → combat/
- combat_utils.js → combat/
- decals.js → rendering/ or ui/
- dungeon.js → dungeon/
- dungeon_items.js → dungeon/
- dungeon_state.js → dungeon/
- equipment_decay.js → mechanics/ or entities/
- flavor.js → core/ (if global) or utils/ (if helper text)
- god.js → core/ (if global systems) or mechanics/ (if rules)
- occupancy_grid.js → world/ or utils/
- stats.js → mechanics/
- status_effects.js → mechanics/ or combat/
- time_service.js → services/
- town_ai.js → town/
- town_gen.js → town/
- utils.js → utils/

Notes:
- Prefer placing domain logic with its owning system (e.g., combat effect calculation in combat/)
- Shared pure helpers go in utils/
- Modules used to coordinate or expose cross-cutting services (time, events, scheduling) go in services/