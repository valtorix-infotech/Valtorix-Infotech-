/* ==========================================================================
   VALTORIX INFOTECH — HTML validation
   --------------------------------------------------------------------------
   Every page is checked against the HTML spec and the WCAG-related rules
   html-validate ships with. This is the one suite that catches markup the
   browser silently repairs: a mis-nested tag, a missing closing quote, an
   aria attribute that points at nothing.

     node scripts/qa-html.js
   ========================================================================== */
const fs = require('fs');
const path = require('path');

const { HtmlValidate } = require('html-validate');

const ROOT = path.join(__dirname, '..');
const results = [];

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}

const htmlFiles = fs.readdirSync(ROOT)
  .filter((f) => f.endsWith('.html'))
  .sort();

const validator = new HtmlValidate({
  extends: ['html-validate:recommended'],
  root: true,
});

/* --------------------------------------------------- 1. the pages are valid */
{
  let total = 0;
  const byFile = new Map();
  for (const f of htmlFiles) {
    const report = validator.validateFileSync(path.join(ROOT, f));
    const messages = report.results[0] ? report.results[0].messages : [];
    total += messages.length;
    if (messages.length) byFile.set(f, messages);
  }

  check('every page passes the HTML validator', total === 0, total + ' message(s)');
  for (const [file, messages] of byFile) {
    for (const m of messages.slice(0, 8)) {
      console.log(`       ${file}:${m.line}:${m.column}  ${m.message}  [${m.ruleId}]`);
    }
  }
}

/* ------------------------------- 2. the pages share one consistent skeleton */
{
  const skeletons = new Set();
  for (const f of htmlFiles) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const has = (tag) => new RegExp(`<${tag}[\\s>]`).test(src);
    skeletons.add(['html', 'head', 'body', 'main', 'footer', 'nav']
      .map((t) => (has(t) ? t : '-' + t)).join('|'));
  }
  check('every page has the same document skeleton', skeletons.size === 1,
    [...skeletons].join('  /  '));
}

/* ------------------------------------------- 3. the page is a real document */
{
  const problems = [];
  for (const f of htmlFiles) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (!/^<!DOCTYPE html>/i.test(src.trim())) problems.push(`${f}: no doctype`);
    if (!/<meta charset="utf-8"\s*>/i.test(src)) problems.push(`${f}: no charset`);
    if (!/<meta name="viewport"/.test(src)) problems.push(`${f}: no viewport`);
    if (!/<html lang="[a-z-]+"/.test(src)) problems.push(`${f}: no lang`);
    if (!/<meta name="description" content="[^"]{50,}"/.test(src)) {
      problems.push(`${f}: a thin meta description`);
    }
  }
  check('every page is a complete document', problems.length === 0,
    problems.slice(0, 5).join(' | '));
}

/* ----------------------------------------- 4. the headings make a ladder */
{
  const problems = [];
  for (const f of htmlFiles) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const levels = [...src.matchAll(/<h([1-6])[\s>]/g)].map((m) => parseInt(m[1], 10));
    if (!levels.length) {
      problems.push(`${f}: no headings`);
      continue;
    }
    if (levels[0] !== 1) problems.push(`${f}: does not start at h1`);
    for (let i = 1; i < levels.length; i++) {
      /* a heading may skip back up (h3 -> h2 is fine) but not jump down two */
      if (levels[i] - levels[i - 1] > 1) {
        problems.push(`${f}: h${levels[i - 1]} -> h${levels[i]} skips a level`);
        break;
      }
    }
  }
  check('the heading levels form a ladder', problems.length === 0,
    problems.slice(0, 5).join(' | '));
}

/* ------------------------------------- 5. the landmarks are all present once */
{
  const problems = [];
  for (const f of htmlFiles) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const [tag, label] of [['main', 'the main landmark'], ['footer', 'a content info']]) {
      const n = (src.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length;
      if (n === 0) problems.push(`${f}: no ${label}`);
      if (n > 1) problems.push(`${f}: ${n} <${tag}> elements`);
    }
    /* Navigation: at least one, and every one of them must be named so a
       screen reader can tell the breadcrumb from the main menu. */
    const navs = [...src.matchAll(/<nav\b([^>]*)>/g)];
    if (!navs.length) problems.push(`${f}: no navigation landmark`);
    for (const n of navs) {
      if (!/aria-label=/.test(n[1])) problems.push(`${f}: a <nav> has no accessible name`);
    }
    /* A banner is a <header> that sits outside <main>. */
    const body = src.slice(src.indexOf('<body'));
    const headerAt = body.search(/<header[\s>]/);
    const mainAt = body.indexOf('<main');
    if (headerAt === -1 || (mainAt !== -1 && headerAt > mainAt)) {
      problems.push(`${f}: no banner landmark`);
    }
  }
  check('every page has its landmarks named and in place', problems.length === 0,
    problems.slice(0, 5).join(' | '));
}

