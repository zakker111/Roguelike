(() => {
  const KEY_DIRS = {
    // Numpad
    Numpad8: {x:0,y:-1}, Numpad2: {x:0,y:1}, Numpad4: {x:-1,y:0}, Numpad6: {x:1,y:0},
    Numpad7: {x:-1,y:-1}, Numpad9: {x:1,y:-1}, Numpad1: {x:-1,y:1}, Numpad3: {x:1,y:1},
  };

  let _handlers = null;
  let _onKey = null;

  function init(handlers) {
    _handlers = handlers || {};
    if (_onKey) {
      window.removeEventListener("keydown", _onKey);
    }
    _onKey = (e) => {
      // death gate
      if (_handlers.isDead && _handlers.isDead()) {
        if (e.key && (e.key.toLowerCase() === "r" || e.key === "Enter")) {
          e.preventDefault();
          _handlers.onRestart && _handlers.onRestart();
        }
        return;
      }

      // inventory modal gate
      if (_handlers.isInventoryOpen && _handlers.isInventoryOpen()) {
        if (e.key && (e.key.toLowerCase() === "i" || e.key === "Escape")) {
          e.preventDefault();
          _handlers.onHideInventory && _handlers.onHideInventory();
        } else {
          e.preventDefault();
        }
        return;
      }

      // toggle inventory
      if (e.key && e.key.toLowerCase() === "i") {
        e.preventDefault();
        _handlers.onShowInventory && _handlers.onShowInventory();
        return;
      }

      // GOD mode modal gate
      if (_handlers.isGodOpen && _handlers.isGodOpen()) {
        if (e.key === "Escape") {
          e.preventDefault();
          _handlers.onHideGod && _handlers.onHideGod();
        } else {
          e.preventDefault();
        }
        return;
      }

      // Open GOD mode
      if (e.key && e.key.toLowerCase() === "p") {
        e.preventDefault();
        _handlers.onShowGod && _handlers.onShowGod();
        return;
      }

      // FOV adjust
      if (e.code === "BracketLeft" || e.key === "[" || e.code === "Minus" || e.code === "NumpadSubtract" || e.key === "-") {
        e.preventDefault();
        _handlers.adjustFov && _handlers.adjustFov(-1);
        return;
      }
      if (e.code === "BracketRight" || e.key === "]" || e.code === "Equal" || e.code === "NumpadAdd" || e.key === "=") {
        e.preventDefault();
        _handlers.adjustFov && _handlers.adjustFov(1);
        return;
      }

      // movement
      const key = e.code;
      if (KEY_DIRS[key]) {
        e.preventDefault();
        const d = KEY_DIRS[key];
        _handlers.onMove && _handlers.onMove(d.x, d.y);
        return;
      }

      // wait
      if (key === "Numpad5") {
        e.preventDefault();
        _handlers.onWait && _handlers.onWait();
        return;
      }

      // loot
      if (e.key && e.key.toLowerCase() === "g") {
        e.preventDefault();
        _handlers.onHideLoot && _handlers.onHideLoot();
        _handlers.onLoot && _handlers.onLoot();
        return;
      }

      // descend
      if ((e.key && e.key.toLowerCase() === "n") || e.key === "Enter") {
        e.preventDefault();
        _handlers.onHideLoot && _handlers.onHideLoot();
        _handlers.onDescend && _handlers.onDescend();
        return;
      }

      // close loot panel on any other key
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