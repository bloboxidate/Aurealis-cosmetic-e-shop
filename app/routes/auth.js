const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const router = express.Router();
const db = require('../db/database');
const Orders = require('../lib/orders');
const cancellations = require('../lib/cancellations');
const ah = require('../lib/ah');
const mailer = require('../lib/mailer');
const { flash, requireAuth, flashNow } = require('../middleware/auth');
const { verifyCsrf } = require('../middleware/csrf');
const { authLimiter } = require('../middleware/rate-limit');
const { emailRe } = require('../lib/validators');

// Applied per-route below (not router.use(verifyCsrf)) — a router-wide
// use() runs whenever THIS router is invoked at all, even for a path it
// has no route for, since routers are mounted at '/' in registration
// order. That silently 403'd every request to any router registered after
// this one (wishlist.js) before it ever reached its own handler, since
// Express doesn't know this router won't match until after its middleware
// has already run.
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// Log a user in, carrying their guest cart (the Sariee cart token + count) and
// applied promo across the session regeneration that prevents session fixation.
function login(req, res, userId, next) {
  const carry = {
    sarieeCartToken: req.session.sarieeCartToken,
    cartCount: req.session.cartCount,
    promo: req.session.promo || '',
  };
  req.session.regenerate((err) => {
    if (err) {
      req.session.userId = userId; // fall back without regeneration
      return res.redirect(next || '/');
    }
    req.session.userId = userId;
    if (carry.sarieeCartToken) req.session.sarieeCartToken = carry.sarieeCartToken;
    if (carry.cartCount) req.session.cartCount = carry.cartCount;
    if (carry.promo) req.session.promo = carry.promo;
    req.session.save(() => res.redirect(next || '/'));
  });
}

router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/account');
  res.render('login', { title: 'Sign in — Auréalis', next: req.query.next || '', values: {} });
});

router.post('/login', verifyCsrf, authLimiter, ah(async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const next = req.body.next || '';
  const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    flashNow(res, 'error', 'Incorrect email or password.');
    return res.status(401).render('login', {
      title: 'Sign in — Auréalis', next, values: { email },
    });
  }
  login(req, res, user.id, next || '/account');
}));

router.get('/signup', (req, res) => {
  if (req.session.userId) return res.redirect('/account');
  res.render('signup', { title: 'Create account — Auréalis', values: {} });
});

