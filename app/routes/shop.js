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
  res.render('home', {
    title: 'Auréalis — Born of the aurora',
    bestsellers: await Products.bestsellers(4),
    home: await content.get('home'),
  });
}));

// Shop / catalog, filtered by ?category=<slug> and ?sub=<slug>
router.get('/shop', ah(async (req, res) => {
  const categories = await Cats.listCategories();
  const catSlugs = categories.map((c) => c.slug);
  const category = catSlugs.includes(req.query.category) ? req.query.category : null;

  let products = await Products.all({ category });
  const sub = req.query.sub || 'all';
  if (sub && sub !== 'all') products = products.filter((p) => p.subcategory === sub);

  const sort = req.query.sort || 'featured';
  if (sort === 'price-asc') products.sort((a, b) => a.price_cents - b.price_cents);
  else if (sort === 'price-desc') products.sort((a, b) => b.price_cents - a.price_cents);
  else if (sort === 'newest') products.sort((a, b) => b.id - a.id);

  const base = await Products.all({ category });
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
  });
}));

// Product detail
router.get('/product/:slug', ah(async (req, res, next) => {
  const product = await Products.bySlug(req.params.slug);
  if (!product || !product.is_active) return next();
  res.render('product', {
    title: product.name + ' — Auréalis',
    product,
    images: await Products.images(product.id),
    related: await Products.related(product, 4),
  });
}));

router.get('/about', ah(async (req, res) => {
  res.render('about', { title: 'About — Auréalis', about: await content.get('about') });
}));

module.exports = router;
