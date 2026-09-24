/* ============================================================
   VALTORIX INFOTECH — site effects (no WebGL, no particles)
   - Hero content parallax (parent wrappers only, never .reveal nodes)
   - Scroll progress bar, magnetic buttons
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 0. Content parallax ---------- */
  function initContentParallax() {
    try {
      var reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
      if (reduce) return;
      var heroWrap = document.querySelector('.hero-content');
      var pageWrap = document.querySelector('.page-hero-body');
      var ticking = false;
      function update() {
        ticking = false;
        var y = window.scrollY || 0;
        if (y > 1200) return; // hero only
        if (heroWrap) heroWrap.style.transform = 'translate3d(0,' + (y * 0.12).toFixed(1) + 'px,0)';
        if (pageWrap) pageWrap.style.transform = 'translate3d(0,' + (y * 0.10).toFixed(1) + 'px,0)';
      }
      window.addEventListener('scroll', function () {
        if (!ticking) { ticking = true; requestAnimationFrame(update); }
      }, { passive: true });
    } catch (err) { /* ignore */ }
  }

  initContentParallax();
  initScrollProgress();
  initMagnetic();

  /* ---------- Scroll progress bar ---------- */
  function initScrollProgress() {
    try {
      var bar = document.createElement('div');
      bar.className = 'scroll-progress';
      document.body.appendChild(bar);
      var ticking = false;
      function update() {
        ticking = false;
        var h = document.documentElement;
        var max = h.scrollHeight - h.clientHeight;
        bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0).toFixed(2) + '%';
      }
      window.addEventListener('scroll', function () {
        if (!ticking) { ticking = true; requestAnimationFrame(update); }
      }, { passive: true });
      update();
    } catch (err) { /* ignore */ }
  }

  /* ---------- Magnetic buttons (desktop) ---------- */
  function initMagnetic() {
    try {
      if (!window.matchMedia('(hover:hover) and (min-width:1024px)').matches) return;
      var btns = document.querySelectorAll('.btn-primary');
      btns.forEach(function (btn) {
        btn.addEventListener('mousemove', function (e) {
          var r = btn.getBoundingClientRect();
          var px = (e.clientX - r.left) / r.width - 0.5;
          var py = (e.clientY - r.top) / r.height - 0.5;
          btn.style.transform = 'translate(' + (px * 8).toFixed(1) + 'px,' + (py * 8).toFixed(1) + 'px)';
        });
        btn.addEventListener('mouseleave', function () { btn.style.transform = ''; });
      });
    } catch (err) { /* ignore */ }
  }
})();