// Site-admin — manages how the storefront PRESENTS Sariee's catalog, plus
// editable page content. It does NOT manage commerce data (products, orders,
// customers live in Sariee). Specifically:
//   • Taxonomy      — local categories & subcategories (lib/categories.js)
//   • Curation      — per Sariee product: local category/subcategory, display
//                     order, featured / bestseller flags, show/hide (lib/overlay.js)
//   • Content       — editable copy for Home, About, Shop, Footer (lib/content.js)
const express = require('express');
const router = express.Router();
const catalog = require('../lib/catalog');
const Cats = require('../lib/categories');
const overlay = require('../lib/overlay');
const content = require('../lib/content');
const reviews = require('../lib/reviews');
const storage = require('../lib/storage');
const upload = require('../middleware/upload');
const ah = require('../lib/ah');
const { requireAuth, requireAdmin, flash } = require('../middleware/auth');
const { verifyCsrf } = require('../middleware/csrf');

router.use(requireAuth, requireAdmin, verifyCsrf);
// Admin shares partials/head.ejs with the storefront; keep the storefront
// motion system (GSAP/Lenis, page transitions) out of it.
router.use((req, res, next) => { res.locals.noMotion = true; next(); });

// Products come live from Sariee — never let a Sariee hiccup 500 the whole
// admin panel. Log the real error (visible in Vercel's Runtime Logs) and
// degrade to an empty list with a banner instead.
async function safeAdminProducts(req) {
  try {
    return { products: await catalog.allForAdmin(), sarieeError: null };
  } catch (err) {
    console.error('[admin] catalog.allForAdmin() failed:', err);
    return { products: [], sarieeError: err.message || 'Could not reach Sariee.' };
  }
}

// ---- Dashboard ----------------------------------------------------------
router.get('/', ah(async (req, res) => {
  const { products, sarieeError } = await safeAdminProducts(req);
  const categories = await Cats.listCategories();
  const stats = {
    products: products.length,
    hidden: products.filter((p) => p.is_hidden).length,
    bestsellers: products.filter((p) => p.is_bestseller).length,
    categories: categories.length,
  };
  res.render('admin/dashboard', { title: 'Site Admin — Auréalis', stats, sarieeError, adminActive: 'dashboard' });
}));

// ---- Product curation ---------------------------------------------------
router.get('/products', ah(async (req, res) => {
  const { products, sarieeError } = await safeAdminProducts(req);
  res.render('admin/products', {
    title: 'Products — Admin',
    products,
    sarieeError,
    categories: await Cats.listCategories(),
    subcategories: await Cats.listSubcategories(),
    adminActive: 'products',
  });
}));

// Persist a drag-reordered list of Sariee ids (AJAX). Must be registered
// before /products/:id below — otherwise Express matches "order" as an :id
// and this route is never reached (that was a pre-existing bug: the
// drag-to-reorder feature silently fell through to the overlay-save route).
router.post('/products/order', ah(async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  await overlay.setOrder(ids);
  res.json({ ok: true });
}));

// Save one product's overlay (flags) and category assignments (a product can
// belong to more than one category — checkboxes named cat_<slug>, each with
// an optional subcat_<slug> select).
router.post('/products/:id', ah(async (req, res) => {
  await overlay.set(req.params.id, {
    is_featured: !!req.body.is_featured,
    is_bestseller: !!req.body.is_bestseller,
    is_hidden: !!req.body.is_hidden,
  });

  const categories = await Cats.listCategories();
  const assignments = categories
    .filter((c) => req.body['cat_' + c.slug])
    .map((c) => ({ category_slug: c.slug, subcategory_slug: (req.body['subcat_' + c.slug] || '').trim() }));
  await overlay.setCategories(req.params.id, assignments);

  flash(req, 'success', 'Product updated.');
  res.redirect('/admin/products');
}));

// ---- Taxonomy (categories / subcategories) ------------------------------
router.get('/categories', ah(async (req, res) => {
  const categories = await Cats.listCategories();
  const subcategories = await Cats.listSubcategories();
  res.render('admin/categories', { title: 'Categories — Admin', categories, subcategories, adminActive: 'categories' });
}));

router.post('/categories', ah(async (req, res) => {
  if (!(req.body.name || '').trim()) { flash(req, 'error', 'Category name is required.'); return res.redirect('/admin/categories'); }
  try { await Cats.createCategory(req.body); flash(req, 'success', 'Category added.'); }
  catch (e) { flash(req, 'error', 'Could not add (name/slug may already exist).'); }
  res.redirect('/admin/categories');
}));

