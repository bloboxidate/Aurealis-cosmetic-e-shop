// Product queries. Rows are decorated so views can use .sizes / .badges as arrays.
const db = require('../db/database');

function decorate(row) {
  if (!row) return row;
  let sizes = [];
  let badges = [];
  try { sizes = JSON.parse(row.sizes || '[]'); } catch (_) {}
  try { badges = JSON.parse(row.badges || '[]'); } catch (_) {}
  return { ...row, sizes, badges };
}

async function all({ category, activeOnly = true } = {}) {
  let sql = 'SELECT * FROM products';
  const clauses = [];
  const args = [];
  if (activeOnly) clauses.push('is_active = 1');
  if (category) { clauses.push('category = ?'); args.push(category); }
  if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY sort_order ASC, id ASC';
  return (await db.all(sql, args)).map(decorate);
}

async function bestsellers(limit = 4) {
  const rows = await db.all(
    'SELECT * FROM products WHERE is_active = 1 AND is_bestseller = 1 ORDER BY sort_order ASC LIMIT ?',
    [limit]
  );
  return rows.map(decorate);
}

async function bySlug(slug) {
  return decorate(await db.get('SELECT * FROM products WHERE slug = ?', [slug]));
}

async function byId(id) {
  return decorate(await db.get('SELECT * FROM products WHERE id = ?', [id]));
}

async function related(product, limit = 4) {
  const rows = await db.all(
    'SELECT * FROM products WHERE is_active = 1 AND id != ? ORDER BY (category = ?) DESC, sort_order ASC LIMIT ?',
    [product.id, product.category, limit]
  );
  return rows.map(decorate);
}

// ---- product images (multiple per product) ----
async function images(productId) {
  return db.all('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, id ASC', [productId]);
}

// Keep products.image_url mirroring the first image so storefront cards/cart,
// which reference image_url, keep working without per-view joins.
async function syncPrimary(productId) {
  const first = await db.get('SELECT url FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1', [productId]);
  await db.run('UPDATE products SET image_url = ? WHERE id = ?', [first ? first.url : '', productId]);
}

async function addImage(productId, url) {
  const row = await db.get('SELECT COALESCE(MAX(sort_order),-1) AS m FROM product_images WHERE product_id = ?', [productId]);
  const next = (Number(row.m) || -1) + 1;
  await db.run('INSERT INTO product_images (product_id, url, sort_order) VALUES (?, ?, ?)', [productId, url, next]);
  await syncPrimary(productId);
}

async function deleteImage(imageId) {
  const img = await db.get('SELECT * FROM product_images WHERE id = ?', [imageId]);
  if (!img) return null;
  await db.run('DELETE FROM product_images WHERE id = ?', [imageId]);
  await syncPrimary(img.product_id);
  return img; // caller removes the file
}

module.exports = {
  all, bestsellers, bySlug, byId, related, decorate,
  images, addImage, deleteImage, syncPrimary,
};
