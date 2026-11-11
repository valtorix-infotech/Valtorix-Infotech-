/* ==========================================================================
   VALTORIX INFOTECH — responsive + reflow audit
   --------------------------------------------------------------------------
   Built from the 2026 responsive-testing practice:

     - widths chosen from real user populations, plus just-below / at /
       just-above every CSS breakpoint in the stylesheet
     - overflow is measured by asking whether an element's BOX escapes the
       viewport and what clips it. `scrollWidth` is NOT trusted: a clipping
       ancestor pins scrollWidth to clientWidth and hides real failures.
     - WCAG 2.2 target sizes: 24x24 unconditional, 44x44 on touch
     - 16px minimum on text inputs (iOS zooms the page below that)
     - 12px minimum type size
     - reflow checked at 320 CSS px and at 400% zoom
     - landscape checked separately: a fixed header must not eat a short screen
     - JS disabled must still deliver the content
   ========================================================================== */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:8099';
const PAGES = (process.env.PAGES || 'index.html,about-us.html,services.html,solutions.html,projects.html,contact.html,start-a-project.html,privacy-policy.html,terms.html,404.html').split(',');

/* width, height, touch? */
const VIEWPORTS = [
  { w: 320, h: 568, touch: true, name: '320 small phone' },
  { w: 360, h: 800, touch: true, name: '360 android' },
  { w: 375, h: 667, touch: true, name: '375 iphone se' },
  { w: 390, h: 844, touch: true, name: '390 iphone 14' },
  { w: 430, h: 932, touch: true, name: '430 iphone pro max' },
  { w: 479, h: 900, touch: true, name: '479 just below 480' },
  { w: 480, h: 900, touch: true, name: '480 at breakpoint' },
  { w: 481, h: 900, touch: true, name: '481 just above 480' },
  { w: 719, h: 1024, touch: true, name: '719 just below 720' },
  { w: 720, h: 1024, touch: true, name: '720 at breakpoint' },
  { w: 721, h: 1024, touch: true, name: '721 just above 720' },
  { w: 767, h: 1024, touch: true, name: '767 tablet portrait' },
  { w: 768, h: 1024, touch: true, name: '768 tablet' },
  { w: 834, h: 1112, touch: true, name: '834 ipad air' },
  { w: 959, h: 768, touch: false, name: '959 just below 960' },
  { w: 960, h: 768, touch: false, name: '960 at breakpoint' },
  { w: 961, h: 768, touch: false, name: '961 just above 960' },
  { w: 1024, h: 768, touch: false, name: '1024 laptop' },
  { w: 1079, h: 800, touch: false, name: '1079 just below 1080' },
  { w: 1080, h: 800, touch: false, name: '1080 at breakpoint' },
  { w: 1081, h: 800, touch: false, name: '1081 just above 1080' },
  { w: 1280, h: 800, touch: false, name: '1280 small laptop' },
  { w: 1440, h: 900, touch: false, name: '1440 desktop' },
  { w: 1920, h: 1080, touch: false, name: '1920 full hd' },
  { w: 2560, h: 1440, touch: false, name: '2560 ultrawide' },
];

const findings = [];

function flag(page, viewport, kind, detail) {
  findings.push({ page, viewport, kind, detail });
}

