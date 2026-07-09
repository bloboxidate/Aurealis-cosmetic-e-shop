const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const db = require('../db/database');
const ah = require('../lib/ah');
const { flash, requireAuth } = require('../middleware/auth');

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

router.post('/login', ah(async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const next = req.body.next || '';
  const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    flash(req, 'error', 'Incorrect email or password.');
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

router.post('/signup', ah(async (req, res) => {
  const first = (req.body.first_name || '').trim();
  const last = (req.body.last_name || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const values = { first_name: first, last_name: last, email };

  const fail = (msg) => {
    flash(req, 'error', msg);
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

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

router.get('/account', requireAuth, ah(async (req, res) => {
  const orders = await db.all(
    'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
    [req.session.userId]
  );
  for (const o of orders) {
    o.items = await db.all('SELECT * FROM order_items WHERE order_id = ?', [o.id]);
  }
  res.render('account', { title: 'My Account — Auréalis', orders });
}));

module.exports = router;
