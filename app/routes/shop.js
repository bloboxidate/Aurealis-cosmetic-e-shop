const express = require('express');
const router = express.Router();
// Storefront now reads its catalog live from Sariee via the adapter, which
// exposes both the product and category helpers the routes use.
const Products = require('../lib/catalog');
const Cats = Products;
const content = require('../lib/content');
const wishlist = require('../lib/wishlist');
const reviews = require('../lib/reviews');
const ah = require('../lib/ah');
const { requireAuth, flash } = require('../middleware/auth');

// Home
router.get('/', ah(async (req, res) => {
  // Degrade gracefully if Sariee is unreachable — show the page without cards
  // rather than a 500, but log so the failure is diagnosable.
  let bestsellers = [];
  try { bestsellers = await Products.bestsellers(4); }
  catch (err) { console.error('[shop] home bestsellers failed:', err.message); bestsellers = []; }
  res.render('home', {
    title: 'Auréalis — Born of the aurora',
    bestsellers,
    home: await content.get('home'),
  });
}));

// Shop / catalog, filtered by ?category=<slug> and ?sub=<slug>
router.get('/shop', ah(async (req, res) => {
  const categories = await Cats.listCategories();
  const catSlugs = categories.map((c) => c.slug);
  const category = catSlugs.includes(req.query.category) ? req.query.category : null;

  // Sariee-backed; degrade to an empty catalog on error instead of a 500, but
  // remember it happened so the page says so rather than looking like an
  // empty store.
  const sub = req.query.sub || 'all';
  let products = [];
  let catalogError = false;
  try { products = await Products.all({ category, subcategory: sub }); }
  catch (err) { console.error('[shop] shop listing failed:', err.message); products = []; catalogError = true; }
  // Unfiltered-by-subcategory count, for the "N products" header line.
  let base = products;
  if (sub !== 'all') {
    try { base = await Products.all({ category }); } catch (_) { base = products; }
  }

  // No Sariee product-search endpoint works server-side (products/list-all
  // ignores name/search query params — confirmed by testing against the live
  // API), so search is a local substring match over the cached catalog.
  const q = (req.query.q || '').trim();
  if (q) {
    const needle = q.toLowerCase();
    products = products.filter((p) =>
      (p.name || '').toLowerCase().includes(needle) || (p.subtitle || '').toLowerCase().includes(needle)
    );
  }

  const sort = req.query.sort || 'featured';
  if (sort === 'price-asc') products.sort((a, b) => a.price_cents - b.price_cents);
  else if (sort === 'price-desc') products.sort((a, b) => b.price_cents - a.price_cents);
  else if (sort === 'newest') products.sort((a, b) => b.id - a.id);

  const subcats = category ? await Cats.subcategoriesForSlug(category) : await Cats.listSubcategories();
  const catObj = categories.find((c) => c.slug === category);

  const PAGE_SIZE = 24;
  const totalPages = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  const page = Math.min(totalPages, Math.max(1, parseInt(req.query.page, 10) || 1));
  const paged = products.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const shopContent = await content.get('shop');
  res.render('shop', {
    title: (catObj ? catObj.name : 'Shop') + ' — Auréalis',
    products: paged,
    category,
    heading: catObj ? catObj.name : (shopContent.title || 'All Products'),
    intro: category ? '' : (shopContent.intro || ''),
    subcats,
    activeSub: sub,
    sort,
    count: base.length,
    catalogError,
    page,
    totalPages,
    q,
  });
}));

// Product detail
router.get('/product/:slug', ah(async (req, res, next) => {
  let product;
  try {
    product = await Products.bySlug(req.params.slug);
  } catch (err) {
    console.error('[shop] product lookup failed:', req.params.slug, err.message);
    return res.status(503).render('error', {
      title: 'Temporarily unavailable — Auréalis',
      heading: 'This product is temporarily unavailable',
      message: 'We couldn’t load this product right now. Please try again in a moment.',
    });
  }
  if (!product || !product.is_active) return next();

  let images = [];
  let related = [];
  try {
    [images, related] = await Promise.all([Products.images(product.id), Products.related(product, 4)]);
  } catch (err) {
    console.error('[shop] product images/related failed:', req.params.slug, err.message);
  }

  let wishlisted = false;
  let canReview = false;
  if (req.session.userId) {
    try {
      wishlisted = await wishlist.has(req.session.userId, product.id);
      canReview = !(await reviews.hasReviewed(product.id, req.session.userId));
    } catch (_) { /* leave defaults */ }
  }
  const [productReviews, reviewSummary] = await Promise.all([
    reviews.forProduct(product.id).catch(() => []),
    reviews.summary(product.id).catch(() => ({ count: 0, average: 0 })),
  ]);

  res.render('product', {
    title: product.name + ' — Auréalis',
    product,
    images,
    related,
    wishlisted,
    canReview,
    productReviews,
    reviewSummary,
  });
}));

router.post('/product/:slug/reviews', requireAuth, ah(async (req, res) => {
  const product = await Products.bySlug(req.params.slug);
  if (!product) return res.status(404).render('error', { title: 'Not found', heading: 'Not found', message: 'Product not found.' });

  const rating = parseInt(req.body.rating, 10);
  const body = (req.body.body || '').trim();
  if (!rating || rating < 1 || rating > 5 || !body) {
    flash(req, 'error', 'Please give a rating and a short review.');
    return res.redirect('/product/' + req.params.slug);
  }
  if (await reviews.hasReviewed(product.id, req.session.userId)) {
    flash(req, 'error', 'You’ve already reviewed this product.');
    return res.redirect('/product/' + req.params.slug);
  }

  await reviews.create({ sarieeProductId: product.id, userId: req.session.userId, rating, body });
  flash(req, 'success', 'Thanks! Your review is awaiting approval before it appears publicly.');
  res.redirect('/product/' + req.params.slug);
}));

router.get('/about', ah(async (req, res) => {
  res.render('about', { title: 'About — Auréalis', about: await content.get('about') });
}));

module.exports = router;
