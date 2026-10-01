// Tiny in-memory read cache for rarely-changing database reads (site content, categories, product overlay).
//
// Why: every page does several of these reads one after another over a single pooled connection to a remote
// database, which is most of the server's response time. They change only when an admin saves.
//
// Rules: entries live for TTL_MS (short, so another serverless instance catches up quickly); any write through the
// same module calls bust(), so the instance that saved sees its own change immediately. Concurrent callers on a cold
// entry share one query. Cached values are cloned on the way out so a caller that mutates a result (sort, push) can't
// poison the cache.
const TTL_MS = 15 * 1000;

const store = new Map();     // key -> { at, value }
const inflight = new Map();  // key -> Promise

function clone(v) {
  if (v instanceof Map) {
    const m = new Map();
    v.forEach((val, k) => m.set(k, Array.isArray(val) ? val.slice() : val));
    return m;
  }
  if (Array.isArray(v)) return v.slice();
  if (v && typeof v === 'object') return { ...v };
  return v;
}

function bust() { store.clear(); inflight.clear(); }

// Wrap the named read functions of a module's exports with the cache, and the named write functions so they bust it.
function wrap(mod, ns, reads, writes) {
  reads.forEach((name) => {
    const fn = mod[name];
    mod[name] = function cachedRead(...args) {
      const key = ns + ':' + name + ':' + JSON.stringify(args);
      const hit = store.get(key);
      if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(clone(hit.value));
      if (inflight.has(key)) return inflight.get(key).then(clone);
      const p = Promise.resolve(fn.apply(this, args))
        .then((value) => { store.set(key, { at: Date.now(), value }); inflight.delete(key); return value; })
        .catch((err) => { inflight.delete(key); throw err; });
      inflight.set(key, p);
      return p.then(clone);
    };
  });
  writes.forEach((name) => {
    const fn = mod[name];
    if (typeof fn !== 'function') return;
    mod[name] = async function bustingWrite(...args) {
      try { return await fn.apply(this, args); } finally { bust(); }
    };
  });
  return mod;
}

module.exports = { wrap, bust, TTL_MS };
