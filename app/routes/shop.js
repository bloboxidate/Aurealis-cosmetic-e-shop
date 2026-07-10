const express = require('express');
const router = express.Router();
// Storefront now reads its catalog live from Sariee via the adapter, which
// exposes both the product and category helpers the routes use.
const Products = require('../lib/catalog');
const Cats = Products;
const content = require('../lib/content');
const ah = require('../lib/ah');

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
  let products = [];
  let catalogError = false;
  try { products = await Products.all({ category }); }
  catch (err) { console.error('[shop] shop listing failed:', err.message); products = []; catalogError = true; }
  const base = products.slice();
  const sub = req.query.sub || 'all';
  if (sub && sub !== 'all') products = products.filter((p) => p.subcategory === sub);

  const sort = req.query.sort || 'featured';
  if (sort === 'price-asc') products.sort((a, b) => a.price_cents - b.price_cents);
  else if (sort === 'price-desc') products.sort((a, b) => b.price_cents - a.price_cents);
  else if (sort === 'newest') products.sort((a, b) => b.id - a.id);

  const subcats = category ? await Cats.subcategoriesForSlug(category) : await Cats.listSubcategories();
  const catObj = categories.find((c) => c.slug === category);

  const shopContent = await content.get('shop');
  res.render('shop', {
    title: (catObj ? catObj.name : 'Shop') + ' — Auréalis',
    products,
    category,
    heading: catObj ? catObj.name : (shopContent.title || 'All Products'),
    intro: category ? '' : (shopContent.intro || ''),
    subcats,
    activeSub: sub,
    sort,
    count: base.length,
    catalogError,
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

  res.render('product', {
    title: product.name + ' — Auréalis',
    product,
    images,
    related,
  });
}));

router.get('/about', ah(async (req, res) => {
  res.render('about', { title: 'About — Auréalis', about: await content.get('about') });
}));

module.exports = router;
