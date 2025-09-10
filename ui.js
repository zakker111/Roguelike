/*
UI module for Tiny Roguelike

Caches DOM elements and provides functions to update UI, panels and bindings.

API
- UI.init()
- UI.setHandlers({ onEquip, onDrink, onRestart })
+ UI.setHandlers({ onEquip, onEquipHand, onUnequip, onDrink, onRestart })
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
      onEquipHand: null,
      onUnequip: null,
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

      // transient hand-chooser element
      this.els.handChooser = document.createElement("div");
      this.els.handChooser.style.position = "fixed";
      this.els.handChooser.style.display = "none";
      this.els.handChooser.style.zIndex = "1001";
      this.els.handChooser.style.background = "rgba(20,24,33,0.95)";
      this.els.handChooser.style.border = "1px solid rgba(80,90,120,0.6)";
      this.els.handChooser.style.borderRadius = "6px";
      this.els.handChooser.style.padding = "8px";
      this.els.handChooser.style.boxShadow = "0 8px 28px rgba(0,0,0,0.4)";
      this.els.handChooser.innerHTML = `
        <div style="color:#cbd5e1; font-size:12px; margin-bottom:6px;">Equip to:</div>
        <div style="display:flex; gap:6px;">
          <button data-hand="left" style="padding:6px 10px; background:#1f2937; color:#e5e7eb; border:1px solid #334155; border-radius:4px; cursor:pointer;">Left</button>
          <button data-hand="right" style="padding:6px 10px; background:#1f2937; color:#e5e7eb; border:1px solid #334155; border-radius:4px; cursor:pointer;">Right</button>
          <button data-hand="cancel" style="padding:6px 10px; background:#111827; color:#9ca3af; border:1px solid #374151; border-radius:4px; cursor:pointer;">Cancel</button>
        </div>
      `;
      document.body.appendChild(this.els.handChooser);

      // Bind static events
      this.els.lootPanel?.addEventListener("click", () => this.hideLoot());
      this.els.restartBtn?.addEventListener("click", () => {
        if (typeof this.handlers.onRestart === "function") this.handlers.onRestart();
      });
      // Delegate equip slot clicks (unequip)
      this.els.equipSlotsEl?.addEventListener("click", (ev) => {
        const span = ev.target.closest("span.name[data-slot]");
        if (!span) return;
        const slot = span.dataset.slot;
        if (slot && typeof this.handlers.onUnequip === "function") {
          this.handlers.onUnequip(slot);
        }
      });
      // Delegate inventory clicks
      this.els.invPanel?.addEventListener("click", (ev) => {
        const li = ev.target.closest("li");
        if (!li || !li.dataset.index) return;
        const idx = parseInt(li.dataset.index, 10);
        if (!Number.isFinite(idx)) return;
        const kind = li.dataset.kind;
        if (kind === "equip") {
          const slot = li.dataset.slot || "";
          const twoH = li.dataset.twohanded === "true";
          if (twoH) {
            if (typeof this.handlers.onEquip === "function") this.handlers.onEquip(idx);
            return;
          }
          if (slot === "hand") {
            // Show hand chooser near the clicked element
            const rect = li.getBoundingClientRect();
            this.showHandChooser(rect.left, rect.bottom + 6, (hand) => {
              if (hand && (hand === "left" || hand === "right")) {
                if (typeof this.handlers.onEquipHand === "function") this.handlers.onEquipHand(idx, hand);
              }
            });
          } else {
            if (typeof this.handlers.onEquip === "function") this.handlers.onEquip(idx);
          }
        } else if (kind === "potion") {
          if (typeof this.handlers.onDrink === "function") this.handlers.onDrink(idx);
        }
      });

      // Hand chooser click
      this.els.handChooser.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;
        e.stopPropagation(); // prevent outside click handler from firing first
        const hand = btn.dataset.hand;
        const cb = this._handChooserCb;
        this.hideHandChooser();
        if (typeof cb === "function") cb(hand);
      });

      // Hide chooser on any outside click (not in capture phase)
      document.addEventListener("click", (e) => {
        if (!this.els.handChooser) return;
        if (this.els.handChooser.style.display === "none") return;
        if (this.els.handChooser.contains(e.target)) return;
        this.hideHandChooser();
      });

      return true;
    },

    setHandlers({ onEquip, onEquipHand, onUnequip, onDrink, onRestart } = {}) {
      if (typeof onEquip === "function") this.handlers.onEquip = onEquip;
      if (typeof onEquipHand === "function") this.handlers.onEquipHand = onEquipHand;
      if (typeof onUnequip === "function") this.handlers.onUnequip = onUnequip;
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
            return `<div class="slot"><strong>${label}:</strong> <span class="name" data-slot="${key}" title="${title}" style="cursor:pointer; text-decoration:underline dotted;">${name}</span></div>`;
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
          if (it.kind === "equip" && (it.slot === "hand" || it.slot === "weapon" || it.slot === "offhand")) {
            li.dataset.slot = "hand";
            if (it.twoHanded) li.dataset.twohanded = "true";
          } else if (it.kind === "equip") {
            li.dataset.slot = it.slot || "";
          }
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

    showHandChooser(x, y, cb) {
      if (!this.els.handChooser) return;
      this._handChooserCb = cb;
      this.els.handChooser.style.left = `${Math.round(x)}px`;
      this.els.handChooser.style.top = `${Math.round(y)}px`;
      this.els.handChooser.style.display = "block";
    },

    hideHandChooser() {
      if (!this.els.handChooser) return;
      this.els.handChooser.style.display = "none";
      this._handChooserCb = null;
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