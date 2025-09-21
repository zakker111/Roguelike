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

    log(msg, type = "info") {
      if (!this._el) this.init();
      const el = this._el;
      if (!el) return;

      // main log
      const div = document.createElement("div");
      div.className = `entry ${type}`;
      div.textContent = String(msg);
      el.prepend(div);
      while (el.childNodes.length > this._max) {
        el.removeChild(el.lastChild);
      }

      // optional right mirror (skip if hidden by CSS or toggle)
      if (this._elRight) {
        let visible = true;
        try {
          const cs = window.getComputedStyle(this._elRight);
          if (cs && cs.display === "none" || cs && cs.visibility === "hidden") visible = false;
        } catch (_) {}
        if (visible) {
          const div2 = document.createElement("div");
          div2.className = `entry ${type}`;
          div2.textContent = String(msg);
          this._elRight.prepend(div2);
          while (this._elRight.childNodes.length > this._max) {
            this._elRight.removeChild(this._elRight.lastChild);
          }
        }
      }
    }
  };

  // Auto-init on load, best-effort
  try { Logger.init(); } catch (e) { /* ignore */ }

  window.Logger = Logger;
})();