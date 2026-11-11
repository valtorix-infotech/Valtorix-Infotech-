/* ==========================================================================
   VALTORIX INFOTECH — project lint
   --------------------------------------------------------------------------
   The checks that catch the mistakes this codebase has actually made, so
   they cannot come back. It is deliberately dependency-free.

     node scripts/lint.js
   ========================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const problems = [];

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function list(dir, ext) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir))) {
    if (entry.endsWith(ext)) out.push(path.join(dir, entry));
  }
  return out;
}

const htmlFiles = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort();
const siteJs = ['app.js', 'stage3d.js', 'stage3d-init.js', 'api/send.js'];

/* ------------------------------------------------------------------ JS */
for (const file of siteJs) {
  const src = read(file);
  const lines = src.split('\n');

  lines.forEach((line, i) => {
    if (/\bvar\s+[A-Za-z_$]/.test(line)) {
      problems.push(`${file}:${i + 1}  uses "var" - the codebase is ES6 (const/let)`);
    }
    if (/\bdebugger\b/.test(line)) {
      problems.push(`${file}:${i + 1}  contains "debugger"`);
    }
    if (/\bTODO\b|\bFIXME\b|\bXXX\b/.test(line)) {
      problems.push(`${file}:${i + 1}  contains an unresolved TODO/FIXME`);
    }
    if (/console\.(log|debug)\(/.test(line) && file !== 'api/send.js') {
      problems.push(`${file}:${i + 1}  leaves a console.log/debug in shipped code`);
    }
    /* `x == null` is the idiomatic null-or-undefined check and is fine */
    const loose = line.replace(/==\s*null/g, '');
    if (/[^=!<>]==[^=]/.test(loose) && !/\/\/|\*|https?:/.test(line)) {
      problems.push(`${file}:${i + 1}  uses "==" - prefer "==="`);
    }
  });

  /* the file must end with a newline and use LF */
  if (!src.endsWith('\n')) problems.push(`${file}  does not end with a newline`);
  if (src.includes('\r\n')) problems.push(`${file}  uses CRLF line endings`);
}

/* ------------------------------------------------------------------ HTML */
for (const file of htmlFiles) {
  const src = read(file);
  const lines = src.split('\n');

  const ids = {};
  const dupes = [];
  for (const m of src.matchAll(/\sid="([^"]+)"/g)) {
    ids[m[1]] = (ids[m[1]] || 0) + 1;
  }
  for (const [id, n] of Object.entries(ids)) {
    if (n > 1) dupes.push(`${id} (${n}x)`);
  }
  if (dupes.length) problems.push(`${file}  duplicate id attribute(s): ${dupes.join(', ')}`);

  const h1s = (src.match(/<h1[\s>]/g) || []).length;
  if (h1s !== 1) problems.push(`${file}  has ${h1s} <h1> elements, expected exactly 1`);

  if (!/<title>[^<]{10,}<\/title>/.test(src)) problems.push(`${file}  has no meaningful <title>`);
  if (!/<meta name="description" content="[^"]{70,}"/.test(src)) {
    problems.push(`${file}  has no meta description of at least 70 characters`);
  }
  /* a noindex page (the 404) must NOT be canonicalised */
  const noindex = /name="robots"[^>]*content="[^"]*noindex/i.test(src);
  if (!/<link rel="canonical"/.test(src) && !noindex) {
    problems.push(`${file}  has no canonical link`);
  }
  if (!/<html lang="[a-z-]+"/.test(src)) problems.push(`${file}  has no lang attribute`);
  if (!/name="viewport"/.test(src)) problems.push(`${file}  has no viewport meta`);

  /* every referenced local file must exist */
  for (const m of src.matchAll(/(?:src|href)="([^"#?]+)"/g)) {
    const ref = m[1];
    if (/^(https?:|mailto:|tel:|data:|\/\/)/.test(ref)) continue;
    if (!fs.existsSync(path.join(ROOT, ref))) {
      problems.push(`${file}  references a file that does not exist: ${ref}`);
    }
  }

  /* an image without an alt attribute */
  for (const m of src.matchAll(/<img\s[^>]*>/g)) {
    if (!/\salt="/.test(m[0])) problems.push(`${file}  an <img> has no alt attribute`);
  }

  /* a form control without a label */
  for (const m of src.matchAll(/<(input|select|textarea)\s[^>]*>/g)) {
    const tag = m[0];
    if (/type="hidden"/.test(tag)) continue;
    const id = (tag.match(/\sid="([^"]+)"/) || [])[1];
    if (!id) continue;
    /* a control inside a <label> is associated implicitly */
    const labelBlocks = [...src.matchAll(/<label[^>]*>[\s\S]*?<\/label>/g)].map((m) => m[0]);
    const wrapped = labelBlocks.some((b) => b.includes(`id="${id}"`));
    if (!new RegExp(`label[^>]*for="${id}"`).test(src) && !wrapped && !/aria-label=/.test(tag)) {
      problems.push(`${file}  the control #${id} has no associated label`);
    }
  }

  lines.forEach((line, i) => {
    if (/\sstyle="/.test(line) && /font-size|color:|background/.test(line)) {
      problems.push(`${file}:${i + 1}  an inline style sets a visual property - move it to styles.css`);
    }
  });
}

/* ------------------------------------------------------------------ CSS */
{
  const src = read('styles.css');
  if (src.includes('\r\n')) problems.push('styles.css  uses CRLF line endings');
  if (!src.endsWith('\n')) problems.push('styles.css  does not end with a newline');

  /* a selector list that ends with a comma swallows the next rule */
  const dangling = [...src.matchAll(/,\s*\n\s*\n/g)];
  if (dangling.length) {
    problems.push(`styles.css  ${dangling.length} selector list(s) end with a comma and merge the next rule`);
  }

  /* a trailing comma before the brace is a syntax error: the rule is dropped */
  const trailingComma = [...src.matchAll(/,\s*\{/g)];
  if (trailingComma.length) {
    problems.push(`styles.css  ${trailingComma.length} rule(s) end with a trailing comma and are dropped by the browser`);
  }

  /* a selector that no page uses is dead weight */
  const html = htmlFiles.map(read).join('\n');
  const usedClasses = new Set();
  for (const m of html.matchAll(/class="([^"]+)"/g)) {
    m[1].split(/\s+/).forEach((c) => c && usedClasses.add(c));
  }
  /* classes the scripts create at runtime */
  const RUNTIME = new Set(['v-toast', 'field-err', 'pick-error', 'send-error', 'is-3d', 'is-loaded', 'broken', 'has-broken', 'scroll-progress', 'v-toast', 'invalid', 'active', 'selected', 'revealed', 'show', 'scrolled', 'is-current', 'done', 'pick-missing']);
  const seen = new Set();
  for (const m of src.matchAll(/^\s*\.([A-Za-z][\w-]*)/gm)) {
    const cls = m[1];
    if (seen.has(cls)) continue;
    seen.add(cls);
    if (!usedClasses.has(cls) && !RUNTIME.has(cls)) {
      problems.push(`styles.css  the class "${cls}" is not used by any page`);
    }
  }
}

/* ------------------------------------------------------------------ JSON */
for (const file of ['package.json', 'tsconfig.json'].filter((f) => fs.existsSync(path.join(ROOT, f)))) {
  try {
    JSON.parse(read(file));
  } catch (e) {
    problems.push(`${file}  is not valid JSON: ${e.message}`);
  }
}
for (const file of fs.existsSync(path.join(ROOT, 'scripts')) ? list('scripts', '.json') : []) {
  try {
    JSON.parse(read(file));
  } catch (e) {
    problems.push(`${file}  is not valid JSON: ${e.message}`);
  }
}

/* ------------------------------------------------------------------ report */
console.log('VALTORIX lint\n');
if (!problems.length) {
  console.log('No problems found.');
} else {
  for (const p of problems) console.log('  ' + p);
  console.log(`\n${problems.length} problem(s).`);
  process.exitCode = 1;
}
