/**
 * UI: HUD, inventory/equipment panel, loot panel, game over panel, and GOD panel.
 *
 * Exports (window.UI):
 * - init()
 * - setHandlers({...})
 * - updateStats(player, floor, getAtk, getDef)
 * - renderInventory(player, describeItem)
 * - showInventory()/hideInventory()/isInventoryOpen()
 * - showLoot(list)/hideLoot()/isLootOpen()
 * - showGameOver(player, floor)/hideGameOver()
 *
 * Notes:
 * - GOD panel includes: Heal, spawn items/enemy, FOV slider, side log toggle, Always Crit toggle with body-part chooser.
 * - Persists user toggles in localStorage (LOG_MIRROR, ALWAYS_CRIT, ALWAYS_CRIT_PART).
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
      onGodHeal: null,
      onGodSpawn: null,
      onGodSetFov: null,
      onGodSpawnEnemy: null,
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

      // GOD mode elements
      this.els.godOpenBtn = document.getElementById("god-open-btn");
      this.els.godPanel = document.getElementById("god-panel");
      this.els.godHealBtn = document.getElementById("god-heal-btn");
      this.els.godSpawnBtn = document.getElementById("god-spawn-btn");
      this.els.godSpawnEnemyBtn = document.getElementById("god-spawn-enemy-btn");
      this.els.godSpawnStairsBtn = document.getElementById("god-spawn-stairs-btn");
      this.els.godFov = document.getElementById("god-fov");
      this.els.godFovValue = document.getElementById("god-fov-value");
      this.els.godToggleMirrorBtn = document.getElementById("god-toggle-mirror-btn");
      this.els.godToggleCritBtn = document.getElementById("god-toggle-crit-btn");
      this.els.godToggleGridBtn = document.getElementById("god-toggle-grid-btn");
      this.els.godSeedInput = document.getElementById("god-seed-input");
      this.els.godApplySeedBtn = document.getElementById("god-apply-seed-btn");
      this.els.godRerollSeedBtn = document.getElementById("god-reroll-seed-btn");
      this.els.godSeedHelp = document.getElementById("god-seed-help");
      // GOD effects
      this.els.godBleedPlayerBtn = document.getElementById("god-bleed-player-btn");
      this.els.godDazePlayerBtn = document.getElementById("god-daze-player-btn");
      this.els.godBleedEnemyBtn = document.getElementById("god-bleed-enemy-btn");
      this.els.godLimpEnemyBtn = document.getElementById("god-limp-enemy-btn");
      this.els.godClearStatusBtn = document.getElementById("god-clear-status-btn");

      // transient hand-chooser element
      this.els.handChooser = document.createElement("div");
      this.els.handChooser.style.position = "fixed";
      this.els.handChooser.style.display = "none";
      this.els.handChooser.style.zIndex = "50000";
      this.els.handChooser.style.background = "rgba(20,24,33,0.98)";
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

      // transient crit-hit-part chooser
      this.els.hitChooser = document.createElement("div");
      this.els.hitChooser.style.position = "fixed";
      this.els.hitChooser.style.display = "none";
      this.els.hitChooser.style.zIndex = "50000";
      this.els.hitChooser.style.background = "rgba(20,24,33,0.98)";
      this.els.hitChooser.style.border = "1px solid rgba(80,90,120,0.6)";
      this.els.hitChooser.style.borderRadius = "6px";
      this.els.hitChooser.style.padding = "8px";
      this.els.hitChooser.style.boxShadow = "0 8px 28px rgba(0,0,0,0.4)";
      this.els.hitChooser.innerHTML = `
        <div style="color:#cbd5e1; font-size:12px; margin-bottom:6px;">Force crit to:</div>
        <div style="display:flex; gap:6px; flex-wrap:wrap; max-width:280px;">
          <button data-part="torso" style="padding:6px 10px; background:#1f2937; color:#e5e7eb; border:1px solid #334155; border-radius:4px; cursor:pointer;">Torso</button>
          <button data-part="head" style="padding:6px 10px; background:#1f2937; color:#e5e7eb; border:1px solid #334155; border-radius:4px; cursor:pointer;">Head</button>
          <button data-part="hands" style="padding:6px 10px; background:#1f2937; color:#e5e7eb; border:1px solid #334155; border-radius:4px; cursor:pointer;">Hands</button>
          <button data-part="legs" style="padding:6px 10px; background:#1f2937; color:#e5e7eb; border:1px solid #334155; border-radius:4px; cursor:pointer;">Legs</button>
          <button data-part="cancel" style="padding:6px 10px; background:#111827; color:#9ca3af; border:1px solid #374151; border-radius:4px; cursor:pointer;">Cancel</button>
        </div>
      `;
      document.body.appendChild(this.els.hitChooser);

      // Bind static events
      this.els.lootPanel?.addEventListener("click", () => this.hideLoot());
      this.els.restartBtn?.addEventListener("click", () => {
        if (typeof this.handlers.onRestart === "function") this.handlers.onRestart();
      });
      // GOD panel open + actions
      this.els.godOpenBtn?.addEventListener("click", () => this.showGod());
      this.els.godHealBtn?.addEventListener("click", () => {
        if (typeof this.handlers.onGodHeal === "function") this.handlers.onGodHeal();
      });
      this.els.godSpawnBtn?.addEventListener("click", () => {
        if (typeof this.handlers.onGodSpawn === "function") this.handlers.onGodSpawn();
      });
      this.els.godSpawnEnemyBtn?.addEventListener("click", () => {
        if (typeof this.handlers.onGodSpawnEnemy === "function") this.handlers.onGodSpawnEnemy();
      });
      this.els.godSpawnStairsBtn?.addEventListener("click", () => {
        if (typeof this.handlers.onGodSpawnStairs === "function") this.handlers.onGodSpawnStairs();
      });
      if (this.els.godFov) {
        const updateFov = () => {
          const val = parseInt(this.els.godFov.value, 10);
          this.setGodFov(val);
          if (typeof this.handlers.onGodSetFov === "function") this.handlers.onGodSetFov(val);
        };
        this.els.godFov.addEventListener("input", updateFov);
        this.els.godFov.addEventListener("change", updateFov);
      }
      if (this.els.godToggleMirrorBtn) {
        this.els.godToggleMirrorBtn.addEventListener("click", () => {
          this.toggleSideLog();
        });
        // initialize label
        this.updateSideLogButton();
      }
      if (this.els.godToggleCritBtn) {
        this.els.godToggleCritBtn.addEventListener("click", (ev) => {
          const btn = ev.currentTarget;
          const next = !this.getAlwaysCritState();
          this.setAlwaysCritState(next);
          if (typeof this.handlers.onGodSetAlwaysCrit === "function") {
            this.handlers.onGodSetAlwaysCrit(next);
          }
          // When enabling, ask for preferred hit location
          if (next) {
            // Prevent this click from triggering the global document click handler that hides choosers
            ev.stopPropagation();
            const rect = btn.getBoundingClientRect();
            this.showHitChooser(rect.left, rect.bottom + 6, (part) => {
              if (part && part !== "cancel") {
                this.setCritPartState(part);
                if (typeof this.handlers.onGodSetCritPart === "function") {
                  this.handlers.onGodSetCritPart(part);
                }
              }
            });
          }
        });
        this.updateAlwaysCritButton();
      }
      if (this.els.godToggleGridBtn) {
        this.els.godToggleGridBtn.addEventListener("click", () => {
          const next = !this.getGridState();
          this.setGridState(next);
          this.updateGridButton();
        });
        this.updateGridButton();
      }
      // RNG seed controls
      if (this.els.godApplySeedBtn) {
        this.els.godApplySeedBtn.addEventListener("click", () => {
          const raw = (this.els.godSeedInput && this.els.godSeedInput.value) ? this.els.godSeedInput.value.trim() : "";
          const n = Number(raw);
          if (Number.isFinite(n) && n >= 0) {
            if (typeof this.handlers.onGodApplySeed === "function") this.handlers.onGodApplySeed(n >>> 0);
          } else {
            // no-op; optionally show hint
          }
        });
      }
      if (this.els.godRerollSeedBtn) {
        this.els.godRerollSeedBtn.addEventListener("click", () => {
          if (typeof this.handlers.onGodRerollSeed === "function") this.handlers.onGodRerollSeed();
        });
      }

      // GOD effects bindings
      this.els.godBleedPlayerBtn?.addEventListener("click", () => {
        const d = parseInt((this.els.godEffectPlayerDur && this.els.godEffectPlayerDur.value) ? this.els.godEffectPlayerDur.value : "2", 10) || 2;
        if (typeof this.handlers.onGodApplyBleedPlayer === "function") this.handlers.onGodApplyBleedPlayer(d);
      });
      this.els.godDazePlayerBtn?.addEventListener("click", () => {
        const d = parseInt((this.els.godEffectPlayerDur && this.els.godEffectPlayerDur.value) ? this.els.godEffectPlayerDur.value : "2", 10) || 2;
        if (typeof this.handlers.onGodApplyDazedPlayer === "function") this.handlers.onGodApplyDazedPlayer(d);
      });
      this.els.godBleedEnemyBtn?.addEventListener("click", () => {
        const d = parseInt((this.els.godEffectEnemyDur && this.els.godEffectEnemyDur.value) ? this.els.godEffectEnemyDur.value : "2", 10) || 2;
        if (typeof this.handlers.onGodApplyBleedEnemy === "function") this.handlers.onGodApplyBleedEnemy(d);
      });
      this.els.godLimpEnemyBtn?.addEventListener("click", () => {
        const d = parseInt((this.els.godEffectEnemyDur && this.els.godEffectEnemyDur.value) ? this.els.godEffectEnemyDur.value : "2", 10) || 2;
        if (typeof this.handlers.onGodApplyLimpEnemy === "function") this.handlers.onGodApplyLimpEnemy(d);
      });
      this.els.godClearStatusBtn?.addEventListener("click", () => {
        if (typeof this.handlers.onGodClearStatuses === "function") this.handlers.onGodClearStatuses();
      });

      // Input remapping
      this.els.godEnableWasdBtn = document.getElementById("god-enable-wasd-btn");
      this.els.godEffectPlayerDur = document.getElementById("god-effect-player-dur");
      this.els.godEffectEnemyDur = document.getElementById("god-effect-enemy-dur");
      this.els.godRemapInventory = document.getElementById("god-remap-inventory");
      this.els.godRemapLoot = document.getElementById("god-remap-loot");
      this.els.godSaveBindingsBtn = document.getElementById("god-save-bindings-btn");

      this.els.godEnableWasdBtn?.addEventListener("click", () => {
        try { if (window.InputBindings && typeof InputBindings.enableWASD === "function") InputBindings.enableWASD(); } catch (_) {}
        this.els.godEnableWasdBtn.textContent = "WASD Enabled";
      });

      // Capture single-key presses into text inputs
      const captureKeyToInput = (inputEl, actionName) => {
        if (!inputEl) return;
        inputEl.addEventListener("keydown", (e) => {
          e.preventDefault();
          const key = e.code || e.key;
          inputEl.value = key;
          try {
            if (window.InputBindings && typeof InputBindings.setAction === "function") {
              InputBindings.setAction(actionName, [key]);
            }
          } catch (_) {}
        });
      };
      captureKeyToInput(this.els.godRemapInventory, "inventory");
      captureKeyToInput(this.els.godRemapLoot, "loot");

      this.els.godSaveBindingsBtn?.addEventListener("click", () => {
        try { if (window.InputBindings && typeof InputBindings.saveToStorage === "function") InputBindings.saveToStorage(); } catch (_) {}
      });

      this.updateSeedUI();

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
            ev.preventDefault();
            if (typeof this.handlers.onEquip === "function") this.handlers.onEquip(idx);
            return;
          }
          if (slot === "hand") {
            ev.preventDefault();
            ev.stopPropagation();
            // If exactly one hand is empty, equip to that hand immediately
            const st = this._equipState || {};
            const leftEmpty = !!st.leftEmpty;
            const rightEmpty = !!st.rightEmpty;
            if (leftEmpty !== rightEmpty) {
              const hand = leftEmpty ? "left" : "right";
              if (typeof this.handlers.onEquipHand === "function") this.handlers.onEquipHand(idx, hand);
              return;
            }
            // Otherwise show hand chooser near the clicked element
            const rect = li.getBoundingClientRect();
            this.showHandChooser(rect.left, rect.bottom + 6, (hand) => {
              if (hand && (hand === "left" || hand === "right")) {
                if (typeof this.handlers.onEquipHand === "function") this.handlers.onEquipHand(idx, hand);
              }
            });
          } else {
            ev.preventDefault();
            if (typeof this.handlers.onEquip === "function") this.handlers.onEquip(idx);
          }
        } else if (kind === "potion") {
          ev.preventDefault();
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

      // Hit chooser click
      this.els.hitChooser.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;
        e.stopPropagation();
        const part = btn.dataset.part;
        const cb = this._hitChooserCb;
        this.hideHitChooser();
        if (typeof cb === "function") cb(part);
      });

      // Hide choosers on any outside click (not in capture phase)
      document.addEventListener("click", (e) => {
        if (this.els.handChooser && this.els.handChooser.style.display !== "none" && !this.els.handChooser.contains(e.target)) {
          this.hideHandChooser();
        }
        if (this.els.hitChooser && this.els.hitChooser.style.display !== "none" && !this.els.hitChooser.contains(e.target)) {
          this.hideHitChooser();
        }
      });

      return true;
    },

    setHandlers({ onEquip, onEquipHand, onUnequip, onDrink, onRestart, onGodHeal, onGodSpawn, onGodSetFov, onGodSpawnEnemy, onGodSpawnStairs, onGodSetAlwaysCrit, onGodSetCritPart, onGodApplySeed, onGodRerollSeed, onGodApplyBleedPlayer, onGodApplyDazedPlayer, onGodApplyBleedEnemy, onGodApplyLimpEnemy, onGodClearStatuses } = {}) {
      if (typeof onEquip === "function") this.handlers.onEquip = onEquip;
      if (typeof onEquipHand === "function") this.handlers.onEquipHand = onEquipHand;
      if (typeof onUnequip === "function") this.handlers.onUnequip = onUnequip;
      if (typeof onDrink === "function") this.handlers.onDrink = onDrink;
      if (typeof onRestart === "function") this.handlers.onRestart = onRestart;
      if (typeof onGodHeal === "function") this.handlers.onGodHeal = onGodHeal;
      if (typeof onGodSpawn === "function") this.handlers.onGodSpawn = onGodSpawn;
      if (typeof onGodSetFov === "function") this.handlers.onGodSetFov = onGodSetFov;
      if (typeof onGodSpawnEnemy === "function") this.handlers.onGodSpawnEnemy = onGodSpawnEnemy;
      if (typeof onGodSpawnStairs === "function") this.handlers.onGodSpawnStairs = onGodSpawnStairs;
      if (typeof onGodSetAlwaysCrit === "function") this.handlers.onGodSetAlwaysCrit = onGodSetAlwaysCrit;
      if (typeof onGodSetCritPart === "function") this.handlers.onGodSetCritPart = onGodSetCritPart;
      if (typeof onGodApplySeed === "function") this.handlers.onGodApplySeed = onGodApplySeed;
      if (typeof onGodRerollSeed === "function") this.handlers.onGodRerollSeed = onGodRerollSeed;
      if (typeof onGodApplyBleedPlayer === "function") this.handlers.onGodApplyBleedPlayer = onGodApplyBleedPlayer;
      if (typeof onGodApplyDazedPlayer === "function") this.handlers.onGodApplyDazedPlayer = onGodApplyDazedPlayer;
      if (typeof onGodApplyBleedEnemy === "function") this.handlers.onGodApplyBleedEnemy = onGodApplyBleedEnemy;
      if (typeof onGodApplyLimpEnemy === "function") this.handlers.onGodApplyLimpEnemy = onGodApplyLimpEnemy;
      if (typeof onGodClearStatuses === "function") this.handlers.onGodClearStatuses = onGodClearStatuses;
    },

    updateStats(player, floor, getAtk, getDef) {
      if (this.els.hpEl) {
        const parts = [`HP: ${player.hp.toFixed(1)}/${player.maxHp.toFixed(1)}`];
        const statuses = [];
        if (player.bleedTurns && player.bleedTurns > 0) statuses.push(`Bleeding (${player.bleedTurns})`);
        if (player.dazedTurns && player.dazedTurns > 0) statuses.push(`Dazed (${player.dazedTurns})`);
        parts.push(`  Status Effect: ${statuses.length ? statuses.join(", ") : "None"}`);
        this.els.hpEl.textContent = parts.join("");
      }
      if (this.els.floorEl) {
        // Shorter labels to fit better on small screens
        this.els.floorEl.textContent = `F: ${floor}  Lv: ${player.level}  XP: ${player.xp}/${player.xpNext}`;
      }
      if (this.els.invStatsEl && typeof getAtk === "function" && typeof getDef === "function") {
        this.els.invStatsEl.textContent = `Attack: ${getAtk().toFixed(1)}   Defense: ${getDef().toFixed(1)}`;
      }
    },

    renderInventory(player, describeItem) {
      // remember current equip occupancy for quick decisions
      this._equipState = {
        leftEmpty: !(player.equipment && player.equipment.left),
        rightEmpty: !(player.equipment && player.equipment.right),
      };

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
          if (it.kind === "equip" && it.slot === "hand") {
            li.dataset.slot = "hand";
            if (it.twoHanded) {
              li.dataset.twohanded = "true";
              li.title = `Two-handed • Decay: ${Number(it.decay || 0).toFixed(0)}%`;
            } else {
              // If exactly one hand is empty, hint which one will be used automatically
              let autoHint = "";
              if (this._equipState) {
                if (this._equipState.leftEmpty && !this._equipState.rightEmpty) autoHint = " (Left is empty)";
                else if (this._equipState.rightEmpty && !this._equipState.leftEmpty) autoHint = " (Right is empty)";
              }
              li.title = `Click to equip${autoHint ? autoHint : " (choose hand)"} • Decay: ${Number(it.decay || 0).toFixed(0)}%`;
            }
            li.style.cursor = "pointer";
          } else if (it.kind === "equip") {
            li.dataset.slot = it.slot || "";
            li.title = `Click to equip • Decay: ${Number(it.decay || 0).toFixed(0)}%`;
            li.style.cursor = "pointer";
          } else if (it.kind === "potion") {
            li.style.cursor = "pointer";
            li.title = "Click to drink";
          } else {
            li.style.opacity = "0.7";
            li.style.cursor = "default";
          }
          li.textContent = typeof describeItem === "function" ? describeItem(it) : (it.name || "item");
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

    showHitChooser(x, y, cb) {
      if (!this.els.hitChooser) return;
      this._hitChooserCb = cb;
      this.els.hitChooser.style.left = `${Math.round(x)}px`;
      this.els.hitChooser.style.top = `${Math.round(y)}px`;
      this.els.hitChooser.style.display = "block";
    },

    hideHitChooser() {
      if (!this.els.hitChooser) return;
      this.els.hitChooser.style.display = "none";
      this._hitChooserCb = null;
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

    // GOD mode modal
    showGod() {
      if (this.isLootOpen()) this.hideLoot();
      if (this.isInventoryOpen()) this.hideInventory();
      if (this.els.godPanel) this.els.godPanel.hidden = false;
    },

    hideGod() {
      if (this.els.godPanel) this.els.godPanel.hidden = true;
    },

    isGodOpen() {
      return !!(this.els.godPanel && !this.els.godPanel.hidden);
    },

    setGodFov(val) {
      if (!this.els.godFov) return;
      const v = Math.max(parseInt(this.els.godFov.min || "3", 10), Math.min(parseInt(this.els.godFov.max || "14", 10), parseInt(val, 10) || 0));
      this.els.godFov.value = String(v);
      if (this.els.godFovValue) this.els.godFovValue.textContent = `FOV: ${v}`;
    },

    // --- Side log mirror controls ---
    getSideLogState() {
      try {
        if (typeof window.LOG_MIRROR === "boolean") return window.LOG_MIRROR;
        const m = localStorage.getItem("LOG_MIRROR");
        if (m === "1") return true;
        if (m === "0") return false;
      } catch (_) {}
      return true; // default on
    },

    setSideLogState(enabled) {
      try {
        window.LOG_MIRROR = !!enabled;
        localStorage.setItem("LOG_MIRROR", enabled ? "1" : "0");
      } catch (_) {}
      // Apply immediately
      try {
        if (window.Logger && typeof Logger.init === "function") {
          Logger.init();
        }
      } catch (_) {}
      // Ensure DOM reflects the state even without reinit
      const el = document.getElementById("log-right");
      if (el) {
        el.style.display = enabled ? "" : "none";
      }
      this.updateSideLogButton();
    },

    toggleSideLog() {
      const cur = this.getSideLogState();
      this.setSideLogState(!cur);
    },

    updateSideLogButton() {
      if (!this.els.godToggleMirrorBtn) return;
      const on = this.getSideLogState();
      this.els.godToggleMirrorBtn.textContent = `Side Log: ${on ? "On" : "Off"}`;
    },

    // --- Render grid controls ---
    getGridState() {
      try {
        if (typeof window.DRAW_GRID === "boolean") return window.DRAW_GRID;
        const v = localStorage.getItem("DRAW_GRID");
        if (v === "1") return true;
        if (v === "0") return false;
      } catch (_) {}
      return true; // default on
    },

    setGridState(enabled) {
      try {
        window.DRAW_GRID = !!enabled;
        localStorage.setItem("DRAW_GRID", enabled ? "1" : "0");
      } catch (_) {}
      this.updateGridButton();
    },

    updateGridButton() {
      if (!this.els.godToggleGridBtn) return;
      const on = this.getGridState();
      this.els.godToggleGridBtn.textContent = `Grid: ${on ? "On" : "Off"}`;
    },

    // --- Always Crit controls ---
    getAlwaysCritState() {
      try {
        if (typeof window.ALWAYS_CRIT === "boolean") return window.ALWAYS_CRIT;
        const v = localStorage.getItem("ALWAYS_CRIT");
        if (v === "1") return true;
        if (v === "0") return false;
      } catch (_) {}
      return false;
    },

    setAlwaysCritState(enabled) {
      try {
        window.ALWAYS_CRIT = !!enabled;
        localStorage.setItem("ALWAYS_CRIT", enabled ? "1" : "0");
      } catch (_) {}
      this.updateAlwaysCritButton();
    },

    getCritPartState() {
      try {
        if (typeof window.ALWAYS_CRIT_PART === "string" && window.ALWAYS_CRIT_PART) return window.ALWAYS_CRIT_PART;
        const v = localStorage.getItem("ALWAYS_CRIT_PART");
        if (v) return v;
      } catch (_) {}
      return "";
    },

    setCritPartState(part) {
      try {
        window.ALWAYS_CRIT_PART = part || "";
        if (part) localStorage.setItem("ALWAYS_CRIT_PART", part);
        else localStorage.removeItem("ALWAYS_CRIT_PART");
      } catch (_) {}
      this.updateAlwaysCritButton();
    },

    updateAlwaysCritButton() {
      if (!this.els.godToggleCritBtn) return;
      const on = this.getAlwaysCritState();
      const part = this.getCritPartState();
      this.els.godToggleCritBtn.textContent = `Always Crit: ${on ? "On" : "Off"}${on && part ? ` (${part})` : ""}`;
    },

    // --- RNG UI ---
    getSeedState() {
      try {
        const v = localStorage.getItem("SEED");
        return v || "";
      } catch (_) {}
      return "";
    },

    updateSeedUI() {
      const seed = this.getSeedState();
      if (this.els.godSeedInput && !this.els.godSeedInput.value) {
        this.els.godSeedInput.value = seed;
      }
      if (this.els.godSeedHelp) {
        this.els.godSeedHelp.textContent = seed ? `Current seed: ${seed}` : "Current seed: (random)";
      }
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