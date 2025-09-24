# Tiny Roguelike

Modular browser roguelike with deterministic RNG and a shared ctx architecture.

## Development

### Lint

Install dev dependencies and run ESLint:

```bash
npm install
npm run lint
```

The ESLint config is in `.eslintrc.json`; ignored paths in `.eslintignore`.

### Smoke Test

Follow `SMOKE_TEST.md` for a quick manual end-to-end test:
- Load, move, fight, loot, descend
- GOD panel toggles (FOV, Side Log, Always Crit, Seed)

## Input Remapping (InputBindings)

You can remap movement and action keys via `InputBindings` at runtime. Bindings are used by `input.js` if present.

- Inspect defaults:
```js
console.log(InputBindings.getKeyDirs());   // code -> {x,y}
console.log(InputBindings.getActions());   // inventory, loot, descend, god, wait, fovDec, fovInc
```

- Remap a direction:
```js
InputBindings.setKeyDir("KeyW", { x: 0, y: -1 }); // WASD up
InputBindings.setKeyDir("KeyA", { x: -1, y: 0 });
InputBindings.setKeyDir("KeyS", { x: 0, y: 1 });
InputBindings.setKeyDir("KeyD", { x: 1, y: 0 });
```

- Remap actions (string or array of strings):
```js
InputBindings.setAction("inventory", ["Tab"]);
InputBindings.setAction("loot", ["KeyL"]);
InputBindings.setAction("descend", ["Enter"]);
InputBindings.setAction("god", ["Backquote"]); // '`' to open GOD
InputBindings.setAction("wait", ["Space"]);
InputBindings.setAction("fovDec", ["Minus", "NumpadSubtract"]);
InputBindings.setAction("fovInc", ["Equal", "NumpadAdd"]);
```

Bindings persist only for the session unless you serialize them to localStorage (you can add a small settings UI to do so).

## Architecture Notes

- `ctx.js` creates a normalized context, attaching module handles and shared `ctx.utils`:
  - `round1, clamp, randInt, randFloat, chance, pick, pickWeighted, capitalize`
- Prefer consuming helpers via `ctx.utils` to keep behavior deterministic with `ctx.rng`.
- Most modules fall back gracefully when a sibling module isn’t present.

## Modules

- `game.js`: Orchestration (loop, input bindings, UI bridging, RNG)
- `dungeon.js`: Generation (rooms, corridors, stairs, enemy spawns)
- `ai.js`: Enemy behavior (perception/chase/flee/attack)
- `fov.js`: Symmetrical shadowcasting with seen memory
- `items.js`: Data-driven registry and generation (weights and tiers)
- `loot.js`: Drops and looting flow
- `status_effects.js`: Limp/Dazed/Bleed
- `flavor.js`: Flavor text
- `render.js`: Canvas renderer
- `ui.js`: HUD, Inventory, Loot modal, GOD panel
- `ui_bridge.js`: Abstraction layer for UI calls (fallbacks when UI is absent)
- `input.js`: Key bindings
- `input_bindings.js`: Runtime key remapping provider
- `los.js`: LOS helpers
- `logger.js`: In-DOM log
- `player.js`, `player_equip.js`, `player_utils.js`: Player core and equipment handling

## Tips

- Use the GOD panel (P) for testing: spawn items/enemies, adjust FOV, toggle logs, force crits, change seed.
- The seed persists in `localStorage` (SEED) for reproducible floors.