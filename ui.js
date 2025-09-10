/*
UI module for Tiny Roguelike

Caches DOM elements and provides functions to update UI, panels and bindings.

API
- UI.init()
- UI.setHandlers({ onEquip, onDrink, onRestart })
- UI.updateStats(player, floor, getAtk, getDef)
- UI.renderInventory(player, describeItem)
- UI.showInventory(), UI.hideInventory(), UI.isInventoryOpen()
- UI.showLoot(list), UI.hideLoot(), UI.isLootOpen()
- UI.showGameOver(player, floor), UI.hideGameOver()
*/
(function () {
  const UI = {
    els: {},
    handlers: {
      onEquip: null,
      onDrink: null,
      onRestart: null,
    },

    init() {
      this.els.hpEl = document.getElementById("health");
      this.els.floorEl = document.getElementById("floor");
      this.els.logEl = document.getElementById("log");
      this.els.lootPanel = document.getElementById("loot-panel");
      this.els.lootList = document.getElementById("loot-list");
      this.els.gameOverPanel = document.getElementById("gameover-panel");
      this.els.gameOverSummary = document.getElementById("gameover-summary");
      this.els.restartBtn = document.getElementById("restart-btn");
      this.els.invPanel = document.getElementById("inv-panel");
      this.els.invList = document.getElementById("inv-list");
      this.els.equipSlotsEl = document.getElementById("equip-slots");
      this.els.invStatsEl = document.getElementById("inv-stats");

      // Bind static events
      this.els.lootPanel?.addEventListener("click", () => this.hideLoot());
      this.els.restartBtn?.addEventListener("click", () => {
        if (typeof this.handlers.onRestart === "function") this.handlers.onRestart();
      });
      // Delegate inventory clicks
      this.els.invPanel?.addEventListener("click", (ev) => {
        const li = ev.target.closest("li");
        if (!li || !li.dataset.index) return;
        const idx = parseInt(li.dataset.index, 10);
        if (!Number.isFinite(idx)) return;
        const kind = li.dataset.kind;
        if (kind === "equip") {
          if (typeof this.handlers.onEquip === "function") this.handlers.onEquip(idx);
        } else if (kind === "potion") {
          if (typeof this.handlers.onDrink === "function") this.handlers.onDrink(idx);
        }
      });

      return true;
    },

    setHandlers({ onEquip, onDrink, onRestart } = {}) {
      if (typeof onEquip === "function") this.handlers.onEquip = onEquip;
      if (typeof onDrink === "function") this.handlers.onDrink = onDrink;
      if (typeof onRestart === "function") this.handlers.onRestart = onRestart;
    },

    updateStats(player, floor, getAtk, getDef) {
      if (this.els.hpEl) {
        const gold = (player.inventory.find(i => i.kind === "gold")?.amount) || 0;
        this.els.hpEl.textContent = `HP: ${player.hp.toFixed(1)}/${player.maxHp.toFixed(1)}  Gold: ${gold}`;
      }
      if (this.els.floorEl) {
        this.els.floorEl.textContent = `Floor: ${floor}  Lv: ${player.level}  XP: ${player.xp}/${player.xpNext}`;
      }
      if (this.els.invStatsEl && typeof getAtk === "function" && typeof getDef === "function") {
        this.els.invStatsEl.textContent = `Attack: ${getAtk().toFixed(1)}   Defense: ${getDef().toFixed(1)}`;
      }
    },

    renderInventory(player, describeItem) {
      // Equipment slots
      if (this.els.equipSlotsEl) {
        const slots = [
          ["left", "Left hand"],
          ["right", "Right hand"],
          ["head", "Head"],
          ["torso", "Torso"],
          ["legs", "Legs"],
          ["hands", "Hands"],
        ];
        const html = slots.map(([key, label]) => {
          const it = player.equipment[key];
          if (it) {
            const name = describeItem(it);
            const title = `Decay: ${Number(it.decay || 0).toFixed(0)}%`;
            return `<div class="slot"><strong>${label}:</strong> <span class="name" title="${title}">${name}</span></div>`;
          } else {
            return `<div class="slot"><strong>${label}:</strong> <span class="name"><span class='empty'>(empty)</span></span></div>`;
          }
        }).join("");
        this.els.equipSlotsEl.innerHTML = html;
      }
      // Inventory list
      if (this.els.invList) {
        this.els.invList.innerHTML = "";
        player.inventory.forEach((it, idx) => {
          const li = document.createElement("li");
          li.dataset.index = String(idx);
          li.dataset.kind = it.kind || "misc";
          li.textContent = typeof describeItem === "function" ? describeItem(it) : (it.name || "item");
          if (it.kind === "equip") {
            li.title = `Decay: ${Number(it.decay || 0).toFixed(0)}%`;
          } else if (it.kind === "potion") {
            li.style.cursor = "pointer";
            li.title = "Click to drink";
          } else {
            li.style.opacity = "0.7";
            li.style.cursor = "default";
          }
          this.els.invList.appendChild(li);
        });
      }
    },

    showInventory() {
      if (this.els.lootPanel && !this.els.lootPanel.hidden) this.hideLoot();
      if (this.els.invPanel) this.els.invPanel.hidden = false;
    },

    hideInventory() {
      if (this.els.invPanel) this.els.invPanel.hidden = true;
    },

    isInventoryOpen() {
      return !!(this.els.invPanel && !this.els.invPanel.hidden);
    },

    showLoot(list) {
      if (!this.els.lootPanel || !this.els.lootList) return;
      this.els.lootList.innerHTML = "";
      list.forEach(name => {
        const li = document.createElement("li");
        li.textContent = name;
        this.els.lootList.appendChild(li);
      });
      this.els.lootPanel.hidden = false;
    },

    hideLoot() {
      if (!this.els.lootPanel) return;
      this.els.lootPanel.hidden = true;
    },

    isLootOpen() {
      return !!(this.els.lootPanel && !this.els.lootPanel.hidden);
    },

    showGameOver(player, floor) {
      if (this.els.lootPanel && !this.els.lootPanel.hidden) this.hideLoot();
      if (!this.els.gameOverPanel) return;
      const gold = (player.inventory.find(i => i.kind === "gold")?.amount) || 0;
      if (this.els.gameOverSummary) {
        this.els.gameOverSummary.textContent = `You died on floor ${floor} (Lv ${player.level}). Gold: ${gold}. XP: ${player.xp}/${player.xpNext}.`;
      }
      this.els.gameOverPanel.hidden = false;
    },

    hideGameOver() {
      if (!this.els.gameOverPanel) return;
      this.els.gameOverPanel.hidden = true;
    }
  };

  window.UI = UI;
})();