/* ==========================================================================
   VALTORIX INFOTECH — 3D hero bootstrap
   --------------------------------------------------------------------------
   Mounts the WebGL scenes as soon as the page has painted. The rule from the
   performance research: WebGL must never be the LCP element, so the copy is
   already on screen before a single line of this runs.

   The canvas fades in over a static poster that is in the HTML, so a visitor
   without WebGL, on a low-power device, or with reduced motion enabled sees
   exactly the same layout with no flash.
   ========================================================================== */
(function () {
  "use strict";

  var started = false;
  var booted = false;

  function boot() {
    if (booted) return;
    booted = true;
    var canvases = document.querySelectorAll("canvas[data-hero3d]");
    for (var i = 0; i < canvases.length; i++) {
      var canvas = canvases[i];
      var opts = {};
      try {
        opts = JSON.parse(canvas.getAttribute("data-hero3d") || "{}");
      } catch (e) {
        opts = {};
      }
      try {
        window.ValtorixHero3D.mount(canvas, opts);
      } catch (err) {
        /* any failure keeps the static poster — never break the page */
        if (window.console) console.warn("hero3d:", err);
      }
    }
  }

  function start() {
    if (started) return;
    started = true;
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(boot, { timeout: 600 });
    } else {
      window.setTimeout(boot, 60);
    }
  }

  function afterPaint(fn) {
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(fn);
    });
  }

  if (!window.ValtorixHero3D) return;

  /* 1. The normal path: the document is parsed, so the copy can paint.
        Mount one frame later so the headline has already been painted. */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      afterPaint(start);
    });
  } else {
    afterPaint(start);
  }

  /* 2. An engaged visitor should not wait: mount on the first interaction. */
  var once = function () {
    start();
    ["pointerdown", "pointermove", "scroll", "keydown", "touchstart", "wheel"].forEach(function (evt) {
      window.removeEventListener(evt, once);
    });
  };
  ["pointerdown", "pointermove", "scroll", "keydown", "touchstart", "wheel"].forEach(function (evt) {
    window.addEventListener(evt, once, { passive: true, once: true });
  });

  /* 3. Hard cap — the hero is never left without its object. */
  window.setTimeout(start, 1800);
})();
