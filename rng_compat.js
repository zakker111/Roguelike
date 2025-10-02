/**
 * RNG compatibility shim:
 * Provides window.RNG API expected by game.js by delegating to RNGService.
 *
 * API:
 * - RNG.autoInit(): returns current seed (uint32), initializes RNG.rng
 * - RNG.rng(): random float [0,1)
 * - RNG.int(min, max)
 * - RNG.float(min, max, decimals=1)
 * - RNG.chance(p)
 * - RNG.applySeed(seedUint32): reseed RNG.rng and persist to localStorage
 */
(function () {
  if (typeof window === "undefined") return;

  // Use RNGService if available; else inline mulberry32 fallback
  function createMulberry32(a) {
    a = (Number(a) >>> 0);
    return function () {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  let _seed = null;
  let _rng = null;

  function applySeed(seedUint32) {
    _seed = (Number(seedUint32) >>> 0);
    try { localStorage.setItem("SEED", String(_seed)); } catch (_) {}
    if (window.RNGService && typeof RNGService.create === "function") {
      _rng = RNGService.create(_seed);
    } else {
      _rng = createMulberry32(_seed);
    }
  }

  function autoInit() {
    try {
      const sRaw = localStorage.getItem("SEED");
      if (sRaw != null) {
        applySeed(Number(sRaw) >>> 0);
      } else {
        applySeed(((Date.now() % 0xffffffff) >>> 0));
      }
    } catch (_) {
      applySeed(((Date.now() % 0xffffffff) >>> 0));
    }
    return _seed;
  }

  function rng() {
    if (!_rng) autoInit();
    return _rng();
  }

  function int(min, max) {
    if (window.RNGService && typeof RNGService.int === "function") {
      return RNGService.int(rng, min, max);
    }
    return Math.floor(rng() * (max - min + 1)) + min;
  }

  function float(min, max, decimals = 1) {
    if (window.RNGService && typeof RNGService.float === "function") {
      return RNGService.float(rng, min, max, decimals);
    }
    const v = min + rng() * (max - min);
    const p = Math.pow(10, decimals);
    return Math.round(v * p) / p;
  }

  function chance(p) {
    if (window.RNGService && typeof RNGService.chance === "function") {
      return RNGService.chance(rng, p);
    }
    return rng() < p;
  }

  window.RNG = {
    autoInit,
    rng,
    int,
    float,
    chance,
    applySeed,
  };
})();