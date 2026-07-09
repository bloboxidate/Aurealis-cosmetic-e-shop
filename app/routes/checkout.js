const express = require('express');
const router = express.Router();
const cart = require('../lib/scart');   // Sariee-backed cart
const geo = require('../lib/geo');
const sariee = require('../lib/sariee');
const orders = require('../lib/orders');
const ah = require('../lib/ah');
const { flash } = require('../middleware/auth');

// Resolve the store's Cash-On-Delivery method (offline, paymentId 0), with a
// safe fallback so checkout still renders if the lookup hiccups.
async function codMethod(req) {
  try {
    const r = await sariee.checkout.availMethods(cart.token(req));
    const offline = r.data && r.data.data && r.data.data.methods && r.data.data.methods.offline;
    if (offline && offline[0]) {
      return { id: offline[0].paymentId, name: offline[0].name_en || 'Cash On Delivery' };
    }
  } catch (_) { /* fall through */ }
  return { id: 0, name: 'Cash On Delivery' };
}

async function cityName(cityId) {
  const g = await geo.cityGroups();
  for (const st of g.states) {
    const c = st.cities.find((x) => x.id === cityId);
    if (c) return `${c.name}, ${st.name}`;
  }
  return '';
}

router.get('/checkout', ah(async (req, res) => {
  const t = await cart.totals(req, { promoCode: req.session.promo || '' });
  if (t.items.length === 0) {
    flash(req, 'error', 'Your bag is empty.');
    return res.redirect('/cart');
  }
  const [g, cod] = await Promise.all([geo.cityGroups(), codMethod(req)]);
  res.render('checkout', {
    title: 'Checkout — Auréalis',
    ...t,
    cityGroups: g.states,
    codPaymentId: cod.id,
    codName: cod.name,
    values: res.locals.user
      ? { email: res.locals.user.email, first_name: res.locals.user.first_name, last_name: res.locals.user.last_name }
      : {},
  });
}));

router.post('/checkout', ah(async (req, res) => {
  const t = await cart.totals(req, { promoCode: req.session.promo || '' });
  if (t.items.length === 0) {
    flash(req, 'error', 'Your bag is empty.');
    return res.redirect('/cart');
  }

  const f = req.body;
  const required = ['email', 'mobile', 'first_name', 'last_name', 'street', 'building', 'city_id'];
  const missing = required.filter((k) => !(f[k] || '').trim());

  const rerender = async (msg, status = 400) => {
    flash(req, 'error', msg);
    const [g, cod] = await Promise.all([geo.cityGroups(), codMethod(req)]);
    return res.status(status).render('checkout', {
      title: 'Checkout — Auréalis', ...t,
      cityGroups: g.states, codPaymentId: cod.id, codName: cod.name, values: f,
    });
  };

  if (missing.length) return rerender('Please complete all fields to place your order.');

  // Place the order on Sariee (Cash On Delivery — no card is taken).
  let result;
  try {
    result = await sariee.checkout.action(cart.token(req), {
      paymentId: Number(f.payment_id) || 0,
      customer: { first_name: f.first_name, last_name: f.last_name, mobile: f.mobile, email: f.email },
      address: { street: f.street, building: f.building, city_id: f.city_id },
    });
  } catch (err) {
    const detail = err.body && (err.body.message || (err.body.data && JSON.stringify(err.body.data)));
    return rerender('We couldn’t place your order: ' + (detail || err.message), 502);
  }

  const data = (result.data && result.data.data) || {};
  const orderId = data.order_id || data.id || result.data.order_id;

  // Snapshot the order for the confirmation page (Sariee is the source of truth;
  // this just renders the immediate thank-you without an extra round-trip).
  const order = {
    order_number: data.order_number || orderId,
    email: f.email,
    ship_first: f.first_name,
    ship_last: f.last_name,
    address: `${f.street}, Bldg ${f.building}`,
    city: await cityName(f.city_id),
    postal: '',
    country: (await geo.cityGroups()).country ? (await geo.cityGroups()).country.name : '',
    ship_method: 'Standard',
    promo_code: t.promo,
    subtotal_cents: t.subtotal_cents,
    discount_cents: t.discount_cents,
    shipping_cents: t.shipping_cents,
    total_cents: t.total_cents,
    items: t.items.map((it) => ({ name: it.name, size: it.size, unit_price_cents: it.price_cents, qty: it.qty })),
  };

  // Record the Sariee order so it shows in the customer's account history.
  try {
    await orders.record({ sarieeOrderId: orderId, userId: req.session.userId || null, email: f.email });
  } catch (_) { /* non-fatal */ }

  await cart.clear(req);
  req.session.promo = '';
  req.session.lastOrder = { id: String(orderId), order };
  res.redirect('/order/' + encodeURIComponent(orderId));
}));

router.get('/order/:id', ah(async (req, res, next) => {
  const last = req.session.lastOrder;
  if (!last || String(last.id) !== String(req.params.id)) {
    return res.status(404).render('error', {
      title: 'Order not found', heading: 'Order not found',
      message: 'We couldn’t find that order.',
    });
  }
  res.render('order-confirmation', { title: 'Order confirmed — Auréalis', order: last.order });
}));

module.exports = router;
