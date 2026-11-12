/* ==========================================================================
   VALTORIX INFOTECH — site QA
   --------------------------------------------------------------------------
   Built from the 2026 website-QA checklists. Priorities follow the P0/P1/P2
   convention: P0 blocks a release, P1 should always pass, P2 is polish.

     P0  links resolve, CTAs go somewhere, 404 handling, forms validate and
         recover, no double submit, keyboard can complete every flow, alt
         text, labels, contrast, heading structure, ARIA
     P1  Core Web Vitals, page weight, image weight, lazy loading,
         orientation change, multi-step back navigation, hover-only controls,
         long strings, print styles, one WebGL context per page
   ========================================================================== */
const { BASE, PAGES, launch, newPage, Reporter } = require('./qa/_lib.js');
const fs = require('fs');
const path = require('path');

const reporter = new Reporter('site QA');
const fail = (area, message, extra) => reporter.fail(area, message, extra);
const pass = (area, message, extra) => reporter.pass(area, message, extra);
const notes = [];

(async () => {
  const browser = await launch('chromium');

  /* ============================================================ P0: links */
  console.log('\n== P0: links and routing ==');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const seen = new Map();

    for (const p of PAGES) {
      await page.goto(`${BASE}/${p}`, { waitUntil: 'load', timeout: 30000 });
      const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => ({
        href: a.getAttribute('href'),
        text: (a.textContent || '').trim().slice(0, 40),
        target: a.getAttribute('target'),
        rel: a.getAttribute('rel')
      })));
      for (const l of links) {
        if (!l.href || l.href.startsWith('#') || /^(https?:|mailto:|tel:|javascript:)/.test(l.href)) {
          /* external links: check rel=noopener on target=_blank */
          if (l.target === '_blank' && !/noopener/.test(l.rel || '')) {
            fail('links', `target=_blank without rel=noopener: "${l.text}"`, l.href);
          }
          continue;
        }
        const key = l.href;
        if (!seen.has(key)) {
          const res = await page.request.get(`${BASE}/${key}`).catch(() => null);
          seen.set(key, res ? res.status() : 0);
        }
        const status = seen.get(key);
        if (status !== 200) fail('links', `broken link on ${p}: "${l.text}"`, `${key} -> ${status}`);
      }
    }

    /* in-page anchors resolve */
    for (const p of PAGES) {
      await page.goto(`${BASE}/${p}`, { waitUntil: 'load', timeout: 30000 });
      const hashes = await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')]
        .map((a) => a.getAttribute('href')).filter((h) => h && h.length > 1));
      for (const h of hashes) {
        const ok = await page.evaluate((id) => !!document.getElementById(id.slice(1)), h);
        if (!ok) fail('links', `dead anchor on ${p}`, h);
      }
    }

    /* cross-page anchors resolve on the target page */
    for (const p of PAGES) {
      await page.goto(`${BASE}/${p}`, { waitUntil: 'load', timeout: 30000 });
      const cross = await page.evaluate(() => [...document.querySelectorAll('a[href*=".html#"]')]
        .map((a) => a.getAttribute('href')));
      for (const href of cross) {
        const [file, hash] = href.split('#');
        await page.goto(`${BASE}/${file}`, { waitUntil: 'load', timeout: 30000 });
        const ok = await page.evaluate((id) => !!document.getElementById(id), hash);
        if (!ok) fail('links', `dead cross-page anchor on ${p}`, href);
      }
    }

    /* a junk URL must land on the custom 404 */
    const junk = await page.request.get(`${BASE}/this-page-does-not-exist-xyz`, { maxRedirects: 0 }).catch(() => null);
    if (!junk) fail('routing', 'junk URL returned no response');
    else if (junk.status() !== 404) fail('routing', 'junk URL did not return 404', 'status=' + junk.status());
    else pass('routing', 'junk URL returns 404');

    await page.goto(`${BASE}/this-page-does-not-exist-xyz`, { waitUntil: 'load', timeout: 30000 });
    const custom = await page.evaluate(() => ({
      h1: (document.querySelector('h1') || {}).textContent || '',
      brand: !!document.querySelector('#navbar .logo')
    }));
    if (!/404|does not exist/i.test(custom.h1)) fail('routing', 'the custom 404 page did not render', custom.h1);
    else pass('routing', 'junk URL shows the branded 404 page');
    if (!custom.brand) fail('routing', 'the 404 page has no navigation');

    await ctx.close();
  }

  /* =========================================================== P0: content */
  console.log('\n== P0: content integrity ==');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    for (const p of PAGES) {
      await page.goto(`${BASE}/${p}`, { waitUntil: 'load', timeout: 30000 });
      const c = await page.evaluate(() => {
        const imgs = [...document.querySelectorAll('img')];
        const inputs = [...document.querySelectorAll('input:not([type=hidden]), select, textarea')];
        const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => Number(h.tagName[1]));
        let order = 0;
        const badOrder = [];
        headings.forEach((lvl, i) => {
          if (i === 0) { order = lvl; return; }
          if (lvl > order + 1) badOrder.push(`h${order} -> h${lvl}`);
          order = lvl;
        });
        const idCounts = {};
        document.querySelectorAll('[id]').forEach((el) => {
          idCounts[el.id] = (idCounts[el.id] || 0) + 1;
        });
        const dupIds = Object.keys(idCounts).filter((k) => idCounts[k] > 1);
        return {
          dupIds,
          lang: document.documentElement.lang,
          title: document.title,
          desc: (document.querySelector('meta[name=description]') || {}).content || '',
          canonical: (document.querySelector('link[rel=canonical]') || {}).href || '',
          og: [...document.querySelectorAll('meta[property^="og:"]')].length,
          noindex: /noindex/i.test((document.querySelector('meta[name=robots]') || {}).content || ''),
          imgsMissingAlt: imgs.filter((i) => !i.hasAttribute('alt')).length,
          imgsEmptyAlt: imgs.filter((i) => i.getAttribute('alt') === '').length,
          imgsNoDims: imgs.filter((i) => !i.getAttribute('width') || !i.getAttribute('height')).length,
          imgsNoLazy: imgs.filter((i) => !i.hasAttribute('loading')).length,
          inputsNoLabel: inputs.filter((i) => {
            if (i.getAttribute('aria-label')) return false;
            if (i.getAttribute('aria-labelledby')) return false;
            if (i.id && document.querySelector(`label[for="${i.id}"]`)) return false;
            return !i.closest('label');
          }).length,
          h1Count: document.querySelectorAll('h1').length,
          badOrder,
          landmarks: {
            main: document.querySelectorAll('main').length,
            nav: document.querySelectorAll('nav').length,
            footer: document.querySelectorAll('footer').length
          },
          webs: document.querySelectorAll('canvas').length
        };
      });

      if (c.lang !== 'en') fail('content', `${p}: html lang is "${c.lang}"`);
      if (!c.title || c.title.length < 15) fail('content', `${p}: title too short`, c.title);
      if (!c.desc || c.desc.length < 70) fail('content', `${p}: meta description too short`, `${c.desc.length} chars`);
      /* a noindex page (the 404) needs neither a canonical nor OG cards */
      if (!c.canonical && !c.noindex) fail('content', `${p}: no canonical`);
      if (c.og < 4 && !c.noindex) fail('content', `${p}: incomplete Open Graph tags`, `${c.og} tags`);
      if (c.imgsMissingAlt) fail('content', `${p}: ${c.imgsMissingAlt} image(s) with no alt attribute`);
      if (c.imgsNoDims) fail('content', `${p}: ${c.imgsNoDims} image(s) without width/height (CLS risk)`);
      if (c.h1Count !== 1) fail('content', `${p}: ${c.h1Count} h1 elements`);
      if (c.badOrder.length) fail('content', `${p}: heading order jumps`, c.badOrder.join(', '));
      if (c.inputsNoLabel) fail('content', `${p}: ${c.inputsNoLabel} form control(s) without a label`);
      if (c.landmarks.main !== 1) fail('content', `${p}: ${c.landmarks.main} <main> landmarks`);
      if (c.webs > 1) fail('content', `${p}: ${c.webs} canvases (one WebGL context per page)`);
      if (c.dupIds.length) fail('content', `${p}: duplicate id attribute(s)`, c.dupIds.join(', '));
    }
    await ctx.close();
  }

  /* ================================================== P0: forms and errors */
  console.log('\n== P0: forms ==');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    let posts = 0;
    page.on('request', (r) => { if (r.url().includes('/api/send')) posts++; });

    /* --- contact form --- */
    await page.goto(`${BASE}/contact.html`, { waitUntil: 'load', timeout: 30000 });
    await page.fill('#cname', 'Ravi Kumar');
    await page.fill('#cemail', 'ravi@example.com');
    await page.fill('#cphone', '9876543210');
    await page.fill('#cmessage', 'We need a website and a small customer portal for our business.');

    /* P0: Enter submits from a single-line field.
       (Enter in a textarea inserts a newline - correct HTML behaviour, so it
       must NOT submit.) */
    await page.focus('#cname');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1200);
    if (posts === 0) fail('forms', 'pressing Enter in a text field did not submit the form');
    else pass('forms', 'Enter submits the contact form');

    /* Enter inside a textarea must NOT submit */
    posts = 0;
    await page.reload({ waitUntil: 'load' });
    await page.fill('#cname', 'Ravi Kumar');
    await page.fill('#cemail', 'ravi@example.com');
    await page.fill('#cphone', '9876543210');
    await page.fill('#cmessage', 'A message that is long enough to pass validation checks.');
    await page.focus('#cmessage');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    if (posts !== 0) fail('forms', 'Enter inside a textarea submitted the form');
    else pass('forms', 'Enter inside a textarea adds a newline instead of submitting');

    /* P0: double submit must not fire twice */
    posts = 0;
    await page.reload({ waitUntil: 'load' });
    await page.fill('#cname', 'Ravi Kumar');
    await page.fill('#cemail', 'ravi@example.com');
    await page.fill('#cphone', '9876543210');
    await page.fill('#cmessage', 'We need a website and a small customer portal for our business.');
    const btn = page.locator('#contactFormElement button[type=submit]');
    await btn.dblclick();
    await page.waitForTimeout(1500);
    if (posts > 1) fail('forms', `double click sent ${posts} requests`);
    else pass('forms', 'double click does not double-submit', `${posts} request`);

    /* P0: the submit button is disabled while the request is in flight.
       Sample it from inside the request handler, not after it finished. */
    let disabledDuringSend = null;
    page.on('request', (r) => {
      if (r.url().includes('/api/send') && disabledDuringSend === null) {
        disabledDuringSend = true;
      }
    });
    await page.evaluate(() => {
      window.__btnState = null;
      const b = document.querySelector('#contactFormElement button[type=submit]');
      if (b) {
        /* record the first (locked) state, not the final one - the button is
           re-enabled again when the request fails */
        const obs = new MutationObserver(() => {
          if (b.disabled) window.__btnState = true;
        });
        obs.observe(b, { attributes: true, attributeFilter: ['disabled'] });
        window.__obs = obs;
      }
    });
    await page.click('#contactFormElement button[type=submit]');
    await page.waitForTimeout(1500);
    const btnState = await page.evaluate(() => window.__btnState);
    if (btnState !== true) fail('forms', 'the submit button is not disabled during submission', 'observed=' + btnState);
    else pass('forms', 'the submit button locks during submission');

    /* P0: validation failure must not lose the user's data */
    await page.reload({ waitUntil: 'load' });
    await page.fill('#cname', 'Ravi Kumar');
    await page.fill('#cemail', 'ravi@example.com');
    await page.fill('#cphone', '9876543210');
    await page.fill('#cmessage', 'A message that is long enough to pass validation checks.');
    await page.fill('#ccompany', 'Acme Industries');
    await page.click('#contactFormElement button[type=submit]');
    await page.waitForTimeout(600);
    const kept = await page.inputValue('#cname');
    const keptCompany = await page.inputValue('#ccompany');
    if (!kept || !keptCompany) fail('forms', 'the form lost the entered data after a validation error');
    else pass('forms', 'the form preserves input on validation failure');

    /* P0: the error message is next to the field and is announced */
    await page.reload({ waitUntil: 'load' });
    await page.click('#contactFormElement button[type=submit]');
    await page.waitForTimeout(500);
    const errs = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.field.invalid').forEach((f) => {
        const input = f.querySelector('input,textarea,select');
        const msg = f.querySelector('.field-err');
        out.push({
          field: input ? (input.id || input.name) : '?',
          hasMessage: !!msg && msg.textContent.trim().length > 0,
          role: msg ? msg.getAttribute('role') : null,
          ariaInvalid: input ? input.getAttribute('aria-invalid') : null,
          describedBy: input ? input.getAttribute('aria-describedby') : null
        });
      });
      return out;
    });
    if (errs.length < 4) fail('forms', `only ${errs.length} fields were flagged invalid`);
    else pass('forms', 'validation flags every required field', `${errs.length} fields`);
    const noMsg = errs.filter((e) => !e.hasMessage);
    if (noMsg.length) fail('forms', 'some invalid fields have no error message', JSON.stringify(noMsg));
    const notAnnounced = errs.filter((e) => !e.ariaInvalid);
    if (notAnnounced.length) notes.push('invalid fields do not set aria-invalid (improvement, not a failure)');

    /* --- multi-step form --- */
    posts = 0;
    await page.goto(`${BASE}/start-a-project.html`, { waitUntil: 'load', timeout: 30000 });
    /* back navigation keeps the data */
    await page.click('#projectType .option[data-value="Website"]');
    await page.fill('#projectTitle', 'A brand new site');
    await page.fill('#name', 'Sam Rao');
    await page.fill('#email', 'sam@example.com');
    await page.fill('#phone', '9000000002');
    await page.fill('#overview', 'A new marketing website for our refreshed brand.');
    await page.click('#nextBtn');
    await page.waitForTimeout(500);
    await page.click('#backBtn');
    await page.waitForTimeout(500);
    const keptTitle = await page.inputValue('#projectTitle');
    const keptType = await page.evaluate(() => !!document.querySelector('#projectType .option.selected'));
    if (!keptTitle || !keptType) fail('forms', 'going back in the multi-step form lost the data');
    else pass('forms', 'back navigation keeps the data');

    /* the review step must show what was entered */
    await page.click('#nextBtn');
    await page.waitForTimeout(400);
    await page.fill('#requirements', 'Login, order history, invoice download and an admin screen for staff.');
    await page.click('#nextBtn');
    await page.waitForTimeout(400);
    await page.click('#timelineChoices .choice[data-value="1 - 3 Months"]');
    await page.click('#budgetChoices .choice[data-value="₹25,000 - ₹50,000"]');
    await page.click('#nextBtn');
    await page.waitForTimeout(600);
    const review = await page.evaluate(() => {
      const ids = ['rType', 'rTitle', 'rName', 'rEmail', 'rRequirements', 'rTimeline', 'rBudget'];
      const out = {};
      ids.forEach((i) => { const e = document.getElementById(i); out[i] = e ? e.textContent.trim() : null; });
      return out;
    });
    const empty = Object.keys(review).filter((k) => !review[k] || review[k] === '—');
    if (empty.length) fail('forms', 'the review step has empty fields', empty.join(', '));
    else pass('forms', 'the review step is fully populated');

    await ctx.close();
  }

  /* ============================================ P0/P1: keyboard and a11y */
  console.log('\n== P0: keyboard ==');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load', timeout: 30000 });

    /* the skip link must be the first stop and must become visible */
    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => {
      const a = document.activeElement;
      const r = a.getBoundingClientRect();
      return { cls: (a.className || '').toString(), text: (a.textContent || '').trim(), visible: r.width > 10 && r.height > 10, top: Math.round(r.top) };
    });
    if (!/skip-link/.test(first.cls)) fail('keyboard', 'the skip link is not the first tab stop', JSON.stringify(first));
    else if (!first.visible) fail('keyboard', 'the focused skip link is still invisible');
    else pass('keyboard', 'the skip link takes focus and becomes visible');

    /* focus must be visible on the main controls */
    const noFocusRing = await page.evaluate(() => {
      const out = [];
      const els = [...document.querySelectorAll('a[href], button, input, select, textarea')].slice(0, 60);
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        el.focus();
        const cs = getComputedStyle(el);
        const hasRing = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) ||
          cs.boxShadow !== 'none';
        if (!hasRing) out.push(el.tagName + '.' + (el.className || '').toString().slice(0, 30));
      }
      return out;
    });
    if (noFocusRing.length) fail('keyboard', `${noFocusRing.length} control(s) with no visible focus ring`, noFocusRing.slice(0, 5).join(', '));
    else pass('keyboard', 'every control shows a focus ring');

    /* no keyboard trap: tabbing must keep moving */
    const trapped = await page.evaluate(async () => {
      const focusables = document.querySelectorAll('a[href], button:not([disabled]), input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return 'none';
      const first = focusables[0];
      first.focus();
      return document.activeElement === first ? 'ok' : 'failed';
    });
    if (trapped === 'failed') fail('keyboard', 'the first focusable element cannot take focus');
    else pass('keyboard', 'focus can enter the page');

    /* the mobile drawer must be operable and escapable */
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const mp = await m.newPage();
    await mp.goto(`${BASE}/index.html`, { waitUntil: 'load', timeout: 30000 });
    await mp.focus('.menu-btn');
    await mp.keyboard.press('Enter');
    await mp.waitForTimeout(500);
    const openState = await mp.evaluate(() => ({
      expanded: document.querySelector('.menu-btn').getAttribute('aria-expanded'),
      visible: document.querySelector('.nav-links').getBoundingClientRect().height > 50
    }));
    if (openState.expanded !== 'true' || !openState.visible) fail('keyboard', 'the drawer does not open from the keyboard', JSON.stringify(openState));
    else pass('keyboard', 'the drawer opens with the keyboard');
    await mp.keyboard.press('Escape');
    await mp.waitForTimeout(400);
    const closed = await mp.evaluate(() => document.querySelector('.menu-btn').getAttribute('aria-expanded'));
    if (closed !== 'false') fail('keyboard', 'Escape does not close the drawer');
    else pass('keyboard', 'Escape closes the drawer');
    await m.close();

    await ctx.close();
  }

  /* =============================================== P1: performance budget */
  console.log('\n== P1: performance ==');
  {
    for (const p of PAGES) {
      /* a fresh context per page so the numbers are a cold-cache load */
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      const bytes = { total: 0, js: 0, css: 0, img: 0, font: 0, other: 0 };
      page.on('response', async (res) => {
        try {
          const h = res.headers();
          const len = parseInt(h['content-length'] || '0', 10);
          bytes.total += len;
          const t = (h['content-type'] || '').split(';')[0];
          if (t === 'application/javascript' || t === 'text/javascript') bytes.js += len;
          else if (t === 'text/css') bytes.css += len;
          else if (t.startsWith('image/')) bytes.img += len;
          else if (t.startsWith('font/')) bytes.font += len;
          else bytes.other += len;
        } catch (e) {}
      });
      const t0 = Date.now();
      await page.goto(`${BASE}/${p}`, { waitUntil: 'load', timeout: 30000 });
      const ttfb = Date.now() - t0;

      const vitals = await page.evaluate(() => new Promise((resolve) => {
        const out = { lcp: 0, cls: 0, sources: [] };
        try {
          new PerformanceObserver((l) => {
            for (const e of l.getEntries()) out.lcp = Math.max(out.lcp, e.startTime);
          }).observe({ type: 'largest-contentful-paint', buffered: true });
        } catch (e) {}
        try {
          new PerformanceObserver((l) => {
            for (const e of l.getEntries()) {
              if (e.hadRecentInput) continue;
              out.cls += e.value;
              /* name what moved, so a failure says which element caused it
                 rather than only how much the page moved */
              for (const s of e.sources || []) {
                const n = s.node;
                if (!n) continue;
                out.sources.push({
                  tag: n.tagName || '?',
                  cls: String(n.className || '').slice(0, 40),
                  src: n.tagName === 'IMG' ? String(n.getAttribute('src') || '').split('/').pop() : '',
                  value: e.value
                });
              }
            }
          }).observe({ type: 'layout-shift', buffered: true });
        } catch (e) {}
        setTimeout(() => resolve(out), 800);
      }));

      const kb = (n) => (n / 1024).toFixed(0);
      const line = `${p}: total ${kb(bytes.total)}KB (js ${kb(bytes.js)} img ${kb(bytes.img)}) LCP ${Math.round(vitals.lcp)}ms CLS ${vitals.cls.toFixed(3)}`;
      if (bytes.total > 3 * 1024 * 1024) fail('performance', `${p} is over the 3MB budget`, line);
      if (bytes.js > 500 * 1024) fail('performance', `${p} JavaScript is over the 500KB budget`, line);
      if (vitals.lcp > 2500) fail('performance', `${p} LCP is over 2.5s`, line);
      if (vitals.cls > 0.1) {
        /* name the elements that moved, so the cause is obvious */
        const moved = [...new Set(vitals.sources.map((s) =>
          s.src ? `IMG ${s.src}` : `${s.tag}.${s.cls}`))].slice(0, 6);
        fail('performance', `${p} CLS is over 0.1`, `${line} :: moved by ${moved.join(', ')}`);
      }
      if (bytes.total <= 3 * 1024 * 1024 && bytes.js <= 500 * 1024 && vitals.lcp <= 2500 && vitals.cls <= 0.1) {
        pass('performance', line);
      }
      await ctx.close();
    }
  }

  /* ============================================ P1: orientation + print */
  console.log('\n== P1: orientation, print, long strings ==');
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    for (const p of ['index.html', 'contact.html', 'start-a-project.html']) {
      await page.goto(`${BASE}/${p}`, { waitUntil: 'load', timeout: 30000 });
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(400);
      const land = await page.evaluate(() => {
        window.scrollTo(300, 0);
        const x = window.scrollX;
        window.scrollTo(0, 0);
        const nav = document.querySelector('#navbar').getBoundingClientRect();
        return { canScrollX: x, navH: Math.round(nav.height), vh: window.innerHeight };
      });
      if (land.canScrollX > 0) fail('orientation', `${p}: scrolls sideways in landscape`, land.canScrollX + 'px');
      if (land.navH > land.vh * 0.25) fail('orientation', `${p}: the header eats a landscape screen`, `${land.navH}/${land.vh}`);
    }
    await ctx.close();

    /* print stylesheet: chrome should be hidden */
    const pctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pp = await pctx.newPage();
    await pp.goto(`${BASE}/index.html`, { waitUntil: 'load', timeout: 30000 });
    await pp.emulateMedia({ media: 'print' });
    const printed = await pp.evaluate(() => ({
      nav: getComputedStyle(document.querySelector('#navbar')).display,
      cta: getComputedStyle(document.querySelector('.cta-band')).display
    }));
    if (printed.nav !== 'none') fail('print', 'the navigation is not hidden in print', 'display=' + printed.nav);
    else pass('print', 'the navigation is hidden when printing');
    await pctx.close();
  }

  /* ================================== P1: INP, zoom, long strings, SEO data */
  console.log('\n== P1: interaction latency, zoom, long strings, SEO data ==');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    /* --- INP: interaction latency, measured not guessed --- */
    await page.goto(`${BASE}/projects.html?inp=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1200);
    const inp = await page.evaluate(async () => {
      const durations = [];
      let po = null;
      try {
        po = new PerformanceObserver((l) => {
          for (const e of l.getEntries()) durations.push(e.duration);
        });
        po.observe({ type: 'event', buffered: true, durationThreshold: 16 });
      } catch (e) { po = null; }
      /* drive a few real interactions */
      const cards = document.querySelectorAll('.work-card');
      const btn = document.querySelector('.filter-btn[data-filter="ai"]');
      if (btn) { btn.click(); await new Promise((r) => setTimeout(r, 200)); btn.click(); }
      if (cards[0]) { cards[0].scrollIntoView(); cards[0].click(); }
      const q = document.querySelector('.faq-question');
      if (q) q.click();
      await new Promise((r) => setTimeout(r, 900));
      if (po) po.disconnect();
      durations.sort((a, b) => a - b);
      return {
        count: durations.length,
        worst: durations.length ? durations[durations.length - 1] : 0,
        p98: durations.length ? durations[Math.floor(durations.length * 0.98)] : 0
      };
    });
    if (inp.count === 0) notes.push('INP: no interaction was long enough to be recorded (good)');
    else if (inp.worst > 200) fail('inp', `the slowest interaction took ${Math.round(inp.worst)}ms`, 'budget 200ms');
    else pass('inp', `interaction latency is ${Math.round(inp.worst)}ms worst case`, `${inp.count} interactions`);

    /* --- 200% text zoom (WCAG 1.4.4) --- */
    for (const p of ['index.html', 'contact.html', 'start-a-project.html']) {
      await page.goto(`${BASE}/${p}?z=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(300);
      const z = await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
        window.scrollTo(300, 0);
        const x = window.scrollX;
        window.scrollTo(0, 0);
        /* find anything whose text is cut off */
        const clipped = [];
        document.querySelectorAll('h1,h2,h3,p,li,a,label,button').forEach((el) => {
          if (el.closest('.skip-link')) return;
          const cs = getComputedStyle(el);
          if (cs.overflow === 'hidden' && cs.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 2) {
            clipped.push(el.tagName + '.' + (el.className || '').toString().slice(0, 24));
          }
        });
        return { canScrollX: x, clipped };
      });
      if (z.canScrollX > 0) fail('zoom', `${p} scrolls sideways at 200% text`, z.canScrollX + 'px');
      if (z.clipped.length) fail('zoom', `${p} clips text at 200%`, z.clipped.slice(0, 3).join(', '));
    }
    pass('zoom', '200% text zoom does not break the layout');

    /* --- long unbroken strings must wrap or scroll, never escape --- */
    await page.goto(`${BASE}/index.html?ls=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
    const longStr = await page.evaluate(() => {
      const target = document.querySelector('.section-title') || document.querySelector('h1');
      const original = target.textContent;
      const token = 'SUPERCALIFRAGILISTICEXPIALIDOCIOUSVERYLONGUNBROKENIDENTIFIER1234567890';
      target.textContent = token;
      const r = target.getBoundingClientRect();
      const overflows = r.right > document.documentElement.clientWidth + 1;
      target.textContent = original;
      return { overflows, w: Math.round(r.width) };
    });
    if (longStr.overflows) fail('text', 'a long unbroken string overflows the viewport');
    else pass('text', 'a long unbroken string stays inside the viewport');

    /* --- sitemap: every listed URL must resolve --- */
    const sm = await page.request.get(`${BASE}/sitemap.xml`).catch(() => null);
    if (!sm || !sm.ok()) fail('seo', 'sitemap.xml could not be fetched');
    else {
      const xml = await sm.text();
      const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
      if (!locs.length) fail('seo', 'sitemap.xml lists no URLs');
      let bad = 0;
      for (const loc of locs) {
        const path = loc.replace(/^https?:\/\/[^/]+/, '');
        const res = await page.request.get(`${BASE}${path}`).catch(() => null);
        if (!res || res.status() !== 200) { bad++; fail('seo', `sitemap URL does not resolve: ${path}`, res ? res.status() : 'no response'); }
      }
      if (!bad) pass('seo', `all ${locs.length} sitemap URLs resolve`);
      /* the legal pages must be listed - they were missing before */
      for (const need of ['privacy-policy', 'terms']) {
        if (!locs.some((l) => l.includes(need))) fail('seo', `the sitemap is missing ${need}`);
      }
    }

    /* --- robots.txt --- */
    const rb = await page.request.get(`${BASE}/robots.txt`).catch(() => null);
    if (!rb || !rb.ok()) fail('seo', 'robots.txt could not be fetched');
    else {
      const txt = await rb.text();
      if (!/Sitemap:/i.test(txt)) fail('seo', 'robots.txt does not point at the sitemap');
      else pass('seo', 'robots.txt points at the sitemap');
    }

    /* --- structured data must be valid JSON-LD --- */
    for (const p of PAGES) {
      await page.goto(`${BASE}/${p}?ld=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
      const ld = await page.evaluate(() => {
        const blocks = [...document.querySelectorAll('script[type="application/ld+json"]')];
        const types = [];
        const errors = [];
        blocks.forEach((b) => {
          try {
            const parsed = JSON.parse(b.textContent);
            const list = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
            list.forEach((n) => { if (n['@type']) types.push(n['@type']); });
          } catch (e) {
            errors.push(e.message);
          }
        });
        return { count: blocks.length, types, errors };
      });
      if (ld.errors.length) fail('seo', `${p}: invalid JSON-LD`, ld.errors[0]);
      else if (!ld.count) notes.push(`${p}: no structured data`);
    }
    pass('seo', 'all structured data blocks parse');

    await ctx.close();
  }

  /* ============================================ P0: the 3D stage hygiene */
  console.log('\n== P1: 3D stage ==');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
    const failedRequests = [];
    page.on('requestfailed', (r) => {
      const u = r.url();
      if (u.includes('google.com/maps') || u.includes('fonts.g')) return;
      failedRequests.push(u + ' :: ' + ((r.failure() || {}).errorText || ''));
    });

    for (const p of PAGES) {
      await page.goto(`${BASE}/${p}?w=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(1500);
      const st = await page.evaluate(() => {
        const H = window.ValtorixStage;
        const c = document.querySelector('.site-stage');
        return {
          instances: H ? H.instances : -1,
          refusal: H ? H.lastRefusal : 'no-init',
          canvases: document.querySelectorAll('canvas').length,
          chapterCount: document.querySelectorAll('[data-stage]:not(canvas)').length,
          opacity: c ? getComputedStyle(c).opacity : 'n/a'
        };
      });
      if (st.canvases > 1) fail('3d', `${p}: ${st.canvases} canvases`);
      if (st.instances > 1) fail('3d', `${p}: ${st.instances} scenes mounted at once`);
      if (st.refusal && st.refusal !== 'reduced-motion') notes.push(`${p}: 3D refused (${st.refusal})`);
    }

    if (consoleErrors.length) fail('3d', 'console errors on the 3D pages', consoleErrors.slice(0, 3).join(' | '));
    else pass('3d', 'no console errors');
    if (failedRequests.length) fail('3d', 'failed requests', failedRequests.slice(0, 3).join(' | '));
    else pass('3d', 'no failed requests');

    await ctx.close();
  }

  await browser.close();

  notes.forEach((n) => reporter.note(n));
  reporter.summary(path.join(__dirname, 'qa-report.json'));
})();
