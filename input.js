/**
 * Input: keyboard bindings and dispatch to game handlers.
 *
 * Exports (window.Input):
 * - init(handlers): installs keydown listener. `handlers` can include:
 *   { isDead, isInventoryOpen, isLootOpen, isGodOpen, onRestart, onShowInventory, onHideInventory,
 *     onHideLoot, onHideGod, onShowGod, onMove(dx,dy), onWait, onLoot, onDescend, adjustFov(delta) }
 * - destroy(): removes listener.
 *
 * Movement: Arrow keys (4-dir) and Numpad (8-dir). Wait: Numpad5. Inventory: I. Loot: G. Descend: N or Enter.
 * GOD panel: P to open; Esc to close when open. FOV adjust: [-] and [+]/[=] (also Numpad +/-).
 */
(() => {
  // Load configurable bindings if present
  const IB = (typeof window !== "undefined" ? window.InputBindings : null);
  let KEY_DIRS = {
    // Numpad
    Numpad8: {x:0,y:-1}, Numpad2: {x:0,y:1}, Numpad4: {x:-1,y:0}, Numpad6: {x:1,y:0},
    Numpad7: {x:-1,y:-1}, Numpad9: {x:1,y:-1}, Numpad1: {x:-1,y:1}, Numpad3: {x:1,y:1},
    // Arrow keys (4-directional)
    ArrowUp: {x:0,y:-1}, ArrowDown: {x:0,y:1}, ArrowLeft: {x:-1,y:0}, ArrowRight: {x:1,y:0},
  };
  let ACTIONS = {
    inventory: ["i", "I"],
    loot: ["g", "G"],
    descend: ["n", "N", "Enter"],
    god: ["p", "P"],
    wait: ["Numpad5"],
    fovDec: ["BracketLeft", "[", "Minus", "NumpadSubtract", "-"],
    fovInc: ["BracketRight", "]", "Equal", "NumpadAdd", "="],
  };
  try {
    if (IB && typeof IB.getKeyDirs === "function") KEY_DIRS = IB.getKeyDirs();
    if (IB && typeof IB.getActions === "function") ACTIONS = IB.getActions();
  } catch (_) {}

  let _handlers = null;
  let _onKey = null;

  function _matchesAction(e, keys) {
    const k = e.key;
    const c = e.code;
    return keys.some(s => s === k || s === c || (typeof s === "string" && s.toLowerCase && k && s.toLowerCase() === k.toLowerCase()));
  }

  function init(handlers) {
    _handlers = handlers || {};
    if (_onKey) {
      window.removeEventListener("keydown", _onKey);
    }
    _onKey = (e) => {
      
      if (_handlers.isDead && _handlers.isDead()) {
        if (e.key && (e.key.toLowerCase() === "r" || e.key === "Enter")) {
          e.preventDefault();
          _handlers.onRestart && _handlers.onRestart();
        }
        return;
      }

      
      if (_handlers.isInventoryOpen && _handlers.isInventoryOpen()) {
        if (_matchesAction(e, ACTIONS.inventory) || e.key === "Escape") {
          e.preventDefault();
          _handlers.onHideInventory && _handlers.onHideInventory();
        } else {
          e.preventDefault();
        }
        return;
      }

      
      if (_handlers.isLootOpen && _handlers.isLootOpen()) {
        e.preventDefault();
        _handlers.onHideLoot && _handlers.onHideLoot();
        return;
      }

      
      if (_matchesAction(e, ACTIONS.inventory)) {
        e.preventDefault();
        _handlers.onShowInventory && _handlers.onShowInventory();
        return;
      }

      
      if (_handlers.isGodOpen && _handlers.isGodOpen()) {
        if (e.key === "Escape") {
          e.preventDefault();
          _handlers.onHideGod && _handlers.onHideGod();
        } else {
          e.preventDefault();
        }
        return;
      }

      
      if (_matchesAction(e, ACTIONS.god)) {
        e.preventDefault();
        _handlers.onShowGod && _handlers.onShowGod();
        return;
      }

      
      if (_matchesAction(e, ACTIONS.fovDec)) {
        e.preventDefault();
        _handlers.adjustFov && _handlers.adjustFov(-1);
        return;
      }
      if (_matchesAction(e, ACTIONS.fovInc)) {
        e.preventDefault();
        _handlers.adjustFov && _handlers.adjustFov(1);
        return;
      }

      
      const key = e.code;
      if (KEY_DIRS[key]) {
        e.preventDefault();
        const d = KEY_DIRS[key];
        _handlers.onMove && _handlers.onMove(d.x, d.y);
        return;
      }

      
      if (_matchesAction(e, ACTIONS.wait)) {
        e.preventDefault();
        _handlers.onWait && _handlers.onWait();
        return;
      }

      
      if (_matchesAction(e, ACTIONS.loot)) {
        e.preventDefault();
        _handlers.onHideLoot && _handlers.onHideLoot();
        _handlers.onLoot && _handlers.onLoot();
        return;
      }

      
      if (_matchesAction(e, ACTIONS.descend)) {
        e.preventDefault();
        _handlers.onHideLoot && _handlers.onHideLoot();
        _handlers.onDescend && _handlers.onDescend();
        return;
      }

      
      if (_handlers.isLootOpen && _handlers.isLootOpen()) {
        _handlers.onHideLoot && _handlers.onHideLoot();
      }
    };
    window.addEventListener("keydown", _onKey);
  }

  function destroy() {
    if (_onKey) {
      window.removeEventListener("keydown", _onKey);
      _onKey = null;
    }
    _handlers = null;
  }

  window.Input = { init, destroy };
})();