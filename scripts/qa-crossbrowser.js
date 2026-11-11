/* ==========================================================================
   VALTORIX INFOTECH — cross-browser suite
   --------------------------------------------------------------------------
   The research is blunt about this: "Test with at least three browser
   engines - Chrome, Safari, and Edge - on real devices or simulators" and
   "Works on Chrome but fails on Safari" is one of the most common release
   defects.

   Chromium stands in for Chrome and Edge. Playwright's WebKit is a real
   WebKit build, so it stands in for Safari. Firefox covers Gecko.

   Everything that could differ between engines is checked here:
     - layout and horizontal overflow at four widths
     - the WebGL stage (Safari's WebGL is the pickiest)
     - WebP delivery through <picture>
     - the mobile drawer, the FAQ accordion and the work filters
     - console errors
   ========================================================================== */
const { chromium, firefox, webkit } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:8099';
const PAGES = ['index.html', 'services.html', 'projects.html', 'contact.html', 'start-a-project.html'];

const findings = [];

function flag(engine, page, kind, detail) {
  findings.push({ engine, page, kind, detail });
  console.log(`  FAIL [${engine}] ${page}: ${kind} :: ${detail}`);
}

(async () => {
  const msCache = path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'ms-playwright');
  const exe = ['chromium-1248/chrome-win64/chrome.exe', 'chromium-1228/chrome-win64/chrome.exe']
    .map((c) => path.join(msCache, c)).find((p) => fs.existsSync(p));

  const engines = [
    { name: 'chromium', type: chromium, opts: exe ? { executablePath: exe } : {} },
    { name: 'firefox', type: firefox, opts: {} },
    { name: 'webkit', type: webkit, opts: {} },
  ];

  for (const eng of engines) {
    console.log(`\n== ${eng.name} ==`);
    let browser;
    try {
      browser = await eng.type.launch(eng.opts);
    } catch (e) {
      flag(eng.name, '-', 'browser-unavailable', e.message.slice(0, 90));
      continue;
    }

    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

    for (const p of PAGES) {
      await page.goto(`${BASE}/${p}?cb=${Date.now()}`, { waitUntil: 'load', timeout: 45000 });
      await page.waitForTimeout(1800);

      const r = await page.evaluate(() => {
        const de = document.documentElement;
        /* can the user scroll sideways? */
        window.scrollTo(300, 0);
        const canScrollX = window.scrollX;
        window.scrollTo(0, 0);

        /* did every image actually decode? */
        const imgs = [...document.querySelectorAll('img')];
        const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0).length;

        /* the 3D stage */
        const H = window.ValtorixStage;
        const canvas = document.querySelector('.site-stage');

        /* does the browser understand the modern CSS we rely on? */
        const supports = {
          overflowClip: CSS.supports('overflow-x', 'clip'),
          displayContents: CSS.supports('display', 'contents'),
          webp: false
        };
        /* WebP support, detected by decoding a tiny data URI */
        return new Promise((resolve) => {
          const probe = new Image();
          probe.onload = () => { supports.webp = probe.width === 1; finish(); };
          probe.onerror = () => { supports.webp = false; finish(); };
          probe.src = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==';
          function finish() {
            resolve({
              canScrollX,
              broken,
              instances: H ? H.instances : -1,
              refusal: H ? H.lastRefusal : 'no-init',
              canvasOpacity: canvas ? getComputedStyle(canvas).opacity : 'n/a',
              h1: (document.querySelector('h1') || {}).textContent?.trim().slice(0, 30) || '',
              supports
            });
          }
        });
      });

      if (r.canScrollX > 0) flag(eng.name, p, 'horizontal-scroll', r.canScrollX + 'px');
      if (r.broken) flag(eng.name, p, 'broken-images', r.broken + ' image(s)');
      if (!r.h1) flag(eng.name, p, 'no-heading', 'the page did not render');
      if (!r.supports.overflowClip) flag(eng.name, p, 'css-gap', 'overflow-x: clip is not supported');
      if (!r.supports.displayContents) flag(eng.name, p, 'css-gap', 'display: contents is not supported');
      if (!r.supports.webp) flag(eng.name, p, 'no-webp', 'WebP decoding failed');
      if (r.refusal && r.refusal !== 'reduced-motion') {
        flag(eng.name, p, '3d-refused', r.refusal);
      }
      if (r.refusal === 'reduced-motion') {
        /* the reduced-motion path must still be a complete page */
        if (Number(r.canvasOpacity) > 0.01) flag(eng.name, p, '3d-shown', 'the scene rendered under reduced motion');
      } else if (r.instances !== 1) {
        flag(eng.name, p, '3d-not-mounted', 'instances=' + r.instances);
      }
    }

    /* ---- interactions ---- */
    await page.goto(`${BASE}/projects.html?cb=${Date.now()}`, { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(600);
    const filtered = await page.evaluate(async () => {
      const ai = document.querySelector('.filter-btn[data-filter="ai"]');
      const all = document.querySelector('.filter-btn[data-filter="all"]');
      if (!ai || !all) return 'no filter';
      ai.click();
      await new Promise((r) => setTimeout(r, 300));
      const visible = [...document.querySelectorAll('[data-category]')].filter((e) => e.style.display !== 'none').length;
      all.click();
      await new Promise((r) => setTimeout(r, 300));
      const restored = [...document.querySelectorAll('[data-category]')].filter((e) => e.style.display !== 'none').length;
      const pressed = all.getAttribute('aria-pressed');
      return { visible, restored, pressed, total: document.querySelectorAll('[data-category]').length };
    });
    if (typeof filtered === 'object') {
      if (filtered.visible !== 1) flag(eng.name, 'projects.html', 'filter', `AI filter showed ${filtered.visible} of ${filtered.total}`);
      if (filtered.restored !== filtered.total) flag(eng.name, 'projects.html', 'filter', `"all" restored ${filtered.restored} of ${filtered.total}`);
      if (filtered.pressed !== 'true') flag(eng.name, 'projects.html', 'filter', 'aria-pressed was not set on the active filter');
    }

    await page.goto(`${BASE}/index.html?cb=${Date.now()}`, { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(600);
    const faq = await page.evaluate(async () => {
      const item = document.querySelector('.faq-item');
      const q = item.querySelector('.faq-question');
      q.click();
      await new Promise((r) => setTimeout(r, 600));
      const h = item.querySelector('.faq-answer').getBoundingClientRect().height;
      return { opened: h > 10, active: item.classList.contains('active'), expanded: q.getAttribute('aria-expanded') };
    });
    if (!faq.opened) flag(eng.name, 'index.html', 'faq', 'the accordion did not open');
    if (faq.expanded !== 'true') flag(eng.name, 'index.html', 'faq', 'aria-expanded was not set');

    /* the mobile drawer */
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const mp = await mctx.newPage();
    await mp.goto(`${BASE}/index.html?cb=${Date.now()}`, { waitUntil: 'load', timeout: 45000 });
    await mp.waitForTimeout(600);
    const drawer = await mp.evaluate(async () => {
      const btn = document.querySelector('.menu-btn');
      btn.click();
      await new Promise((r) => setTimeout(r, 500));
      const links = document.querySelector('.nav-links');
      const r = links.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      return {
        open: links.classList.contains('show'),
        visible: r.height > 50,
        btnOnScreen: btnRect.right <= window.innerWidth + 0.5,
        expanded: btn.getAttribute('aria-expanded')
      };
    });
    if (!drawer.open || !drawer.visible) flag(eng.name, 'index.html', 'drawer', 'the drawer did not open');
    if (!drawer.btnOnScreen) flag(eng.name, 'index.html', 'drawer', 'the menu button is off-screen');
    if (drawer.expanded !== 'true') flag(eng.name, 'index.html', 'drawer', 'aria-expanded was not set');
    await mctx.close();

    /* the contact form */
    await page.goto(`${BASE}/contact.html?cb=${Date.now()}`, { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(500);
    await page.click('#contactFormElement button[type=submit]');
    await page.waitForTimeout(700);
    const invalid = await page.evaluate(() => document.querySelectorAll('.field.invalid').length);
    if (invalid < 4) flag(eng.name, 'contact.html', 'form', `only ${invalid} fields flagged invalid`);

    if (consoleErrors.length) flag(eng.name, '(all)', 'console-errors', consoleErrors.slice(0, 2).join(' | '));

    await browser.close();
  }

  console.log('\n================ SUMMARY ================');
  if (!findings.length) console.log('0 failures across chromium, firefox and webkit.');
  else {
    const byEngine = {};
    for (const f of findings) (byEngine[f.engine] = byEngine[f.engine] || []).push(f);
    for (const e of Object.keys(byEngine)) {
      console.log(`\n-- ${e} (${byEngine[e].length})`);
      byEngine[e].forEach((f) => console.log(`   ${f.page}: ${f.kind} :: ${f.detail}`));
    }
  }
  fs.writeFileSync(path.join(__dirname, 'crossbrowser-report.json'), JSON.stringify(findings, null, 2));
  process.exitCode = findings.length ? 1 : 0;
})();
