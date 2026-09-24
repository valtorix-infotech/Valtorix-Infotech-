/* VALTORIX INFOTECH — contact/project mail API (Vercel serverless).
   Responds instantly (~1s); mail is sent in background via waitUntil.
   POST { subject, replyTo, fields } -> branded owner mail + rich auto-reply.
   Needs env: GMAIL_USER, GMAIL_APP_PASSWORD (Google app password). */
const nodemailer = require('nodemailer');

let waitUntil = null;
try {
  ({ waitUntil } = require('@vercel/functions'));
} catch (e) { /* local preview: fall back to awaiting */ }

const OWNER = 'valtorix.infotech@gmail.com';
const SITE = 'https://valtorixinfotech-1446.vercel.app';
const PHONE = '+91 79893 69571';
const WA = 'https://wa.me/917989369571';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pickName(fields) {
  const v = fields['Your Name'] || fields['Name'] || '';
  return String(v).trim() && String(v).trim() !== '—' ? String(v).trim().split(' ')[0] : 'there';
}

function ownerHtml(subject, fields) {
  const rows = Object.keys(fields)
    .map(
      (k, i) =>
        '<tr><td style="padding:10px 12px;border:1px solid #dbe7f5;background:' +
        (i % 2 ? '#ffffff' : '#f1f7ff') +
        ';font-weight:bold;color:#10294d;width:190px;">' +
        esc(k) +
        '</td><td style="padding:10px 12px;border:1px solid #dbe7f5;color:#33445f;">' +
        esc(fields[k]) +
        '</td></tr>'
    )
    .join('');
  return (
    '<div style="max-width:640px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;background:#f4f8fd;padding:20px;">' +
    '<div style="background:#0e5bc0;color:#ffffff;padding:18px 22px;border-radius:10px 10px 0 0;">' +
    '<div style="font-size:12px;letter-spacing:2px;opacity:.85;">VALTORIX INFOTECH</div>' +
    '<div style="font-size:20px;font-weight:bold;margin-top:4px;">' + esc(subject) + '</div></div>' +
    '<div style="background:#ffffff;padding:20px 22px;border:1px solid #dbe7f5;border-top:none;">' +
    '<table style="width:100%;border-collapse:collapse;font-size:14px;">' + rows + '</table></div>' +
    '<div style="text-align:center;font-size:12px;color:#7890b0;padding:14px;">' +
    'Sent from website enquiry form • Mon–Sat 9AM–9PM (Sun closed)</div></div>'
  );
}

function replyHtml(name, subject) {
  const step = (n, t) =>
    '<table style="width:100%;border-collapse:collapse;margin:0 0 12px;"><tr>' +
    '<td valign="top" style="width:34px;"><div style="width:34px;height:34px;line-height:34px;background:#0e5bc0;color:#fff;text-align:center;' +
    'font-weight:bold;border-radius:8px;font-size:15px;">' + n + '</div></td>' +
    '<td valign="top" style="padding:7px 0 7px 12px;color:#33445f;font-size:14px;line-height:1.6;">' + t + '</td>' +
    '</tr></table>';
  return (
    '<div style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;background:#f4f8fd;padding:20px;">' +
    '<div style="background:#0e5bc0;color:#ffffff;padding:20px 22px;border-radius:10px 10px 0 0;">' +
    '<div style="font-size:12px;letter-spacing:2px;opacity:.85;">VALTORIX INFOTECH • HYDERABAD</div>' +
    '<div style="font-size:22px;font-weight:bold;margin-top:4px;">Hi ' + esc(name) + ', we got your message!</div></div>' +
    '<div style="background:#ffffff;padding:20px 22px;border:1px solid #dbe7f5;border-top:none;">' +
    '<p style="font-size:14px;color:#33445f;line-height:1.7;">Thank you for reaching out' +
    (subject ? ' about <b>' + esc(subject) + '</b>' : '') +
    '. Our team will contact you shortly — usually within 24 hours on business days.</p>' +
    '<div style="margin:14px 0 4px;">' +
    step('1', 'We review your requirement carefully.') +
    step('2', 'We call / WhatsApp you to discuss the best approach.') +
    step('3', 'You get a clear plan with timeline and cost.') +
    '</div>' +
    '<p style="font-size:14px;color:#33445f;">Need it urgent? Reply to this mail or chat now:<br>' +
    '<a href="' + WA + '" style="display:inline-block;margin-top:10px;background:#0e5bc0;color:#fff;' +
    'text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:bold;">Chat on WhatsApp</a></p>' +
    '<p style="font-size:12px;color:#7890b0;margin-top:16px;">Mon–Sat 9:00 AM–9:00 PM (Sunday closed) • ' +
    PHONE + ' • ' + SITE + '</p></div></div>'
  );
}

function replyText(name) {
  return (
    'Hi ' + name + ',\n\nThank you for contacting VALTORIX INFOTECH!\n\n' +
    'We received your details. What happens next:\n' +
    '1. We review your requirement (within 24 hours on business days).\n' +
    '2. We call / WhatsApp you to discuss the best approach.\n' +
    '3. You get a clear plan with timeline and cost.\n\n' +
    'Urgent? WhatsApp us: ' + WA + '\n\n' +
    'Mon-Sat 9AM-9PM (Sunday closed) | ' + PHONE + '\n' +
    '— Team VALTORIX INFOTECH, Hyderabad'
  );
}

function makeTransport(user, pass) {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
  });
}

async function sendWithRetry(user, pass, label, mailOptions, tries) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    const t = makeTransport(user, pass);
    try {
      const info = await t.sendMail(mailOptions);
      try { t.close(); } catch (e) {}
      console.log(label + ' sent:', info && info.messageId);
      return true;
    } catch (e) {
      lastErr = e;
      console.error(label + ' attempt ' + (i + 1) + ' failed:', e && e.message);
      try { t.close(); } catch (ce) {}
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  console.error(label + ' FAILED after retries:', lastErr && lastErr.message);
  return false;
}

async function deliver(user, pass, subject, replyTo, fields) {
  const name = pickName(fields);
  const okOwner = await sendWithRetry(user, pass, 'owner-mail', {
    from: 'VALTORIX Website <' + user + '>',
    to: OWNER,
    replyTo: replyTo || undefined,
    subject,
    html: ownerHtml(subject, fields),
  }, 2);
  if (!okOwner) throw new Error('owner mail failed');
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(replyTo)) {
    await sendWithRetry(user, pass, 'auto-reply', {
      from: 'VALTORIX INFOTECH <' + user + '>',
      to: replyTo,
      subject: 'We received your enquiry — VALTORIX INFOTECH',
      text: replyText(name),
      html: replyHtml(name, ''),
    }, 3);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const body = req.body || {};
  const fields = body.fields;
  if (!fields || typeof fields !== 'object' || !Object.keys(fields).length) {
    return res.status(400).json({ ok: false });
  }
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return res.status(500).json({ ok: false, error: 'mail-not-configured' });

  const subject = String(body.subject || 'Website enquiry — VALTORIX').slice(0, 120);
  const replyTo = String(body.replyTo || '').trim();

  /* Fast path: queue mail in background, reply to visitor at once. */
  const job = deliver(user, pass, subject, replyTo, fields).catch((e) => {
    console.error('mail background send failed:', e && e.message);
  });
  if (waitUntil) waitUntil(job);
  else await job;
  return res.status(200).json({ ok: true });
};
