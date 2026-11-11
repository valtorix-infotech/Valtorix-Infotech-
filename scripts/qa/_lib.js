/* ==========================================================================
   Shared helpers for the QA suites.
   --------------------------------------------------------------------------
   Every suite needs the same three things: a browser that can actually be
   found on this machine, the list of pages, and a way to report findings.
   This module owns all three so the suites stay about what they check.
   ========================================================================== */
const fs = require('fs');
const path = require('path');

const ENGINES = { chromium: require('playwright').chromium, firefox: require('playwright').firefox, webkit: require('playwright').webkit };

const BASE = process.env.BASE || 'http://localhost:8099';

const PAGES = (process.env.PAGES ||
  'index.html,about-us.html,services.html,solutions.html,projects.html,' +
  'contact.html,start-a-project.html,privacy-policy.html,terms.html,404.html'
).split(',').filter(Boolean);

/**
 * Find a usable browser binary. Playwright's own download is preferred; the
 * cached Playwright browser directories are the fallback, because a machine
 * may have them installed under a different revision than the client expects.
 */
function findBrowser() {
  const cache = path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'ms-playwright');
  const candidates = [
    'chromium-1248/chrome-win64/chrome.exe',
    'chromium-1228/chrome-win64/chrome.exe',
  ];
  for (const c of candidates) {
    const p = path.join(cache, c);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Launch a browser. Chromium is started from the cached binary so the suite
 * works on a machine with no Playwright download of its own.
 */
async function launch(name = 'chromium') {
  const type = ENGINES[name];
  if (!type) throw new Error('unknown browser engine: ' + name);
  const executablePath = name === 'chromium' ? findBrowser() : null;
  return type.launch(executablePath ? { executablePath } : {});
}

/** A new page on a fresh context, so each page is measured with a cold cache. */
async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const page = await ctx.newPage();
  return { ctx, page };
}

/** Collects findings and prints them as they happen. */
class Reporter {
  constructor(title) {
    this.title = title;
    this.findings = [];
    this.notes = [];
  }

  fail(area, message, extra) {
    this.findings.push({ area, message, extra: extra || '' });
    console.log(`  FAIL [${area}] ${message}${extra ? ' :: ' + extra : ''}`);
  }

  pass(area, message, extra) {
    console.log(`  PASS [${area}] ${message}${extra ? ' :: ' + extra : ''}`);
  }

  note(message) {
    this.notes.push(message);
  }

  /** Print the summary and write the JSON report. */
  summary(file) {
    console.log('\n================ SUMMARY ================');
    if (!this.findings.length) {
      console.log('0 failures.');
    } else {
      const byArea = {};
      for (const f of this.findings) (byArea[f.area] = byArea[f.area] || []).push(f);
      for (const area of Object.keys(byArea)) {
        console.log(`\n-- ${area} (${byArea[area].length})`);
        byArea[area].forEach((f) => console.log(`   ${f.message}${f.extra ? ' :: ' + f.extra : ''}`));
      }
    }
    if (this.notes.length) {
      console.log('\n-- notes (improvements, not failures) --');
      this.notes.forEach((n) => console.log('   ' + n));
    }
    if (file) {
      fs.writeFileSync(file, JSON.stringify({ findings: this.findings, notes: this.notes }, null, 2));
    }
    process.exitCode = this.findings.length ? 1 : 0;
  }
}

module.exports = { BASE, PAGES, launch, newPage, findBrowser, Reporter };
