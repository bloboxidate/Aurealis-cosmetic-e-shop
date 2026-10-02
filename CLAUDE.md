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

## Added in the redesign-v2 pass (each of these will bite if forgotten)
- **Bump `ASSET_V` when you deploy** (Vercel env var; default `1`). CSS/JS are cached for a day and requested as `?v=ASSET_V`,
  so without a bump returning visitors keep the old files. Fonts are hashed filenames and need no bump.
- **Read cache (`lib/ttl.js`).** Reads in `content`, `categories`, `overlay` and `reviews` are cached (fresh 15 s, then served
  stale while one background query refreshes). Writes through the same module bust it. A new write function in those
  modules must be added to that module's `ttl.wrap(...)` list or admin edits won't show. Other serverless instances can
  lag by about 15 s. `catalog.js` has the same stale-while-revalidate for the Sariee list (60 s fresh, 5 min stale).
- **No session for anonymous browsing.** `middleware/csrf.js` skips creating a CSRF token (so no session row, no cookie) on the
  public pages in `PUBLIC_PAGES`. If one of those pages ever gets a form that needs `csrfToken`, remove it from the list.
- **JS is split.** `motion.js` is the core; `motion-home/about/product/banner.js`, `aurora.js`, `ritual.js`, `search.js`, `sound.js`
  load only where used and register with `AuCore.queue(priority, fn)`. Keep that order (hero 10, scenes 20, footer 30, product
  40, index 45, pointer 50+, reveals 90): ScrollTriggers must be created in DOM order.
- **Hero loop video** (`public/media/hero-loop.json`) is used only while its `source` equals the admin's current hero image.
  Regenerate with `tools/hero-loop/` after changing the hero (see its README). The page falls back to the still by itself.
- **Wishlist toggle and add-to-bag answer JSON** when called with `Accept: application/json` (storefront hearts / product page
  / ritual builder). The plain form posts still redirect, so the site works without JS.
- Self-hosted fonts live in `public/fonts` (variable files, hashed names); there is no Google Fonts request any more.

## Admin rebuild (each of these will bite if forgotten)
- **Never save in the admin on the local `:3000` server: it writes to the LIVE production DB (and uploads to the live Supabase bucket).**
  Test admin work in a sandbox: `DATABASE_URL= ADMIN_EMAIL=sandbox@aurealis.test ADMIN_PASSWORD=<throwaway> node db/seed.js`
  once (must print `(sqlite)`), then `DATABASE_URL= SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= PORT=3100 node server.js`
  (blank env vars stop dotenv from filling them in). Catalog reads still go to live Sariee; never add to bag or check out there.
- **Starting any server against Postgres runs `db/schema.postgres.sql`** (`init()`), so a new table is created in production the moment a
  local server starts. Prefer storing new settings in the `site_content` JSON store (keys `site`, `announcement`, `product_extras`,
  `activity`) over new tables.
- **Every content write goes through `lib/contentSchema.js`.** A field not listed in `SCHEMA` is dropped on save. A new editable field needs:
  a default in `lib/content.js`, a `SCHEMA` entry, and a form field. `req: true` fields fall back to their default when left blank;
  `bool` fields need `F.toggle()` (hidden `0` + checkbox `1`) or "off" never arrives; `url` fields only allow `http(s)`, `/path`, `mailto:`, `tel:`, `#`.
  "Restore original wording" (`resetPatch`) never touches image fields (`hero_image`, about `image`).
- **Route order in `routes/admin.js`:** literal `POST /products/order` and `/products/bulk` stay above `POST /products/:id`.
- Admin writes answer JSON when called with `Accept: application/json` (`done()`), and redirect with a flash otherwise.
  Plain-form AJAX must send urlencoded bodies (`URLSearchParams`), never `FormData` (multipart is parsed only on the upload routes).
- A new write function in `reviews`/`overlay`/`content` must be added to that module's `ttl.wrap(...)` write list.
- Hidden homepage sections are not rendered at all (the motion code looks elements up); the hero is never hideable.
- Admin form classes are `.fld`/`.input`/etc. under `.adm` (`admin.css`). Do not name anything `.field`: the storefront's `head.ejs` already defines it.
- Product text from Sariee is plain text with blank-line (CRLF) paragraph breaks: render it with `paragraphs()` (res.locals), never a bare `<%= %>`.
- The first-visit entrance waits up to 1.3 s for the aurora shader's first frame, else uses the CSS orb; sound defaults come from `data-au-sound` on `<html>` (set in `head.ejs` from the `site` settings).