router.post('/signup', verifyCsrf, authLimiter, ah(async (req, res) => {
  const first = (req.body.first_name || '').trim();
  const last = (req.body.last_name || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const values = { first_name: first, last_name: last, email };

  const fail = (msg) => {
    flashNow(res, 'error', msg);
    res.status(400).render('signup', { title: 'Create account — Auréalis', values });
  };

  if (!emailRe.test(email)) return fail('Please enter a valid email address.');
  if (password.length < 6) return fail('Password must be at least 6 characters.');
  if (!req.body.agree) return fail('Please agree to the Terms and Privacy Policy.');

  const exists = await db.get('SELECT id FROM users WHERE email = ?', [email]);
  if (exists) return fail('An account with that email already exists.');

  const id = await db.insertId(
    'INSERT INTO users (email, password_hash, first_name, last_name) VALUES (?, ?, ?, ?)',
    [email, bcrypt.hashSync(password, 10), first, last]
  );

  flash(req, 'success', 'Welcome to Auréalis!');
  login(req, res, id, '/account');
}));

router.post('/logout', verifyCsrf, (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

router.get('/forgot-password', (req, res) => {
  res.render('forgot-password', { title: 'Forgot password — Auréalis' });
});

// Always show the same generic message whether or not the email exists —
// otherwise this endpoint becomes an account-enumeration oracle.
router.post('/forgot-password', verifyCsrf, authLimiter, ah(async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const genericMsg = 'If an account exists for that email, we\'ve sent a password reset link.';

  const user = emailRe.test(email) ? await db.get('SELECT id FROM users WHERE email = ?', [email]) : null;
  if (user) {
    const raw = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
    await db.run(
      'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [user.id, hashToken(raw), expiresAt]
    );
    const link = `${req.protocol}://${req.get('host')}/reset-password/${raw}`;
    mailer.send({
      to: email,
      subject: 'Reset your Auréalis password',
      text: `Click to reset your password (expires in 1 hour): ${link}\n\nIf you didn't request this, ignore this email.`,
    }).catch(() => {});
  }

  flashNow(res, 'success', genericMsg);
  res.render('forgot-password', { title: 'Forgot password — Auréalis', submitted: true });
}));

router.get('/reset-password/:token', ah(async (req, res) => {
  const row = await db.get(
    'SELECT id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
    [hashToken(req.params.token), new Date().toISOString()]
  );
  if (!row) {
    return res.status(400).render('error', {
      title: 'Link expired — Auréalis', heading: 'This reset link is invalid or expired',
      message: 'Please request a new password reset link.',
    });
  }
  res.render('reset-password', { title: 'Reset password — Auréalis', token: req.params.token });
}));

router.post('/reset-password/:token', verifyCsrf, authLimiter, ah(async (req, res) => {
  const tokenHash = hashToken(req.params.token);
  const row = await db.get(
    'SELECT id, user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
    [tokenHash, new Date().toISOString()]
  );
  if (!row) {
    return res.status(400).render('error', {
      title: 'Link expired — Auréalis', heading: 'This reset link is invalid or expired',
      message: 'Please request a new password reset link.',
    });
  }

  const password = req.body.password || '';
  if (password.length < 6) {
    flashNow(res, 'error', 'Password must be at least 6 characters.');
    return res.status(400).render('reset-password', { title: 'Reset password — Auréalis', token: req.params.token });
  }

  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(password, 10), row.user_id]);
  await db.run('UPDATE password_resets SET used_at = ? WHERE id = ?', [new Date().toISOString(), row.id]);

  flash(req, 'success', 'Your password has been reset. Please sign in.');
  res.redirect('/login');
}));

router.get('/account', requireAuth, ah(async (req, res) => {
  // Orders live in Sariee; fetch the ones placed under this account.
  let orders = [];
  let ordersError = false;
  try {
    const result = await Orders.forUser({
      userId: req.session.userId,
      email: res.locals.user ? res.locals.user.email : '',
    });
    orders = result.orders;
    ordersError = result.partial;
  } catch (err) {
    console.error('[account] order history failed:', err.message);
    orders = [];
    ordersError = true;
  }
  res.render('account', { title: 'My Account — Auréalis', orders, ordersError });
}));

// No Sariee endpoint can cancel/void an order (checked all 425 documented
// endpoints), so this records the request and emails store ops to action it
// manually — the user sees a clear "request sent" message, not a fake instant
// cancellation.
router.post('/account/orders/:id/cancel-request', verifyCsrf, requireAuth, ah(async (req, res) => {
  const owns = await Orders.belongsToUser(req.params.id, req.session.userId);
  if (!owns) {
    flash(req, 'error', 'We couldn’t find that order on your account.');
    return res.redirect('/account');
  }

  await cancellations.request({
    sarieeOrderId: req.params.id,
    userId: req.session.userId,
    note: (req.body.note || '').trim(),
  });

  const opsEmail = process.env.STORE_OPS_EMAIL;
  if (opsEmail) {
    mailer.send({
      to: opsEmail,
      subject: `Cancellation requested — order ${req.params.id}`,
      text: `Customer ${res.locals.user.email} requested cancellation of order ${req.params.id}.\nNote: ${req.body.note || '(none)'}\n\nThis must be actioned manually in Sariee — there is no cancel API.`,
    }).catch(() => {});
  } else {
    console.log(`[cancellation] STORE_OPS_EMAIL not set — request recorded for order ${req.params.id}, not emailed. Set STORE_OPS_EMAIL to route these.`);
  }
  mailer.send({
    to: res.locals.user.email,
    subject: `We received your cancellation request for order ${req.params.id}`,
    text: 'Our team will review and follow up shortly. This is a request, not a confirmed cancellation.',
  }).catch(() => {});

  flash(req, 'success', 'Your cancellation request has been sent. We’ll follow up by email.');
  res.redirect('/account');
}));

module.exports = router;