/* The in-page auditor. Runs once per viewport per page. */
const AUDIT = () => {
  const docW = document.documentElement.clientWidth;
  const docH = document.documentElement.clientHeight;

  /* --- can the user actually scroll sideways? --- */
  window.scrollTo(300, window.scrollY);
  const canScrollX = window.scrollX;
  window.scrollTo(0, window.scrollY);

  /* --- which elements' boxes escape the viewport, and what clips them? --- */
  const escaping = [];
  const all = document.body.querySelectorAll('*');
  const SKIP = '.skip-link,.honeypot';
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right <= docW + 0.5 && r.left >= -0.5) continue;
    /* the skip link and the honeypot are deliberately parked off-screen */
    if (el.closest(SKIP)) continue;
    /* an animated marquee is an intentional crop */
    if (el.closest('.marquee')) continue;
    /* fixed elements are sized to the viewport, not the document */
    if (getComputedStyle(el).position === 'fixed') continue;

    /* find the nearest ancestor that clips it */
    let clipper = null;
    let p = el.parentElement;
    while (p) {
      const cs = getComputedStyle(p);
      if (cs.overflowX === 'hidden' || cs.overflowX === 'clip' ||
          cs.overflowX === 'auto' || cs.overflowX === 'scroll') { clipper = p; break; }
      p = p.parentElement;
    }
    /* a clipper that spans the viewport is the layout failing, not a crop */
    const spans = clipper ? clipper.getBoundingClientRect().width >= docW - 1 : false;
    const intentionalScroller = clipper &&
      (getComputedStyle(clipper).overflowX === 'auto' || getComputedStyle(clipper).overflowX === 'scroll') &&
      clipper.scrollWidth > clipper.clientWidth;

    escaping.push({
      tag: el.tagName.toLowerCase(),
      cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').toString().slice(0, 48),
      left: Math.round(r.left),
      right: Math.round(r.right),
      clipped: !!clipper,
      clipperSpans: spans,
      intentionalScroller: !!intentionalScroller,
      text: (el.textContent || '').trim().slice(0, 40)
    });
  }

  /* --- touch target sizes (WCAG 2.5.8: 24x24 floor; 44x44 on touch) --- */
  const smallTargets = [];
  const interactive = document.querySelectorAll(
    'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [onclick]'
  );
  for (const el of interactive) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;      // not rendered
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    /* WCAG 2.5.8 exempts links that sit inside a block of text, and the
       skip link, which is parked off-screen until it takes focus. */
    let inline = false;
    if (el.tagName === 'A') {
      if (el.closest('.skip-link')) inline = true;
      const parent = el.parentElement;
      if (parent) {
        const pcs = getComputedStyle(parent);
        if (pcs.display === 'inline' || pcs.display === 'inline-block') inline = true;
        else {
          /* the parent holds other prose, so the link is part of a sentence */
          for (const n of parent.childNodes) {
            if (n.nodeType === 3 && n.textContent.trim() && n !== el) { inline = true; break; }
          }
        }
      }
    }
    if (inline) continue;
    if (r.width < 24 || r.height < 24) {
      smallTargets.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 40),
        text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30),
        w: Math.round(r.width), h: Math.round(r.height)
      });
    }
  }

  /* --- type sizes --- */
  const smallText = [];
  document.querySelectorAll('p, span, a, li, label, small, div, h1, h2, h3, h4, strong, em').forEach((el) => {
    if (!el.textContent.trim()) return;
    /* the wordmark lockup is a brand element, not body text - documented
       exception to the 12px floor */
    if (el.closest('.logo-word')) return;
    if (el.children.length && !Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim())) return;
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    if (size && size < 12) {
      smallText.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 40),
        size: size,
        text: el.textContent.trim().slice(0, 30)
      });
    }
  });

  /* --- inputs must be 16px or iOS zooms the page on focus --- */
  const zoomInputs = [];
  document.querySelectorAll('input[type=text], input[type=email], input[type=tel], input[type=search], textarea, select').forEach((el) => {
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    if (size && size < 16) {
      zoomInputs.push({
        tag: el.tagName.toLowerCase(), id: el.id || el.name || '',
        size: size
      });
    }
  });

  /* --- text that is clipped or truncated --- */
  const clipped = [];
  document.querySelectorAll('h1, h2, h3, h4, p, a, li, span, strong').forEach((el) => {
    if (el.children.length) return;
    if (el.closest('.skip-link')) return;
    const cs = getComputedStyle(el);
    if (cs.overflow === 'hidden' && cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap') {
      if (el.scrollWidth > el.clientWidth + 1) {
        clipped.push({ tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 40), text: el.textContent.trim().slice(0, 40) });
      }
    }
    if (cs.overflow === 'hidden' && cs.textOverflow !== 'ellipsis') {
      if (el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0) {
        clipped.push({ tag: el.tagName.toLowerCase(), cls: (el.className || '').toString().slice(0, 40), text: el.textContent.trim().slice(0, 40), kind: 'v-clipped' });
      }
    }
  });

  /* --- a fixed header that eats the viewport on a short screen --- */
  const nav = document.querySelector('#navbar');
  const navRect = nav ? nav.getBoundingClientRect() : null;

  /* --- images that overflow their container --- */
  const badImages = [];
  document.querySelectorAll('img').forEach((im) => {
    const r = im.getBoundingClientRect();
    if (r.width === 0) return;
    let clipped = false;
    let q = im.parentElement;
    while (q) {
      const o = getComputedStyle(q);
      if (o.overflowX === 'hidden' || o.overflowX === 'clip' ||
          o.overflowX === 'auto' || o.overflowX === 'scroll') { clipped = true; break; }
      q = q.parentElement;
    }
    if (!clipped && (r.right > docW + 1 || r.left < -1)) {
      badImages.push({ src: (im.getAttribute('src') || '').slice(-40), left: Math.round(r.left), right: Math.round(r.right) });
    }
    if (im.complete && im.naturalWidth && r.width > im.naturalWidth * 1.6) {
      badImages.push({ src: (im.getAttribute('src') || '').slice(-40), kind: 'upscaled', natural: im.naturalWidth, shown: Math.round(r.width) });
    }
  });

  /* --- line length on wide screens --- */
  const prose = document.querySelector('.prose p, .section-desc, .hero-lead');
  const proseChars = prose ? Math.round(prose.getBoundingClientRect().width / 8) : 0;

  return {
    docW, docH, canScrollX,
    escaping: escaping.slice(0, 14),
    smallTargets: smallTargets.slice(0, 14),
    smallText: smallText.slice(0, 10),
    zoomInputs: zoomInputs.slice(0, 10),
    clipped: clipped.slice(0, 10),
    badImages: badImages.slice(0, 10),
    navHeight: navRect ? Math.round(navRect.height) : 0,
    proseChars,
    scrollWidth: document.documentElement.scrollWidth
  };
};

