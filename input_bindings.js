/**
 * InputBindings: configurable key bindings.
 *
 * Exports (window.InputBindings):
 * - getKeyDirs(): returns a mapping from event.code to {x,y}
 * - getActions(): returns action keys { inventory, loot, descend, god, wait, fovDec, fovInc }
 * - setKeyDir(code, vec): override direction mapping
 * - setAction(name, keys): override action keys (array or single string)
 *
 * Notes:
 * - Defaults mirror current hardcoded bindings in input.js.
 */
(function () {
  const STORAGE_KEY_DIRS = "INPUT_KEY_DIRS";
  const STORAGE_ACTIONS = "INPUT_ACTIONS";

  const KEY_DIRS = {
    // Numpad
    Numpad8: {x:0,y:-1}, Numpad2: {x:0,y:1}, Numpad4: {x:-1,y:0}, Numpad6: {x:1,y:0},
    Numpad7: {x:-1,y:-1}, Numpad9: {x:1,y:-1}, Numpad1: {x:-1,y:1}, Numpad3: {x:1,y:1},
    // Arrow keys (4-directional)
    ArrowUp: {x:0,y:-1}, ArrowDown: {x:0,y:1}, ArrowLeft: {x:-1,y:0}, ArrowRight: {x:1,y:0},
  };

  const ACTIONS = {
    inventory: ["i", "I"],
    loot: ["g", "G"],
    descend: ["n", "N", "Enter"],
    god: ["p", "P"],
    wait: ["Numpad5"],
    fovDec: ["BracketLeft", "[", "Minus", "NumpadSubtract", "-"],
    fovInc: ["BracketRight", "]", "Equal", "NumpadAdd", "="],
  };

  function loadFromStorage() {
    try {
      const kd = localStorage.getItem(STORAGE_KEY_DIRS);
      if (kd) {
        const obj = JSON.parse(kd);
        for (const code in obj) {
          const v = obj[code];
          if (v && typeof v.x === "number" && typeof v.y === "number") KEY_DIRS[code] = { x: v.x | 0, y: v.y | 0 };
        }
      }
      const act = localStorage.getItem(STORAGE_ACTIONS);
      if (act) {
        const objA = JSON.parse(act);
        for (const name in objA) {
          const arr = objA[name];
          if (Array.isArray(arr) && arr.length > 0 && (name in ACTIONS)) ACTIONS[name] = arr.slice();
        }
      }
    } catch (_) {}
  }

  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY_DIRS, JSON.stringify(KEY_DIRS));
      localStorage.setItem(STORAGE_ACTIONS, JSON.stringify(ACTIONS));
      return true;
    } catch (_) { return false; }
  }

  function getKeyDirs() {
    return Object.assign({}, KEY_DIRS);
  }

  function getActions() {
    // return shallow copy
    const out = {};
    for (const k in ACTIONS) out[k] = ACTIONS[k].slice();
    return out;
  }

  function setKeyDir(code, vec) {
    if (!code || !vec || typeof vec.x !== "number" || typeof vec.y !== "number") return false;
    KEY_DIRS[code] = { x: vec.x | 0, y: vec.y | 0 };
    return true;
  }

  function setAction(name, keys) {
    if (!name || !(name in ACTIONS)) return false;
    const arr = Array.isArray(keys) ? keys.slice() : (typeof keys === "string" ? [keys] : null);
    if (!arr || arr.length === 0) return false;
    ACTIONS[name] = arr;
    return true;
  }

  // Convenience: enable WASD mappings
  function enableWASD() {
    KEY_DIRS.KeyW = { x:0, y:-1 };
    KEY_DIRS.KeyA = { x:-1, y:0 };
    KEY_DIRS.KeyS = { x:0, y:1 };
    KEY_DIRS.KeyD = { x:1, y:0 };
    return true;
  }

  // Initialize from storage on load
  loadFromStorage();

  window.InputBindings = { getKeyDirs, getActions, setKeyDir, setAction, saveToStorage, enableWASD };
})();