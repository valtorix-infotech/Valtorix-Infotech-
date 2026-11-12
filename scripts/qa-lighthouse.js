/* ==========================================================================
   VALTORIX INFOTECH — Lighthouse gate
   --------------------------------------------------------------------------
   Runs the Lighthouse CLI against the local server and fails the build if any
   category drops below the threshold. Automated tools catch roughly 30-40%
   of WCAG failures; this is the floor, not the ceiling.

     node scripts/qa-lighthouse.js [url] [threshold]
   ========================================================================== */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TARGET = process.argv[2] || process.env.LH_URL || 'http://localhost:8099/index.html';
const THRESHOLD = parseFloat(process.argv[3] || '0.95');
const PAGES = (process.env.LH_PAGES || 'index.html,about-us.html,services.html,solutions.html,projects.html,contact.html,start-a-project.html,privacy-policy.html,terms.html,404.html').split(',');

const OUT = path.join(__dirname, '.lighthouse');
fs.mkdirSync(OUT, { recursive: true });

let failed = 0;
for (const p of PAGES) {
  const url = TARGET.replace(/\/[^/]*$/, '/' + p);
  const file = path.join(OUT, p.replace(/\.html$/, '') + '.json');
  let report;
  try {
    /* invoke the CLI through node directly: `npx` is a .cmd on Windows and
       execFileSync cannot spawn it without a shell */
    const cli = path.join(__dirname, '..', 'node_modules', 'lighthouse', 'cli', 'index.js');
    execFileSync(process.execPath, [
      cli, url,
      '--only-categories=accessibility,best-practices,seo',
      '--output=json', '--output-path=' + file,
      '--chrome-flags=--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage',
      '--quiet'
    ], { stdio: 'pipe', timeout: 240000 });
    report = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    const msg = ((e.stderr || '') + (e.stdout || '') + (e.message || '')).toString().trim().slice(0, 160);
    console.log(`  FAIL ${p}: lighthouse could not run (${msg})`);
    failed++;
    continue;
  }

  const scores = report.categories;
  /* a noindex page (the 404) is *supposed* to be blocked from indexing, so
     the is-crawlable audit must not count against it */
  const noindex = /noindex/i.test(
    JSON.stringify((report.audits['is-crawlable'] || {}).details || '')
  );
  const CATS = noindex ? ['accessibility', 'best-practices'] : ['accessibility', 'best-practices', 'seo'];
  const line = CATS.map((c) => `${c} ${Math.round((scores[c] ? scores[c].score : 0) * 100)}`)
    .join('  ') + (noindex ? '  (noindex - seo not scored)' : '');
  const bad = CATS.filter((c) => !scores[c] || scores[c].score < THRESHOLD);

  if (bad.length) {
    console.log(`  FAIL ${p}: ${line}  (below ${THRESHOLD})`);
    /* name the failing audits so the log is actionable */
    Object.keys(report.audits || {}).forEach((id) => {
      const a = report.audits[id];
      if (a.score !== null && a.score < 1 && bad.some((c) => (report.categories[c].auditRefs || []).some((r) => r.id === id))) {
        console.log(`        - ${id}: ${a.title}`);
      }
    });
    failed++;
  } else {
    console.log(`  PASS ${p}: ${line}`);
  }
}

console.log(failed ? `\n${failed} page(s) failed the Lighthouse gate.` : '\nAll pages pass the Lighthouse gate.');
process.exitCode = failed ? 1 : 0;
