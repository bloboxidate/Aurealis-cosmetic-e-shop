// Transactional email over SMTP (nodemailer) - order confirmations, order updates, password resets, cancellation requests.
//
// Configured with env vars (never in the repo). For a GoDaddy "Workspace / Professional Email" mailbox:
//   SMTP_HOST=smtpout.secureserver.net   SMTP_PORT=465   SMTP_SECURE=true
//   SMTP_USER=<the full mailbox address>   SMTP_PASS=<its password>   MAIL_FROM="Auréalis <that same address>"
// For a Microsoft 365 mailbox bought through GoDaddy: SMTP_HOST=smtp.office365.com, SMTP_PORT=587, SMTP_SECURE=false
// (STARTTLS) - and SMTP AUTH must be switched on for the mailbox in the Microsoft 365 admin centre.
//
// Without SMTP_HOST this only logs what it would have sent. send() never throws: a mail failure must not break the
// checkout / reset flow that already succeeded on its main job. It also never waits longer than TIMEOUT_MS: on Vercel the
// function is frozen once the response is sent, so callers `await` it before responding, and a stuck SMTP server must not
// hold a customer's order page open.
const nodemailer = require('nodemailer');

const TIMEOUT_MS = 12000;

function cfg() {
  const port = Number(process.env.SMTP_PORT) || 587;
  // 465 is implicit TLS ("SSL"); 587/25/80/3535 upgrade with STARTTLS. An explicit SMTP_SECURE always wins.
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465;
  const user = (process.env.SMTP_USER || '').trim();
  return {
    host: (process.env.SMTP_HOST || '').trim(),
    port, secure, user,
    pass: process.env.SMTP_PASS || '',
    from: (process.env.MAIL_FROM || '').trim() || (user ? `Auréalis <${user}>` : 'Auréalis <no-reply@aurealis.example>'),
  };
}

let transporter = null;
function getTransporter() {
  if (transporter !== null) return transporter;
  const c = cfg();
  if (!c.host) {
    transporter = false; // sentinel: "checked, not configured"
    return transporter;
  }
  transporter = nodemailer.createTransport({
    host: c.host, port: c.port, secure: c.secure,
    auth: c.user ? { user: c.user, pass: c.pass } : undefined,
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000,
  });
  return transporter;
}

// What the admin page may show: never the password.
function status() {
  const c = cfg();
  return {
    configured: !!c.host, host: c.host, port: c.port, secure: c.secure,
    user: c.user, hasPassword: !!c.pass, from: c.from,
    opsEmail: (process.env.STORE_OPS_EMAIL || '').trim(),
  };
}

// Send an email, or log it if SMTP isn't configured. -> { sent, reason? }
async function send({ to, subject, text, html, replyTo, timeoutMs }) {
  const t = getTransporter();
  if (!t) {
    console.log(`[mailer] SMTP not configured - would send to ${to}: "${subject}"\n${text || ''}`);
    return { sent: false, reason: 'not-configured' };
  }
  let timer;
  try {
    const job = t.sendMail({ from: cfg().from, to, subject, text, html, replyTo: replyTo || undefined });
    const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('The mail server took too long to answer.')), timeoutMs || TIMEOUT_MS); });
    await Promise.race([job, limit]);
    return { sent: true };
  } catch (err) {
    console.error(`[mailer] send to ${to} failed:`, err.message);
    return { sent: false, reason: err.message };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { send, status };
