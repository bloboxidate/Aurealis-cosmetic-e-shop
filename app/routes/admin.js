// Site-admin — manages how the storefront PRESENTS Sariee's catalog, plus editable page content and site behaviour.
// It does NOT manage commerce data (products, orders and customers live in Sariee). Specifically:
//   • Taxonomy      — local categories & subcategories (lib/categories.js)
//   • Curation      — per Sariee product: categories, display order, featured / bestseller / hidden (lib/overlay.js),
//                     plus extra text and a badge on top of Sariee's (content key "product_extras")
//   • Content       — Homepage, About, Shop, policies, Footer (lib/content.js, cleaned by lib/contentSchema.js)
//   • Site settings — announcement bar, first-visit entrance, ambient sound, hero video
//   • Reviews       — moderation
// Every write answers JSON when asked for it (the admin's own scripts) and redirects with a flash message otherwise,
// so the pages still work with JavaScript off.
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const catalog = require('../lib/catalog');
const Cats = require('../lib/categories');
const overlay = require('../lib/overlay');
const content = require('../lib/content');
const schema = require('../lib/contentSchema');
const activity = require('../lib/activity');
const reviews = require('../lib/reviews');
const storage = require('../lib/storage');
const upload = require('../middleware/upload');
const ah = require('../lib/ah');
const { requireAuth, requireAdmin, flash } = require('../middleware/auth');
const { verifyCsrf } = require('../middleware/csrf');

router.use(requireAuth, requireAdmin, verifyCsrf);
// Admin shares partials/head.ejs with the storefront; keep the storefront
// motion system (GSAP/Lenis, page transitions) out of it.
router.use((req, res, next) => { res.locals.noMotion = true; res.locals.F = require('../lib/adminForm'); next(); });
// The sidebar shows how many reviews are waiting.
router.use(ah(async (req, res, next) => {
  res.locals.adminBadges = { reviews: await reviews.pendingCount().catch(() => 0) };
  next();
}));

const wantsJson = (req) => /application\/json/.test(req.get('accept') || '') || req.xhr;

// One way to answer every write: JSON for the admin's scripts, flash + redirect for plain form posts.
function done(req, res, { ok = true, message = '', redirect = '/admin', data = {}, status } = {}) {
  if (wantsJson(req)) return res.status(status || (ok ? 200 : 400)).json({ ok, message, ...data });
  flash(req, ok ? 'success' : 'error', message);
  return res.redirect(redirect);
}

const note = (res, text) => activity.log(res.locals.user, text);
const asArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

// Products come live from Sariee — never let a Sariee hiccup 500 the whole
// admin panel. Log the real error (visible in Vercel's Runtime Logs) and
// degrade to an empty list with a banner instead.
async function safeAdminProducts() {
  try {
    return { products: await catalog.allForAdmin(), sarieeError: null };
  } catch (err) {
    console.error('[admin] catalog.allForAdmin() failed:', err);
    return { products: [], sarieeError: err.message || 'Could not reach Sariee.' };
  }
}

// The hero loop video (public/media/hero-loop.json) only plays while it was rendered from the current hero image.
function heroVideoStatus(home) {
  let m = null;
  try { m = require('../public/media/hero-loop.json'); } catch (_) { /* none rendered */ }
  if (!m || !m.file) return 'none';
  if (!home.hero_image) return 'none';
  return m.source === home.hero_image ? 'current' : 'stale';
}

