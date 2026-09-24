/* VALTORIX INFOTECH — contact/project mail API (Vercel serverless).
   POST { subject, replyTo, fields } -> Gmail SMTP to owner + auto-reply.
   Needs env: GMAIL_USER, GMAIL_APP_PASSWORD (Google app password). */
const nodemailer = require('nodemailer');

const OWNER = 'valtorix.infotech@gmail.com';
const AUTOREPLY =
  'Thank you for contacting VALTORIX INFOTECH!\n\n' +
  'We received your details and our team will contact you shortly ' +
  '(Mon-Sat 9AM-9PM, Sunday closed).\n\n' +
  '— Team VALTORIX INFOTECH, Hyderabad | +91 79893 69571';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  try {
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
    const rows = Object.keys(fields)
      .map((k) => '<tr><td><b>' + esc(k) + '</b></td><td>' + esc(fields[k]) + '</td></tr>')
      .join('');

    const t = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 25000,
    });
    await t.sendMail({
      from: 'VALTORIX Website <' + user + '>',
      to: OWNER,
      replyTo: replyTo || undefined,
      subject,
      html: '<h3>' + esc(subject) + '</h3><table border="1" cellpadding="8" cellspacing="0">' + rows + '</table>',
    });

    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(replyTo)) {
      try {
        await t.sendMail({
          from: 'VALTORIX INFOTECH <' + user + '>',
          to: replyTo,
          subject: 'We received your enquiry — VALTORIX INFOTECH',
          text: AUTOREPLY,
        });
      } catch (e) { /* owner mail already sent; ignore autoreply failure */ }
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false });
  }
};
