# Game Version History
Last updated: 2025-09-26 00:00 UTC

This file tracks notable changes to the game across iterations. Versions here reflect functional milestones rather than semantic releases.

Conventions
- Added: new features or modules
- Changed: behavior or structure adjustments
- Fixed: bug fixes
- UI: user interface-only changes
- Dev: refactors, tooling, or internal changes

v1.4 — Tavern, Barkeeper, and Shopkeepers
- Added: Guaranteed Tavern in town (chooses a large building near the plaza).
- Added: Interior furnishing for Tavern: bar desk (table) and several benches.
- Added: Barkeeper NPC stationed at the bar desk during day; returns home at night.
- Added: Each shop now has a dedicated shopkeeper NPC who stands at the shop door during the day and goes home at night.
- Changed: Evening/night routines: a subset of villagers (those with a tavern preference) go to the Tavern instead of heading straight home.
- Dev: Context now exposes shops, townProps, and time to FOV; declared transition anchors (townExitAt, worldReturnPos, dungeonExitAt, cameFromWorld) used across mode changes.
- Fixed: Runtime issues introduced during iteration:
  - Unterminated template string in lootCorpse() shop interaction.
  - Missing closing brace after townNPCsAct().
  - Missing declarations for townExitAt/worldReturnPos/dungeonExitAt.

v1.3 — Shops + Night Lamps + Resting
- Added: Lamp posts cast a warm light glow at night/dusk/dawn.
- Added: Shops have opening hours (day only). Interacting on a shop door:
  - Open (day): logs that trading is coming soon.
  - Closed (dawn/dusk/night): logs closed message.
- Added: Rest systems:
  - Benches: if used at night/dawn/dusk, rest until 06:00 with a light heal.
  - Inn: stand on the Inn door and press G to sleep until morning; fully heal.
- Dev: Exposed shopAt()/isShopOpenNow()/rest helpers; time advancement converts minutes to turns.

v1.2 — Day/Night Cycle and Turn Time
- Added: Global time-of-day system shared across all modes (world/town/dungeon).
  - Full day = 24 hours (1440 minutes).
  - Cycle length = 360 turns per day.
  - Minutes per turn = 1440 / 360 = 4 minutes per turn.
- UI: Time shown in the overworld HUD next to the biome label; scene tint changes per phase:
  - Dawn (cool tint), Day (normal), Dusk (warm tint), Night (darkened).
  - Same tinting applied in towns.
- Dev: getClock() exposes hours, minutes, hhmm, phase, minutesPerTurn, cycleTurns, and turnCounter to renderer and AI.

v1.1 — Town Life: Homes and Routines
- Added: Each villager is assigned a home inside a building; also gets a daytime destination (plaza or shop).
- Changed: NPCs follow a simple daily routine driven by a turn counter:
  - Morning: stay at or head to their home.
  - Day: wander toward plaza/shops.
  - Evening: return home.
- Changed: Movement uses a simple greedy step toward the target while avoiding props, other NPCs, and the player.
- Dev: Exposed townBuildings and townPlaza to support routines; townTick increments each town turn.

v1.0.2 — Fewer Windows Per Building
- Changed: Window placement limited per building and spaced out to avoid clusters.
  - Total windows per building are capped (1–3 based on size).
  - Adjacent window tiles are avoided to reduce visual clutter.

v1.0.1 — Town FOV Rendering + See-through Windows
- UI: Town renderer now respects FOV: unseen tiles are hidden; seen-but-not-currently-visible tiles are dimmed, matching dungeon behavior.
- Changed: Props/NPCs/shop glyphs in towns render only when their tiles are currently visible.
- Note: Windows already allow light through; this keeps interiors dark until you have line-of-sight via doors/windows.

v1.0 — Overworld Connectivity Guaranteed
- Added: Post-generation pass connects all towns and dungeons by carving walkable paths:
  - Converts river crossings to BEACH tiles (ford/bridge) and mountain passes to GRASS.
  - Uses a line-based path to connect any unreachable POIs to the main region.
- Changed: World remains visually similar; bridges/passes are subtle walkable corridors.
- Note: Overworld stays fully revealed. Towns keep FOV.

v0.9 — Town FOV + Windows
- Added: Windows tile in towns (non-walkable, light passes) placed along building walls; rendered as blue-gray.
- Changed: Towns now use proper fog-of-war with FOV, like dungeons (overworld still fully visible).
- Dev: recomputeFOV now only auto-reveals in world mode; town initializes seen/visible as false.

v0.8.4 — Stronger Player Marker (World + Town)
- UI: Player '@' now renders with an outlined glyph (black stroke) on top of the white backdrop in both overworld and town, improving contrast further.

v0.8.3 — Improve Player Visibility in Town
- UI: Added the same subtle white backdrop and outline behind the player glyph '@' in town mode to match the overworld visibility tweak.

