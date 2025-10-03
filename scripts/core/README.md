core/

Purpose:
Foundational modules that initialize and coordinate the application runtime, global registries, and cross-module bootstrapping.

Place files like:
- actions.js (if global action dispatch lives here)
- flavor.js (if used globally at init time)
- god.js (if represents core game orchestrator/root system)

Notes:
- Keep this lean. Heavy domain logic should live in its own folder (combat/, dungeon/, etc.).