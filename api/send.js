/* VALTORIX INFOTECH — contact / project-request mail API (Vercel serverless).
 *
 * Contract (unchanged, do not break the frontend):
 *   POST { subject, replyTo, fields }  ->  200 { ok: true }
 *
 * Behaviour:
 *   - Replies immediately (200) and sends mail in the background via waitUntil.
 *   - Sends an owner notification + a branded auto-reply to the visitor.
 *   - Rejects honeypot hits, malformed field payloads and abuse.
 *
 * Env:
 *   GMAIL_USER         Gmail address used as the SMTP sender      (required)
 *   GMAIL_APP_PASSWORD Google app password for the SMTP account    (required)
 *   SITE_URL           Public site origin, used in emails (optional)
 */
const nodemailer = require('nodemailer');

let waitUntil = null;
try {
  ({ waitUntil } = require('@vercel/functions'));
} catch (e) {
  /* local preview: fall back to awaiting the job */
}

const OWNER = 'valtorix.infotech@gmail.com';
const SITE = process.env.SITE_URL || 'https://valtorixinfotech-1446.vercel.app';
const PHONE = '+91 79893 69571';
const WA = 'https://wa.me/917989369571';

/* Brand palette — mirrors styles.css */
const INK = '#0a0a0a';
const ACCENT = '#1f6feb';
const PAPER = '#ffffff';
const LINE = '#e4e4df';
const TEXT = '#3d3d3a';
const MUTED = '#8a8a8a';

/* ------------------------------------------------------------------ limits */
const MAX_FIELDS = 40;
const MAX_KEY_LEN = 60;
const MAX_VALUE_LEN = 4000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 8; // per IP per window — generous, this is a shared-IP market

const hits = new Map();

function rateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_MAX) {
    hits.set(ip, list);
    return true;
  }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear(); // keep the map from growing without bound
  return false;
}

/* ----------------------------------------------------------------- helpers */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cleanFields(fields) {
  const out = {};
  let i = 0;
  for (const k of Object.keys(fields)) {
    if (i++ >= MAX_FIELDS) break;
    const key = String(k).slice(0, MAX_KEY_LEN);
    const val = String(fields[k] == null ? '' : fields[k]).slice(0, MAX_VALUE_LEN);
    if (!key.trim()) continue;
    out[key] = val;
  }
  return out;
}

function pickName(fields) {
  const v = fields['Your Name'] || fields['Name'] || '';
  return String(v).trim() && String(v).trim() !== '—' ? String(v).trim().split(' ')[0] : 'there';
}

function brandHeader(label) {
  return (
    '<div style="padding:22px 22px 18px;background:' + INK + ';">' +
    '<div style="font-size:11px;letter-spacing:3px;color:#8a8a8a;">' + esc(label) + '</div>' +
    '<div style="font-size:19px;font-weight:700;color:' + PAPER + ';margin-top:6px;">VALTORIX INFOTECH</div>' +
    '</div>'
  );
}

/* ------------------------------------------------------------------ emails */
function ownerHtml(subject, fields) {
  const rows = Object.keys(fields)
    .map(
      (k, i) =>
        '<tr><td style="padding:10px 12px;border:1px solid ' + LINE + ';background:' +
        (i % 2 ? PAPER : '#f7f7f5') +
        ';font-weight:bold;color:' + INK + ';width:190px;vertical-align:top;">' +
        esc(k) +
        '</td><td style="padding:10px 12px;border:1px solid ' + LINE + ';color:' + TEXT + ';">' +
        esc(fields[k]).replace(/\n/g, '<br>') +
        '</td></tr>'
    )
    .join('');
  return (
    '<div style="max-width:640px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;background:#f7f7f5;padding:20px;">' +
    brandHeader('NEW WEBSITE ENQUIRY') +
    '<div style="background:' + PAPER + ';padding:20px 22px;border:1px solid ' + LINE + ';border-top:none;">' +
    '<div style="font-size:17px;font-weight:bold;color:' + INK + ';margin-bottom:14px;">' + esc(subject) + '</div>' +
    '<table style="width:100%;border-collapse:collapse;font-size:14px;">' + rows + '</table>' +
    '<div style="margin-top:16px;"><a href="' + SITE + '" style="display:inline-block;background:' + INK +
    ';color:' + PAPER + ';text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:bold;font-size:13px;">Open website</a></div>' +
    '</div>' +
    '<div style="text-align:center;font-size:12px;color:' + MUTED + ';padding:14px;">' +
    'Sent from the VALTORIX website &bull; Mon&ndash;Sat 9AM&ndash;9PM (Sunday closed)</div></div>'
  );
}