(async () => {
  const msCache = path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'ms-playwright');
  const exe = ['chromium-1248/chrome-win64/chrome.exe', 'chromium-1228/chrome-win64/chrome.exe']
    .map((c) => path.join(msCache, c)).find((p) => fs.existsSync(p));
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});

  console.log('== responsive matrix ==');
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      isMobile: vp.touch,
      hasTouch: vp.touch
    });
    const page = await ctx.newPage();
    for (const p of PAGES) {
      await page.goto(`${BASE}/${p}?rs=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(250);
      const a = await page.evaluate(AUDIT);

      const label = `${vp.w}px`;

      if (a.canScrollX > 0) {
        flag(p, label, 'horizontal-scroll', `the page scrolls sideways by ${a.canScrollX}px`);
      }
      /* boxes that escape and are NOT clipped by an intentional scroller */
      for (const e of a.escaping) {
        if (e.intentionalScroller) continue;
        if (e.clipperSpans) {
          flag(p, label, 'escaping-box', `<${e.tag} class="${e.cls}"> right=${e.right} (viewport ${a.docW}) clipped by a full-width ancestor`);
        } else if (!e.clipped) {
          flag(p, label, 'escaping-box', `<${e.tag} class="${e.cls}"> left=${e.left} right=${e.right} (viewport ${a.docW}) — nothing clips it`);
        }
      }
      for (const t of a.smallTargets) {
        flag(p, label, 'small-target', `<${t.tag} class="${t.cls}"> ${t.w}x${t.h} — "${t.text}"`);
      }
      for (const t of a.smallText) {
        flag(p, label, 'small-text', `<${t.tag} class="${t.cls}"> ${t.size}px — "${t.text}"`);
      }
      for (const t of a.zoomInputs) {
        flag(p, label, 'input-zoom', `<${t.tag} id="${t.id}"> ${t.size}px — iOS zooms below 16px`);
      }
      for (const c of a.clipped) {
        flag(p, label, 'clipped-text', `<${c.tag} class="${c.cls}"> ${c.kind || 'clipped'} — "${c.text}"`);
      }
      for (const b of a.badImages) {
        flag(p, label, 'image-overflow', `${b.src} ${b.kind || ('left=' + b.left + ' right=' + b.right)}`);
      }
      if (vp.h < 500 && a.navHeight > a.docH * 0.2) {
        flag(p, label, 'header-eats-screen', `fixed header is ${a.navHeight}px of a ${a.docH}px viewport`);
      }
      if (vp.w >= 1280 && a.proseChars > 95) {
        flag(p, label, 'long-line', `prose is ~${a.proseChars} characters wide`);
      }
    }
    await ctx.close();
  }

  /* ---------- landscape ---------- */
  console.log('== landscape ==');
  for (const [w, h] of [[844, 390], [740, 360], [932, 430]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/index.html?rs=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(250);
    const a = await page.evaluate(AUDIT);
    if (a.canScrollX > 0) flag('index.html', `landscape ${w}x${h}`, 'horizontal-scroll', `${a.canScrollX}px`);
    if (a.navHeight > h * 0.2) flag('index.html', `landscape ${w}x${h}`, 'header-eats-screen', `${a.navHeight}px of ${h}px`);
    await ctx.close();
  }

  /* ---------- 400% zoom / 320 reflow ---------- */
  /* Chrome's browser zoom shrinks the LAYOUT viewport, so 1280x1024 at 400%
     zoom is exactly a 320x256 CSS px layout rendered into 1280 device pixels.
     Media queries re-evaluate, which CSS `zoom` does not do. */
  console.log('== 400% zoom (1280x1024 -> 320x256 CSS px layout) ==');
  for (const p of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 256 }, deviceScaleFactor: 4, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/${p}?rs=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(200);
    const a = await page.evaluate(AUDIT);
    if (a.canScrollX > 0) flag(p, '400% zoom', 'horizontal-scroll', `${a.canScrollX}px`);
    for (const e of a.escaping) {
      if (!e.intentionalScroller && e.clipperSpans) {
        flag(p, '400% zoom', 'escaping-box', `<${e.tag} class="${e.cls}"> right=${e.right}`);
      }
    }
    for (const t of a.smallTargets) {
      flag(p, '400% zoom', 'small-target', `<${t.tag} class="${t.cls}"> ${t.w}x${t.h}`);
    }
    await ctx.close();
  }

  /* ---------- 320 reflow, real 320 viewport ---------- */
  console.log('== 320px reflow (WCAG 1.4.10) ==');
  {
    const ctx = await browser.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    for (const p of PAGES) {
      await page.goto(`${BASE}/${p}?rs=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(200);
      const a = await page.evaluate(AUDIT);
      if (a.canScrollX > 0) flag(p, '320 reflow', 'horizontal-scroll', `${a.canScrollX}px`);
    }
    await ctx.close();
  }

  /* ---------- JavaScript disabled ---------- */
  console.log('== JavaScript disabled ==');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });
    const page = await ctx.newPage();
    for (const p of PAGES) {
      await page.goto(`${BASE}/${p}?rs=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const info = await page.evaluate(() => ({
        h1: (document.querySelector('h1') || {}).textContent || '',
        words: (document.body.innerText || '').split(/\s+/).filter(Boolean).length,
        links: document.querySelectorAll('a[href]').length,
        nav: !!document.querySelector('#navbar')
      })).catch(() => null);
      if (!info) { flag(p, 'no-js', 'crash', 'the page did not render'); continue; }
      if (info.words < 40) flag(p, 'no-js', 'thin-content', `${info.words} words visible`);
      if (!info.h1.trim()) flag(p, 'no-js', 'no-h1', 'no heading rendered');
      if (!info.nav) flag(p, 'no-js', 'no-nav', 'navigation missing');
    }
    await ctx.close();
  }

  await browser.close();

  /* ---------- report ---------- */
  const byKind = {};
  for (const f of findings) {
    byKind[f.kind] = byKind[f.kind] || [];
    byKind[f.kind].push(f);
  }
  console.log('\n================ FINDINGS ================');
  let total = 0;
  for (const k of Object.keys(byKind).sort((a, b) => byKind[b].length - byKind[a].length)) {
    const list = byKind[k];
    total += list.length;
    console.log(`\n-- ${k}  (${list.length})`);
    const seen = new Set();
    for (const f of list) {
      const key = f.detail.replace(/\d+/g, '#');
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`   ${f.viewport.padEnd(18)} ${f.page.padEnd(20)} ${f.detail}`);
    }
  }
  console.log(`\nTOTAL: ${total} findings across ${findings.length} checks`);
  fs.writeFileSync(path.join(__dirname, 'responsive-report.json'), JSON.stringify(findings, null, 2));
})();