// ---- Dashboard ----------------------------------------------------------
router.get('/', ah(async (req, res) => {
  const [{ products, sarieeError }, categories, pending, published, home, site, announcement, recent] = await Promise.all([
    safeAdminProducts(),
    Cats.listCategories(),
    reviews.pendingCount().catch(() => 0),
    reviews.listPublished(500).then((r) => r.length).catch(() => 0),
    content.get('home'), content.get('site'), content.get('announcement'),
    activity.recent(8),
  ]);
  const visible = products.filter((p) => !p.is_hidden);
  const stats = {
    products: products.length, visible: visible.length, hidden: products.length - visible.length,
    bestsellers: products.filter((p) => p.is_bestseller).length, categories: categories.length, pending, published,
  };
  const noCategory = visible.filter((p) => !p.categories.length);
  const noImage = visible.filter((p) => !p.image_url);
  const outOfStock = visible.filter((p) => p.stock <= 0);
  const video = heroVideoStatus(home);
  const todos = [];
  if (pending) todos.push({ icon: 'star', title: `${pending} review${pending === 1 ? '' : 's'} waiting for approval`, detail: 'Approve the good ones so they appear on the product page and the homepage.', href: '/admin/reviews', cta: 'Review them' });
  if (noCategory.length) todos.push({ icon: 'tag', title: `${noCategory.length} visible product${noCategory.length === 1 ? ' has' : 's have'} no category`, detail: noCategory.slice(0, 3).map((p) => p.name).join(', ') + (noCategory.length > 3 ? '…' : ''), href: '/admin/products?filter=nocat', cta: 'Assign' });
  if (noImage.length) todos.push({ icon: 'bag', title: `${noImage.length} visible product${noImage.length === 1 ? ' has' : 's have'} no image`, detail: 'Images are added in Sariee.', href: '/admin/products', cta: 'See products' });
  if (outOfStock.length) todos.push({ icon: 'bag', title: `${outOfStock.length} visible product${outOfStock.length === 1 ? ' shows' : 's show'} 0 in stock in Sariee`, detail: outOfStock.slice(0, 3).map((p) => p.name).join(', ') + (outOfStock.length > 3 ? '… ' : ' ') + '(Bundles can show 0 even when their contents are in stock.)', href: '/admin/products', cta: 'See products' });
  if (!home.hero_image) todos.push({ icon: 'layout', title: 'No hero image yet', detail: 'The homepage opens with a gradient until you upload a hero image.', href: '/admin/homepage#hero', cta: 'Add one' });
  if (video === 'stale' && site.hero_video_enabled) todos.push({ icon: 'layout', title: 'The hero loop video is out of date', detail: 'You changed the hero image, so visitors see the still photo until the loop is rendered again (tools/hero-loop).', href: '/admin/homepage#hero', cta: 'Details' });
  if (sarieeError) todos.unshift({ icon: 'bag', title: 'Sariee is not responding', detail: sarieeError, href: '/admin', cta: 'Retry' });
  res.render('admin/dashboard', {
    title: 'Dashboard — Admin', adminActive: 'dashboard', stats, todos, recent, sarieeError,
    announcement, site, video,
  });
}));

// ---- Product curation ---------------------------------------------------
router.get('/products', ah(async (req, res) => {
  const { products, sarieeError } = await safeAdminProducts();
  const [categories, subcategories] = await Promise.all([Cats.listCategories(), Cats.listSubcategories()]);
  const items = products.map((p) => ({
    id: String(p.id), name: p.name, slug: p.slug, subtitle: p.subtitle, price: p.price_cents, image: p.image_url, stock: p.stock,
    hidden: !!p.is_hidden, featured: !!p.is_featured, bestseller: !!p.is_bestseller,
    cats: p.categories.map((c) => ({ c: c.category_slug, s: c.subcategory_slug || '' })),
    extras: { details: (p.extras && p.extras.details) || '', how_to_use: (p.extras && p.extras.how_to_use) || '', ingredients: (p.extras && p.extras.ingredients) || '', badge: (p.extras && p.extras.badge) || '' },
    sariee: p.sariee_text || {},
  }));
  res.render('admin/products', {
    title: 'Products — Admin', adminActive: 'products', items, sarieeError, categories, subcategories,
    paletteItems: items.map((i) => ({ t: i.name, u: '/admin/products?open=' + encodeURIComponent(i.id), k: 'Product' })),
    pageScript: 'admin-products.js',
  });
}));

// Persist a drag-reordered list of Sariee ids (AJAX). Must be registered
// before /products/:id below — otherwise Express matches "order" as an :id
// and this route is never reached (that was a pre-existing bug: the
// drag-to-reorder feature silently fell through to the overlay-save route).
router.post('/products/order', ah(async (req, res) => {
  const ids = asArray(req.body.ids).map(String);
  await overlay.setOrder(ids);
  await note(res, 'Reordered the products');
  res.json({ ok: true, message: 'Order saved.' });
}));

