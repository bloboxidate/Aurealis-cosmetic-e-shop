const rateLimit = require('express-rate-limit');

// Login/signup: brute-force + enumeration throttling, keyed by IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many attempts. Please try again in a few minutes.',
});

// Checkout: real orders shouldn't be placed dozens of times a minute from
// one IP; generous enough not to trip up a genuine customer retrying.
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many checkout attempts. Please try again in a few minutes.',
});

// The limits below answer JSON to the storefront's fetch() calls (so the page can show the message) and plain text otherwise.
function limited(message) {
  return (req, res) => {
    if (req.xhr || /application\/json/.test(req.get('accept') || '')) return res.status(429).json({ ok: false, message });
    return res.status(429).type('text/plain').send(message);
  };
}

// Bag changes and wishlist hearts: every add/update goes to Sariee, so a script hammering them costs real calls.
// Generous for a person (the ritual builder adds several items in a row).
const cartLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limited('You are doing that a little too fast. Please wait a moment and try again.'),
});

// Promo codes: stops code-guessing. A real customer tries one or two codes.
const promoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limited('Too many promo code attempts. Please try again in a few minutes.'),
});

// Reviews: one per product per customer anyway; this stops floods of throwaway accounts or posts.
const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limited('Too many reviews submitted. Please try again later.'),
});

module.exports = { authLimiter, checkoutLimiter, cartLimiter, promoLimiter, reviewLimiter };
