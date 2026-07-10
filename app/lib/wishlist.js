// Local wishlist — keyed by the signed-in user and the Sariee product id.
const db = require('../db/database');

async function list(userId) {
  return db.all('SELECT sariee_product_id FROM wishlist_items WHERE user_id = ? ORDER BY created_at DESC', [userId]);
}

// Set of product ids a user has wishlisted — one query, for marking up a
// whole grid of product cards at once instead of a has() call per card.
async function idsFor(userId) {
  const rows = await list(userId);
  return new Set(rows.map((r) => r.sariee_product_id));
}

async function has(userId, sarieeProductId) {
  const row = await db.get(
    'SELECT id FROM wishlist_items WHERE user_id = ? AND sariee_product_id = ?',
    [userId, sarieeProductId]
  );
  return !!row;
}

async function add(userId, sarieeProductId) {
  if (await has(userId, sarieeProductId)) return;
  await db.run(
    'INSERT INTO wishlist_items (user_id, sariee_product_id) VALUES (?, ?)',
    [userId, sarieeProductId]
  );
}

async function remove(userId, sarieeProductId) {
  await db.run(
    'DELETE FROM wishlist_items WHERE user_id = ? AND sariee_product_id = ?',
    [userId, sarieeProductId]
  );
}

module.exports = { list, idsFor, has, add, remove };