v0.8.2 — Furnished Buildings (Interiors)
- Added: Building interiors are now furnished with:
  - Fireplaces (∩) generally placed along inside walls
  - Chests (▯), tables (┼), and beds (b) scattered inside
- UI: Renderer shows new interior prop glyphs and colors.
- Changed: Interactions (G) include messages for fireplaces, chests (locked), tables, and beds.

v0.8.1 — Improve Player Visibility on Overworld
- UI: Added a subtle white backdrop and outline under the player glyph '@' in overworld mode so the player stands out on all biomes.

v0.8 — Town Buildings: Guaranteed Doors and Varied Sizes
- Added: Every town building now has at least one door carved into its perimeter.
- Changed: Building sizes are now varied per block (randomized within block bounds) for a more organic layout.
- Changed: Shop doors are still preferred near the plaza; non-shop houses also get doors automatically.
- Dev: Refactored door placement to prefer doors facing sidewalks/roads when possible.

v0.7 — Structured Towns, Wandering NPCs, and Interactions
- Added: Structured town generation with:
  - Walled perimeter with a proper gate aligned to entry point
  - Main road from the gate to a central plaza
  - Secondary road grid and block-aligned buildings (hollow interiors)
  - Shops placed on door tiles of buildings near the plaza, marked with 'S'
- Added: Plaza ambience and props:
  - Well (O), fountain (◌), stalls (s), benches (≡), lamps (†), trees (♣)
  - Gate tile marked with 'G'
  - Interactions via G near props (log feedback)
- Added: Town NPCs roam; random, collision-aware, avoid player and props
- Changed: Town entry spawns “gate greeters” without surrounding the player
- Fixed: Player is guaranteed free adjacent tiles when entering town
- Changed: Renderer now renders town props and gate glyph

v0.6 — Bigger Overworld with Biomes and Minimap
- Added: Larger overworld (120 × 80)
- Added: New biomes and features:
  - Rivers (non-walkable), beaches, swamps, deserts, snow
  - Forests and mountain ridges
- Added: Biome label HUD (top-left) in world mode
- Added: Overworld minimap (top-right) showing biomes, towns, dungeons, and player
- Changed: Town placement prefers water/river/beach; dungeons prefer forest/mountain
- Changed: World.isWalkable blocks water, rivers, and mountains

v0.5 — Town Mode and Exit UX
- Added: Town mode as a separate map with buildings, shops (S), and NPCs
- Added: Exit Town confirmation modal:
  - UI.showConfirm and fallback to window.confirm
  - Floating “Exit Town” button (bottom-right) while in town
- Added: 'G' key talks to NPCs in town, logs if no one nearby
- Fixed: Player does not spawn inside building; BFS nudges to nearest free tile
- Changed: Overworld no longer spawns NPCs; NPCs are town-only

v0.4 — Overworld Mode Foundation
- Added: world.js module:
  - TILES: WATER, GRASS, FOREST, MOUNTAIN, TOWN, DUNGEON
  - generate(), isWalkable(), pickTownStart()
- Added: World rendering path in render.js, with T (town) / D (dungeon) markers
- Added: Mode switching in game.js (world/dungeon), return path for floor 1
- Added: Basic NPCs in early world iterations (later moved to towns)
- Fixed: Enemy visibility check in renderer (visible[y][x])

v0.3 — Stabilization and Smoke Tests
- Fixed: render.js syntax errors (orphan braces, window references in case labels)
- Fixed: log and visibility guards to avoid runtime errors
- Added: Smoke test checklist and validation across:
  - Initialization, rendering, input, combat, inventory, dungeon gen, UI
- Confirmed: Deterministic RNG via seed, FOV/LOS correctness, fallback rendering

v0.2 — Inventory and UI Fallbacks
- Fixed: Undefined invPanel in game.js when UI module absent
  - showInventoryPanel/hideInventoryPanel now query DOM directly in fallback
- Confirmed: All modules use shared ctx, avoid direct window.* where appropriate
- Confirmed: Data-driven items and enemies with deterministic RNG
- Changed: Improved rendering fallbacks when sprites are missing

v0.1 — Baseline Roguelike Core
- Added: Dungeon generation with connected rooms and guaranteed stairs
- Added: Player movement, bump-to-attack, combat system with crits and blocks
- Added: Items (equipment, potions), inventory and equipment management
- Added: Status effects (daze, bleed), loot, corpses, decals
- Added: FOV/LOS modules and renderer with fallback glyphs/colors
- Added: GOD panel tools (heal, spawn, FOV adjustment, seed control)

Planned / Ideas
- Bridge/ford generation across rivers
- Named towns and persistent inventories/NPCs across visits
- Shop UI (buy/sell) and currency
- District themes (market/residential/temple) and signage
- Movement costs or effects per biome (swamp slow, snow visibility, desert hazard)