/* --------------------------------------------- 6. the aria references resolve */
{
  const problems = [];
  for (const f of htmlFiles) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const ids = new Set([...src.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    /* aria-labelledby / aria-describedby / aria-controls */
    for (const m of src.matchAll(/\saria-(?:labelledby|describedby|controls|owns)="([^"]+)"/g)) {
      for (const ref of m[1].split(/\s+/).filter(Boolean)) {
        if (!ids.has(ref)) problems.push(`${f}: aria reference to a missing #${ref}`);
      }
    }
    /* for= must point at a real control */
    for (const m of src.matchAll(/\sfor="([^"]+)"/g)) {
      if (!ids.has(m[1])) problems.push(`${f}: label for=#${m[1]} has no target`);
    }
    /* href="#..." must point at a real element */
    for (const m of src.matchAll(/href="#([^"]+)"/g)) {
      if (m[1] && !ids.has(m[1])) problems.push(`${f}: link to a missing #${m[1]}`);
    }
  }
  check('every aria and anchor reference resolves', problems.length === 0,
    problems.slice(0, 6).join(' | '));
}

/* ------------------------------------------------ 7. the JSON-LD is valid */
{
  const problems = [];
  for (const f of htmlFiles) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      try {
        JSON.parse(m[1]);
      } catch (e) {
        problems.push(`${f}: ${e.message}`);
      }
    }
  }
  check('every structured-data block is valid JSON', problems.length === 0,
    problems.slice(0, 4).join(' | '));
}

/* --------------------------- 7b. the FAQ schema matches the visible page */
{
  /* The questions and answers live in the page, where a reader can see them.
     The structured data is generated from that markup, so it cannot drift -
     but only if the check keeps it honest. A mismatch is what search engines
     penalise, and it is invisible to every other check. */
  const problems = [];
  const decode = (s) => s
    .replace(/&nbsp;/g, ' ').replace(/&ndash;/g, '-').replace(/&mdash;/g, '-')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'").replace(/&lsquo;/g, "'")
    .replace(/&hellip;/g, '...').trim();

  for (const f of htmlFiles) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');

    /* the questions and answers as the reader sees them */
    const visible = [];
    const itemRe = /<h3 class="faq-q">\s*<button class="faq-question" type="button">([\s\S]*?)<i[^>]*><\/i><\/button>\s*<\/h3>\s*<div class="faq-answer"><div class="faq-answer-inner">([\s\S]*?)<\/div><\/div>/g;
    for (const m of src.matchAll(itemRe)) {
      const strip = (x) => decode(x.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
      visible.push({ q: strip(m[1]), a: strip(m[2]) });
    }

    /* and the structured data */
    const schemaRe = /<!-- FAQ SCHEMA: START -->\s*<script type="application\/ld\+json">([\s\S]*?)<\/script>/;
    const sm = src.match(schemaRe);
    let schema = [];
    if (sm) {
      try {
        const parsed = JSON.parse(sm[1]);
        schema = (parsed.mainEntity || []).map((n) => ({
          q: n.name,
          a: n.acceptedAnswer && n.acceptedAnswer.text
        }));
      } catch (e) {
        problems.push(`${f}: the FAQ schema does not parse`);
      }
    }

    if (visible.length !== schema.length) {
      problems.push(`${f}: ${visible.length} question(s) on the page, ${schema.length} in the schema`);
      continue;
    }
    for (let i = 0; i < visible.length; i++) {
      if (visible[i].q !== schema[i].q) {
        problems.push(`${f}: question ${i + 1} differs between the page and the schema`);
      }
      if (visible[i].a !== schema[i].a) {
        problems.push(`${f}: the answer to "${visible[i].q.slice(0, 40)}" differs between the page and the schema`);
      }
    }
  }
  check('the FAQ schema matches the visible questions and answers', problems.length === 0,
    problems.slice(0, 5).join(' | '));

  /* Every question has to be a heading, or the document outline has a hole
     where the question should be and no engine can pair question to answer. */
  const notHeadings = [];
  for (const f of htmlFiles) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const buttons = (src.match(/<button class="faq-question"/g) || []).length;
    const headings = (src.match(/<h3 class="faq-q">/g) || []).length;
    if (buttons !== headings) notHeadings.push(`${f}: ${buttons} question button(s), ${headings} heading(s)`);
  }
  check('every FAQ question is a heading', notHeadings.length === 0,
    notHeadings.slice(0, 4).join(' | '));
}

