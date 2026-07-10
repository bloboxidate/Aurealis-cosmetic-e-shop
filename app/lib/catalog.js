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

async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
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

// Merge the overlay onto one already-mapped Sariee product.
function decorate(p, ov) {
  const o = ov.get(p.id) || {};
  return {
    ...p,
    category: o.category_slug || slugify(p.sariee_category),
    subcategory: o.subcategory_slug || '',
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
  const [{ list }, ov] = await Promise.all([fetchSariee(), overlay.map()]);
  return list.map((p) => decorate(p, ov));
}

function byOrder(a, b) {
  return (a.sort_order - b.sort_order) || a.name.localeCompare(b.name);
}

// ---- Products (storefront-facing: hidden excluded) ---------------------
async function all({ category, subcategory } = {}) {
  let products = (await withOverlay()).filter((p) => !p.is_hidden);
  if (category) products = products.filter((p) => p.category === category);
  if (subcategory && subcategory !== 'all') products = products.filter((p) => p.subcategory === subcategory);
  return products.sort(byOrder);
}

async function bestsellers(limit = 4) {
  const products = (await withOverlay()).filter((p) => !p.is_hidden);
  const picked = products.filter((p) => p.is_bestseller).sort(byOrder);
  return (picked.length ? picked : products.sort(byOrder)).slice(0, limit);
}

async function featured(limit = 8) {
  return (await withOverlay()).filter((p) => !p.is_hidden && p.is_featured).sort(byOrder).slice(0, limit);
}

async function bySlug(slug) {
  const [{ index }, ov] = await Promise.all([fetchSariee(), overlay.map()]);
  const p = index.bySlug.get(slug);
  if (!p) return null;
  const decorated = decorate(p, ov);
  return decorated.is_hidden ? null : decorated;
}

async function byId(id) {
  const [{ index }, ov] = await Promise.all([fetchSariee(), overlay.map()]);
  const p = index.byId.get(id);
  return p ? decorate(p, ov) : null;
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
  return (await withOverlay())
    .filter((p) => p.id !== product.id && !p.is_hidden)
    .sort((a, b) => Number(b.category === product.category) - Number(a.category === product.category) || byOrder(a, b))
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
