

/**
 * Game: main loop, world state, combat, FOV/render orchestration, and glue.
 *
 * Responsibilities:
 * - Manage map, entities, player, RNG, and turn sequence
 * - Handle movement, bump-to-attack, blocks/crits/body-part, damage/DR, equipment decay
 * - Orchestrate FOV and drawing; bridge to UI and modules via ctx
 * - GOD toggles: always-crit (with forced body-part)
 *
 * Notes:
 * - Uses Ctx.create(base) to provide a normalized ctx to modules.
 * - Randomness is deterministic via mulberry32; helpers (randInt, randFloat, chance) built over it.
 */
(() => {
  const TILE = 32;
  const COLS = 30;
  const ROWS = 20;
  
  const MAP_COLS = 120;
  const MAP_ROWS = 80;

  const FOV_DEFAULT = 8;
  let fovRadius = FOV_DEFAULT;

  // Game modes: "world" (overworld) or "dungeon" (roguelike floor)
  let mode = "world";
  let world = null;          // { map, width, height, towns, dungeons }
  let npcs = [];             // simple NPCs for town mode: { x, y, name, lines:[] }
  let shops = [];            // shops in town mode: [{x,y,type,name}]
  let townProps = [];        // interactive town props: [{x,y,type,name}]
  let townBuildings = [];    // town buildings: [{x,y,w,h,door:{x,y}}]
  let townPlaza = null;      // central plaza coordinates {x,y}
  let tavern = null;         // tavern info: { building:{x,y,w,h,door}, door:{x,y} }
  let townTick = 0;          // simple turn counter for town routines
  let townName = null;       // current town's generated name

