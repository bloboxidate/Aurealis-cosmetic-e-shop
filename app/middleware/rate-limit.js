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

module.exports = { authLimiter, checkoutLimiter };
