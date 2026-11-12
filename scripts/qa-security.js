/* ==========================================================================
   VALTORIX INFOTECH — security checks
   --------------------------------------------------------------------------
   The site is static, so the attack surface is small but real: a public form
   endpoint, third-party embeds, and whatever is committed to the repository.

     node scripts/qa-security.js
   ========================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const results = [];

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}

function read(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf8');
}

const htmlFiles = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
const siteJs = ['app.js', 'stage3d.js', 'stage3d-init.js', 'api/send.js']
  .filter((f) => fs.existsSync(path.join(ROOT, f)));
const allHtml = htmlFiles.map(read).join('\n');
const allJs = siteJs.map(read).join('\n');

/* ------------------------------------------------- 1. secrets in the repo */
{
  const patterns = [
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
    [/\bAIza[0-9A-Za-z_-]{35}\b/, 'a Google API key'],
    [/\bghp_[0-9A-Za-z]{36}\b/, 'a GitHub token'],
    [/\bsk-[A-Za-z0-9]{32,}\b/, 'an API secret key'],
    [/\bxox[baprs]-[0-9A-Za-z-]{10,}\b/, 'a Slack token'],
    [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key id'],
    [/(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["'][^"'\s]{12,}["']/i, 'a hard-coded credential']
  ];
  const hits = [];
  for (const f of [...htmlFiles, ...siteJs, 'package.json', 'vercel.json', 'robots.txt']) {
    const src = read(f);
    for (const [re, label] of patterns) {
      if (re.test(src)) hits.push(`${f}: ${label}`);
    }
  }
  check('no credentials are committed', hits.length === 0, hits.join(', '));
}

/* ------------------------------------------- 2. env files are ignored */
{
  const gi = read('.gitignore');
  check('.env files are git-ignored', /\.env/.test(gi), '');
  const tracked = [];
  for (const f of fs.readdirSync(path.join(ROOT, '.git'))) { /* noop */ }
  check('no .env file is committed',
    !fs.existsSync(path.join(ROOT, '.env')) && !fs.existsSync(path.join(ROOT, '.env.local')), '');
}

/* ---------------------------------------- 3. response headers are set */
{
  const cfg = JSON.parse(read('vercel.json'));
  const all = (cfg.headers || []).flatMap((r) => r.headers || []);
  const keys = all.map((h) => h.key.toLowerCase());
  for (const h of ['x-content-type-options', 'referrer-policy', 'x-frame-options', 'permissions-policy']) {
    check(`the ${h} header is set`, keys.includes(h), '');
  }
  const cache = all.find((h) => h.key.toLowerCase() === 'cache-control');
  check('a cache-control header is set', !!cache, cache ? cache.value : '');
}

/* --------------------------------- 4. the client never injects raw data */
{
  const risky = [];
  for (const f of siteJs) {
    const src = read(f);
    src.split('\n').forEach((line, i) => {
      if (/innerHTML\s*=/.test(line) && !/textContent/.test(line)) {
        /* innerHTML is allowed only when the source is a template literal with
           no interpolation of anything outside the file */
        risky.push(`${f}:${i + 1}  ${line.trim().slice(0, 90)}`);
      }
      if (/\beval\s*\(/.test(line) || /new\s+Function\s*\(/.test(line)) {
        risky.push(`${f}:${i + 1}  dynamic code evaluation`);
      }
      if (/document\.write\s*\(/.test(line)) {
        risky.push(`${f}:${i + 1}  document.write`);
      }
    });
  }
  check('the client never injects unescaped markup', risky.length === 0, risky.slice(0, 3).join(' | '));
}

/* --------------------------- 5. every new tab is protected from tabnabbing */
{
  const bad = [];
  htmlFiles.forEach((f) => {
    const src = read(f);
    for (const m of src.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
      if (!/rel="[^"]*noopener/.test(m[0])) bad.push(`${f}: ${m[0].slice(0, 90)}`);
    }
  });
  check('every target=_blank link has rel=noopener', bad.length === 0, bad.slice(0, 3).join(' | '));
}

/* ---------------------------------------- 6. no mixed content, no http */
{
  const bad = [];
  htmlFiles.forEach((f) => {
    const src = read(f);
    for (const m of src.matchAll(/(?:src|href)="(http:\/\/[^"]+)"/g)) {
      bad.push(`${f}: ${m[1]}`);
    }
  });
  check('there is no plain-http resource', bad.length === 0, bad.slice(0, 3).join(' | '));
}

/* ------------------------------------ 7. third-party embeds are limited */
{
  const hosts = new Set();
  htmlFiles.forEach((f) => {
    const src = read(f);
    for (const m of src.matchAll(/(?:src|href)="https?:\/\/([^/"]+)/g)) hosts.add(m[1]);
  });
  const allowed = new Set([
    'fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com',
    'www.google.com', 'maps.googleapis.com', 'maps.gstatic.com',
    'wa.me', 'www.linkedin.com', 'www.facebook.com', 'www.instagram.com', 'www.youtube.com',
    // our own canonical and social origins
    'valtorixinfotech-1446.vercel.app'
  ]);
  const unexpected = [...hosts].filter((h) => !allowed.has(h));
  check('only known third parties are embedded', unexpected.length === 0, unexpected.join(', '));
}

/* ------------------------------------- 8. the form cannot be abused */
{
  const api = read('api/send.js');
  check('the endpoint rejects non-POST methods', /req\.method !== 'POST'/.test(api), '');
  check('the endpoint caps the field count', /MAX_FIELDS/.test(api) && /slice\(0, MAX_VALUE_LEN\)/.test(api), '');
  check('the endpoint has a honeypot', /spam-detected/.test(api), '');
  check('the endpoint rate limits by IP', /rateLimited/.test(api), '');
  check('the endpoint escapes user text', /&amp;|&lt;|&gt;|&quot;/.test(api), '');
  /* the owner notification must always go to the studio inbox; the visitor
     only ever receives the auto-reply, and only after the owner mail
     succeeded */
  const ownerMail = api.slice(api.indexOf("'owner-mail'"), api.indexOf("'auto-reply'"));
  check('the owner notification always goes to the studio inbox',
    /to: OWNER/.test(ownerMail) && !/to: replyTo/.test(ownerMail), '');
  check('the visitor only receives the auto-reply, after the owner mail',
    /to: replyTo/.test(api) && api.indexOf('if (!okOwner) throw') < api.indexOf("'auto-reply'"), '');
}

/* ---------------------------------------- 9. the robots file is sane */
{
  const rb = read('robots.txt');
  check('robots.txt allows the site', /User-agent:\s*\*/.test(rb) && /Allow:\s*\//.test(rb), '');
  check('robots.txt points at the sitemap', /Sitemap:/i.test(rb), '');
  check('the api is excluded from crawling', /Disallow:\s*\/api\//.test(rb), '');
}

/* ------------------------------- 9b. the dependencies have no known holes */
{
  const pkg = JSON.parse(read('package.json'));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

  /* The mail library is the one dependency that processes untrusted input.
     It must not be an end-of-life major with published advisories. */
  const mail = deps.nodemailer || '';
  const version = /(\d+)/.exec(mail.replace(/^[\^~>=<\s]*/, ''));
  const major = version ? parseInt(version[1], 10) : 0;
  check('the mail library is on a supported major', major >= 7,
    'nodemailer ' + (pkg.dependencies && pkg.dependencies.nodemailer));

  /* Every dependency must be pinned to a range, not "latest". */
  const floating = Object.entries(deps)
    .filter(([, v]) => !/^[\^~]?\d/.test(v))
    .map(([k, v]) => k + '@' + v);
  check('every dependency is version-pinned', floating.length === 0, floating.join(', '));

  /* The lockfile has to exist, or CI installs something different. */
  check('the lockfile is committed', fs.existsSync(path.join(ROOT, 'package-lock.json')), '');
}

/* ---------------------------- 10. the site does not leak the stack */{
  const cfg = JSON.parse(read('vercel.json'));
  check('no framework is advertised in the headers',
    !JSON.stringify(cfg.headers).includes('X-Powered-By'), '');
  const html = allHtml;
  check('no stack traces are in the markup',
    !/at Object\.<anonymous>|node_modules|\/Users\//.test(html), '');
}

/* --------------------------------- 11. the browser has no inline script */
{
  const inline = [];
  htmlFiles.forEach((f) => {
    const src = read(f);
    const scripts = [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
    for (const s of scripts) {
      const body = s[1].trim();
      if (!body) continue;
      /* a JSON-LD block is data, not code */
      if (s[0].includes('application/ld+json')) continue;
      inline.push(`${f}: ${body.slice(0, 70).replace(/\n/g, ' ')}`);
    }
  });
  check('there is no inline script in the markup', inline.length === 0, inline.slice(0, 3).join(' | '));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} security checks passed`);
process.exitCode = failed.length ? 1 : 0;
