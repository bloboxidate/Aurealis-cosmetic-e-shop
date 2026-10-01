// Sariee-backed catalog adapter, with a LOCAL presentation layer on top.
//
// Products/prices/images come live from Sariee. The site-admin then curates how
// they appear on the storefront via:
//   • product_overlay  — local category/subcategory, display order, featured /
//                         bestseller flags, and hidden toggle (lib/overlay.js)
//   • categories/subcategories tables — the local taxonomy (lib/categories.js)
//
// Sariee product objects are mapped into the exact shape the EJS views expect,
// then the overlay is merged in. The raw Sariee list is cached briefly; overlay
// + taxonomy come from the DB and are applied fresh so admin edits show at once.

const sariee = require('./sariee');
const overlay = require('./overlay');
const Cats = require('./categories'); // local taxonomy tables (read side)

const TTL_MS = Number(process.env.CATALOG_CACHE_MS || 60000);
const cache = new Map();
const inflight = new Map(); // key -> in-progress promise, so concurrent callers
                             // on a cold cache share one fetch instead of each
                             // triggering their own (a real issue once callers
                             // started running in parallel via Promise.all).

// Stale-while-revalidate: fresh for TTL_MS; after that the last good list is still served instantly (up to STALE_MS)
// while ONE background fetch refreshes it, so the first visitor after an idle minute doesn't wait on the Sariee API.
// A failed refresh keeps serving the last good list. Prices/stock shown can therefore lag by about a minute plus one
// request; the cart and checkout always go to Sariee for the real numbers.
const STALE_MS = Number(process.env.CATALOG_STALE_MS || 5 * 60 * 1000);

async function cached(key, fn) {
  const hit = cache.get(key);
  const age = hit ? Date.now() - hit.at : Infinity;
  if (hit && age < TTL_MS) return hit.value;
  const refresh = () => {
    if (inflight.has(key)) return inflight.get(key);
    const promise = fn()
      .then((value) => {
        cache.set(key, { at: Date.now(), value });
        inflight.delete(key);
        return value;
      })
      .catch((err) => {
        inflight.delete(key);
        throw err;
      });
    inflight.set(key, promise);
    return promise;
  };
  if (hit && age < STALE_MS) {
    refresh().catch(() => {}); // already logged by fetchSariee; keep serving the last good list
    return hit.value;
  }
  return refresh();
}

