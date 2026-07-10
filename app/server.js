require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

const db = require('./db/database');
const DbStore = require('./db/session-store');
const { locals } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Behind Vercel's proxy — needed for secure cookies + correct protocol.
app.set('trust proxy', 1);

// Views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static assets (logo, client JS, product images)
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// The site has no locale-prefixed routing (English is the only, unprefixed
// content) — /en and any /en/* path just redirect to the same path without
// the prefix, so links like /en or /en/shop resolve instead of 404ing.
app.use('/en', (req, res) => res.redirect(301, req.url === '/' ? '/' : req.url));

// Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Ensure the schema exists before any request touches the DB. On serverless
// this runs once per cold start; `db.init` is idempotent (CREATE TABLE IF NOT
// EXISTS), and we cache the promise so concurrent requests share one init.
let readyPromise = null;
function ready() {
  if (!readyPromise) readyPromise = db.init();
  return readyPromise;
}
app.use((req, res, next) => { ready().then(() => next()).catch(next); });

// Sessions (persisted in the active database)
app.use(session({
  store: new DbStore(),
  secret: process.env.SESSION_SECRET || 'aurealis-northern-lights-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,           // HTTPS-only cookies in production
    maxAge: 1000 * 60 * 60 * 24 * 30,
  },
}));

// Shared view locals (user, cart count, flash)
app.use(locals);

// Routes
app.use('/', require('./routes/shop'));
app.use('/', require('./routes/cart'));
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/checkout'));
app.use('/admin', require('./routes/admin'));
app.use('/api/sariee', require('./routes/sariee'));

// 404
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Not found — Auréalis',
    heading: 'Page not found',
    message: 'The page you’re looking for has drifted beyond the horizon.',
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', {
    title: 'Something went wrong — Auréalis',
    heading: 'Something went wrong',
    message: 'An unexpected error occurred. Please try again.',
  });
});

// Start a listener only when run directly (local dev). On Vercel the app is
// imported by api/index.js as a serverless handler, so we must NOT listen.
if (require.main === module) {
  ready()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`\n  Auréalis is running (${db.backend}) →  http://localhost:${PORT}\n`);
      });
    })
    .catch((err) => {
      console.error('Failed to initialize database:', err);
      process.exit(1);
    });
}

module.exports = app;