// Apply one change to several products at once. Also a literal path, so it stays above /products/:id.
const BULK_FLAGS = { show: ['is_hidden', 0], hide: ['is_hidden', 1], feature: ['is_featured', 1], unfeature: ['is_featured', 0], bestseller: ['is_bestseller', 1], unbestseller: ['is_bestseller', 0] };
router.post('/products/bulk', ah(async (req, res) => {
  const { action, value } = req.body || {};
  const { products } = await safeAdminProducts();
  const known = new Set(products.map((p) => String(p.id)));
  const ids = asArray(req.body.ids).map(String).filter((id) => known.has(id));
  if (!ids.length) return done(req, res, { ok: false, message: 'Pick at least one product first.' });
  if (BULK_FLAGS[action]) {
    const [field, v] = BULK_FLAGS[action];
    for (const id of ids) await overlay.set(id, { [field]: v });
  } else if (action === 'add_category' || action === 'remove_category') {
    const cats = await Cats.listCategories();
    if (!cats.some((c) => c.slug === value)) return done(req, res, { ok: false, message: 'That category does not exist.' });
    for (const id of ids) {
      const cur = (await overlay.getCategories(id)).map((c) => ({ category_slug: c.category_slug, subcategory_slug: c.subcategory_slug }));
      const has = cur.some((c) => c.category_slug === value);
      if (action === 'add_category' && !has) cur.push({ category_slug: value, subcategory_slug: '' });
      if (action === 'remove_category' && has) await overlay.setCategories(id, cur.filter((c) => c.category_slug !== value));
      else if (action === 'add_category' && !has) await overlay.setCategories(id, cur);
    }
  } else {
    return done(req, res, { ok: false, message: 'Unknown action.' });
  }
  await note(res, `Bulk update (${action.replace('_', ' ')}) on ${ids.length} product${ids.length === 1 ? '' : 's'}`);
  done(req, res, { message: `Updated ${ids.length} product${ids.length === 1 ? '' : 's'}.`, redirect: '/admin/products' });
}));

// One switch (featured / bestseller / hidden) — saves the moment it is clicked.
router.post('/products/:id/toggle', ah(async (req, res) => {
  const field = req.body.field;
  if (!['is_featured', 'is_bestseller', 'is_hidden'].includes(field)) return done(req, res, { ok: false, message: 'Unknown switch.' });
  const on = req.body.value === 1 || req.body.value === '1' || req.body.value === true;
  await overlay.set(req.params.id, { [field]: on ? 1 : 0 });
  const label = { is_featured: 'featured', is_bestseller: 'a bestseller', is_hidden: 'hidden' }[field];
  const p = await catalog.byId(req.params.id).catch(() => null);
  await note(res, `${(p && p.name) || 'Product ' + req.params.id}: ${on ? 'marked ' + label : 'no longer ' + label}`);
  done(req, res, { message: field === 'is_hidden' ? (on ? 'Hidden from the store.' : 'Visible in the store.') : (on ? 'Marked as ' + label + '.' : 'Removed.'), redirect: '/admin/products' });
}));

// Text added on top of Sariee's (shown on the product page) and a small badge on the product's card.
router.post('/products/:id/extras', ah(async (req, res) => {
  const spec = { details: { type: 'rich', max: 3000 }, how_to_use: { type: 'rich', max: 3000 }, ingredients: { type: 'rich', max: 3000 }, badge: { type: 'text', max: 24 } };
  const out = {};
  for (const [k, sp] of Object.entries(spec)) {
    let s = String(Array.isArray(req.body[k]) ? req.body[k][0] : (req.body[k] == null ? '' : req.body[k])).replace(/\r\n?/g, '\n');
    s = sp.type === 'text' ? s.replace(/\s*\n\s*/g, ' ').trim() : s.trim();
    if (s.length > sp.max) s = s.slice(0, sp.max);
    out[k] = s;
  }
  await content.set('product_extras', { [req.params.id]: out });
  const p = await catalog.byId(req.params.id).catch(() => null);
  await note(res, `Edited the extra text on ${(p && p.name) || 'product ' + req.params.id}`);
  done(req, res, { message: 'Product text saved.', redirect: '/admin/products' });
}));

