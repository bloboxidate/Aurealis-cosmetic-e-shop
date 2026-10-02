const express = require('express');
const router = express.Router();
const cart = require('../lib/scart'); // Sariee-backed cart
const ah = require('../lib/ah');
const { flash } = require('../middleware/auth');
const { sameOrigin } = require('../middleware/same-origin');
const { cartLimiter, promoLimiter } = require('../middleware/rate-limit');

function wantsJson(req) {
  return req.xhr || (req.headers.accept || '').includes('application/json');
}

// View cart
router.get('/cart', ah(async (req, res) => {
  const promo = req.session.promo || '';
  const t = await cart.totals(req, { promoCode: promo });
  res.render('cart', {
    title: 'Your Bag — Auréalis',
    ...t,
    promoCode: promo,
    promoError: req.session.promoError || null,
  });
  req.session.promoError = null;
}));

// Add to bag (form post from product page or AJAX from cards)
router.post('/cart/add', sameOrigin, cartLimiter, ah(async (req, res) => {
  const { product_id, size, qty } = req.body;
  const ok = await cart.addItem(req, product_id, size, qty);
  const failMsg = req.addFailReason === 'stock' ? 'Sorry, that item is out of stock right now.' : 'Sorry, that item could not be added.';
  if (wantsJson(req)) {
    return res.json({ ok, count: await cart.getCount(req), message: ok ? undefined : failMsg });
  }
  if (ok) flash(req, 'success', 'Added to your bag.');
  else flash(req, 'error', failMsg);
  res.redirect('/cart');
}));

router.post('/cart/update', sameOrigin, cartLimiter, ah(async (req, res) => {
  const itemId = req.body.item_id;
  let qty = req.body.qty;
  // Support relative +/- buttons (op=inc|dec) so the cart works without JS.
  if (req.body.op === 'inc' || req.body.op === 'dec') {
    const items = await cart.getItems(req);
    const current = items.find((i) => String(i.id) === String(itemId));
    const base = current ? current.qty : 1;
    qty = req.body.op === 'inc' ? base + 1 : base - 1;
  }
  await cart.updateQty(req, itemId, qty);
  if (wantsJson(req)) {
    const t = await cart.totals(req, { promoCode: req.session.promo || '' });
    return res.json({ ok: true, count: await cart.getCount(req), totals: t });
  }
  res.redirect('/cart');
}));

router.post('/cart/remove', sameOrigin, cartLimiter, ah(async (req, res) => {
  await cart.removeItem(req, req.body.item_id);
  if (wantsJson(req)) {
    const t = await cart.totals(req, { promoCode: req.session.promo || '' });
    return res.json({ ok: true, count: await cart.getCount(req), totals: t });
  }
  res.redirect('/cart');
}));

router.post('/cart/promo', sameOrigin, promoLimiter, ah(async (req, res) => {
  const code = (req.body.code || '').trim();
  const valid = await cart.applyPromo(req, code);
  req.session.promoError = valid || !code ? null : 'That promo code isn’t valid.';
  res.redirect('/cart');
}));

module.exports = router;
