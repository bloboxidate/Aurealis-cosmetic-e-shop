// A short log of things that went wrong on the site (a failed checkout, an email that did not go out, an unexpected error),
// shown in Admin → Problems so nobody has to open Vercel's logs. Kept in the content store (key "issues") like lib/activity.js,
// so it needs no table; only the newest entries are kept. Logging never throws and never breaks the request it describes.
// Two requests on different serverless instances can overwrite each other's entry; that is fine for a log.
const content = require('./content');

const KEEP = 100;

const clip = (v, n) => String(v == null ? '' : v).slice(0, n);

// kind: 'checkout' | 'email' | 'error'. details: a flat object of short facts (strings/numbers), shown as a list.
async function log(kind, title, details = {}) {
  try {
    const cur = await content.get('issues');
    const items = Array.isArray(cur.items) ? cur.items : [];
    const clean = {};
    for (const [k, v] of Object.entries(details || {})) if (v != null && v !== '') clean[clip(k, 40)] = clip(typeof v === 'object' ? JSON.stringify(v) : v, 600);
    items.unshift({ t: Date.now(), kind: clip(kind, 20), title: clip(title, 200), details: clean });
    await content.set('issues', { items: items.slice(0, KEEP) });
  } catch (err) {
    console.error('[issues] could not record "%s": %s', title, err.message);
  }
}

async function list() {
  const cur = await content.get('issues');
  return Array.isArray(cur.items) ? cur.items : [];
}

async function count() {
  try { return (await list()).length; } catch (_) { return 0; }
}

async function clear() {
  await content.set('issues', { items: [] });
}

module.exports = { log, list, count, clear };
