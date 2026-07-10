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
  // rather than a 500, but log so the failure is diagnosable. Independent of
  // the content lookup, so both run in parallel.
  const [bestsellers, home] = await Promise.all([
    Products.bestsellers(4).catch((err) => {
      console.error('[shop] home bestsellers failed:', err.message); return [];
    }),
    content.get('home'),
  ]);
  res.render('home', { title: 'Auréalis — Born of the aurora', bestsellers, home });
}));

// Shop / catalog, filtered by ?category=<slug> and ?sub=<slug>
router.get('/shop', ah(async (req, res) => {
  const categories = await Cats.listCategories();
  const catSlugs = categories.map((c) => c.slug);
  const category = catSlugs.includes(req.query.category) ? req.query.category : null;

  // Sariee-backed; degrade to an empty catalog on error instead of a 500, but
  // remember it happened so the page says so rather than looking like an
  // empty store. These four lookups are independent of each other, so they
  // run in parallel rather than one after another.
  const sub = req.query.sub || 'all';
  let catalogError = false;
  const [products, base, subcats, shopContent] = await Promise.all([
    Products.all({ category, subcategory: sub }).catch((err) => {
      console.error('[shop] shop listing failed:', err.message); catalogError = true; return [];
    }),
    sub !== 'all'
      ? Products.all({ category }).catch(() => [])
      : Promise.resolve(null), // filled in below once we know `products`
    category ? Cats.subcategoriesForSlug(category) : Cats.listSubcategories(),
    content.get('shop'),
  ]);
  const baseList = base !== null ? base : products;

  // No Sariee product-search endpoint works server-side (products/list-all
  // ignores name/search query params — confirmed by testing against the live
  // API), so search is a local substring match over the cached catalog.
  const q = (req.query.q || '').trim();
  let filtered = products;
  if (q) {
    const needle = q.toLowerCase();
    filtered = filtered.filter((p) =>
      (p.name || '').toLowerCase().includes(needle) || (p.subtitle || '').toLowerCase().includes(needle)
    );
  }

  const sort = req.query.sort || 'featured';
  if (sort === 'price-asc') filtered.sort((a, b) => a.price_cents - b.price_cents);
  else if (sort === 'price-desc') filtered.sort((a, b) => b.price_cents - a.price_cents);
  else if (sort === 'newest') filtered.sort((a, b) => b.id - a.id);

  const catObj = categories.find((c) => c.slug === category);

  const PAGE_SIZE = 24;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(totalPages, Math.max(1, parseInt(req.query.page, 10) || 1));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  res.render('shop', {
    title: (catObj ? catObj.name : 'Shop') + ' — Auréalis',
    products: paged,
    category,
    heading: catObj ? catObj.name : (shopContent.title || 'All Products'),
    intro: category ? '' : (shopContent.intro || ''),
    subcats,
    activeSub: sub,
    sort,
    count: baseList.length,
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

  // product.images is already on the decorated product (from bySlug above) —
  // no need to refetch it via a second byId() lookup.
  const images = product.images || [];
  let related = [];
  try {
    related = await Products.related(product, 4);
  } catch (err) {
    console.error('[shop] related products failed:', req.params.slug, err.message);
  }

  const [productReviews, wishlisted, alreadyReviewed] = await Promise.all([
    reviews.forProduct(product.id).catch(() => []),
    req.session.userId ? wishlist.has(req.session.userId, product.id).catch(() => false) : Promise.resolve(false),
    req.session.userId ? reviews.hasReviewed(product.id, req.session.userId).catch(() => false) : Promise.resolve(false),
  ]);
  const canReview = req.session.userId ? !alreadyReviewed : false;
  const reviewSummary = reviews.summarize(productReviews);

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
