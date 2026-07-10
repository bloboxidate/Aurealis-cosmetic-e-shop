// Transactional email — env-gated no-op when SMTP isn't configured.
//
// No SMTP credentials exist for this site yet, so by default this only logs
// what it would have sent (visible in server/Vercel logs) instead of failing
// or pretending to deliver mail. Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/
// MAIL_FROM to enable real delivery via nodemailer.
const nodemailer = require('nodemailer');

let transporter = null;
function getTransporter() {
  if (transporter !== null) return transporter;
  if (!process.env.SMTP_HOST) {
    transporter = false; // sentinel: "checked, not configured"
    return transporter;
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transporter;
}

// Send an email, or log it if SMTP isn't configured. Never throws — a mail
// failure shouldn't break checkout/password-reset flows that already
// succeeded on their primary action.
async function send({ to, subject, text, html }) {
  const t = getTransporter();
  if (!t) {
    console.log(`[mailer] SMTP not configured — would send to ${to}: "${subject}"\n${text || ''}`);
    return { sent: false, reason: 'not-configured' };
  }
  try {
    await t.sendMail({
      from: process.env.MAIL_FROM || 'Auréalis <no-reply@aurealis.example>',
      to, subject, text, html,
    });
    return { sent: true };
  } catch (err) {
    console.error('[mailer] send failed:', err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { send };
