// Order history — bridges our local accounts to Sariee's orders.
//
// Orders live in Sariee. When a customer places one through this storefront we
// record its Sariee order id here (keyed by user + email), then the account
// page pulls the live details back from Sariee via `single-order`.
const db = require('../db/database');
const sariee = require('./sariee');

// Remember an order placed through the site.
// `paymentMethod` ('cod' | 'instapay'): Sariee only knows cash on delivery, so what the customer really chose is kept here.
async function record({ sarieeOrderId, userId = null, email = '', paymentMethod = 'cod', firstName = '' }) {
  if (!sarieeOrderId) return;
  // Insert once; ignore if we've already recorded this order id.
  const exists = await db.get('SELECT id FROM sariee_orders WHERE sariee_order_id = ?', [String(sarieeOrderId)]);
  if (exists) return;
  const base = [String(sarieeOrderId), userId || null, (email || '').toLowerCase()];
  try {
    await db.run('INSERT INTO sariee_orders (sariee_order_id, user_id, email, payment_method, first_name) VALUES (?, ?, ?, ?, ?)', [...base, paymentMethod, firstName]);
  } catch (err) {
    // A database that has not picked up the new columns yet (schema not re-run): still record the order itself.
    console.warn('[orders] recording without payment_method:', err.message);
    await db.run('INSERT INTO sariee_orders (sariee_order_id, user_id, email) VALUES (?, ?, ?)', base);
  }
}

// The newest orders placed through this storefront, for the admin Orders page.
async function recent(limit = 25) {
  try {
    return await db.all('SELECT sariee_order_id, email, first_name, payment_method, created_at FROM sariee_orders ORDER BY id DESC LIMIT ?', [limit]);
  } catch (_) {
    return db.all('SELECT sariee_order_id, email, created_at FROM sariee_orders ORDER BY id DESC LIMIT ?', [limit]);
  }
}

// One recorded order by its Sariee id.
async function find(sarieeOrderId) {
  try {
    return await db.get('SELECT sariee_order_id, email, first_name, payment_method FROM sariee_orders WHERE sariee_order_id = ?', [String(sarieeOrderId)]);
  } catch (_) {
    return db.get('SELECT sariee_order_id, email FROM sariee_orders WHERE sariee_order_id = ?', [String(sarieeOrderId)]);
  }
}

// Map a Sariee single-order payload into the shape the account view renders.
function mapOrder(sarieeOrderId, d, paymentMethod) {
  if (!d) return null;
  const money = (v) => Math.round((Number(v) || 0) * 100);
  return {
    id: sarieeOrderId,
    number: d.invoice_number ? `#${d.invoice_number}` : sarieeOrderId.slice(0, 8),
    date: d.date || '',
    status: d.status_name || d.status || '',
    payment: paymentMethod === 'instapay' ? 'InstaPay' : (d.payment_method_name || d.payment_method || ''),
    subtotal_cents: money(d.total_amount),
    shipping_cents: money(d.shipping_fees),
    total_cents: money(d.final_amount != null ? d.final_amount : d.total_amount),
    address: d.customer_address || null,
    items: (d.items || []).map((it) => ({
      name: it.product_name || 'Item',
      image_url: it.product_image || '',
      qty: Number(it.current_quantity) || 1,
      line_cents: money(it.total),
    })),
  };
}

// All orders for a signed-in user (matched by user id or the email they used),
// with live details fetched from Sariee. Fetch failures are skipped, not
// fatal — but flagged via `partial` so the caller can distinguish "genuinely
// no orders" from "some orders exist but Sariee couldn't return them".
async function forUser({ userId = null, email = '' }) {
  const clauses = [];
  const args = [];
  if (userId) { clauses.push('user_id = ?'); args.push(userId); }
  if (email) { clauses.push('email = ?'); args.push(String(email).toLowerCase()); }
  if (!clauses.length) return { orders: [], partial: false };
  let rows;
  try {
    rows = await db.all(`SELECT sariee_order_id, MAX(payment_method) AS payment_method FROM sariee_orders WHERE ${clauses.join(' OR ')} GROUP BY sariee_order_id`, args);
  } catch (_) { // payment_method column not there yet
    rows = await db.all(`SELECT DISTINCT sariee_order_id FROM sariee_orders WHERE ${clauses.join(' OR ')}`, args);
  }

  let failures = 0;
  const fetched = await Promise.all(rows.map(async (row) => {
    try {
      const r = await sariee.store.singleOrder({ order_id: row.sariee_order_id });
      return mapOrder(row.sariee_order_id, r.data && r.data.data, row.payment_method);
    } catch (_) {
      failures += 1;
      return null; // skip an order Sariee can't return right now
    }
  }));
  const orders = fetched.filter(Boolean);
  // Newest first (invoice numbers ascend with time).
  orders.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return { orders, partial: failures > 0 };
}

// Ownership check: does this Sariee order id belong to this signed-in user?
async function belongsToUser(sarieeOrderId, userId) {
  if (!sarieeOrderId || !userId) return false;
  const row = await db.get(
    'SELECT id FROM sariee_orders WHERE sariee_order_id = ? AND user_id = ?',
    [String(sarieeOrderId), userId]
  );
  return !!row;
}

module.exports = { record, recent, find, forUser, mapOrder, belongsToUser };
