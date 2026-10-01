// Local product reviews (Sariee has no review feature). User-generated
// content on a live storefront is an abuse surface, so reviews are gated
// behind admin moderation (is_approved) before showing to other shoppers —
// the submitter still sees their own pending review immediately.
const db = require('../db/database');
const ttl = require('./ttl'); // short stale-while-revalidate read cache; writes below bust it

async function forProduct(sarieeProductId) {
  return db.all(
    `SELECT r.id, r.rating, r.body, r.created_at, u.first_name
     FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE r.sariee_product_id = ? AND r.is_approved = 1
     ORDER BY r.created_at DESC`,
    [String(sarieeProductId)]
  );
}

// The latest approved reviews across the store, for the home page. Only moderated (is_approved) reviews, never
// filtered by rating (no cherry-picking), and only the reviewer's first name is ever exposed.
async function latestApproved(limit = 6) {
  const rows = await db.all(
    `SELECT r.id, r.rating, r.body, r.created_at, r.sariee_product_id, u.first_name
     FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE r.is_approved = 1
     ORDER BY r.created_at DESC
     LIMIT ?`,
    [limit]
  );
  return rows.filter((r) => (r.body || '').trim().length >= 12);
}

// Pure aggregate over an already-fetched review list — lets callers that
// already have the rows (e.g. the product page, which renders them too)
// avoid a second query just for the count/average.
function summarize(rows) {
  if (!rows.length) return { count: 0, average: 0 };
  const average = rows.reduce((s, r) => s + r.rating, 0) / rows.length;
  return { count: rows.length, average: Math.round(average * 10) / 10 };
}

async function summary(sarieeProductId) {
  return summarize(await forProduct(sarieeProductId));
}

async function hasReviewed(sarieeProductId, userId) {
  const row = await db.get(
    'SELECT id FROM reviews WHERE sariee_product_id = ? AND user_id = ?',
    [String(sarieeProductId), userId]
  );
  return !!row;
}

async function create({ sarieeProductId, userId, rating, body }) {
  const clamped = Math.min(5, Math.max(1, Number(rating) || 0));
  await db.run(
    'INSERT INTO reviews (sariee_product_id, user_id, rating, body) VALUES (?, ?, ?, ?)',
    [String(sarieeProductId), userId, clamped, (body || '').trim().slice(0, 2000)]
  );
}

// ---- Admin moderation -----------------------------------------------------
async function listPending() {
  return db.all(
    `SELECT r.id, r.sariee_product_id, r.rating, r.body, r.created_at, u.email
     FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE r.is_approved = 0 ORDER BY r.created_at ASC`
  );
}

async function approve(id) {
  await db.run('UPDATE reviews SET is_approved = 1 WHERE id = ?', [id]);
}

async function reject(id) {
  await db.run('DELETE FROM reviews WHERE id = ?', [id]);
}

module.exports = ttl.wrap({ latestApproved, forProduct, summary, summarize, hasReviewed, create, listPending, approve, reject },
  'reviews', ['latestApproved', 'forProduct', 'summary'], ['create', 'approve', 'reject']);
