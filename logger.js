/*
Logger module for Tiny Roguelike.

- Creates colored log entries in the #log panel
- Keeps most recent entries at the top
- Caps the total number of entries (default 60)

API:
- Logger.init(target = "#log", max = 60)
  target can be a CSS selector, HTMLElement, or omitted to auto-detect #log
- Logger.log(message, type = "info")
  type is one of: "info" (default), "crit", "block", "death", "good", "warn"
*/
(function () {
  const Logger = {
    _el: null,
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
      return this._el != null;
    },

    log(msg, type = "info") {
      if (!this._el) this.init();
      const el = this._el;
      if (!el) return;

      const div = document.createElement("div");
      div.className = `entry ${type}`;
      div.textContent = String(msg);
      // Most recent on top
      el.prepend(div);

      // Cap entries
      while (el.childNodes.length > this._max) {
        el.removeChild(el.lastChild);
      }
    }
  };

  // Auto-init on load, best-effort
  try { Logger.init(); } catch (e) { /* ignore */ }

  window.Logger = Logger;
})();