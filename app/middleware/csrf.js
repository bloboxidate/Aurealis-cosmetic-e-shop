// Synchronizer-token CSRF protection. Scoped to auth, checkout, and the
// admin panel (the forms with real consequences) rather than every POST in
// the app — sameSite=lax already covers classic cross-site POST CSRF for
// the rest; this adds defense-in-depth where it matters most.
const crypto = require('crypto');

function ensureToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return req.session.csrfToken;
}

// Expose res.locals.csrfToken so any view can embed it in a form.
// Public, form-less pages that an anonymous visitor can browse without a session. Creating a token modifies the
// session, which makes express-session INSERT a row into the (remote) database and hold the response open until it is
// saved: for every first-time visitor and every crawler. None of these pages embeds a token for a signed-out visitor
// (the only token on them is the logout form, shown to signed-in users), so they get an empty one and no session.
// Anything else - login, signup, checkout, account, admin, every POST - still gets a real token as before.
const PUBLIC_PAGES = /^\/(?:$|shop\/?$|product\/|about\/?$|contact\/?$|shipping-policy\/?$|refund-policy\/?$)/;

function csrfLocals(req, res, next) {
  if ((req.method === 'GET' || req.method === 'HEAD') && !req.session.userId && !req.session.csrfToken && PUBLIC_PAGES.test(req.path)) {
    res.locals.csrfToken = '';
    return next();
  }
  res.locals.csrfToken = ensureToken(req);
  next();
}

// Reject POSTs whose token doesn't match the session's — checked in the form
// body (_csrf) or, for the one AJAX call in the admin panel, the
// X-CSRF-Token header. GET/HEAD requests pass through untouched.
function verifyCsrf(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const expected = req.session.csrfToken;
  const provided = (req.body && req.body._csrf) || req.get('X-CSRF-Token');
  if (!expected || provided !== expected) {
    return res.status(403).render('error', {
      title: 'Request blocked — Auréalis',
      heading: 'This request could not be verified',
      message: 'Your session may have expired. Please refresh the page and try again.',
    });
  }
  next();
}

module.exports = { csrfLocals, verifyCsrf };
