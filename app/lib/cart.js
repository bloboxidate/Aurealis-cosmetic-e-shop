// Cart helpers — cart is keyed by the express session id, so guests get a cart too.
const db = require('./../db/database');

const ITEMS_SQL = `
  SELECT ci.id, ci.product_id, ci.size, ci.qty,
         p.name, p.subtitle, p.slug, p.price_cents, p.color, p.image_url
  FROM cart_items ci
  JOIN products p ON p.id = ci.product_id
  WHERE ci.session_id = ? AND p.is_active = 1
  ORDER BY ci.created_at ASC, ci.id ASC
`;

async function getItems(sessionId) {
  const rows = await db.all(ITEMS_SQL, [sessionId]);
  return rows.map((it) => ({ ...it, line_cents: it.price_cents * it.qty }));
}

async function getCount(sessionId) {
  const row = await db.get(
    'SELECT COALESCE(SUM(qty),0) AS n FROM cart_items WHERE session_id = ?',
    [sessionId]
  );
  return Number(row.n) || 0;
}

// Add to cart via explicit upsert. A bare `qty = qty + n` inside ON CONFLICT is
// ambiguous in Postgres (fine in SQLite), so we select-then-update/insert, which
// is unambiguous on both engines. `SET qty = qty + ?` in a plain UPDATE is fine.
async function upsertItem(runner, sessionId, productId, size, qty) {
  const existing = await runner.get(
    'SELECT id FROM cart_items WHERE session_id = ? AND product_id = ? AND size = ?',
    [sessionId, productId, size]
  );
  if (existing) {
    await runner.run('UPDATE cart_items SET qty = qty + ? WHERE id = ?', [qty, existing.id]);
  } else {
    await runner.run(
      'INSERT INTO cart_items (session_id, product_id, size, qty) VALUES (?, ?, ?, ?)',
      [sessionId, productId, size, qty]
    );
  }
}

async function addItem(sessionId, productId, size, qty) {
  qty = Math.max(1, parseInt(qty, 10) || 1);
  const product = await db.get('SELECT id FROM products WHERE id = ? AND is_active = 1', [productId]);
  if (!product) return false;
  await upsertItem(db, sessionId, productId, size || '', qty);
  return true;
}

async function updateQty(sessionId, itemId, qty) {
  qty = parseInt(qty, 10) || 0;
  if (qty <= 0) {
    await db.run('DELETE FROM cart_items WHERE id = ? AND session_id = ?', [itemId, sessionId]);
  } else {
    await db.run('UPDATE cart_items SET qty = ? WHERE id = ? AND session_id = ?', [qty, itemId, sessionId]);
  }
}

async function removeItem(sessionId, itemId) {
  await db.run('DELETE FROM cart_items WHERE id = ? AND session_id = ?', [itemId, sessionId]);
}

async function clear(sessionId) {
  await db.run('DELETE FROM cart_items WHERE session_id = ?', [sessionId]);
}

// Move a guest cart onto a new session id (used on login so the cart follows the user).
async function reassign(fromSession, toSession) {
  const items = await db.all('SELECT product_id, size, qty FROM cart_items WHERE session_id = ?', [fromSession]);
  await db.tx(async (t) => {
    for (const it of items) {
      await upsertItem(t, toSession, it.product_id, it.size, it.qty);
    }
    await t.run('DELETE FROM cart_items WHERE session_id = ?', [fromSession]);
  });
}

async function lookupPromo(code) {
  if (!code) return null;
  const row = await db.get('SELECT * FROM promo_codes WHERE code = ? AND active = 1', [
    String(code).trim().toUpperCase(),
  ]);
  return row || null;
}

// Compute money totals. shippingMethod: 'standard' (free) | 'express' ($12).
async function totals(sessionId, { promoCode = '', shippingMethod = 'standard' } = {}) {
  const items = await getItems(sessionId);
  const subtotal = items.reduce((s, it) => s + it.line_cents, 0);

  let discount = 0;
  const promo = await lookupPromo(promoCode);
  if (promo && subtotal > 0) {
    discount = promo.kind === 'percent'
      ? Math.round((subtotal * promo.value) / 100)
      : Math.min(promo.value, subtotal);
  }

  const shipping = shippingMethod === 'express' ? 1200 : 0;
  const total = Math.max(0, subtotal - discount) + shipping;
  return {
    items,
    subtotal_cents: subtotal,
    discount_cents: discount,
    shipping_cents: shipping,
    total_cents: total,
    promo: promo ? promo.code : '',
  };
}

module.exports = {
  getItems, getCount, addItem, updateQty, removeItem, clear, reassign, lookupPromo, totals,
};
