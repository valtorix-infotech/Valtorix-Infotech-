const { BASE, launch, newPage } = require('./qa/_lib.js');
const fs = require('fs');
const path = require('path');
const results = [];

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}

(async () => {
  const browser = await launch('chromium');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  /* ---------- 1. Contact form validation ---------- */
  await page.goto(`${BASE}/contact.html?t=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
  let posts = 0;
  page.on('request', (r) => { if (r.url().includes('/api/send')) posts++; });

  await page.click('#contactFormElement button[type=submit]');
  await page.waitForTimeout(600);
  const errCount = await page.locator('.field-err').count();
  check('contact: empty submit shows inline validation', errCount >= 4, `${errCount} errors`);
  check('contact: empty submit does not POST', posts === 0, `posts=${posts}`);
  const toastText = await page.locator('.v-toast').textContent().catch(() => '');
  check('contact: empty submit shows a toast', !!toastText, toastText);

  /* ---------- 2. Contact form happy path ---------- */
  await page.click('.subject[data-subject="Web Development"]');
  await page.fill('#cname', 'Ravi Kumar');
  await page.fill('#cemail', 'ravi@example.com');
  await page.fill('#cphone', '9876543210');
  await page.fill('#cmessage', 'We need a website and a small customer portal for our business.');
  await page.selectOption('#cmethod', 'WhatsApp');
  await page.selectOption('#ctime', 'Morning (9 AM – 12 PM)');
  const msg = 'We need a website and a small customer portal for our business.';
  const counter = await page.locator('[data-count="cmessage"]').textContent();
  check('contact: char counter tracks input', counter === String(msg.length), `counter=${counter} expected=${msg.length}`);

  await page.click('#contactFormElement button[type=submit]');
  await page.waitForTimeout(2500);
  check('contact: valid submit POSTs to /api/send', posts === 1, `posts=${posts}`);
  const errBox = await page.locator('#contactForm .send-error').count();
  check('contact: failure path shows WhatsApp fallback (no local API)', errBox === 1, `send-error boxes=${errBox}`);
  const waLink = await page.locator('#contactForm .send-error a').getAttribute('href').catch(() => '');
  check('contact: fallback links to WhatsApp', (waLink || '').includes('wa.me/917989369571'), waLink);

  /* ---------- 3. Multi-step project form ---------- */
  await page.goto(`${BASE}/start-a-project.html?t=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
  let posts2 = 0;
  page.on('request', (r) => { if (r.url().includes('/api/send')) posts2++; });

  await page.click('#nextBtn');
  await page.waitForTimeout(400);
  const stillStep1 = await page.locator('.form-step[data-step="1"]').isVisible();
  check('project: step 1 blocks advance when empty', stillStep1, 'still on step 1');

  await page.click('#projectType .option[data-value="Web Application"]');
  await page.fill('#projectTitle', 'Client portal');
  await page.fill('#name', 'Anita Rao');
  await page.fill('#email', 'anita@example.com');
  await page.fill('#phone', '9000000001');
  await page.fill('#overview', 'A portal where our customers can log in and see their order history.');
  await page.click('#nextBtn');
  await page.waitForTimeout(600);
  const step2 = await page.locator('.form-step[data-step="2"]').isVisible();
  check('project: advances to step 2 once step 1 is valid', step2, '');

  await page.click('#nextBtn');
  await page.waitForTimeout(400);
  const step2Still = await page.locator('.form-step[data-step="2"]').isVisible();
  check('project: step 2 blocks advance when requirements empty', step2Still, '');

  await page.fill('#requirements', 'Login, order history, invoice download and an admin screen for our staff.');
  await page.click('#nextBtn');
  await page.waitForTimeout(600);
  const step3 = await page.locator('.form-step[data-step="3"]').isVisible();
  check('project: advances to step 3', step3, '');

  await page.click('#nextBtn');
  await page.waitForTimeout(400);
  const step3Still = await page.locator('.form-step[data-step="3"]').isVisible();
  check('project: step 3 blocks advance without timeline/budget', step3Still, '');

  await page.click('#timelineChoices .choice[data-value="1 - 3 Months"]');
  await page.click('#budgetChoices .choice[data-value="₹25,000 - ₹50,000"]');
  await page.click('#goalChoices .option[data-value="Automate Processes"]');
  await page.click('#nextBtn');
  await page.waitForTimeout(700);
  const step4 = await page.locator('.form-step[data-step="4"]').isVisible();
  check('project: advances to review step', step4, '');

  const rTitle = await page.locator('#rTitle').textContent();
  const rType = await page.locator('#rType').textContent();
  const rTimeline = await page.locator('#rTimeline').textContent();
  const rBudget = await page.locator('#rBudget').textContent();
  const rGoals = await page.locator('#rGoals').textContent();
  check('project: review shows project title', rTitle.trim() === 'Client portal', rTitle);
  check('project: review shows project type', rType.trim() === 'Web Application', rType);
  check('project: review shows timeline', rTimeline.trim() === '1 - 3 Months', rTimeline);
  check('project: review shows budget', rBudget.trim() === '₹25,000 - ₹50,000', rBudget);
  check('project: review shows goals', rGoals.trim() === 'Automate Processes', rGoals);

  await page.click('#nextBtn');
  await page.waitForTimeout(500);
  check('project: submit blocked until terms accepted', posts2 === 0, `posts=${posts2}`);

  await page.check('#terms');
  await page.click('#nextBtn');
  await page.waitForTimeout(2500);
  check('project: submit POSTs to /api/send', posts2 === 1, `posts=${posts2}`);
  const refId = await page.locator('#referenceId').textContent();
  check('project: reference id is generated', /^VTX-\d{4}-\d{4}-\d{4}$/.test(refId.trim()), refId);

  /* ---------- 4. Back button + edit ---------- */
  await page.goto(`${BASE}/start-a-project.html?t=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
  await page.click('#projectType .option[data-value="Website"]');
  await page.fill('#projectTitle', 'Rebrand site');
  await page.fill('#name', 'Sam');
  await page.fill('#email', 'sam@example.com');
  await page.fill('#phone', '9000000002');
  await page.fill('#overview', 'A new marketing website for our new brand.');
  await page.click('#nextBtn');
  await page.waitForTimeout(500);
  await page.click('#backBtn');
  await page.waitForTimeout(500);
  const backOk = await page.locator('.form-step[data-step="1"]').isVisible();
  check('project: back button returns to step 1', backOk, '');

  /* ---------- 4b. The wizard is a real form ---------- */
  const nextType = await page.locator('#nextBtn').getAttribute('type');
  check('project: the next button is a submit button', nextType === 'submit', nextType);

  const insideForm = await page.evaluate(() => {
    const b = document.getElementById('nextBtn');
    const f = document.getElementById('projectForm');
    return !!(b && f && f.contains(b));
  });
  check('project: the submit button is inside its own form', insideForm, '');

  const formAttrs = await page.evaluate(() => {
    const f = document.getElementById('projectForm');
    return { method: f.getAttribute('method'), action: f.getAttribute('action') };
  });
  check('project: the form can post without JavaScript',
    formAttrs.method === 'post' && !!formAttrs.action,
    `${formAttrs.method} ${formAttrs.action}`);

  /* Pressing Enter in a single-line field should move the wizard on, exactly
     as clicking the button does. (Enter inside a textarea is a newline, so
     that is deliberately not the field used here.) */
  await page.fill('#name', 'Sam');
  await page.fill('#email', 'sam@example.com');
  await page.fill('#phone', '9000000002');
  await page.fill('#overview', 'A new marketing website for our new brand.');
  await page.locator('#name').press('Enter');
  await page.waitForTimeout(600);
  const advanced = await page.locator('.form-step[data-step="2"]').isVisible();
  check('project: Enter in a field advances the wizard', advanced, '');

  /* The wizard must never navigate the page away. */
  const stillHere = page.url().includes('start-a-project');
  check('project: the wizard never navigates away', stillHere, page.url());

  /* ---------- 5. FAQ accordion ---------- */
  await page.goto(`${BASE}/index.html?t=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
  const firstFaq = page.locator('.faq-item').first();
  // measure the clipping container, not the paragraph inside it
  const visibleH = (item) => item.locator('.faq-answer').evaluate((e) => e.getBoundingClientRect().height);
  await firstFaq.locator('.faq-question').click();
  await page.waitForTimeout(600);
  const h = await visibleH(firstFaq);
  check('faq: accordion opens', h > 10, `height=${Math.round(h)}`);
  const secondFaq = page.locator('.faq-item').nth(1);
  await secondFaq.locator('.faq-question').click();
  await page.waitForTimeout(700);
  const h0 = await visibleH(firstFaq);
  const h1 = await visibleH(secondFaq);
  check('faq: single-open behaviour', h0 < 5 && h1 > 10, `first=${Math.round(h0)} second=${Math.round(h1)}`);

  /* ---------- 6. Project filters ---------- */
  await page.goto(`${BASE}/projects.html?t=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
  const total = await page.locator('[data-category]').count();
  await page.click('.filter-btn[data-filter="ai"]');
  await page.waitForTimeout(300);
  const visible = await page.locator('[data-category]:visible').count();
  check('work: category filter narrows the grid', visible === 1 && visible < total, `${visible}/${total} visible`);
  await page.click('.filter-btn[data-filter="all"]');
  await page.waitForTimeout(300);
  const allVisible = await page.locator('[data-category]:visible').count();
  check('work: "all" restores every card', allVisible === total, `${allVisible}/${total}`);

  /* ---------- 7. Nav active state + mobile menu ---------- */
  await page.goto(`${BASE}/services.html?t=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
  const activeHref = await page.locator('#navbar .nav-links a.active').getAttribute('href');
  check('nav: current page is marked active', activeHref === 'services.html', activeHref);

  const m = await ctx.newPage();
  await m.setViewportSize({ width: 390, height: 844 });
  await m.goto(`${BASE}/index.html?t=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
  const hiddenBefore = await m.locator('#navbar .nav-links').isVisible();
  await m.click('.menu-btn');
  await m.waitForTimeout(500);
  const shownAfter = await m.locator('#navbar .nav-links').isVisible();
  check('mobile: drawer opens', !hiddenBefore && shownAfter, `before=${hiddenBefore} after=${shownAfter}`);
  const expanded = await m.locator('.menu-btn').getAttribute('aria-expanded');
  check('mobile: menu button reports aria-expanded', expanded === 'true', expanded);
  await m.click('#navbar .nav-links a[href="services.html"]');
  await m.waitForTimeout(400);
  const closedAfterNav = await m.locator('#navbar .nav-links').isVisible();
  check('mobile: drawer closes after navigating', !closedAfterNav, '');

  /* ---------- 8. Honeypot ---------- */
  await page.goto(`${BASE}/contact.html?t=${Date.now()}`, { waitUntil: 'load', timeout: 30000 });
  let posts3 = 0;
  page.on('request', (r) => { if (r.url().includes('/api/send')) posts3++; });
  await page.fill('#website', 'http://spam.example');
  await page.fill('#cname', 'Spam Bot');
  await page.fill('#cemail', 'spam@example.com');
  await page.fill('#cphone', '9000000003');
  await page.fill('#cmessage', 'Buy cheap backlinks right now please.');
  await page.click('#contactFormElement button[type=submit]');
  await page.waitForTimeout(800);
  check('security: honeypot blocks the submission', posts3 === 0, `posts=${posts3}`);

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('FAILED:');
    failed.forEach((f) => console.log('  - ' + f.name + (f.detail ? ' :: ' + f.detail : '')));
    process.exitCode = 1;
  }
})();
