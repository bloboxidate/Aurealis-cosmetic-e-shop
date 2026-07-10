// Category / subcategory taxonomy. Products store category & subcategory as
// slug strings; these tables provide the canonical, editable list and drive the
// storefront nav + admin dropdowns.
const db = require('../db/database');

function slugify(s) {
  return (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function listCategories() {
  return db.all('SELECT * FROM categories ORDER BY sort_order ASC, name ASC');
}

async function listSubcategories() {
  return db.all(`
    SELECT s.*, c.slug AS category_slug, c.name AS category_name
    FROM subcategories s JOIN categories c ON c.id = s.category_id
    ORDER BY c.sort_order ASC, s.sort_order ASC, s.name ASC
  `);
}

async function subcategoriesForSlug(categorySlug) {
  return db.all(`
    SELECT s.* FROM subcategories s
    JOIN categories c ON c.id = s.category_id
    WHERE c.slug = ? ORDER BY s.sort_order ASC, s.name ASC
  `, [categorySlug]);
}

async function getCategory(id) {
  return db.get('SELECT * FROM categories WHERE id = ?', [id]);
}
async function getCategoryBySlug(slug) {
  return db.get('SELECT * FROM categories WHERE slug = ?', [slug]);
}
async function getSubcategory(id) {
  return db.get('SELECT * FROM subcategories WHERE id = ?', [id]);
}

// Products live in Sariee, assigned to a local category via product_overlay
// (lib/overlay.js) — not a local `products` table (that was pre-Sariee-
// migration dead schema, removed). Counting here checks the overlay.
async function countProductsInCategory(slug) {
  return (await db.get('SELECT COUNT(*) AS n FROM product_overlay WHERE category_slug = ?', [slug])).n;
}

async function createCategory({ name, slug, sort_order }) {
  slug = slugify(slug) || slugify(name);
  await db.run('INSERT INTO categories (slug, name, sort_order) VALUES (?, ?, ?)',
    [slug, (name || '').trim(), parseInt(sort_order, 10) || 0]);
}

// Reassigning product_overlay rows on a slug rename is handled separately by
// the caller (overlay.renameCategory), since categories.js has no business
// reaching into the overlay table directly.
async function updateCategory(id, { name, slug, sort_order }) {
  const cur = await getCategory(id);
  if (!cur) return;
  const newSlug = slugify(slug) || slugify(name);
  await db.run('UPDATE categories SET slug = ?, name = ?, sort_order = ? WHERE id = ?',
    [newSlug, (name || '').trim(), parseInt(sort_order, 10) || 0, id]);
}

async function updateCategoryImage(id, imageUrl) {
  await db.run('UPDATE categories SET image_url = ? WHERE id = ?', [imageUrl, id]);
}

async function deleteCategory(id) {
  const cur = await getCategory(id);
  if (!cur) return { ok: false, reason: 'not found' };
  const n = await countProductsInCategory(cur.slug);
  if (n > 0) return { ok: false, reason: `${n} product(s) still use this category` };
  await db.run('DELETE FROM categories WHERE id = ?', [id]); // subcategories cascade
  return { ok: true };
}

async function createSubcategory({ category_id, name, slug, sort_order }) {
  slug = slugify(slug) || slugify(name);
  await db.run('INSERT INTO subcategories (category_id, slug, name, sort_order) VALUES (?, ?, ?, ?)',
    [category_id, slug, (name || '').trim(), parseInt(sort_order, 10) || 0]);
}

async function updateSubcategory(id, { category_id, name, slug, sort_order }) {
  const cur = await getSubcategory(id);
  if (!cur) return;
  const newSlug = slugify(slug) || slugify(name);
  await db.run('UPDATE subcategories SET category_id = ?, slug = ?, name = ?, sort_order = ? WHERE id = ?',
    [category_id || cur.category_id, newSlug, (name || '').trim(), parseInt(sort_order, 10) || 0, id]);
}

async function deleteSubcategory(id) {
  await db.run('DELETE FROM subcategories WHERE id = ?', [id]);
  return { ok: true };
}

module.exports = {
  slugify, listCategories, listSubcategories, subcategoriesForSlug,
  getCategory, getCategoryBySlug, getSubcategory, countProductsInCategory,
  createCategory, updateCategory, updateCategoryImage, deleteCategory,
  createSubcategory, updateSubcategory, deleteSubcategory,
};
