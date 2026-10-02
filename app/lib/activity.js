// A short "recent changes" feed for the admin dashboard. Kept in the content store (key "activity") so it needs
// no table of its own; only the newest entries are kept. Logging never breaks the admin action it describes.
const content = require('./content');

const KEEP = 40;

async function log(user, text) {
  try {
    const cur = await content.get('activity');
    const items = Array.isArray(cur.items) ? cur.items : [];
    items.unshift({ t: Date.now(), who: (user && (user.first_name || user.email)) || 'Admin', text: String(text).slice(0, 160) });
    await content.set('activity', { items: items.slice(0, KEEP) });
  } catch (err) {
    console.error('[admin] activity log failed:', err.message);
  }
}

async function recent(limit = 8) {
  const cur = await content.get('activity');
  return (Array.isArray(cur.items) ? cur.items : []).slice(0, limit);
}

module.exports = { log, recent };
