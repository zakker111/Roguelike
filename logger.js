/**
 * Logger: in-DOM log with capped length and optional right-side mirror.
 *
 * Exports (window.Logger):
 * - init(target = "#log", max = 60): boolean
 * - log(message, type = "info")
 * Types: info, crit, block, death, good, warn, flavor.
 *
 * Notes:
 * - If an element with id="log-right" exists and LOG_MIRROR !== false, entries are mirrored there.
 */
(function () {
  const Logger = {
    _el: null,
    _elRight: null,
    _max: 60,
    _lastText: "",
    _lastType: "",
    _lastCount: 0,

    init(target, max) {
      if (typeof max === "number" && max > 0) {
        this._max = max;
      }
      if (!target) {
        this._el = document.getElementById("log");
      } else if (typeof target === "string") {
        this._el = document.querySelector(target);
      } else if (target instanceof HTMLElement) {
        this._el = target;
      }
      // discover optional right-side mirror (honor global toggle)
      try {
        if (window.LOG_MIRROR === false) {
          this._elRight = null;
        } else {
          this._elRight = document.getElementById("log-right") || null;
        }
      } catch (_) {
        this._elRight = null;
      }
      return this._el != null;
    },

    _prepend(el, type, text) {
      const div = document.createElement("div");
      div.className = `entry ${type}`;
      div.textContent = String(text);
      el.prepend(div);
      while (el.childNodes.length > this._max) {
        el.removeChild(el.lastChild);
      }
    },

    _mirror(type, text) {
      if (!this._elRight) return;
      let visible = true;
      try {
        const cs = window.getComputedStyle(this._elRight);
        if (cs && (cs.display === "none" || cs.visibility === "hidden")) visible = false;
      } catch (_) {}
      if (!visible) return;
      this._prepend(this._elRight, type, text);
    },

    log(msg, type = "info") {
      if (!this._el) this.init();
      const el = this._el;
      if (!el) return;

      const text = String(msg);

      // Coalesce with previous identical message and type
      if (this._lastText === text && this._lastType === type) {
        this._lastCount += 1;
        // Update the very top entry to reflect repeat count: "message (xN)"
        const first = el.firstChild;
        if (first && first.textContent) {
          // find the base part before (xN)
          const base = this._lastText.replace(/\s+\(x\d+\)$/, "");
          first.textContent = `${base} (x${this._lastCount + 1})`;
        }
        // Mirror update
        if (this._elRight && this._elRight.firstChild) {
          const firstR = this._elRight.firstChild;
          if (firstR && firstR.textContent) {
            const baseR = this._lastText.replace(/\s+\(x\d+\)$/, "");
            firstR.textContent = `${baseR} (x${this._lastCount + 1})`;
          }
        }
        return;
      }

      // New message: reset run
      this._lastText = text;
      this._lastType = type;
      this._lastCount = 0;

      this._prepend(el, type, text);
      this._mirror(type, text);
    }
  };

  // Auto-init on load, best-effort
  try { Logger.init(); } catch (e) { /* ignore */ }

  window.Logger = Logger;
})();