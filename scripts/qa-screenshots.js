const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:8099';
const OUT = path.join(__dirname, 'shots');
const PAGES = [
  'index.html',
  'about-us.html',
  'services.html',
  'solutions.html',
  'projects.html',
  'contact.html',
  'strat-project.html',
  'privacy-policy.html',
  'terms.html',
  '404.html',
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const msCache = path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'ms-playwright');
  const candidates = [
    'chromium-1248/chrome-win64/chrome.exe',
    'chromium-1228/chrome-win64/chrome.exe',
    'chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe',
  ];
  let executablePath;
  for (const c of candidates) {
    const p = path.join(msCache, c);
    if (fs.existsSync(p)) { executablePath = p; break; }
  }
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const report = [];

  for (const vp of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();

    for (const p of PAGES) {
      const consoleErrors = [];
      const failedReq = [];
      const onMsg = (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); };
      const onFail = (r) => failedReq.push(r.url() + ' :: ' + (r.failure() || {}).errorText);
      page.on('console', onMsg);
      page.on('requestfailed', onFail);

      await page.goto(`${BASE}/${p}?qa=${Date.now()}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(700);
      // trigger every reveal so full-page capture is not blank
      await page.evaluate(() => {
        document.querySelectorAll('.reveal,.reveal-left,.reveal-right').forEach((e) => e.classList.add('revealed'));
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(500);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);

      const file = path.join(OUT, `${vp.name}-${p.replace('.html', '')}.png`);
      await page.screenshot({ path: file, fullPage: true });

      const audit = await page.evaluate(() => {
        const broken = [];
        document.querySelectorAll('img').forEach((i) => {
          if (!i.complete || i.naturalWidth === 0) broken.push(i.currentSrc || i.src);
        });
        const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        const h1 = document.querySelectorAll('h1').length;
        const nav = !!document.querySelector('#navbar .logo img');
        const title = document.title;
        const desc = (document.querySelector('meta[name=description]') || {}).content;
        return { broken, overflow, h1, nav, title, descLen: (desc || '').length, height: document.body.scrollHeight };
      });

      report.push({ vp: vp.name, page: p, consoleErrors, failedReq: failedReq.filter((u) => !u.includes('fonts.g') && !u.includes('cdnjs')), ...audit });
      page.off('console', onMsg);
      page.off('requestfailed', onFail);
    }
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(__dirname, 'qa-report.json'), JSON.stringify(report, null, 2));
  for (const r of report) {
    const flags = [];
    if (r.broken.length) flags.push('BROKEN_IMG:' + r.broken.join(','));
    if (r.consoleErrors.length) flags.push('CONSOLE:' + r.consoleErrors.join(' | '));
    if (r.failedReq.length) flags.push('REQFAIL:' + r.failedReq.join(' | '));
    if (r.overflow > 2) flags.push('H_OVERFLOW:' + r.overflow + 'px');
    if (r.h1 !== 1) flags.push('H1_COUNT:' + r.h1);
    if (!r.nav) flags.push('NO_NAV_LOGO');
    console.log(
      `${(r.vp + '/' + r.page).padEnd(34)} h=${String(r.height).padStart(6)} desc=${r.descLen} ${flags.length ? '<< ' + flags.join(' ; ') : 'ok'}`
    );
  }
})();
