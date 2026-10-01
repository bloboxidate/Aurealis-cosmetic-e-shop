require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');

const db = require('./db/database');
const DbStore = require('./db/session-store');
const { locals } = require('./middleware/auth');
const { csrfLocals } = require('./middleware/csrf');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Refuse to start in production without a real session secret — the
// alternative is silently signing cookies with a hardcoded value that sits
// in public source control, which lets anyone forge a session (including
// admin sessions, since is_admin trust flows from req.session.userId).
if (isProd && !process.env.SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET must be set in production. Refusing to start with the dev fallback secret.');
  process.exit(1);
}

// Behind Vercel's proxy — needed for secure cookies + correct protocol.
app.set('trust proxy', 1);

// Security headers. CSP allows 'unsafe-inline' for style/script because the
// EJS views use inline style attributes and one inline <script> block
// (admin/products.ejs) — tightening that further needs an external-file
// refactor, out of scope here. img-src stays open to https: since product
// photos are served from Sariee's CDN, whose exact host isn't fixed.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // fonts.googleapis.com serves the Cormorant Garamond / Manrope stylesheet
      // (views/partials/head.ejs); without it the CSP blocks that <link> and the
      // site silently renders in fallback fonts. The font files themselves come
      // from fonts.gstatic.com, already covered by helmet's default font-src (https:).
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      // 'inline-speculation-rules' allows the inline <script type="speculationrules"> in head.ejs (hover-prefetch of safe pages).
      scriptSrc: ["'self'", "'unsafe-inline'", "'inline-speculation-rules'", 'https://va.vercel-scripts.com'],
      // Several views use inline onchange/onsubmit handlers (e.g. shop.ejs's
      // sort <select>, admin delete-confirm dialogs) — script-src-attr is a
      // separate CSP directive from script-src and defaults to 'none',
      // which would silently break those without this.
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://vitals.vercel-insights.com'],
      // helmet's default adds `upgrade-insecure-requests`. On the https production site that's harmless, but
      // opened over plain HTTP from another device (http://192.168.x.x:3000 on a phone) the browser rewrites
      // every same-origin /js, /css and /assets request to https:// — which a dev server can't answer — so
      // scripts, styles and the logo all fail and the page loads static. `localhost` is exempt, which is why
      // it only ever showed up on a phone. Production keeps it.
      upgradeInsecureRequests: isProd ? [] : null,
    },
  },
}));

// Views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static assets (logo, client JS, product images)
// maxAge lets repeat visitors skip re-validating these on every page load.
// No cache-busting/versioning scheme exists yet, so kept moderate rather than
// "forever" — a week's staleness for a logo/favicon update is fine; a day for
// app.js, which changes more often during active development.
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets'), { maxAge: '7d' }));
app.use('/js', express.static(path.join(__dirname, 'public', 'js'), { maxAge: isProd ? '1d' : 0 }));
app.use('/css', express.static(path.join(__dirname, 'public', 'css'), { maxAge: isProd ? '1d' : 0 }));
// Cache-bust query for the motion CSS/JS (head.ejs). Bump ASSET_V (or the '1'
// below) whenever those files change in production; in dev it changes on
// every restart so a 1-day maxAge never serves stale files.
app.locals.assetV = process.env.ASSET_V || (isProd ? '1' : String(Date.now()));

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
// If it fails (a transient DB hiccup, e.g. Supabase briefly unreachable), the
// rejection is NOT cached — otherwise every request for the rest of this
// server's lifetime would keep failing immediately on the stale rejected
// promise instead of getting a fresh chance to connect.
let readyPromise = null;
function ready() {
  if (!readyPromise) {
    readyPromise = db.init().catch((err) => {
      readyPromise = null;
      throw err;
    });
  }
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
app.use(csrfLocals);

// Routes
app.use('/', require('./routes/shop'));
app.use('/', require('./routes/cart'));
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/checkout'));
app.use('/', require('./routes/wishlist'));
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
