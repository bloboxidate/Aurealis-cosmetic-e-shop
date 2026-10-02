// CSRF defence for the POST routes that anonymous visitors use (add to bag, promo code, ...).
// Those visitors deliberately have no session and no CSRF token on public pages (see PUBLIC_PAGES in csrf.js), so a token cannot
// protect them. Browsers tell us where a request came from instead, and a forged cross-site request cannot hide it:
//   - Sec-Fetch-Site: "same-origin" (or "none", a typed address) is ours; "cross-site" / "same-site" is not.
//   - Origin (sent on every cross-origin and every POST in modern browsers) must be our own host; "null" is refused.
//   - Referer is the fallback for browsers that send neither.
// A request with none of these headers is not a browser (curl, a server), so it is not a CSRF vector and is allowed through.
function reject(req, res) {
  const message = 'This request could not be verified. Please reload the page and try again.';
  if (req.xhr || /application\/json/.test(req.get('accept') || '')) return res.status(403).json({ ok: false, message });
  return res.status(403).render('error', { title: 'Request blocked — Auréalis', heading: 'This request could not be verified', message });
}

function hostOf(url) {
  try { return new URL(url).host; } catch (_) { return null; }
}

function sameOrigin(req, res, next) {
  const site = req.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin' && site !== 'none') return reject(req, res);

  const host = req.get('host');
  const origin = req.get('Origin');
  if (origin !== undefined) {
    if (origin === 'null' || hostOf(origin) !== host) return reject(req, res);
  } else if (!site) {
    const ref = req.get('Referer');
    if (ref && hostOf(ref) !== host) return reject(req, res);
  }
  next();
}

module.exports = { sameOrigin };
