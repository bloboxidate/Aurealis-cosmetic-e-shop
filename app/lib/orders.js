// Order history — bridges our local accounts to Sariee's orders.
//
// Orders live in Sariee. When a customer places one through this storefront we
// record its Sariee order id here (keyed by user + email), then the account
// page pulls the live details back from Sariee via `single-order`.
const db = require('../db/database');
const sariee = require('./sariee');

// Remember an order placed through the site.
async function record({ sarieeOrderId, userId = null, email = '' }) {
  if (!sarieeOrderId) return;
  // Insert once; ignore if we've already recorded this order id.
  const exists = await db.get('SELECT id FROM sariee_orders WHERE sariee_order_id = ?', [String(sarieeOrderId)]);
  if (exists) return;
  await db.run(
    'INSERT INTO sariee_orders (sariee_order_id, user_id, email) VALUES (?, ?, ?)',
    [String(sarieeOrderId), userId || null, (email || '').toLowerCase()]
  );
}

// Map a Sariee single-order payload into the shape the account view renders.
function mapOrder(sarieeOrderId, d) {
  if (!d) return null;
  const money = (v) => Math.round((Number(v) || 0) * 100);
  return {
    id: sarieeOrderId,
    number: d.invoice_number ? `#${d.invoice_number}` : sarieeOrderId.slice(0, 8),
    date: d.date || '',
    status: d.status_name || d.status || '',
    payment: d.payment_method_name || d.payment_method || '',
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
// with live details fetched from Sariee. Fetch failures are skipped, not fatal.
async function forUser({ userId = null, email = '' }) {
  const clauses = [];
  const args = [];
  if (userId) { clauses.push('user_id = ?'); args.push(userId); }
  if (email) { clauses.push('email = ?'); args.push(String(email).toLowerCase()); }
  if (!clauses.length) return [];
  const rows = await db.all(
    `SELECT DISTINCT sariee_order_id FROM sariee_orders WHERE ${clauses.join(' OR ')}`,
    args
  );

  const orders = [];
  for (const row of rows) {
    try {
      const r = await sariee.store.singleOrder({ order_id: row.sariee_order_id });
      const mapped = mapOrder(row.sariee_order_id, r.data && r.data.data);
      if (mapped) orders.push(mapped);
    } catch (_) { /* skip an order Sariee can't return right now */ }
  }
  // Newest first (invoice numbers ascend with time).
  orders.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return orders;
}

module.exports = { record, forUser, mapOrder };