function slugify(s) {
  return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function slugFromProduct(p) {
  const fromUrl = (p.store_url || '').split('/').filter(Boolean).pop();
  return fromUrl || slugify(p.name);
}

// Map a Sariee frontend product into the storefront view shape.
function mapProduct(p) {
  const bc = (p.barcodes && p.barcodes[0]) || {};
  const priceUnits = bc.useSalePrice && bc.salePrice != null ? bc.salePrice : bc.price;
  const files = (bc.files && bc.files.length ? bc.files : p.files) || [];
  const image = files[0] && files[0].src ? files[0].src : '';
  const sizes = Array.isArray(p.variations) ? p.variations.map((v) => v.name).filter(Boolean) : [];
  const badges = [];
  if (bc.useSalePrice && bc.salePrice != null) badges.push('Sale');

  return {
    id: p.id,
    barcode_id: bc.id || null,
    slug: slugFromProduct(p),
    name: p.name,
    subtitle: p.brief || '',
    description: p.description || '',
    details: p.about || '',
    how_to_use: p.warranty_info || '',
    ingredients: Array.isArray(p.additional)
      ? p.additional.map((a) => (a && (a.value || a.name)) || a).filter(Boolean).join(', ') : '',
    price_cents: Math.round((Number(priceUnits) || 0) * 100),
    image_url: image,
    color: '',
    sizes,
    badges,
    // Sariee's own category slug, used as a fallback when unassigned locally.
    sariee_category: typeof p.categories === 'string' ? p.categories : (p.categories && p.categories.name) || '',
    stock: Number(bc.quantity) || 0,
    is_active: p.status !== false,
    images: files.map((f, i) => ({ id: f.id, url: f.src, sort_order: f.sorting ?? i })),
  };
}

const PER_PAGE = 200;
const MAX_PAGES = 25; // safety cap (~5,000 products) against a runaway loop

// The raw Sariee product list (mapped, no overlay), cached. Logs clearly on
// failure (visible in Vercel's Runtime Logs) — a failed fetch is NOT cached,
// so the next request retries rather than being stuck on an empty result.
// Walks every page (Sariee's `_meta.pagination.last_page`) instead of only
// the first 200 products, so a catalog past that size doesn't silently lose
// items with no indication to admins or shoppers.
function fetchSariee() {
  return cached('sariee', async () => {
    try {
      let page = 1;
      let raw = [];
      for (;;) {
        const r = await sariee.products.listAll({ is_single: 1, per_page: PER_PAGE, page });
        const list = (r.data && r.data.data) || [];
        raw = raw.concat(list);
        const pagination = r.data && r.data._meta && r.data._meta.pagination;
        const lastPage = pagination ? Number(pagination.last_page) || 1 : 1;
        if (page >= lastPage || list.length === 0 || page >= MAX_PAGES) {
          if (page >= MAX_PAGES && page < lastPage) {
            console.error(`[catalog] product list exceeds ${MAX_PAGES}-page safety cap; truncating (last_page=${lastPage})`);
          }
          break;
        }
        page += 1;
      }
      const list = raw.map(mapProduct);
      return { list, index: buildIndex(list) };
    } catch (err) {
      console.error('[catalog] Sariee products.listAll failed:', err.status || '', err.message);
      throw err;
    }
  });
}

function buildIndex(list) {
  const bySlug = new Map();
  const byId = new Map();
  const byBarcode = new Map();
  for (const p of list) {
    bySlug.set(p.slug, p);
    byId.set(p.id, p);
    if (p.barcode_id) byBarcode.set(p.barcode_id, p);
  }
  return { bySlug, byId, byBarcode };
}

// Merge the overlay onto one already-mapped Sariee product. A product can
// belong to several categories at once (product_categories); `categories` is
// the full list, and `category`/`subcategory` are the first one — kept for
// display contexts that only ever show a single category (breadcrumbs, nav
// active-state) and for backward compatibility, falling back to Sariee's own
// category when nothing's been assigned locally.
function decorate(p, ov, catsBySariee) {
  const o = ov.get(p.id) || {};
  const categories = (catsBySariee && catsBySariee.get(p.id)) || [];
  const primary = categories[0];
  return {
    ...p,
    categories,
    category: primary ? primary.category_slug : slugify(p.sariee_category),
    subcategory: primary ? primary.subcategory_slug : '',
    sort_order: Number(o.sort_order) || 0,
    is_featured: !!o.is_featured,
    is_bestseller: !!o.is_bestseller,
    is_hidden: !!o.is_hidden,
    badges: p.badges.slice(),
    sizes: p.sizes || [],
  };
}

// Merge the local overlay into every product. Sets category/subcategory (local
// assignment, falling back to Sariee's), sort_order, featured/bestseller/hidden.
async function withOverlay() {
  const [{ list }, ov, catsBySariee] = await Promise.all([fetchSariee(), overlay.map(), overlay.categoriesMap()]);
  return list.map((p) => decorate(p, ov, catsBySariee));
}

function byOrder(a, b) {
  return (a.sort_order - b.sort_order) || a.name.localeCompare(b.name);
}

// A product "is in" a category if any of its product_categories rows match
// (optionally further scoped to a specific subcategory within that category).
function inCategory(p, category, subcategory) {
  return p.categories.some((c) =>
    c.category_slug === category && (!subcategory || subcategory === 'all' || c.subcategory_slug === subcategory)
  );
}

// ---- Products (storefront-facing: hidden excluded) ---------------------
async function all({ category, subcategory } = {}) {
  let products = (await withOverlay()).filter((p) => !p.is_hidden);
  if (category) products = products.filter((p) => inCategory(p, category, subcategory));
  return products.sort(byOrder);
}

// Only products explicitly flagged is_bestseller in the overlay — no
// fallback to "show everything" when none are picked yet, which used to
// make arbitrary products appear in the Bestsellers section unasked.
async function bestsellers(limit = 4) {
  const products = (await withOverlay()).filter((p) => !p.is_hidden);
  return products.filter((p) => p.is_bestseller).sort(byOrder).slice(0, limit);
}

async function featured(limit = 8) {
  return (await withOverlay()).filter((p) => !p.is_hidden && p.is_featured).sort(byOrder).slice(0, limit);
}

async function bySlug(slug) {
  const [{ index }, ov, catsBySariee] = await Promise.all([fetchSariee(), overlay.map(), overlay.categoriesMap()]);
  const p = index.bySlug.get(slug);
  if (!p) return null;
  const decorated = decorate(p, ov, catsBySariee);
  return decorated.is_hidden ? null : decorated;
}

async function byId(id) {
  const [{ index }, ov, catsBySariee] = await Promise.all([fetchSariee(), overlay.map(), overlay.categoriesMap()]);
  const p = index.byId.get(id);
  return p ? decorate(p, ov, catsBySariee) : null;
}

// Raw (pre-overlay) lookup by barcode id — used by the cart, which only needs
// fields set in mapProduct (slug/name/image/price), not overlay decoration.
async function byBarcodeId(barcodeId) {
  const { index } = await fetchSariee();
  return index.byBarcode.get(barcodeId) || null;
}

// The barcode→product Map itself, for callers resolving several barcodes at
// once (the cart) — one fetch instead of one per item.
async function barcodeIndex() {
  const { index } = await fetchSariee();
  return index.byBarcode;
}

async function related(product, limit = 4) {
  const productSlugs = new Set(product.categories.map((c) => c.category_slug));
  const shares = (p) => p.categories.some((c) => productSlugs.has(c.category_slug));
  return (await withOverlay())
    .filter((p) => p.id !== product.id && !p.is_hidden)
    .sort((a, b) => Number(shares(b)) - Number(shares(a)) || byOrder(a, b))
    .slice(0, limit);
}

async function images(productId) {
  const p = await byId(productId);
  return p ? p.images : [];
}

// Admin-facing: EVERY Sariee product with its overlay (incl. hidden), ordered.
async function allForAdmin() {
  return (await withOverlay()).sort(byOrder);
}

// ---- Categories (local taxonomy tables) --------------------------------
async function listCategories() { return Cats.listCategories(); }
async function subcategoriesForSlug(slug) { return Cats.subcategoriesForSlug(slug); }
async function listSubcategories() { return Cats.listSubcategories(); }
async function getCategoryBySlug(slug) { return Cats.getCategoryBySlug(slug); }

// Drop only the Sariee product cache (overlay/taxonomy are read live from DB).
function invalidate() { cache.clear(); }

module.exports = {
  slugify,
  all, bestsellers, featured, bySlug, byId, byBarcodeId, barcodeIndex, related, images, mapProduct,
  allForAdmin, withOverlay, allRaw: withOverlay, // allRaw = every product incl. hidden (used by the cart)
  listCategories, listSubcategories, subcategoriesForSlug, getCategoryBySlug,
  invalidate,
};