// Save one product's flags and category assignments (a product can belong to more than one category — checkboxes
// named cat_<slug>, each with an optional subcat_<slug> select).
router.post('/products/:id', ah(async (req, res) => {
  await overlay.set(req.params.id, {
    is_featured: !!req.body.is_featured,
    is_bestseller: !!req.body.is_bestseller,
    is_hidden: !!req.body.is_hidden,
  });

  const categories = await Cats.listCategories();
  const assignments = categories
    .filter((c) => req.body['cat_' + c.slug])
    .map((c) => ({ category_slug: c.slug, subcategory_slug: String(req.body['subcat_' + c.slug] || '').trim() }));
  await overlay.setCategories(req.params.id, assignments);

  const p = await catalog.byId(req.params.id).catch(() => null);
  await note(res, `Updated ${(p && p.name) || 'product ' + req.params.id}`);
  done(req, res, { message: 'Product updated.', redirect: '/admin/products' });
}));

// ---- Taxonomy (categories / subcategories) ------------------------------
router.get('/categories', ah(async (req, res) => {
  const categories = await Cats.listCategories();
  const subcategories = await Cats.listSubcategories();
  res.render('admin/categories', { title: 'Categories — Admin', categories, subcategories, adminActive: 'categories' });
}));

router.post('/categories', ah(async (req, res) => {
  if (!(req.body.name || '').trim()) { flash(req, 'error', 'Category name is required.'); return res.redirect('/admin/categories'); }
  try { await Cats.createCategory(req.body); await note(res, `Added the category “${req.body.name.trim()}”`); flash(req, 'success', 'Category added.'); }
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
    await note(res, `Updated the category “${(before && before.name) || req.params.id}”`);
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
    await note(res, 'Changed a category image');
    res.json({ ok: true, url });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
}));

router.post('/categories/:id/delete', ah(async (req, res) => {
  const before = await Cats.getCategory(req.params.id);
  const r = await Cats.deleteCategory(req.params.id);
  if (r.ok && before) { await overlay.clearCategory(before.slug); await note(res, `Deleted the category “${before.name}”`); }
  flash(req, r.ok ? 'success' : 'error', r.ok ? 'Category deleted.' : 'Cannot delete: ' + r.reason + '.');
  res.redirect('/admin/categories');
}));

