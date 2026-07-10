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

// The raw Sariee product list (mapped, no overlay), cached. Logs clearly on
// failure (visible in Vercel's Runtime Logs) — a failed fetch is NOT cached,
// so the next request retries rather than being stuck on an empty result.
function fetchSariee() {
  return cached('sariee', async () => {
    try {
      const r = await sariee.products.listAll({ is_single: 1, per_page: 200 });
      const list = (r.data && r.data.data) || [];
      return list.map(mapProduct);
    } catch (err) {
      console.error('[catalog] Sariee products.listAll failed:', err.status || '', err.message);
      throw err;
    }
  });
}

// Merge the local overlay into each product. Sets category/subcategory (local
// assignment, falling back to Sariee's), sort_order, featured/bestseller/hidden.
async function withOverlay() {
  const [products, ov] = await Promise.all([fetchSariee(), overlay.map()]);
  return products.map((p) => {
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
  });
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
  return (await withOverlay()).find((p) => p.slug === slug && !p.is_hidden) || null;
}

async function byId(id) {
  return (await withOverlay()).find((p) => p.id === id) || null;
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
  all, bestsellers, featured, bySlug, byId, related, images, mapProduct,
  allForAdmin, withOverlay, allRaw: withOverlay, // allRaw = every product incl. hidden (used by the cart)
  listCategories, listSubcategories, subcategoriesForSlug, getCategoryBySlug,
  invalidate,
};
