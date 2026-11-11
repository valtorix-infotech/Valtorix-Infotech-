const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:8099';
const OUT = path.join(__dirname, 'shots3d');
const results = [];

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const msCache = path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'ms-playwright');
  const exe = ['chromium-1248/chrome-win64/chrome.exe', 'chromium-1228/chrome-win64/chrome.exe']
    .map((c) => path.join(msCache, c)).find((p) => fs.existsSync(p));
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});

  /* ---------- desktop hero ---------- */
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(`${BASE}/index.html?t=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);

  const st = await page.evaluate(() => {
    const c = document.querySelector('.hero-canvas');
    const p = document.querySelector('.hero-poster');
    const gl = c.getContext('webgl');
    const H = window.ValtorixHero3D;
    return {
      canvasOpacity: getComputedStyle(c).opacity,
      posterOpacity: getComputedStyle(p).opacity,
      is3d: c.parentElement.classList.contains('is-3d'),
      hasGeo: !!window.VALTORIX_HERO_GEOMETRY,
      tris: window.VALTORIX_HERO_GEOMETRY ? window.VALTORIX_HERO_GEOMETRY.indices.length / 3 : 0,
      glOk: !!gl,
      glError: gl ? gl.getError() : -1,
      instances: H ? H.instances : -1,
      refusal: H ? H.lastRefusal : 'no-init',
      inlineOpacity: c.style.opacity || '(none)',
      readyState: document.readyState
    };
  });
  check('3d: geometry loaded', st.hasGeo, `${st.tris} triangles`);
  check('3d: WebGL context alive', st.glOk, 'glError=' + st.glError);
  console.log('    state:', JSON.stringify(st));

  // Prove pixels were actually drawn by analysing the rendered pixels of the
  // hero frame (readPixels after compositing returns an empty buffer).
  const frameShot = await page.locator('.hero-frame').screenshot({ path: path.join(OUT, 'hero-desktop.png') });
  const lit = require('./_pixels.js').countDistinct(frameShot);
  check('3d: pixels actually rendered', lit > 2000, `${lit} non-background pixels`);
  check('3d: canvas faded in over the poster', st.is3d && st.canvasOpacity === '1' && st.posterOpacity === '0',
    `canvas=${st.canvasOpacity} poster=${st.posterOpacity}`);
  check('3d: no console errors', errors.length === 0, errors.join(' | '));

  // the headline + primary CTA must be visible without scrolling at 1280x720
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(400);
  const above = await page.evaluate(() => {
    const h1 = document.querySelector('.hero h1');
    const cta = document.querySelector('.hero-buttons .btn-primary');
    return { h1: h1.getBoundingClientRect().bottom, cta: cta.getBoundingClientRect().bottom };
  });
  check('layout: headline and CTA visible at 1280x720', above.h1 < 720 && above.cta < 720,
    `h1 bottom=${Math.round(above.h1)} cta bottom=${Math.round(above.cta)}`);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(600);
  await page.locator('.hero-frame').screenshot({ path: path.join(OUT, 'hero-desktop.png') });
  await page.locator('.hero').screenshot({ path: path.join(OUT, 'hero-section.png') });

  /* ---------- inner page hero ---------- */
  await page.goto(`${BASE}/services.html?t=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2200);
  const innerState = await page.evaluate(() => {
    const c = document.querySelector('.page-hero-art .hero-canvas');
    return c ? { found: true, is3d: c.parentElement.classList.contains('is-3d') } : { found: false };
  });
  const innerShot = await page.locator('.page-hero-art').screenshot({ path: path.join(OUT, 'inner-hero.png') });
  const innerLit = require('./_pixels.js').countDistinct(innerShot);
  check('3d: inner page hero renders', innerState.found && innerState.is3d && innerLit > 1500,
    innerState.found ? `is3d=${innerState.is3d} lit=${innerLit}` : 'canvas missing');

  await ctx.close();

  /* ---------- reduced motion fallback ---------- */
  const rmCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const rm = await rmCtx.newPage();
  const rmErrors = [];
  rm.on('pageerror', (e) => rmErrors.push(e.message));
  await rm.goto(`${BASE}/index.html?t=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await rm.waitForTimeout(2000);
  const rmState = await rm.evaluate(() => {
    const c = document.querySelector('.hero-canvas');
    const p = document.querySelector('.hero-poster');
    return {
      canvasOpacity: getComputedStyle(c).opacity,
      posterOpacity: getComputedStyle(p).opacity,
      is3d: c.parentElement.classList.contains('is-3d')
    };
  });
  check('fallback: reduced motion keeps the static poster',
    rmState.canvasOpacity === '0' && rmState.posterOpacity === '1' && !rmState.is3d,
    `canvas=${rmState.canvasOpacity} poster=${rmState.posterOpacity}`);
  check('fallback: reduced motion throws no errors', rmErrors.length === 0, rmErrors.join(' | '));
  await rm.locator('.hero-frame').screenshot({ path: path.join(OUT, 'fallback-reduced-motion.png') });
  await rmCtx.close();

  /* ---------- no WebGL fallback ---------- */
  const noCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const no = await noCtx.newPage();
  const noErrors = [];
  no.on('pageerror', (e) => noErrors.push(e.message));
  await no.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type) {
      if (type === 'webgl' || type === 'experimental-webgl') return null;
      return orig.apply(this, arguments);
    };
  });
  await no.goto(`${BASE}/index.html?t=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await no.waitForTimeout(2000);
  const noState = await no.evaluate(() => {
    const c = document.querySelector('.hero-canvas');
    const p = document.querySelector('.hero-poster');
    return {
      canvasOpacity: getComputedStyle(c).opacity,
      posterOpacity: getComputedStyle(p).opacity,
      is3d: c.parentElement.classList.contains('is-3d'),
      h1: document.querySelector('.hero h1').textContent.trim().slice(0, 30)
    };
  });
  check('fallback: no WebGL keeps the static poster',
    noState.canvasOpacity === '0' && noState.posterOpacity === '1' && !noState.is3d,
    `canvas=${noState.canvasOpacity} poster=${noState.posterOpacity}`);
  check('fallback: no WebGL page still renders the headline', noState.h1.length > 5, noState.h1);
  check('fallback: no WebGL throws no errors', noErrors.length === 0, noErrors.join(' | '));
  await no.locator('.hero-frame').screenshot({ path: path.join(OUT, 'fallback-no-webgl.png') });
  await noCtx.close();

  /* ---------- mobile ---------- */
  const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const m = await mCtx.newPage();
  await m.goto(`${BASE}/index.html?t=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await m.waitForTimeout(2200);
  const mState = await m.evaluate(() => {
    const c = document.querySelector('.hero-canvas');
    const h1 = document.querySelector('.hero h1').getBoundingClientRect();
    const frame = document.querySelector('.hero-frame').getBoundingClientRect();
    // measure the way a visitor experiences it: can the page actually be
    // scrolled sideways?
    window.scrollTo(300, 0);
    const canScrollX = window.scrollX;
    window.scrollTo(0, 0);
    return {
      dpr: window.devicePixelRatio,
      bufferW: c.width,
      cssW: Math.round(c.getBoundingClientRect().width),
      h1Bottom: Math.round(h1.bottom),
      frameTop: Math.round(frame.top),
      canScrollX
    };
  });
  check('mobile: canvas buffers are capped', mState.bufferW <= mState.cssW * 1.6 + 2,
    `css=${mState.cssW} buffer=${mState.bufferW} dpr=${mState.dpr}`);
  check('mobile: the page cannot be scrolled sideways', mState.canScrollX === 0,
    'scrollX=' + mState.canScrollX);
  check('mobile: the 3D object sits below the headline', mState.frameTop > mState.h1Bottom,
    `h1 bottom=${mState.h1Bottom} frame top=${mState.frameTop}`);
  await m.screenshot({ path: path.join(OUT, 'mobile-hero.png') });
  await mCtx.close();

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    failed.forEach((f) => console.log('  - ' + f.name + (f.detail ? ' :: ' + f.detail : '')));
    process.exitCode = 1;
  }
})();