function replyHtml(name, subject) {
  const step = (n, t) =>
    '<table style="width:100%;border-collapse:collapse;margin:0 0 12px;"><tr>' +
    '<td valign="top" style="width:34px;"><div style="width:34px;height:34px;line-height:34px;background:' + ACCENT +
    ';color:#fff;text-align:center;font-weight:bold;border-radius:8px;font-size:15px;">' + n + '</div></td>' +
    '<td valign="top" style="padding:7px 0 7px 12px;color:' + TEXT + ';font-size:14px;line-height:1.6;">' + t + '</td>' +
    '</tr></table>';
  return (
    '<div style="max-width:600px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;background:#f7f7f5;padding:20px;">' +
    brandHeader('HYDERABAD &bull; SOFTWARE STUDIO') +
    '<div style="background:' + PAPER + ';padding:20px 22px;border:1px solid ' + LINE + ';border-top:none;">' +
    '<div style="font-size:22px;font-weight:bold;color:' + INK + ';margin-bottom:12px;">Hi ' + esc(name) + ', we got your message.</div>' +
    '<p style="font-size:14px;color:' + TEXT + ';line-height:1.7;">Thank you for reaching out' +
    (subject ? ' about <b>' + esc(subject) + '</b>' : '') +
    '. Our team will contact you shortly &mdash; usually within 24 hours on business days.</p>' +
    '<div style="margin:14px 0 4px;">' +
    step('1', 'We read your requirement carefully.') +
    step('2', 'We call or WhatsApp you to agree the approach.') +
    step('3', 'You get a written plan with timeline and cost.') +
    '</div>' +
    '<p style="font-size:14px;color:' + TEXT + ';">Need it urgent? Reply to this mail or chat now:<br>' +
    '<a href="' + WA + '" style="display:inline-block;margin-top:10px;background:' + INK + ';color:' + PAPER +
    ';text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:bold;">Chat on WhatsApp</a></p>' +
    '<p style="font-size:12px;color:' + MUTED + ';margin-top:16px;">Mon&ndash;Sat 9:00 AM&ndash;9:00 PM (Sunday closed) &middot; ' +
    PHONE + ' &middot; ' + SITE + '</p></div></div>'
  );
}

function replyText(name) {
  return (
    'Hi ' + name + ',\n\n' +
    'Thank you for contacting VALTORIX INFOTECH!\n\n' +
    'We received your details. What happens next:\n' +
    '1. We review your requirement (within 24 hours on business days).\n' +
    '2. We call / WhatsApp you to discuss the best approach.\n' +
    '3. You get a written plan with timeline and cost.\n\n' +
    'Urgent? WhatsApp us: ' + WA + '\n\n' +
    'Mon-Sat 9AM-9PM (Sunday closed) | ' + PHONE + '\n' +
    '— Team VALTORIX INFOTECH, Hyderabad\n' +
    SITE
  );
}

/* ------------------------------------------------------------------- mail */
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
    from: 'VALTORIX INFOTECH <' + user + '>',
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

/* --------------------------------------------------------------- handler */
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const ip =
    (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
    req.socket.remoteAddress ||
    '';

  if (rateLimited(ip)) {
    return res.status(429).json({ ok: false, error: 'too-many-requests' });
  }

  const body = req.body || {};
  const raw = body.fields;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Object.keys(raw).length) {
    return res.status(400).json({ ok: false });
  }

  const fields = cleanFields(raw);
  if (!Object.keys(fields).length) {
    return res.status(400).json({ ok: false });
  }

  /* Honeypot anti-spam: reject if the hidden website field is filled */
  if (fields.website && String(fields.website).trim().length > 0) {
    return res.status(400).json({ ok: false, error: 'spam-detected' });
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return res.status(500).json({ ok: false, error: 'mail-not-configured' });

  const subject = String(body.subject || 'Website enquiry — VALTORIX').slice(0, 120);
  const replyTo = String(body.replyTo || '').trim().slice(0, 200);

  /* Fast path: queue mail in the background, reply to the visitor at once. */
  const job = deliver(user, pass, subject, replyTo, fields).catch((e) => {
    console.error('mail background send failed:', e && e.message);
  });
  if (waitUntil) waitUntil(job);
  else await job;
  return res.status(200).json({ ok: true });
};
