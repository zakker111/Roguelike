/**
 * ModeManager: orchestrates mode-specific actions with pluggable handlers.
 *
 * Usage:
 *   const mm = ModeManager.create({
 *     getMode: () => mode,
 *     setMode: (m) => { mode = m; },
 *     onActionWorld: () => { ... },
 *     onActionTown: () => { ... },
 *     onActionDungeon: () => { ... },
 *     onTryMoveWorld: (dx, dy) => { ... },
 *     onTryMoveTown: (dx, dy) => { ... },
 *     onTryMoveDungeon: (dx, dy) => { ... },
 *     onTurnWorld: () => {},
 *     onTurnTown: () => {},
 *     onTurnDungeon: () => {},
 *   });
 */
(function () {
  function create(handlers) {
    const H = handlers || {};
    function getMode() {
      return (typeof H.getMode === "function") ? H.getMode() : "dungeon";
    }
    function setMode(m) {
      if (typeof H.setMode === "function") H.setMode(m);
    }
    function doAction() {
      const m = getMode();
      if (m === "world" && typeof H.onActionWorld === "function") return H.onActionWorld();
      if (m === "town" && typeof H.onActionTown === "function") return H.onActionTown();
      if (m === "dungeon" && typeof H.onActionDungeon === "function") return H.onActionDungeon();
    }
    function tryMove(dx, dy) {
      const m = getMode();
      if (m === "world" && typeof H.onTryMoveWorld === "function") return H.onTryMoveWorld(dx, dy);
      if (m === "town" && typeof H.onTryMoveTown === "function") return H.onTryMoveTown(dx, dy);
      if (m === "dungeon" && typeof H.onTryMoveDungeon === "function") return H.onTryMoveDungeon(dx, dy);
    }
    function onTurn() {
      const m = getMode();
      if (m === "world" && typeof H.onTurnWorld === "function") return H.onTurnWorld();
      if (m === "town" && typeof H.onTurnTown === "function") return H.onTurnTown();
      if (m === "dungeon" && typeof H.onTurnDungeon === "function") return H.onTurnDungeon();
    }
    return { getMode, setMode, doAction, tryMove, onTurn };
  }

  window.ModeManager = { create };
})();