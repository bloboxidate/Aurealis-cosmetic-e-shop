const db = require('../db/database');
const cart = require('../lib/scart');       // Sariee-backed cart
const Cats = require('../lib/catalog');      // Sariee-backed categories
const content = require('../lib/content');   // editable site content
const { money, price } = require('../lib/format');

// Populate res.locals used by every view: current user, cart count, flash messages.
async function locals(req, res, next) {
  try {
    let user = null;
    if (req.session.userId) {
      user = await db.get(
        'SELECT id, email, first_name, last_name, is_admin FROM users WHERE id = ?',
        [req.session.userId]
      );
      if (!user) req.session.userId = null; // stale
    }
    res.locals.user = user || null;
    // Nav + cart count come from Sariee now; degrade gracefully if it hiccups.
    try { res.locals.navCategories = await Cats.listCategories(); }
    catch (_) { res.locals.navCategories = []; }
    try { res.locals.footer = await content.get('footer'); }
    catch (_) { res.locals.footer = content.defaults('footer'); }
    res.locals.cartCount = await cart.getCount(req);
    res.locals.money = money;
    res.locals.price = price;
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
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
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
