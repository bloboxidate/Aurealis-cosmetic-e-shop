// Sariee integration routes.
//
// A thin JSON API that lets the storefront (and admin UI) talk to the live
// Sariee backend through our client, which applies the proven request format
// (x-domain / x-locale headers, cart token, bearer auth). Mounted at
// /api/sariee in server.js.
//
// Storefront calls need no login. The cart token is minted once per browser
// session and kept in req.session so cart + checkout share one cart.
// Admin-portal proxying is gated behind requireAdmin.

const express = require('express');
const router = express.Router();
const ah = require('../lib/ah');
const sariee = require('../lib/sariee');

// Ensure the session has a Sariee cart token; return it.
function cartToken(req) {
  if (!req.session.sarieeCartToken) {
    req.session.sarieeCartToken = sariee.newCartToken();
  }
  return req.session.sarieeCartToken;
}

// Turn a SarieeError into a clean JSON response instead of a 500.
function sendError(res, err) {
  if (err instanceof sariee.SarieeError) {
    return res.status(err.status || 502).json({
      ok: false,
      message: err.message,
      status: err.status || null,
      body: err.body ?? null,
    });
  }
  throw err; // unexpected — let Express handle it
}

const ok = (res, result) => res.json({ ok: true, ...result });

// ---- Catalog ------------------------------------------------------------
router.get('/products', ah(async (req, res) => {
  try { ok(res, await sariee.products.listAll(req.query)); }
  catch (e) { sendError(res, e); }
}));

router.get('/products/single', ah(async (req, res) => {
  try { ok(res, await sariee.products.single(req.query)); }
  catch (e) { sendError(res, e); }
}));

router.get('/products/best-selling', ah(async (req, res) => {
  try { ok(res, await sariee.products.bestSelling(req.query)); }
  catch (e) { sendError(res, e); }
}));

router.get('/products/recommended', ah(async (req, res) => {
  try { ok(res, await sariee.products.recommended(req.query)); }
  catch (e) { sendError(res, e); }
}));

router.get('/categories', ah(async (req, res) => {
  try { ok(res, await sariee.categories.all(req.query)); }
  catch (e) { sendError(res, e); }
}));

router.get('/collections', ah(async (req, res) => {
  try { ok(res, await sariee.collections.all(req.query)); }
  catch (e) { sendError(res, e); }
}));

// ---- Auth ---------------------------------------------------------------
router.post('/register', ah(async (req, res) => {
  try { ok(res, await sariee.auth.register(req.body)); }
  catch (e) { sendError(res, e); }
}));

router.post('/login', ah(async (req, res) => {
  try { ok(res, await sariee.auth.login(req.body)); }
  catch (e) { sendError(res, e); }
}));

// ---- Cart ---------------------------------------------------------------
router.post('/cart/init', ah(async (req, res) => {
  try { ok(res, await sariee.cart.init(cartToken(req))); }
  catch (e) { sendError(res, e); }
}));

router.post('/cart/add', ah(async (req, res) => {
  try {
    ok(res, await sariee.cart.addUpdate(cartToken(req), {
      productBarcodeId: req.body.product_barcode_id || req.body.productBarcodeId,
      quantity: req.body.quantity ?? 1,
    }));
  } catch (e) { sendError(res, e); }
}));

router.post('/cart/remove', ah(async (req, res) => {
  try {
    ok(res, await sariee.cart.remove(cartToken(req), {
      cart_item_id: req.body.cart_item_id || req.body.cartItemId,
    }));
  } catch (e) { sendError(res, e); }
}));

router.post('/cart/promocode', ah(async (req, res) => {
  try {
    ok(res, await sariee.cart.promocode(cartToken(req), {
      promocode: req.body.promocode || req.body.code,
    }));
  } catch (e) { sendError(res, e); }
}));

// ---- Checkout -----------------------------------------------------------
router.get('/checkout/methods', ah(async (req, res) => {
  try { ok(res, await sariee.checkout.availMethods(cartToken(req))); }
  catch (e) { sendError(res, e); }
}));

router.post('/checkout', ah(async (req, res) => {
  try {
    ok(res, await sariee.checkout.action(cartToken(req), {
      paymentId: req.body.payment_id ?? req.body.paymentId ?? 0,
      customer: req.body.customer,
      address: req.body.address,
    }));
  } catch (e) { sendError(res, e); }
}));

// ---- Helpers (geo) ------------------------------------------------------
router.get('/helper/countries', ah(async (req, res) => {
  try { ok(res, await sariee.helpers.countries(req.query)); }
  catch (e) { sendError(res, e); }
}));

router.get('/helper/cities', ah(async (req, res) => {
  try { ok(res, await sariee.helpers.cities(req.query)); }
  catch (e) { sendError(res, e); }
}));

// ---- Admin portal proxy (gated) ----------------------------------------
// Enumerate the admin endpoints the client knows about.
router.get('/admin/endpoints', requireAdminJson, ah(async (req, res) => {
  res.json({ ok: true, endpoints: sariee.admin.list().map((e) => ({
    id: e.id, name: e.name, method: e.method, path: e.path, group: e.group,
  })) });
}));

// Generic passthrough: call any documented endpoint by id.
// body: { params?, query?, body?, token? }  (token overrides SARIEE_COMPANY_TOKEN)
//
// Default-safe: read-only (GET) company endpoints are always reachable this
// way, but mutating endpoints (POST/PUT/PATCH/DELETE) are blocked unless
// their id is explicitly listed in SARIEE_ADMIN_PROXY_ALLOW (comma-separated
// endpoint ids) — nothing in this app's own admin UI currently calls this
// passthrough, so without an allow-list it would let any admin session run
// any of the 425 documented company actions, including destructive ones.
const allowedWriteIds = new Set(
  (process.env.SARIEE_ADMIN_PROXY_ALLOW || '').split(',').map((s) => s.trim()).filter(Boolean)
);

router.post('/admin/call/:id', requireAdminJson, ah(async (req, res) => {
  const endpoint = sariee.getEndpoint(req.params.id);
  if (!endpoint) {
    return res.status(404).json({ ok: false, message: 'Unknown endpoint id.' });
  }
  const method = (endpoint.method || 'GET').toUpperCase();
  if (method !== 'GET' && !allowedWriteIds.has(req.params.id)) {
    return res.status(403).json({
      ok: false,
      message: `This endpoint (${method}) is not allow-listed for the admin proxy. Add its id to SARIEE_ADMIN_PROXY_ALLOW to enable it.`,
    });
  }
  try {
    const { params, query, body, token } = req.body || {};
    ok(res, await sariee.admin.call(req.params.id, { params, query, body, token }));
  } catch (e) { sendError(res, e); }
}));

// JSON variant of requireAdmin (the shared one renders an HTML error page).
function requireAdminJson(req, res, next) {
  if (!res.locals.user || !res.locals.user.is_admin) {
    return res.status(403).json({ ok: false, message: 'Admins only.' });
  }
  next();
}

module.exports = router;
