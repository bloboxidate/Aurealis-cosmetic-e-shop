// Sariee-backed shopping cart.
//
// Replaces the old SQLite cart. State lives in the live Sariee cart, addressed
// by a per-session cart token (kept in req.session.sarieeCartToken). Items and
// money totals come straight from Sariee; we map them into the same shape the
// cart / checkout views already expect.
//
// Sariee's cart/add-update SETS a barcode's quantity (it does not increment),
// so "add N to bag" reads the current line qty and sets current + N, while the
// cart +/- buttons set an absolute quantity.
//
// getCount() is read on every request by the layout, so we cache the count in
// the session after each mutation instead of hitting the API each time.

const sariee = require('./sariee');
const catalog = require('./catalog');

function token(req) {
  if (!req.session.sarieeCartToken) {
    req.session.sarieeCartToken = sariee.newCartToken();
  }
  return req.session.sarieeCartToken;
}

// Cache the full cart snapshot in the session and remember the item count.
// We rely on this snapshot instead of re-reading via cart/init, because
// Sariee's cart/init currently 500s on a NON-empty cart (their bug: it queries
// a missing `cart_bundle_selections` table). Every add/update/remove response
// returns the authoritative cart, so we keep the latest here.
function cacheCart(req, cart) {
  const c = cart || { items: [], calculations: {} };
  req.session.sarieeCart = { items: c.items || [], calculations: c.calculations || {}, promocode: c.promocode || '' };
  req.session.cartCount = c.calculations ? Number(c.calculations.count_items) || 0 : 0;
  return req.session.sarieeCart;
}

// Load the current cart. Prefer the cached snapshot (set by the last mutation);
// only call cart/init to establish/read an as-yet-unseen cart, and swallow the
// known init-with-items Sariee bug by falling back to whatever we have cached.
async function load(req) {
  if (req.session.sarieeCart) return req.session.sarieeCart;
  try {
    const r = await sariee.cart.init(token(req));
    return cacheCart(req, (r.data && r.data.data) || { items: [], calculations: {} });
  } catch (err) {
    return cacheCart(req, req.session.sarieeCart || { items: [], calculations: {} });
  }
}

// Map a Sariee cart line into the view's item shape. `product.id` on a line is
// the barcode id; we resolve the storefront slug via the catalog for links.
async function mapItems(cart) {
  const items = cart.items || [];
  const byBarcode = await catalog.barcodeIndex().catch(() => new Map());
  return items.map((it) => {
    const prod = it.product || {};
    const cat = byBarcode.get(prod.id);
    return {
      id: it.id,                                   // cart_item_id
      product_id: prod.id,                         // barcode id
      name: prod.name,
      subtitle: prod.brief || '',
      slug: cat ? cat.slug : '',
      color: '',
      image_url: (prod.image && prod.image.src) || (cat && cat.image_url) || '',
      qty: it.quantity,
      size: '',
      price_cents: Math.round((Number(prod.price) || 0) * 100),
      line_cents: Math.round((Number(it.total) || 0) * 100),
    };
  });
}

function calcToTotals(cart, items) {
  const c = cart.calculations || {};
  return {
    items,
    subtotal_cents: Math.round((Number(c.sub_total) || 0) * 100),
    discount_cents: Math.round((Number(c.discount) || 0) * 100),
    shipping_cents: Math.round((Number(c.shipping_fees) || 0) * 100),
    total_cents: Math.round((Number(c.total) || 0) * 100),
    promo: (cart.promocode && (cart.promocode.code || cart.promocode)) || '',
  };
}

async function getCount(req) {
  // Cheap: read the cached count; no network call on every page.
  return Number(req.session.cartCount) || 0;
}

async function getItems(req) {
  const cart = await load(req);
  return mapItems(cart);
}

async function totals(req, { promoCode } = {}) {
  if (promoCode) {
    try {
      const r = await sariee.cart.promocode(token(req), { promocode: promoCode });
      const c = r.data && r.data.data;
      if (c && c.calculations) cacheCart(req, c);
    } catch (_) { /* invalid promo is surfaced separately */ }
  }
  const cart = await load(req);
  return calcToTotals(cart, await mapItems(cart));
}