router.post('/categories/:id/edit', ah(async (req, res) => {
  const before = await Cats.getCategory(req.params.id);
  try {
    await Cats.updateCategory(req.params.id, req.body);
    if (before) {
      const after = await Cats.getCategory(req.params.id);
      if (after && after.slug !== before.slug) await overlay.renameCategory(before.slug, after.slug);
    }
    flash(req, 'success', 'Category updated.');
  } catch (e) { flash(req, 'error', 'Could not update (slug may already exist).'); }
  res.redirect('/admin/categories');
}));

// AJAX (fetch + FormData), so the response is JSON, not a redirect.
router.post('/categories/:id/image', upload.single('image'), ah(async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, message: 'No file uploaded.' });
  try {
    const url = await storage.uploadImage(req.file.buffer, req.file.mimetype, 'categories');
    await Cats.updateCategoryImage(req.params.id, url);
    res.json({ ok: true, url });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
}));

router.post('/categories/:id/delete', ah(async (req, res) => {
  const before = await Cats.getCategory(req.params.id);
  const r = await Cats.deleteCategory(req.params.id);
  if (r.ok && before) await overlay.clearCategory(before.slug);
  flash(req, r.ok ? 'success' : 'error', r.ok ? 'Category deleted.' : 'Cannot delete: ' + r.reason + '.');
  res.redirect('/admin/categories');
}));

router.post('/subcategories', ah(async (req, res) => {
  if (!(req.body.name || '').trim() || !req.body.category_id) { flash(req, 'error', 'Subcategory needs a name and category.'); return res.redirect('/admin/categories'); }
  try { await Cats.createSubcategory(req.body); flash(req, 'success', 'Subcategory added.'); }
  catch (e) { flash(req, 'error', 'Could not add (slug may already exist in this category).'); }
  res.redirect('/admin/categories');
}));

router.post('/subcategories/:id/edit', ah(async (req, res) => {
  const before = await Cats.getSubcategory(req.params.id);
  try {
    await Cats.updateSubcategory(req.params.id, req.body);
    if (before) {
      const after = await Cats.getSubcategory(req.params.id);
      if (after && after.slug !== before.slug) await overlay.renameSubcategory(before.slug, after.slug);
    }
    flash(req, 'success', 'Subcategory updated.');
  } catch (e) { flash(req, 'error', 'Could not update.'); }
  res.redirect('/admin/categories');
}));

router.post('/subcategories/:id/delete', ah(async (req, res) => {
  const before = await Cats.getSubcategory(req.params.id);
  await Cats.deleteSubcategory(req.params.id);
  if (before) await overlay.clearSubcategory(before.slug);
  flash(req, 'success', 'Subcategory deleted.');
  res.redirect('/admin/categories');
}));

// ---- Editable content ---------------------------------------------------
const CONTENT_PAGES = ['home', 'about', 'shop', 'shipping', 'refund', 'contact', 'footer'];

router.get('/content', ah(async (req, res) => {
  res.render('admin/content', {
    title: 'Page Content — Admin',
    content: await content.getMany(CONTENT_PAGES),
    adminActive: 'content',
  });
}));

router.post('/content/:key', ah(async (req, res) => {
  if (!CONTENT_PAGES.includes(req.params.key)) return res.redirect('/admin/content');
  const { _page, _csrf, ...fields } = req.body; // strip control fields
  await content.set(req.params.key, fields);
  flash(req, 'success', `${req.params.key[0].toUpperCase() + req.params.key.slice(1)} content saved.`);
  res.redirect('/admin/content');
}));

// Which content field an uploaded image saves to, per page.
const CONTENT_IMAGE_FIELD = { home: 'hero_image', about: 'image' };

// AJAX (fetch + FormData), so the response is JSON, not a redirect.
router.post('/content/:key/image', upload.single('image'), ah(async (req, res) => {
  const field = CONTENT_IMAGE_FIELD[req.params.key];
  if (!field) return res.status(400).json({ ok: false, message: 'This page has no editable image.' });
  if (!req.file) return res.status(400).json({ ok: false, message: 'No file uploaded.' });
  try {
    const url = await storage.uploadImage(req.file.buffer, req.file.mimetype, `content/${req.params.key}`);
    await content.set(req.params.key, { [field]: url });
    res.json({ ok: true, url });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
}));

// ---- Review moderation ---------------------------------------------------
// Reviews are user-generated content on a live site, gated behind approval
// before they show publicly (lib/reviews.js).
router.get('/reviews', ah(async (req, res) => {
  res.render('admin/reviews', {
    title: 'Reviews — Admin',
    pending: await reviews.listPending(),
    adminActive: 'reviews',
  });
}));

router.post('/reviews/:id/approve', ah(async (req, res) => {
  await reviews.approve(req.params.id);
  flash(req, 'success', 'Review approved.');
  res.redirect('/admin/reviews');
}));

router.post('/reviews/:id/reject', ah(async (req, res) => {
  await reviews.reject(req.params.id);
  flash(req, 'success', 'Review rejected.');
  res.redirect('/admin/reviews');
}));

module.exports = router;
