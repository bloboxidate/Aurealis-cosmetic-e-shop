// Tiny in-memory read cache for rarely-changing database reads (site content, categories, product overlay, reviews).
//
// Why: every page does several of these reads one after another over a single pooled connection to a remote
// database, which is most of the server's response time. They change only when an admin saves (or a review is moderated).
//
// Stale-while-revalidate: an entry is FRESH for TTL_MS; after that it is still served instantly (STALE_MS) while one
// background query refreshes it, so a visitor never waits on the database for data we already have. Only the very first
// read after a cold start (or after a write) pays the query.
//
// Rules: any write through the same module calls bust(), so the instance that saved sees its own change immediately;
// other serverless instances catch up within roughly TTL_MS. Concurrent callers on a cold entry share one query.
// Cached values are cloned on the way out so a caller that mutates a result (sort, push) can't poison the cache.
const TTL_MS = 15 * 1000;
const STALE_MS = 10 * 60 * 1000;

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

function load(key, fn, args, self) {
  if (inflight.has(key)) return inflight.get(key);
  const p = Promise.resolve(fn.apply(self, args))
    .then((value) => { if (inflight.get(key) === p) { store.set(key, { at: Date.now(), value }); inflight.delete(key); } return value; })
    .catch((err) => { if (inflight.get(key) === p) inflight.delete(key); throw err; });
  inflight.set(key, p);
  return p;
}

// Wrap the named read functions of a module's exports with the cache, and the named write functions so they bust it.
function wrap(mod, ns, reads, writes) {
  reads.forEach((name) => {
    const fn = mod[name];
    mod[name] = function cachedRead(...args) {
      const key = ns + ':' + name + ':' + JSON.stringify(args);
      const hit = store.get(key);
      const age = hit ? Date.now() - hit.at : Infinity;
      if (hit && age < TTL_MS) return Promise.resolve(clone(hit.value));
      if (hit && age < STALE_MS) {
        load(key, fn, args, this).catch(() => {}); // refresh in the background; keep serving what we have if it fails
        return Promise.resolve(clone(hit.value));
      }
      return load(key, fn, args, this).then(clone);
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