/* ------------------------------------------ 8. the forms are marked up right */
{
  const problems = [];
  for (const f of htmlFiles) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/<form\b[^>]*>/g)) {
      const tag = m[0];
      if (!/method="post"/i.test(tag)) problems.push(`${f}: a form has no method="post"`);
      if (!/action=/i.test(tag)) problems.push(`${f}: a form has no action`);
    }
    /* every button says what it does */
    for (const m of src.matchAll(/<button\b[^>]*>/g)) {
      if (!/type="/.test(m[0]) && !/type=/.test(m[0])) {
        problems.push(`${f}: a button has no explicit type`);
      }
    }
  }
  check('the forms and buttons are marked up correctly', problems.length === 0,
    problems.slice(0, 6).join(' | '));
}

/* --------------------------------------- 8b. the search snippets are right */
{
  /* Google truncates a title at roughly 55-60 characters and a meta
     description at about 160. A description that only describes, without
     asking the reader to do anything, wastes the only part of the page a
     searcher sees before they click. */
  const visible = (s) => (s || '')
    .replace(/&amp;/g, '&').replace(/&mdash;/g, '-').replace(/&ndash;/g, '-')
    .replace(/&nbsp;/g, ' ').replace(/&rsquo;/g, "'").replace(/&hellip;/g, '...');

  const tooLong = [];
  const noCta = [];
  const COMMERCIAL = ['index.html', 'about-us.html', 'services.html',
                      'solutions.html', 'projects.html', 'contact.html',
                      'start-a-project.html'];

  for (const f of htmlFiles) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const title = (src.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    const desc = (src.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';

    if (visible(title).length > 60) {
      tooLong.push(`${f}: the title is ${visible(title).length} characters`);
    }
    if (visible(desc).length > 160) {
      tooLong.push(`${f}: the description is ${visible(desc).length} characters`);
    }
    if (COMMERCIAL.includes(f)) {
      /* a call to action, not just a description */
      const cta = /\b(see|read|start|send|tell us|meet|find|browse|view|get|try|book|explore|discuss|choose)\b/i;
      if (!cta.test(visible(desc))) {
        noCta.push(`${f}: the description does not ask the reader to do anything`);
      }
    }
  }
  check('every title and description fits the search snippet', tooLong.length === 0,
    tooLong.slice(0, 5).join(' | '));
  check('every commercial description asks the reader to do something',
    noCta.length === 0, noCta.slice(0, 5).join(' | '));

  /* A page with no link to it in the body copy is reachable only from the
     navigation, which tells a search engine much less about it. */
  const NAV = /class="(nav-links|footer|nav-cta|nav-wrap|menu-btn|quick-links|footer-grid|footer-brand|footer-bottom|links)"/;
  const orphans = [];
  for (const f of htmlFiles) {
    if (f === '404.html' || f === 'index.html') continue;
    let inbound = 0;
    for (const g of htmlFiles) {
      if (g === f) continue;
      const src = fs.readFileSync(path.join(ROOT, g), 'utf8');
      /* only the body copy counts - the navigation is on every page */
      const body = src.replace(/<nav[\s\S]*?<\/nav>/g, '')
                      .replace(/<footer[\s\S]*?<\/footer>/g, '');
      const links = body.match(new RegExp('href="' + f.replace('.', '\\.') + '"', 'g'));
      if (links) inbound += links.length;
    }
    if (inbound === 0) orphans.push(f);
  }
  check('every page is linked from the body copy of another page',
    orphans.length === 0, orphans.join(', '));
}

/* ------------------------------------------- 9. the dependencies are declared */
{
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const declared = new Set([
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.devDependencies || {}),
  ]);
  /* the Node built-ins are not packages */
  const builtins = new Set(require('module').builtinModules);
  const problems = [];
  for (const f of ['scripts/qa-html.js', 'scripts/qa-assets.js', 'scripts/qa-api.js',
                   'scripts/qa-security.js', 'scripts/qa/_lib.js', 'scripts/lint.js']) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/require\('([a-z@][^'./][^']*)'\)/g)) {
      const pkg = m[1].startsWith('@') ? m[1].split('/').slice(0, 2).join('/') : m[1].split('/')[0];
      if (builtins.has(pkg)) continue;
      if (!declared.has(pkg)) problems.push(`${f}: "${pkg}" is not in package.json`);
    }
  }
  check('every required package is declared', problems.length === 0,
    problems.slice(0, 5).join(' | '));
}

/* ---------------------------------------------------- 10. the summary */
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} HTML checks passed`);
process.exitCode = failed.length ? 1 : 0;
