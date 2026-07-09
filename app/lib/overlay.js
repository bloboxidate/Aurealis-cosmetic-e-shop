// Local presentation overlay for Sariee products (table: product_overlay).
// Keyed by the Sariee product id — lets the site-admin curate Sariee's catalog
// (local category/subcategory, display order, featured/bestseller, hidden)
// without changing anything in Sariee.
const db = require('../db/database');

const FIELDS = ['category_slug', 'subcategory_slug', 'sort_order', 'is_featured', 'is_bestseller', 'is_hidden'];

// Map of sariee_id -> overlay row, for merging into the catalog.
async function map() {
  const rows = await db.all('SELECT * FROM product_overlay');
  const m = new Map();
  for (const r of rows) m.set(r.sariee_id, r);
  return m;
}

async function get(sarieeId) {
  return db.get('SELECT * FROM product_overlay WHERE sariee_id = ?', [sarieeId]);
}

// Upsert a subset of overlay fields for a product.
async function set(sarieeId, patch = {}) {
  const cur = await get(sarieeId);
  const merged = {
    category_slug: '', subcategory_slug: '', sort_order: 0,
    is_featured: 0, is_bestseller: 0, is_hidden: 0,
    ...(cur || {}),
  };
  for (const f of FIELDS) {
    if (f in patch && patch[f] !== undefined) {
      merged[f] = f.startsWith('is_') ? (patch[f] ? 1 : 0) : patch[f];
    }
  }
  if (cur) {
    await db.run(
      `UPDATE product_overlay SET category_slug=@category_slug, subcategory_slug=@subcategory_slug,
         sort_order=@sort_order, is_featured=@is_featured, is_bestseller=@is_bestseller, is_hidden=@is_hidden
       WHERE sariee_id=@sariee_id`,
      { ...merged, sariee_id: sarieeId }
    );
  } else {
    await db.run(
      `INSERT INTO product_overlay (sariee_id, category_slug, subcategory_slug, sort_order, is_featured, is_bestseller, is_hidden)
       VALUES (@sariee_id, @category_slug, @subcategory_slug, @sort_order, @is_featured, @is_bestseller, @is_hidden)`,
      { ...merged, sariee_id: sarieeId }
    );
  }
}

// Persist a full display order from an ordered list of sariee ids.
async function setOrder(orderedIds = []) {
  await db.tx(async (t) => {
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      const cur = await t.get('SELECT sariee_id FROM product_overlay WHERE sariee_id = ?', [id]);
      if (cur) await t.run('UPDATE product_overlay SET sort_order = ? WHERE sariee_id = ?', [i, id]);
      else await t.run('INSERT INTO product_overlay (sariee_id, sort_order) VALUES (?, ?)', [id, i]);
    }
  });
}

// Reassign products when a category/subcategory slug is renamed or deleted.
async function renameCategory(oldSlug, newSlug) {
  await db.run('UPDATE product_overlay SET category_slug = ? WHERE category_slug = ?', [newSlug, oldSlug]);
}
async function clearCategory(slug) {
  await db.run("UPDATE product_overlay SET category_slug = '', subcategory_slug = '' WHERE category_slug = ?", [slug]);
}
async function renameSubcategory(oldSlug, newSlug) {
  await db.run('UPDATE product_overlay SET subcategory_slug = ? WHERE subcategory_slug = ?', [newSlug, oldSlug]);
}
async function clearSubcategory(slug) {
  await db.run("UPDATE product_overlay SET subcategory_slug = '' WHERE subcategory_slug = ?", [slug]);
}

module.exports = {
  map, get, set, setOrder,
  renameCategory, clearCategory, renameSubcategory, clearSubcategory,
};
