/* ==========================================================================
   VALTORIX INFOTECH — API tests
   --------------------------------------------------------------------------
   The serverless endpoint is the one piece of the site with a real surface
   area: it accepts anything a stranger can POST. These tests drive the real
   handler with a mock request/response, and unit-test the helpers it uses.

     node scripts/qa-api.js
   ========================================================================== */
const path = require('path');

/* Mock nodemailer BEFORE the handler is loaded, so no test ever opens a
   real SMTP connection. Every mail is captured for inspection. */
const sent = [];
const nodemailer = require('nodemailer');
nodemailer.createTransport = () => ({
  sendMail: async (options) => {
    sent.push(options);
    return { messageId: 'test-' + sent.length };
  },
  close: () => {}
});

const handler = require(path.join(__dirname, '..', 'api', 'send.js'));
const { esc, cleanFields, cleanSubject, cleanReplyTo, ownerHtml, replyHtml, pickName,
        rateLimited, MAX_FIELDS, MAX_VALUE_LEN } = handler._internals;

const results = [];

function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}

/** A mock Vercel request/response pair. */
function mockRes() {
  const res = {
    statusCode: null,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    setHeader(k, v) { this.headers[k] = v; }
  };
  return res;
}

/* Every test gets its own source IP, so the rate limiter (which is checked
   before the payload, exactly as in production) cannot make one test affect
   another. */
let ipCounter = 0;
function mockReq(body, opts = {}) {
  const ip = opts.ip || '10.0.0.' + (++ipCounter % 250);
  return {
    method: opts.method || 'POST',
    body: body,
    headers: { 'x-forwarded-for': ip },
    socket: { remoteAddress: ip }
  };
}

async function call(body, opts) {
  const res = mockRes();
  await handler(mockReq(body, opts), res);
  return res;
}

