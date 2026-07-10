const express = require('express');
const router = express.Router();
const cart = require('../lib/scart');   // Sariee-backed cart
const geo = require('../lib/geo');
const sariee = require('../lib/sariee');
const orders = require('../lib/orders');
const ah = require('../lib/ah');
const { flash } = require('../middleware/auth');
const { verifyCsrf } = require('../middleware/csrf');
const { checkoutLimiter } = require('../middleware/rate-limit');

router.use(verifyCsrf);
const { emailRe, mobileRe } = require('../lib/validators');
const mailer = require('../lib/mailer');
const { money } = require('../lib/format');

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

// Look up a city's display name (and validate it belongs to the known set)
// against an already-fetched cityGroups() result — avoids re-awaiting the
// cached geo lookup multiple times per request.
function findCity(g, cityId) {
  for (const st of g.states) {
    const c = st.cities.find((x) => String(x.id) === String(cityId));
    if (c) return { name: `${c.name}, ${st.name}`, state: st };
  }
  return null;
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

router.post('/checkout', checkoutLimiter, ah(async (req, res) => {
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
  if (!emailRe.test((f.email || '').trim())) return rerender('Please enter a valid email address.');
  if (!mobileRe.test((f.mobile || '').trim())) return rerender('Please enter a valid mobile number.');

  const g = await geo.cityGroups();
  const city = findCity(g, f.city_id);
  if (!city) return rerender('Please select a valid city.');

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
    city: city.name,
    postal: '',
    country: g.country ? g.country.name : '',
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

  // Best-effort confirmation email — never blocks the order, which already
  // succeeded on Sariee. Logs instead of sending if SMTP isn't configured.
  mailer.send({
    to: f.email,
    subject: `Your Auréalis order ${order.order_number} is confirmed`,
    text: `Thanks, ${f.first_name}! Your order ${order.order_number} is confirmed.\n\n`
      + order.items.map((it) => `${it.name}${it.size ? ' · ' + it.size : ''} x${it.qty} — ${money(it.unit_price_cents * it.qty)}`).join('\n')
      + `\n\nTotal: ${money(order.total_cents)}\nShipping to: ${order.address}, ${order.city}, ${order.country}`,
  }).catch(() => {});

  await cart.clear(req);
  req.session.promo = '';
  req.session.lastOrder = { id: String(orderId), order };
  res.redirect('/order/' + encodeURIComponent(orderId));
}));

router.get('/order/:id', ah(async (req, res, next) => {
  const last = req.session.lastOrder;
  if (last && String(last.id) === String(req.params.id)) {
    return res.render('order-confirmation', { title: 'Order confirmed — Auréalis', order: last.order });
  }

  // Session snapshot is gone (cleared cookies, different device, session
  // eviction) — for signed-in customers, check they actually own this order
  // (via the local sariee_orders mapping) and send them to /account, which
  // already renders live Sariee order details correctly instead of
  // re-guessing the shipping-detail fields here.
  if (req.session.userId) {
    try {
      const owns = await orders.belongsToUser(req.params.id, req.session.userId);
      if (owns) {
        flash(req, 'success', 'Your order is confirmed — here are the details.');
        return res.redirect('/account');
      }
    } catch (_) { /* fall through to not-found */ }
  }

  return res.status(404).render('error', {
    title: 'Order not found', heading: 'Order not found',
    message: 'We couldn’t find that order.',
  });
}));

module.exports = router;
