const express = require('express');
const router = express.Router();
const wishlist = require('../lib/wishlist');
const catalog = require('../lib/catalog');
const ah = require('../lib/ah');
const { flash, requireAuth } = require('../middleware/auth');
const { sameOrigin } = require('../middleware/same-origin');
const { cartLimiter } = require('../middleware/rate-limit');

router.get('/wishlist', requireAuth, ah(async (req, res) => {
  const rows = await wishlist.list(req.session.userId);
  const products = (await Promise.all(
    rows.map((r) => catalog.byId(r.sariee_product_id).catch(() => null))
  )).filter(Boolean);
  products.forEach((p) => { p.wishlisted = true; }); // every card here is, by definition
  res.render('wishlist', { title: 'My Wishlist — Auréalis', products });
}));

// Toggle add/remove, then bounce back to wherever the request came from.
// Signed-in toggles from the storefront's hearts are done in place (fetch) and answered with JSON; a plain
// form post (no JS) still redirects back as before. Signed-out requests are redirected to /login by requireAuth.
router.post('/wishlist/toggle', sameOrigin, requireAuth, cartLimiter, ah(async (req, res) => {
  const productId = req.body.product_id;
  // Only a path on this site: an attacker-supplied `next` must never send the visitor to another domain.
  const next = typeof req.body.next === 'string' ? req.body.next : '';
  const back = /^\/(?![/\\])/.test(next) ? next : '/wishlist';
  const wantsJson = req.xhr || (req.headers.accept || '').includes('application/json');
  if (!productId) return wantsJson ? res.status(400).json({ ok: false }) : res.redirect(back);

  let nowSaved;
  if (await wishlist.has(req.session.userId, productId)) {
    await wishlist.remove(req.session.userId, productId);
    nowSaved = false;
    if (!wantsJson) flash(req, 'success', 'Removed from wishlist.');
  } else {
    await wishlist.add(req.session.userId, productId);
    nowSaved = true;
    if (!wantsJson) flash(req, 'success', 'Added to wishlist.');
  }
  if (wantsJson) return res.json({ ok: true, wishlisted: nowSaved });
  res.redirect(back);
}));

module.exports = router;
