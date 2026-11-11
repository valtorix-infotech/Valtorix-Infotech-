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

  /* ================= desktop ================= */
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(`${BASE}/index.html?t=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2500);

  const st = await page.evaluate(() => {
    const c = document.querySelector('.site-stage');
    const H = window.ValtorixStage;
    return {
      exists: !!c,
      opacity: c ? getComputedStyle(c).opacity : 'n/a',
      fixed: c ? getComputedStyle(c).position : 'n/a',
      zIndex: c ? getComputedStyle(c).zIndex : 'n/a',
      instances: H ? H.instances : -1,
      refusal: H ? H.lastRefusal : 'no-init',
      geo: !!window.VALTORIX_STAGE,
      stages: document.querySelectorAll('canvas[data-stage-root]').length,
      chapters: [...document.querySelectorAll('[data-stage]:not(canvas)')].map((n) => n.getAttribute('data-stage')),
      state: c ? c.__stage : null
    };
  });
  check('stage: canvas present and fixed', st.exists && st.fixed === 'fixed', `z-index ${st.zIndex}`);
  check('stage: exactly one canvas per page', st.stages === 1, `${st.stages} canvases`);
  check('stage: geometry loaded', st.geo, '');
  check('stage: scene mounted', st.instances === 1, `instances=${st.instances} refusal=${st.refusal}`);
  check('stage: canvas revealed', st.opacity === '1', 'opacity=' + st.opacity);
  check('stage: chapters wired', st.chapters.join(',') === 'hero,capabilities,work,numbers,process,cta',
    st.chapters.join(','));

  const shot = await page.screenshot({ path: path.join(OUT, 'stage-hero.png') });
  const lit = require('./qa-pixels.js').countDistinct(shot);
  check('stage: pixels rendered', lit > 20000, `${lit} non-background pixels`);

  /* ---- scroll drives the world ---- */
  const marks = [];
  for (const y of [0, 900, 2200, 4200, 6500]) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(900);
    const m = await page.evaluate(() => {
      const c = document.querySelector('.site-stage');
      return { scrollY: window.scrollY, state: c.__stage };
    });
    marks.push(m);
    console.log(`    scrollY=${String(m.scrollY).padStart(5)} camZ=${m.state ? m.state.camZ.toFixed(1) : '?'} sx=${m.state ? m.state.sx.toFixed(2) : '?'} size=${m.state ? m.state.size.toFixed(2) : '?'}`);
  }
  const camZMoved = Math.abs(marks[marks.length - 1].state.camZ - marks[0].state.camZ) > 4;
  check('stage: the camera travels through the world as you scroll', camZMoved,
    `camZ ${marks[0].state.camZ.toFixed(1)} -> ${marks[marks.length - 1].state.camZ.toFixed(1)}`);
  const markMoved = Math.abs(marks[marks.length - 1].state.sx - marks[0].state.sx) > 0.05 ||
    Math.abs(marks[marks.length - 1].state.size - marks[0].state.size) > 0.02;
  check('stage: the mark changes position and scale between chapters', markMoved,
    `sx ${marks[0].state.sx.toFixed(2)} -> ${marks[marks.length - 1].state.sx.toFixed(2)}`);

  /* ---- content stays readable: cards are solid even over the stage ---- */
  const legibility = await page.evaluate(() => {
    const card = document.querySelector('.stage-section .card');
    const desc = document.querySelector('.stage-section .section-desc');
    const bg = card ? getComputedStyle(card).backgroundColor : '';
    return { cardBg: bg, descColor: desc ? getComputedStyle(desc).color : '' };
  });
  check('stage: content cards stay solid over the scene',
    legibility.cardBg === 'rgb(255, 255, 255)', legibility.cardBg);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, 'stage-home.png') });
  await page.evaluate(() => window.scrollTo(0, 2400));
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, 'stage-scrolled.png') });

  check('stage: no console errors', errors.length === 0, errors.join(' | '));

  /* ---- inner page ---- */
  await page.goto(`${BASE}/services.html?t=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2200);
  const inner = await page.evaluate(() => {
    const c = document.querySelector('.site-stage');
    const H = window.ValtorixStage;
    return {
      instances: H ? H.instances : -1,
      opacity: c ? getComputedStyle(c).opacity : 'n/a',
      canvases: document.querySelectorAll('canvas').length
    };
  });
  check('stage: inner pages use the same single canvas', inner.instances === 1 && inner.canvases === 1,
    `instances=${inner.instances} canvases=${inner.canvases}`);
  check('stage: inner page reveals the scene', inner.opacity === '1', 'opacity=' + inner.opacity);
  await page.screenshot({ path: path.join(OUT, 'stage-inner.png') });

  await ctx.close();

  /* ================= reduced motion ================= */
  const rmCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const rm = await rmCtx.newPage();
  const rmErrors = [];
  rm.on('pageerror', (e) => rmErrors.push(e.message));
  await rm.goto(`${BASE}/index.html?t=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
  await rm.waitForTimeout(2200);
  const rmState = await rm.evaluate(() => {
    const c = document.querySelector('.site-stage');
    const H = window.ValtorixStage;
    return {
      opacity: c ? getComputedStyle(c).opacity : 'n/a',
      instances: H ? H.instances : -1,
      refusal: H ? H.lastRefusal : 'no-init',
      h1: document.querySelector('.hero h1').textContent.trim().slice(0, 28)
    };
  });
  check('fallback: reduced motion mounts no 3D scene',
    rmState.opacity === '0' && rmState.instances === 0, `refusal=${rmState.refusal}`);
  check('fallback: reduced motion still renders the page', rmState.h1.length > 5, rmState.h1);
  check('fallback: reduced motion throws no errors', rmErrors.length === 0, rmErrors.join(' | '));
  await rm.screenshot({ path: path.join(OUT, 'fallback-reduced-motion.png') });
  await rmCtx.close();

  /* ================= no WebGL ================= */
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
  await no.goto(`${BASE}/index.html?t=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
  await no.waitForTimeout(2200);
  const noState = await no.evaluate(() => {
    const c = document.querySelector('.site-stage');
    const H = window.ValtorixStage;
    return {
      opacity: c ? getComputedStyle(c).opacity : 'n/a',
      instances: H ? H.instances : -1,
      refusal: H ? H.lastRefusal : 'no-init',
      h1: document.querySelector('.hero h1').textContent.trim().slice(0, 28)
    };
  });
  check('fallback: no WebGL mounts no scene',
    noState.opacity === '0' && noState.instances === 0, `refusal=${noState.refusal}`);
  check('fallback: no WebGL still renders the page', noState.h1.length > 5, noState.h1);
  check('fallback: no WebGL throws no errors', noErrors.length === 0, noErrors.join(' | '));
  await no.screenshot({ path: path.join(OUT, 'fallback-no-webgl.png') });
  await noCtx.close();

  /* ================= mobile ================= */
  const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const m = await mCtx.newPage();
  await m.goto(`${BASE}/index.html?t=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
  await m.waitForTimeout(2200);
  const mState = await m.evaluate(() => {
    const c = document.querySelector('.site-stage');
    window.scrollTo(300, 0);
    const scrolledX = window.scrollX;
    window.scrollTo(0, 0);
    return {
      bufferW: c.width,
      cssW: Math.round(c.getBoundingClientRect().width),
      dpr: window.devicePixelRatio,
      canScrollX: scrolledX,
      instances: window.ValtorixStage ? window.ValtorixStage.instances : -1
    };
  });
  check('mobile: the stage renders', mState.instances === 1, 'instances=' + mState.instances);
  check('mobile: canvas buffers are capped', mState.bufferW <= mState.cssW * 1.6 + 2,
    `css=${mState.cssW} buffer=${mState.bufferW} dpr=${mState.dpr}`);
  check('mobile: the page cannot be scrolled sideways', mState.canScrollX === 0,
    'scrollX=' + mState.canScrollX);
  await m.screenshot({ path: path.join(OUT, 'stage-mobile.png') });
  await mCtx.close();

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    failed.forEach((f) => console.log('  - ' + f.name + (f.detail ? ' :: ' + f.detail : '')));
    process.exitCode = 1;
  }
})();
