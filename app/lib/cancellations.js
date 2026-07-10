// Cancellation requests — Sariee has no cancel/void order endpoint, so this
// only records the request and notifies store ops to action it manually.
const db = require('../db/database');

async function request({ sarieeOrderId, userId, note = '' }) {
  await db.run(
    'INSERT INTO cancellation_requests (sariee_order_id, user_id, note) VALUES (?, ?, ?)',
    [String(sarieeOrderId), userId, note]
  );
}

module.exports = { request };
