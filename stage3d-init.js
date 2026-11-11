/* ==========================================================================
   VALTORIX INFOTECH — 3D stage bootstrap
   --------------------------------------------------------------------------
   Mounts the scenes after the page has painted. The rule from the immersive-3D
   research: WebGL must never be the LCP element, so the copy is on screen
   before a single line of this runs.

     canvas[data-stage-root] -> the full-page world behind the page

   The static poster that is already in the HTML stays visible underneath, so
   a visitor without WebGL, on a low-power device, or with reduced motion
   enabled sees exactly the same layout with no flash.
   ========================================================================== */
(function () {
  "use strict";

  var started = false;
  var booted = false;

  function mount(canvas, fn, opts) {
    try {
      fn(canvas, opts || {});
    } catch (err) {
      if (window.console) console.warn("stage3d:", err);
    }
  }

  function boot() {
    if (booted) return;
    booted = true;
    var S = window.ValtorixStage;
    if (!S) return;

    var stages = document.querySelectorAll("canvas[data-stage-root]");
    for (var i = 0; i < stages.length; i++) {
      mount(stages[i], S.mountStage, parseOpts(stages[i]));
    }

  }

  function parseOpts(canvas) {
    var opts = {};
    try {
      opts = JSON.parse(canvas.getAttribute("data-hero3d") || canvas.getAttribute("data-stage-opts") || "{}");
    } catch (e) {
      opts = {};
    }
    return opts;
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
    /* requestAnimationFrame is suspended in a background tab, so the mount
       must never depend on it alone. */
    var done = false;
    function go() {
      if (done) return;
      done = true;
      fn();
    }
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(go);
    });
    window.setTimeout(go, 250);
  }

  if (!window.ValtorixStage) return;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { afterPaint(start); });
  } else {
    afterPaint(start);
  }

  /* An engaged visitor should not wait. */
  var once = function () {
    start();
    ["pointerdown", "pointermove", "scroll", "keydown", "touchstart", "wheel"].forEach(function (evt) {
      window.removeEventListener(evt, once);
    });
  };
  ["pointerdown", "pointermove", "scroll", "keydown", "touchstart", "wheel"].forEach(function (evt) {
    window.addEventListener(evt, once, { passive: true, once: true });
  });

  /* Hard cap — the page is never left without its world. */
  window.setTimeout(start, 1800);
})();