router.post('/subcategories', ah(async (req, res) => {
  if (!(req.body.name || '').trim() || !req.body.category_id) { flash(req, 'error', 'Subcategory needs a name and category.'); return res.redirect('/admin/categories'); }
  try { await Cats.createSubcategory(req.body); await note(res, `Added the subcategory “${req.body.name.trim()}”`); flash(req, 'success', 'Subcategory added.'); }
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

// ---- Homepage, pages and site settings (all editable content) ------------
const PAGE_KEYS = ['about', 'shop', 'shipping', 'refund', 'contact', 'footer'];
const CONTENT_KEYS = ['home', 'site', 'announcement', ...PAGE_KEYS];
const PAGE_LABEL = { home: 'Homepage', site: 'Site settings', announcement: 'Announcement bar', about: 'About page', shop: 'Shop page', shipping: 'Shipping policy', refund: 'Refund policy', contact: 'Contact page', footer: 'Footer' };
const SETTINGS_BACK = { home: '/admin/homepage', site: '/admin/settings', announcement: '/admin/settings' };

router.get('/homepage', ah(async (req, res) => {
  const home = await content.get('home');
  res.render('admin/homepage', { title: 'Homepage — Admin', adminActive: 'homepage', home, video: heroVideoStatus(home), site: await content.get('site') });
}));

router.get('/settings', ah(async (req, res) => {
  const [site, announcement] = await Promise.all([content.get('site'), content.get('announcement')]);
  res.render('admin/settings', { title: 'Site settings — Admin', adminActive: 'settings', site, announcement });
}));

router.get('/pages', ah(async (req, res) => {
  res.render('admin/pages', {
    title: 'Pages — Admin', adminActive: 'pages', content: await content.getMany(PAGE_KEYS),
    tab: PAGE_KEYS.includes(req.query.tab) ? req.query.tab : 'about',
  });
}));
router.get('/content', (req, res) => res.redirect('/admin/pages')); // the old address

router.post('/content/:key', ah(async (req, res) => {
  const key = req.params.key;
  if (!CONTENT_KEYS.includes(key)) return done(req, res, { ok: false, message: 'Unknown page.', redirect: '/admin' });
  const { patch } = schema.clean(key, req.body);
  await content.set(key, patch);
  await note(res, `Saved ${PAGE_LABEL[key].toLowerCase()}`);
  done(req, res, { message: `${PAGE_LABEL[key]} saved.`, redirect: SETTINGS_BACK[key] || '/admin/pages?tab=' + key });
}));

// Back to the original wording. Image fields are kept: resetting must never blank the hero or story picture.
router.post('/content/:key/reset', ah(async (req, res) => {
  const key = req.params.key;
  if (!CONTENT_KEYS.includes(key)) return done(req, res, { ok: false, message: 'Unknown page.', redirect: '/admin' });
  await content.set(key, schema.resetPatch(key));
  await note(res, `Restored the original wording of ${PAGE_LABEL[key].toLowerCase()}`);
  done(req, res, { message: `${PAGE_LABEL[key]} restored to the original wording.`, redirect: SETTINGS_BACK[key] || '/admin/pages?tab=' + key });
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
    await note(res, req.params.key === 'home' ? 'Changed the hero image' : 'Changed the story image');
    res.json({ ok: true, url });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
}));

// ---- Review moderation ---------------------------------------------------
// Reviews are user-generated content on a live site, gated behind approval
// before they show publicly (lib/reviews.js).
router.get('/reviews', ah(async (req, res) => {
  const tab = req.query.tab === 'published' ? 'published' : 'pending';
  const [pending, published] = await Promise.all([reviews.listPending(), reviews.listPublished(200)]);
  let names = {};
  try { (await catalog.allForAdmin()).forEach((p) => { names[String(p.id)] = { name: p.name, slug: p.slug }; }); } catch (_) { /* names are a nicety */ }
  res.render('admin/reviews', { title: 'Reviews — Admin', adminActive: 'reviews', tab, pending, published, names });
}));

router.post('/reviews/:id/approve', ah(async (req, res) => {
  await reviews.approve(req.params.id);
  await note(res, 'Approved a review');
  done(req, res, { message: 'Review approved.', redirect: '/admin/reviews' });
}));

router.post('/reviews/:id/unpublish', ah(async (req, res) => {
  await reviews.unpublish(req.params.id);
  await note(res, 'Unpublished a review');
  done(req, res, { message: 'Review moved back to pending.', redirect: '/admin/reviews?tab=published' });
}));

router.post('/reviews/:id/reject', ah(async (req, res) => {
  await reviews.reject(req.params.id);
  await note(res, 'Deleted a review');
  done(req, res, { message: 'Review deleted.', redirect: '/admin/reviews' });
}));

// ---- Backup (presentation data only: no customers, no review emails) -----
router.get('/backup.json', ah(async (req, res) => {
  const out = { exported_at: new Date().toISOString(), content: {}, categories: await Cats.listCategories(), subcategories: await Cats.listSubcategories() };
  for (const k of [...CONTENT_KEYS, 'product_extras']) out.content[k] = await content.get(k);
  out.product_overlay = await db.all('SELECT * FROM product_overlay');
  out.product_categories = await db.all('SELECT * FROM product_categories');
  res.setHeader('Content-Disposition', `attachment; filename="aurealis-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.type('application/json').send(JSON.stringify(out, null, 2));
}));

module.exports = router;
