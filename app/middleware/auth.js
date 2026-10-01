const db = require('../db/database');
const cart = require('../lib/scart');       // Sariee-backed cart
const Cats = require('../lib/catalog');      // Sariee-backed categories
const content = require('../lib/content');   // editable site content
const { money, price } = require('../lib/format');
const richtext = require('../lib/richtext');

// Populate res.locals used by every view: current user, cart count, flash messages.
// The user/categories/footer lookups are independent of each other, so they
// run in parallel instead of stacking three round-trips on every request.
async function locals(req, res, next) {
  try {
    const [user, navCategories, footer, cartCount] = await Promise.all([
      req.session.userId
        ? db.get('SELECT id, email, first_name, last_name, is_admin FROM users WHERE id = ?', [req.session.userId])
        : Promise.resolve(null),
      Cats.listCategories().catch(() => []),
      content.get('footer').catch(() => content.defaults('footer')),
      cart.getCount(req),
    ]);
    if (req.session.userId && !user) req.session.userId = null; // stale

    res.locals.user = user || null;
    res.locals.navCategories = navCategories;
    res.locals.footer = footer;
    res.locals.cartCount = cartCount;
    res.locals.money = money;
    res.locals.price = price;
    res.locals.richText = richtext.render;
    res.locals.flash = req.session.flash || null;
    res.locals.currentPath = req.path;
    delete req.session.flash;
    next();
  } catch (err) {
    next(err);
  }
}

function flash(req, type, message) {
  req.session.flash = { type, message };
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    flash(req, 'error', 'Please sign in to continue.');
    // For a POST (wishlist toggle, review submit, etc.) req.originalUrl is a
    // POST-only endpoint with no GET handler — redirecting back to it after
    // login would 404. Send those back to the referring page instead; only
    // a GET navigation can safely resume at the exact URL.
    const back = req.method === 'GET' ? req.originalUrl : (req.get('Referer') || '/');
    return res.redirect('/login?next=' + encodeURIComponent(back));
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!res.locals.user || !res.locals.user.is_admin) {
    return res.status(403).render('error', {
      title: 'Forbidden',
      heading: 'Admins only',
      message: 'You need an administrator account to view this page.',
    });
  }
  next();
}

module.exports = { locals, flash, requireAuth, requireAdmin };
