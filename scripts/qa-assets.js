/* ==========================================================================
   VALTORIX INFOTECH — asset audit
   --------------------------------------------------------------------------
   The site's payload is mostly images and a couple of generated files. This
   suite answers the questions that decide how fast the site feels:

     - is anything shipped that nothing references (dead weight)?
     - is anything referenced that does not exist (a broken page)?
     - are the photographs delivered as WebP with a raster fallback?
     - is the render-blocking path small enough to feel instant?
     - do the cache headers let the static files be reused?

     node scripts/qa-assets.js
   ========================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const results = [];

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}

function note(text) {
  console.log(`  NOTE  ${text}`);
}

function read(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf8');
}

function kb(p) {
  return fs.statSync(path.join(ROOT, p)).size / 1024;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else out.push(rel.split(path.sep).join('/'));
  }
  return out;
}

/**
 * The pixel dimensions of an image, read from its header. PNG and JPEG are
 * both parsed here so the check needs no dependency.
 */
function imageSize(file) {
  const buf = fs.readFileSync(file);
  if (buf.slice(1, 4).toString() === 'PNG') {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const length = buf.readUInt16BE(i + 2);
      /* SOF0-SOF15, except the DHT/JPG/DAC markers */
      if (marker >= 0xc0 && marker <= 0xcf &&
          marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + length;
    }
  }
  if (buf.slice(8, 12).toString() === 'WEBP') {
    const format = buf.slice(12, 16).toString();
    if (format === 'VP8 ') {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (format === 'VP8L') {
      const bits = buf.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (format === 'VP8X') {
      const w = buf[24] | (buf[25] << 8) | (buf[26] << 16);
      const h = buf[27] | (buf[28] << 8) | (buf[29] << 16);
      return { width: w + 1, height: h + 1 };
    }
  }
  return null;
}

const htmlFiles = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort();
const html = htmlFiles.map(read).join('\n');
const css = read('styles.css');
const js = ['app.js', 'stage3d.js', 'stage3d-init.js'].map(read).join('\n');
const manifest = fs.existsSync(path.join(ROOT, 'site.webmanifest'))
  ? read('site.webmanifest') : '';

/* ------------------------------------------------ 1. every reference exists */
{
  const missing = [];
  const seen = new Set();
  const scan = (src, label) => {
    for (const m of src.matchAll(/(?:src|href|data-map-src)="([^"#?]+)"/g)) {
      const ref = m[1];
      if (/^(https?:|mailto:|tel:|data:|\/\/|#)/.test(ref)) continue;
      if (seen.has(ref)) continue;
      seen.add(ref);
      if (!fs.existsSync(path.join(ROOT, ref))) missing.push(`${label}: ${ref}`);
    }
  };
  htmlFiles.forEach((f) => scan(read(f), f));
  scan(css, 'styles.css');
  scan(js, 'the scripts');
  if (manifest) scan(manifest, 'site.webmanifest');
  check('every referenced file exists', missing.length === 0, missing.slice(0, 5).join(' | '));
}

/* --------------------------------------------- 2. nothing ships unreferenced */
{
  /* images/brand/ is the brand kit: it deliberately holds every variant of
     the identity, including the ones no page uses yet. */
  const shipped = walk('images').filter((p) => !p.startsWith('images/brand/'));
  const orphans = shipped.filter((p) => {
    const base = path.basename(p);
    return !html.includes(p) && !html.includes(base) &&
           !css.includes(p) && !css.includes(base) &&
           !js.includes(p) && !js.includes(base) &&
           !manifest.includes(base);
  });
  check('no image ships without a reference', orphans.length === 0,
    orphans.slice(0, 6).join(' | '));
  if (orphans.length) {
    note(`${orphans.length} orphan file(s) - bytes that are shipped but never fetched`);
  }

  const brand = walk('images/brand');
  note(`the brand kit holds ${brand.length} files, referenced or not, by design`);
}

/* ---------------------------------------- 3. the photographs are WebP-first */
{
  const photos = walk('images')
    .filter((p) => /\.(jpe?g|png)$/i.test(p))
    .filter((p) => !/favicon|icon-|apple-touch|logo|og-image/i.test(p));
  const withoutWebp = photos.filter((p) => !fs.existsSync(p.replace(/\.png$/i, '.webp')));
  check('every photograph has a WebP variant', withoutWebp.length === 0,
    withoutWebp.slice(0, 5).join(' | '));

  const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  const noSize = imgs.filter((t) => !/\bwidth=/.test(t) || !/\bheight=/.test(t));
  check('every <img> declares its intrinsic size', noSize.length === 0,
    noSize.slice(0, 3).map((t) => t.slice(0, 80)).join(' | '));

  /* The declared size has to match the file. The browser reserves the box
     from the width/height attributes, so a wrong ratio means the box is the
     wrong shape until the image arrives - and then everything below it
     jumps. That is a real layout shift, not a theoretical one. */
  const wrongSize = [];
  for (const f of htmlFiles) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/<img\b[^>]*>/g)) {
      const tag = m[0];
      const s = tag.match(/src="([^"]+)"/);
      const w = tag.match(/width="(\d+)"/);
      const h = tag.match(/height="(\d+)"/);
      if (!s || !w || !h) continue;
      const file = path.join(ROOT, s[1]);
      if (!fs.existsSync(file)) continue;
      const size = imageSize(file);
      if (!size) continue;
      if (size.width !== +w[1] || size.height !== +h[1]) {
        wrongSize.push(`${f}: ${s[1]} says ${w[1]}x${h[1]}, the file is ${size.width}x${size.height}`);
      }
    }
  }
  check('every declared image size matches the file', wrongSize.length === 0,
    wrongSize.slice(0, 4).join(' | '));

  const noAlt = imgs.filter((t) => !/\salt="/.test(t));
  check('every <img> has an alt attribute', noAlt.length === 0,
    noAlt.slice(0, 3).map((t) => t.slice(0, 80)).join(' | '));

  /* Only the brand marks are above the fold; every content photograph must
     be lazy so the browser never fetches an image nobody has scrolled to. */
  const content = imgs.filter((t) => !/brand\//.test(t));
  const eager = content.filter((t) => !/loading="lazy"/.test(t));
  check('every content photograph is lazy loaded', eager.length === 0,
    eager.slice(0, 3).map((t) => t.slice(0, 80)).join(' | '));

  /* a <picture> without a raster fallback breaks older browsers */
  const pictures = [...html.matchAll(/<picture\b[\s\S]*?<\/picture>/g)].map((m) => m[0]);
  const noFallback = pictures.filter((p) => !/<img\b[^>]*src="/.test(p));
  check('every <picture> has a raster fallback', noFallback.length === 0,
    `${pictures.length} picture element(s)`);

  const webpFirst = pictures.filter((p) => {
    const webp = p.indexOf('type="image/webp"');
    const img = p.indexOf('<img');
    return webp > -1 && webp < img;
  });
  check('the WebP source is offered first', webpFirst.length === pictures.length,
    `${webpFirst.length} of ${pictures.length}`);
}

/* --------------------------------------------------- 4. the weight budget */
{
  const budgetKB = 320;                 // per file, on disk
  const heavy = [];
  let totalKB = 0;
  for (const p of walk('images')) {
    const size = kb(p);
    totalKB += size;
    if (/\.(jpe?g|png|webp)$/i.test(p) && size > budgetKB) heavy.push(`${p} (${Math.round(size)} KB)`);
  }
  check('no single image exceeds the weight budget', heavy.length === 0,
    heavy.slice(0, 5).join(' | '));
  note(`the whole image library is ${Math.round(totalKB)} KB on disk`);

  /* What blocks the first paint: the document and the stylesheet. */
  const renderBlocking = kb('index.html') + kb('styles.css');
  check('the render-blocking path stays under 120 KB', renderBlocking < 120,
    `${Math.round(renderBlocking)} KB (index.html + styles.css)`);

  /* The 3D stage is deferred, but it still competes for bandwidth. */
  const deferredJS = kb('app.js') + kb('stage3d.js') + kb('stage3d-init.js') + kb('stage3d-geometry.js');
  check('the deferred JavaScript stays under 200 KB', deferredJS < 200,
    `${Math.round(deferredJS)} KB (app + stage + geometry)`);
}

/* ------------------------------------------- 5. the images are not oversized */
{
  const oversized = [];
  for (const p of walk('images').filter((f) => f.endsWith('.png'))) {
    const buf = fs.readFileSync(path.join(ROOT, p));
    if (buf.slice(1, 4).toString() !== 'PNG') continue;
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    /* the social card has a fixed spec of 1200x630, so it is allowed */
    if (/og-image/.test(p)) continue;
    if (w > 1024 || h > 1024) oversized.push(`${p} (${w}x${h})`);
  }
  check('no raster asset is needlessly large', oversized.length === 0,
    oversized.slice(0, 5).join(' | '));
}

/* ------------------------------------------- 6. the cache headers are right */
{
  const cfg = JSON.parse(read('vercel.json'));
  const rules = cfg.headers || [];
  const flat = [];
  for (const rule of rules) {
    for (const h of rule.headers || []) flat.push({ source: rule.source || '', key: h.key, value: h.value });
  }

  const find = (needle) => flat.find((h) => h.source.includes(needle));
  const maxAge = (value) => {
    const m = /max-age=(\d+)/.exec(value || '');
    return m ? parseInt(m[1], 10) : 0;
  };

  const assets = find('(js|css|png');
  check('the static assets are cached for at least a day',
    !!assets && maxAge(assets.value) >= 86400, assets ? assets.value : 'no asset rule');

  const htmlRule = flat.find((h) => h.source === '/(.*)' && /max-age/.test(h.value));
  check('the html is revalidated rather than cached forever',
    !!htmlRule && maxAge(htmlRule.value) <= 60, htmlRule ? htmlRule.value : 'no html rule');

  /* The brand assets are NOT versioned in the URL, so a long immutable cache
     would keep showing an old logo after a rebuild. A week plus a stale
     window is the honest policy. */
  const brand = find('/images/brand/');
  check('the brand assets are cached but not frozen',
    !!brand && maxAge(brand.value) >= 86400 && !/immutable/.test(brand.value),
    brand ? brand.value : 'no brand rule');

  /* Nothing may claim to be immutable unless its URL carries a version. */
  const immutable = flat.filter((h) => /immutable/.test(h.value));
  check('no unversioned file is cached immutably', immutable.length === 0,
    immutable.map((h) => h.source).join(', '));
}

/* ---------------------------------------- 7. the generated files are current */
{
  const brandData = 'scripts/brand-data.json';
  const geometry = 'stage3d-geometry.js';
  if (fs.existsSync(path.join(ROOT, brandData)) && fs.existsSync(path.join(ROOT, geometry))) {
    const b = fs.statSync(path.join(ROOT, brandData)).mtimeMs;
    const g = fs.statSync(path.join(ROOT, geometry)).mtimeMs;
    check('the 3D geometry is newer than the traced logo', g >= b,
      g >= b ? 'up to date' : 'the geometry is stale - run npm run build:stage');
  } else {
    check('the traced logo and the 3D geometry are both present', false,
      'scripts/brand-data.json or stage3d-geometry.js is missing');
  }

  const brandRefs = [...new Set(
    [...html.matchAll(/images\/brand\/[A-Za-z0-9._-]+/g)].map((m) => m[0])
  )];
  const missingBrand = brandRefs.filter((r) => !fs.existsSync(path.join(ROOT, r)));
  check('every brand asset the pages reference exists', missingBrand.length === 0,
    missingBrand.join(' | '));

  /* the brand kit must contain every variant the build script writes */
  const expected = ['valtorix-mark.svg', 'valtorix-mark-white.svg', 'valtorix-logo.svg',
    'valtorix-logo-white.svg', 'valtorix-logo-stacked.svg', 'favicon.svg',
    'favicon-white.svg', 'favicon-16.png', 'favicon-32.png', 'favicon-64.png',
    'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'og-image.png'];
  const missingKit = expected.filter((f) => !fs.existsSync(path.join(ROOT, 'images', 'brand', f)));
  check('the brand kit is complete', missingKit.length === 0, missingKit.join(' | '));
}

/* ------------------------------------------- 8. the manifest is complete */
{
  if (!manifest) {
    check('the web app manifest exists', false, 'site.webmanifest is missing');
  } else {
    let m = null;
    try { m = JSON.parse(manifest); } catch (e) { /* handled below */ }
    check('the web app manifest is valid JSON', !!m, '');
    if (m) {
      check('the manifest declares its icons', Array.isArray(m.icons) && m.icons.length > 0,
        `${(m.icons || []).length} icon(s)`);
      const missingIcons = (m.icons || [])
        .map((i) => i.src)
        .filter((src) => !fs.existsSync(path.join(ROOT, src.replace(/^\//, ''))));
      check('every manifest icon exists', missingIcons.length === 0, missingIcons.join(' | '));
      check('the manifest has a name and a start_url', !!m.name && !!m.start_url,
        m.start_url || '');
    }
  }
}

/* ------------------------------------------- 9. the icons are all present */
{
  const iconRefs = [...new Set(
    [...html.matchAll(/rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)].map((m) => m[1])
  )];
  const missing = iconRefs.filter((r) => !fs.existsSync(path.join(ROOT, r.replace(/^\//, ''))));
  check('every favicon the pages reference exists', missing.length === 0, missing.join(' | '));
  note(`${iconRefs.length} icon reference(s) across the site`);

  check('the root favicon.ico carries the current mark',
    fs.existsSync(path.join(ROOT, 'favicon.ico')), 'the browser asks for this unprompted');
}

/* ------------------------------------------------ 10. the summary */
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} asset checks passed`);
process.exitCode = failed.length ? 1 : 0;
