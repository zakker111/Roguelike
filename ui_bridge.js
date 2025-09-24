/**
 * UIBridge: decouples game orchestration from direct window.UI calls.
 *
 * Exports (window.UIBridge):
 * - updateStats(player, floor, getAtk, getDef)
 * - renderInventory(player, describeItem)
 * - showInventory()/hideInventory()/isInventoryOpen()
 * - showLoot(list)/hideLoot()/isLootOpen()
 * - showGameOver(player, floor)/hideGameOver()
 * - showGod()/hideGod()/isGodOpen()
 * - setGodFov(val)
 * - setHandlers(handlers)
 *
 * Notes:
 * - Uses window.UI if available; otherwise falls back to minimal DOM operations.
 * - Safe to call even if UI module isn't present.
 */
(function () {
  function updateStats(player, floor, getAtk, getDef) {
    if (window.UI && typeof UI.updateStats === "function") {
      UI.updateStats(player, floor, getAtk, getDef);
      return;
    }
    const hpEl = document.getElementById("health");
    const floorEl = document.getElementById("floor");
    const gold = (player.inventory.find(i => i.kind === "gold")?.amount) || 0;
    if (hpEl) hpEl.textContent = `HP: ${player.hp.toFixed(1)}/${player.maxHp.toFixed(1)}`;
    if (floorEl) floorEl.textContent = `F: ${floor}  Lv: ${player.level}  XP: ${player.xp}/${player.xpNext}  Gold: ${gold}`;
  }

  function renderInventory(player, describeItem) {
    if (window.UI && typeof UI.renderInventory === "function") {
      UI.renderInventory(player, describeItem);
    }
  }

  function showInventory() {
    if (window.UI && typeof UI.showInventory === "function") {
      UI.showInventory();
      return;
    }
    const panel = document.getElementById("inv-panel");
    if (panel) panel.hidden = false;
  }

  function hideInventory() {
    if (window.UI && typeof UI.hideInventory === "function") {
      UI.hideInventory();
      return;
    }
    const panel = document.getElementById("inv-panel");
    if (panel) panel.hidden = true;
  }

  function isInventoryOpen() {
    if (window.UI && typeof UI.isInventoryOpen === "function") {
      return UI.isInventoryOpen();
    }
    const panel = document.getElementById("inv-panel");
    return !!(panel && !panel.hidden);
  }

  function showLoot(list) {
    if (window.UI && typeof UI.showLoot === "function") {
      UI.showLoot(list);
      return;
    }
    const panel = document.getElementById("loot-panel");
    const ul = document.getElementById("loot-list");
    if (!panel || !ul) return;
    ul.innerHTML = "";
    list.forEach(name => {
      const li = document.createElement("li");
      li.textContent = name;
      ul.appendChild(li);
    });
    panel.hidden = false;
  }

  function hideLoot() {
    if (window.UI && typeof UI.hideLoot === "function") {
      UI.hideLoot();
      return;
    }
    const panel = document.getElementById("loot-panel");
    if (panel) panel.hidden = true;
  }

  function isLootOpen() {
    if (window.UI && typeof UI.isLootOpen === "function") {
      return UI.isLootOpen();
    }
    const panel = document.getElementById("loot-panel");
    return !!(panel && !panel.hidden);
  }

  function showGameOver(player, floor) {
    if (window.UI && typeof UI.showGameOver === "function") {
      UI.showGameOver(player, floor);
      return;
    }
    const panel = document.getElementById("gameover-panel");
    const summary = document.getElementById("gameover-summary");
    const gold = (player.inventory.find(i => i.kind === "gold")?.amount) || 0;
    if (summary) {
      summary.textContent = `You died on floor ${floor} (Lv ${player.level}). Gold: ${gold}. XP: ${player.xp}/${player.xpNext}.`;
    }
    if (panel) panel.hidden = false;
  }

  function hideGameOver() {
    if (window.UI && typeof UI.hideGameOver === "function") {
      UI.hideGameOver();
      return;
    }
    const panel = document.getElementById("gameover-panel");
    if (panel) panel.hidden = true;
  }

  function showGod() {
    if (window.UI && typeof UI.showGod === "function") {
      UI.showGod();
      return;
    }
    const panel = document.getElementById("god-panel");
    if (panel) panel.hidden = false;
  }

  function hideGod() {
    if (window.UI && typeof UI.hideGod === "function") {
      UI.hideGod();
      return;
    }
    const panel = document.getElementById("god-panel");
    if (panel) panel.hidden = true;
  }

  function isGodOpen() {
    if (window.UI && typeof UI.isGodOpen === "function") {
      return UI.isGodOpen();
    }
    const panel = document.getElementById("god-panel");
    return !!(panel && !panel.hidden);
  }

  function setGodFov(val) {
    if (window.UI && typeof UI.setGodFov === "function") {
      UI.setGodFov(val);
    }
  }

  function setHandlers(h) {
    if (window.UI && typeof UI.setHandlers === "function") {
      UI.setHandlers(h);
    }
  }

  window.UIBridge = {
    updateStats,
    renderInventory,
    showInventory,
    hideInventory,
    isInventoryOpen,
    showLoot,
    hideLoot,
    isLootOpen,
    showGameOver,
    hideGameOver,
    showGod,
    hideGod,
    isGodOpen,
    setGodFov,
    setHandlers,
  };
})();