// Resolve a posted product id (Sariee product uuid) — or a barcode id — to the
// barcode id the cart needs.
async function resolveBarcode(productId) {
  const p = await catalog.byId(productId);
  if (p && p.barcode_id) return p.barcode_id;
  // maybe they already posted a barcode id
  const byBarcode = await catalog.barcodeIndex().catch(() => new Map());
  if (byBarcode.has(productId)) return productId;
  return null;
}

async function currentQty(cart, barcodeId) {
  const line = (cart.items || []).find((it) => it.product && it.product.id === barcodeId);
  return line ? Number(line.quantity) || 0 : 0;
}

// Recompute the cached cart's line/total figures locally — used to keep the UI
// consistent when Sariee's cart API errors out (their backend is currently
// buggy for quantity updates / re-reads). Sariee stays the source of truth when
// it responds; this only covers the degraded case so the site never crashes.
function recalcCache(req) {
  const cart = req.session.sarieeCart || { items: [], calculations: {} };
  let sub = 0; let count = 0;
  for (const it of cart.items) {
    const price = Number(it.product && it.product.price) || 0;
    it.total = price * it.quantity;
    sub += it.total;
    count += it.quantity;
  }
  const c = cart.calculations || {};
  cart.calculations = { ...c, sub_total: sub, count_items: count,
    total: sub - (Number(c.discount) || 0) + (Number(c.shipping_fees) || 0) };
  req.session.cartCount = count;
  return cart;
}

// Add N of a product to the bag (increments the existing line).
async function addItem(req, productId, size, qty) {
  qty = Math.max(1, parseInt(qty, 10) || 1);
  const barcodeId = await resolveBarcode(productId);
  if (!barcodeId) return false;
  const cart = await load(req);
  const next = (await currentQty(cart, barcodeId)) + qty;
  try {
    const r = await sariee.cart.addUpdate(token(req), { productBarcodeId: barcodeId, quantity: next });
    cacheCart(req, r.data && r.data.data);
    return true;
  } catch (err) {
    // Sariee says "Insufficient stock available" for a sold-out item. Keep the raw text away from customers
    // (CLAUDE.md) but record the *reason* so the route can say "out of stock" instead of a vague failure.
    if (/insufficient stock|out of stock/i.test(String(err && err.message))) req.addFailReason = 'stock';
    return false; // surfaced as a flash by the route
  }
}

// Set an absolute quantity for a cart line (from the +/- buttons). qty<=0 removes.
async function updateQty(req, itemId, qty) {
  qty = parseInt(qty, 10) || 0;
  const cart = await load(req);
  const line = (cart.items || []).find((it) => String(it.id) === String(itemId));
  if (!line) return;
  if (qty <= 0) return removeItem(req, itemId);
  try {
    const r = await sariee.cart.addUpdate(token(req), { productBarcodeId: line.product.id, quantity: qty });
    cacheCart(req, r.data && r.data.data);
  } catch (err) {
    // Sariee cart update is currently broken server-side — reflect the change
    // locally so the bag stays usable.
    line.quantity = qty;
    recalcCache(req);
  }
}

async function removeItem(req, itemId) {
  try {
    const r = await sariee.cart.remove(token(req), { cartItemId: itemId });
    cacheCart(req, r.data && r.data.data);
  } catch (err) {
    const cart = req.session.sarieeCart || { items: [] };
    cart.items = (cart.items || []).filter((it) => String(it.id) !== String(itemId));
    recalcCache(req);
  }
}

// Empty the bag — start a fresh cart token and drop the cached snapshot.
async function clear(req) {
  req.session.sarieeCartToken = sariee.newCartToken();
  req.session.sarieeCart = null;
  req.session.cartCount = 0;
  req.session.promo = '';
}

// Apply / validate a promo code against the Sariee cart. Returns true if valid.
async function applyPromo(req, code) {
  if (!code) { req.session.promo = ''; return false; }
  try {
    const r = await sariee.cart.promocode(token(req), { promocode: code });
    const c = r.data && r.data.data;
    if (c && c.calculations) cacheCart(req, c);
    req.session.promo = code;
    return true;
  } catch (_) {
    req.session.promo = '';
    return false;
  }
}

module.exports = {
  token, load, getCount, getItems, totals,
  addItem, updateQty, removeItem, clear, applyPromo,
};
