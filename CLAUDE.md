# CLAUDE.md

Guidance for working in this repo. Architecture and setup live in
[`README.md`](README.md), [`app/README.md`](app/README.md) and
[`app/DEPLOY.md`](app/DEPLOY.md); Sariee API specifics in
[`sariee/sariee-integration-guide.md`](sariee/sariee-integration-guide.md). This file
is only the traps.

## Where things are
- The store is in `app/` (run commands from there). Root `*.dc.html` files are design
  mockups — reference only, don't "fix" them. `support.js` is generated; never edit it.
- Sariee owns products, carts, promo codes and orders. The local DB holds accounts,
  the category/overlay presentation layer, page content, wishlist, reviews.

## Do not do without the user's explicit go-ahead
- **Submit checkout** (`POST /checkout`, or Sariee `checkout-action`) — it creates a
  real order with fulfilment consequences, even from localhost. Sariee has no cancel/delete.
- Commit, push, or deploy.
- Read, print or commit `app/.env`.

## Traps (each one has bitten this project)
- **CSRF is applied per route** (`verifyCsrf` on the route), never `router.use(verifyCsrf)`
  in a router mounted at `/`: all routers share that mount, so it 403s every router
  registered after it (this broke the wishlist). `admin.js` is safe — it's mounted at `/admin`.
- **Route order in `routes/admin.js`:** `POST /products/order` must stay *before*
  `POST /products/:id`, or "order" is captured as an id and drag-reorder silently breaks.
- **Load `lib/sariee/endpoints.json` with `require()`**, not `fs.readFileSync` — Vercel's
  bundler doesn't trace dynamic reads and the function crashes on load.
- **Keep `"includeFiles": "views/**"` in `app/vercel.json`** — EJS views aren't traced
  and will 404/500 in production only.
- **`/api/company/*` calls must omit the `x-domain` header** (403 otherwise). `client.js`
  handles it; don't add `x-domain` globally.
- **Sariee `cart/add-update` sets quantity, it doesn't add.** Use `scart.addItem`.
  Don't re-read a non-empty cart with `cart/init` (it has failed server-side); trust the
  session snapshot (`lib/scart.js`).
- **Schema changes go in both** `db/schema.sql` (SQLite) **and** `db/schema.postgres.sql`.
  Production won't pick up new tables on cold start if the schema file isn't bundled —
  re-run `npm run seed` against prod (see `DEPLOY.md` §6).
- **`DATABASE_URL` on Vercel must be the pooled string (port 6543)**; the pg pool is
  `max: 1` on purpose.
- Categories/products are keyed by **slug** and Sariee **product id**; renaming or
  deleting a category must go through the `overlay.*` helpers to keep `product_categories`
  consistent (the admin routes already do).
- Never show Sariee's raw error text to customers (PHP-style messages); log it, show a
  generic message.
- Admin image uploads need Supabase Storage (`lib/storage.js`); the Vercel filesystem is
  not persistent — don't write uploads to disk.

## Known open issue
`app/routes/sariee.js` (`/api/sariee/*`) exposes catalog, cart, register/login and
`checkout` publicly with no CSRF, rate limit or auth, and nothing in the app uses it.
Don't build on it; prefer removing it or gating it behind `requireAdmin`.
