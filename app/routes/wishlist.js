const express = require('express');
const router = express.Router();
const wishlist = require('../lib/wishlist');
const catalog = require('../lib/catalog');
const ah = require('../lib/ah');
const { flash, requireAuth } = require('../middleware/auth');

router.get('/wishlist', requireAuth, ah(async (req, res) => {
  const rows = await wishlist.list(req.session.userId);
  const products = (await Promise.all(
    rows.map((r) => catalog.byId(r.sariee_product_id).catch(() => null))
  )).filter(Boolean);
  res.render('wishlist', { title: 'My Wishlist — Auréalis', products });
}));

// Toggle add/remove, then bounce back to wherever the request came from.
router.post('/wishlist/toggle', requireAuth, ah(async (req, res) => {
  const productId = req.body.product_id;
  const back = req.body.next || req.get('Referer') || '/wishlist';
  if (!productId) return res.redirect(back);

  if (await wishlist.has(req.session.userId, productId)) {
    await wishlist.remove(req.session.userId, productId);
    flash(req, 'success', 'Removed from wishlist.');
  } else {
    await wishlist.add(req.session.userId, productId);
    flash(req, 'success', 'Added to wishlist.');
  }
  res.redirect(back);
}));

module.exports = router;