(async () => {
  /* ---------------------------------------------------------- method */
  {
    const res = mockRes();
    await handler(mockReq({}, { method: 'GET' }), res);
    check('GET is rejected', res.statusCode === 405, 'status=' + res.statusCode);
  }
  {
    const res = mockRes();
    await handler(mockReq({}, { method: 'PUT' }), res);
    check('PUT is rejected', res.statusCode === 405, 'status=' + res.statusCode);
  }

  /* ---------------------------------------------------------- payload */
  {
    const res = await call({});
    check('a body with no fields is rejected', res.statusCode === 400, 'status=' + res.statusCode);
  }
  {
    const res = await call({ fields: {} });
    check('an empty fields object is rejected', res.statusCode === 400, 'status=' + res.statusCode);
  }
  {
    const res = await call({ fields: ['a', 'b'] });
    check('an array payload is rejected', res.statusCode === 400, 'status=' + res.statusCode);
  }
  {
    const res = await call({ fields: 'not an object' });
    check('a string payload is rejected', res.statusCode === 400, 'status=' + res.statusCode);
  }
  {
    const res = await call({ fields: { Name: 'x', website: 'http://spam.example' } });
    check('the honeypot is rejected', res.statusCode === 400 && res.body.error === 'spam-detected',
      `status=${res.statusCode} error=${res.body && res.body.error}`);
  }
  {
    const res = await call({ fields: { Name: 'x', website: '   ' } });
    check('a whitespace honeypot is not rejected', res.statusCode !== 400,
      'status=' + res.statusCode);
  }

  /* -------------------------------------------------- configuration */
  {
    const savedUser = process.env.GMAIL_USER;
    const savedPass = process.env.GMAIL_APP_PASSWORD;
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;
    const res = await call({ fields: { Name: 'Test' } });
    check('a missing mail configuration fails loudly', res.statusCode === 500 &&
      res.body.error === 'mail-not-configured', `status=${res.statusCode}`);
    if (savedUser) process.env.GMAIL_USER = savedUser;
    if (savedPass) process.env.GMAIL_APP_PASSWORD = savedPass;
  }
  {
    /* a valid request with a mail configuration in place */
    const savedUser = process.env.GMAIL_USER;
    const savedPass = process.env.GMAIL_APP_PASSWORD;
    process.env.GMAIL_USER = 'studio@example.com';
    process.env.GMAIL_APP_PASSWORD = 'test-app-password';
    const res = await call({ fields: { Name: 'Test', Email: 'a@b.com' }, replyTo: 'a@b.com' });
    check('a valid request is accepted', res.statusCode === 200 && res.body.ok === true,
      `status=${res.statusCode}`);
    if (savedUser === undefined) delete process.env.GMAIL_USER;
    else process.env.GMAIL_USER = savedUser;
    if (savedPass === undefined) delete process.env.GMAIL_APP_PASSWORD;
    else process.env.GMAIL_APP_PASSWORD = savedPass;
  }

  /* --------------------------------------------------------- limits */
  {
    const many = {};
    for (let i = 0; i < MAX_FIELDS + 25; i++) many['k' + i] = 'v';
    const cleaned = cleanFields(many);
    check('the field count is capped', Object.keys(cleaned).length === MAX_FIELDS,
      `${Object.keys(cleaned).length} of ${MAX_FIELDS + 25}`);
  }
  {
    const long = 'x'.repeat(MAX_VALUE_LEN + 500);
    const cleaned = cleanFields({ Note: long });
    check('a long value is truncated', cleaned.Note.length === MAX_VALUE_LEN,
      `${cleaned.Note.length} chars`);
  }
  {
    const longKey = 'k'.repeat(200);
    const cleaned = cleanFields({ [longKey]: 'v' });
    check('a long key is truncated', Object.keys(cleaned)[0].length <= 60,
      `${Object.keys(cleaned)[0].length} chars`);
  }
  {
    const cleaned = cleanFields({ '  ': 'v', Name: 'ok' });
    check('a blank key is dropped', !Object.keys(cleaned).includes('  '),
      JSON.stringify(Object.keys(cleaned)));
  }

  /* ------------------------------------------------------- escaping */
  {
    const payloads = [
      '<script>alert(1)</script>',
      '"><img src=x onerror=alert(1)>',
      "'; DROP TABLE users; --",
      '<a href="javascript:alert(1)">x</a>',
      '&<>"\''
    ];
    let safe = true;
    for (const p of payloads) {
      const out = esc(p);
      if (out.includes('<') || out.includes('>')) safe = false;
    }
    check('the escape helper neutralises markup', safe);

    const html = ownerHtml('Test <b>x</b>', { Name: '<script>alert(1)</script>' });
    if (html.includes('<script>alert(1)</script>')) safe = false;
    check('the owner email escapes a field value', safe);

    const reply = replyHtml('<script>alert(1)</script>', 'Test');
    if (reply.includes('<script>alert(1)</script>')) safe = false;
    check('the auto-reply escapes the visitor name', safe);

    check('the subject is capped', cleanSubject('x'.repeat(300)).length === 120,
      `${cleanSubject('x'.repeat(300)).length} chars`);
    check('a missing subject gets the default', cleanSubject('').length > 0, cleanSubject(''));
    check('the reply-to is capped', cleanReplyTo('a'.repeat(400)).length === 200,
      `${cleanReplyTo('a'.repeat(400)).length} chars`);
    check('the reply-to is trimmed', cleanReplyTo('  a@b.com  ') === 'a@b.com',
      JSON.stringify(cleanReplyTo('  a@b.com  ')));
  }

  /* ------------------------------------------------------ pickName */
  {
    check('a name is taken from the first word', pickName({ 'Your Name': 'Ravi Kumar' }) === 'Ravi');
    check('a missing name falls back', pickName({}) === 'there');
    check('a placeholder name falls back', pickName({ Name: '—' }) === 'there');
  }

  /* ---------------------------------------------------- rate limit */
  {
    const ip = '203.0.113.99';
    let limited = false;
    let count = 0;
    for (let i = 0; i < 12; i++) {
      const res = await call({ fields: { Name: 'x' } }, { ip });
      if (res.statusCode === 429) limited = true;
      else count++;
    }
    check('a flood from one IP is rate limited', limited, `${count} accepted before the limit`);
  }
  {
    const res = await call({ fields: { Name: 'x' } }, { ip: '198.51.100.7' });
    check('a different IP is not affected by the limit', res.statusCode !== 429,
      'status=' + res.statusCode);
  }

  /* ------------------------------------------------- the mail itself */
  {
    const before = sent.length;
    const savedUser = process.env.GMAIL_USER;
    const savedPass = process.env.GMAIL_APP_PASSWORD;
    process.env.GMAIL_USER = 'studio@example.com';
    process.env.GMAIL_APP_PASSWORD = 'test-app-password';
    await call({
      fields: { Name: 'Ravi Kumar', Email: 'ravi@example.com', Message: 'Hello there' },
      subject: 'New Contact Message',
      replyTo: 'ravi@example.com'
    });
    await new Promise((r) => setTimeout(r, 250));
    const mails = sent.slice(before);
    check('the owner notification is sent', mails.length >= 1, `${mails.length} mail(s)`);
    const owner = mails.find((m) => m.to === 'valtorix.infotech@gmail.com');
    check('the owner notification goes to the studio inbox', !!owner,
      owner ? owner.to : mails.map((m) => m.to).join(', '));
    if (owner) {
      check('the visitor is set as the reply-to', owner.replyTo === 'ravi@example.com',
        String(owner.replyTo));
      check('the notification carries the submitted fields',
        owner.html.includes('Ravi Kumar') && owner.html.includes('ravi@example.com'), '');
      check('the notification is branded', owner.html.includes('VALTORIX'), '');
    }
    const auto = mails.find((m) => m.to === 'ravi@example.com');
    check('the visitor gets an auto-reply', !!auto, auto ? auto.subject : 'none');
    if (savedUser === undefined) delete process.env.GMAIL_USER;
    else process.env.GMAIL_USER = savedUser;
    if (savedPass === undefined) delete process.env.GMAIL_APP_PASSWORD;
    else process.env.GMAIL_APP_PASSWORD = savedPass;
  }

  /* ------------------------------------------------- the no-JS form post */
  {
    /* A browser without JavaScript posts the form as urlencoded, so every
       value arrives at the top level as a string. The endpoint has to
       accept that shape too. */
    const savedUser = process.env.GMAIL_USER;
    const savedPass = process.env.GMAIL_APP_PASSWORD;
    process.env.GMAIL_USER = 'studio@example.com';
    process.env.GMAIL_APP_PASSWORD = 'test-app-password';
    const before = sent.length;
    const res = await call({
      name: 'Ravi Kumar',
      email: 'ravi@example.com',
      message: 'Sent without JavaScript',
      subject: 'Website enquiry'
    });
    check('a plain form post is accepted', res.statusCode === 200 && res.body.ok === true,
      `status=${res.statusCode}`);
    await new Promise((r) => setTimeout(r, 250));
    const mails = sent.slice(before);
    const owner = mails.find((m) => m.to === 'valtorix.infotech@gmail.com');
    check('the form post reaches the studio inbox', !!owner, `${mails.length} mail(s)`);
    if (owner) {
      check('the form post sets the visitor as the reply-to',
        owner.replyTo === 'ravi@example.com', String(owner.replyTo));
      check('the form post carries its fields',
        owner.html.includes('Ravi Kumar') && owner.html.includes('Sent without JavaScript'), '');
    }
    const auto = mails.find((m) => m.to === 'ravi@example.com');
    check('the form post visitor gets an auto-reply', !!auto, auto ? auto.subject : 'none');
    if (savedUser === undefined) delete process.env.GMAIL_USER;
    else process.env.GMAIL_USER = savedUser;
    if (savedPass === undefined) delete process.env.GMAIL_APP_PASSWORD;
    else process.env.GMAIL_APP_PASSWORD = savedPass;
  }

  /* ------------------------------------------------------- summary */
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} API checks passed`);
  process.exitCode = failed.length ? 1 : 0;
})();
