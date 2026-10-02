# Auréalis — storefront app

The working store behind the Auréalis design mockups. Node.js + Express + EJS,
with the **commerce backend delegated to [Sariee](../sariee/sariee-integration-guide.md)**
(`api.sariee.com`, store `aurealis.sariee.shop`).

> **Heads-up: checkout creates real orders.** Products, carts, promo codes and
> orders all live in Sariee. Placing an order here — even from `localhost` —
> calls Sariee's `checkout-action` and creates a **real Cash-on-Delivery order**
> that the store will see and fulfil. Don't submit the checkout form unless you
> mean it.

## Who owns what

| Lives in **Sariee** (source of truth) | Lives in **our database** (Postgres / SQLite) |
|---|---|
| Products, prices, images, stock | Customer accounts (bcrypt) + sessions |
| Cart, promo codes, shipping fees | Categories & subcategories (storefront taxonomy) |
| Orders and their status | Product *overlay*: category assignments, order, featured / bestseller / hidden |
| Countries → states → cities | Editable page content (Home, About, Shop, Footer) |
| Payment methods (Cash on Delivery only) | Wishlist, product reviews (+ moderation), password-reset tokens |
| | Order-id mapping (`sariee_orders`) and cancellation requests |

There is **no local product or order data**. Sariee outages degrade pages to an
empty/error state (logged as `[catalog]`, `[shop]`, `[admin]`…) instead of a 500.

## Features

**Storefront**
- Home (editable hero + bestsellers), Shop with category/subcategory filters,
  local text search (`?q=`), sorting, and 24-per-page pagination; product pages
  with gallery, related products, wishlist and reviews.
- Cart (guest or signed-in), promo codes (validated by Sariee), checkout
  (Cash on Delivery, Egypt governorate → city picker), order confirmation.
- Accounts: sign up / log in / log out, forgot + reset password (1-hour token),
  order history pulled live from Sariee's `single-order`, **cancellation
  requests** (Sariee has no cancel API — the request is stored and emailed to
  `STORE_OPS_EMAIL` for manual handling).
- Policy pages in the footer: **Shipping Policy** (`/shipping-policy`),
  **Refund Policy** (`/refund-policy`) and **Contact Us** (`/contact`, shows email +
  phone). All three are editable in the admin.
- Wishlist (signed-in only). Prices display in **EGP** (`lib/format.js`).
- `/en` and `/en/*` 301-redirect to the unprefixed path; there is no i18n and no `/ar`.

**Site admin (`/admin`, admin users only)** — manages *presentation*, not commerce:
- **Dashboard** — product / hidden / bestseller / category counts.
- **Products** — per Sariee product: assign to one or more categories (each with
  an optional subcategory), drag to reorder, featured / bestseller / hidden flags.
  Products themselves are created and edited in Sariee's own dashboard.
- **Categories** — create / rename / delete categories and subcategories, upload
  a category image.
- **Page Content** — edit Home, About, Shop, Shipping Policy, Refund Policy,
  Contact Us and Footer copy; upload the hero (Home) and About images. Policy
  text supports light formatting (blank line = paragraph, `## Heading`,
  `- bullet`, `**bold**`, `*italic*`, `[link](url)`; HTML is always escaped —
  `lib/richtext.js`). The Contact page's email/phone fall back to the Footer's
  if left blank. The shipping/refund defaults in `lib/content.js` are draft
  wording to review.
- **Reviews** — approve or reject pending customer reviews (nothing shows
  publicly until approved).

There are no Orders or Customers pages here — use Sariee's dashboard for those.

## Run it locally

You need **Node ≥ 18** and **network access to Sariee**, since the catalog is
never stored locally.

```bash
cd app
npm install
cp .env.example .env     # then fill it in (see below)
npm run seed             # creates the schema + the first admin user (no products!)
npm start                # http://localhost:3000   (npm run dev = auto-restart)
```

Minimum `.env` for local work:

```
SESSION_SECRET=any-long-random-string
SARIEE_API_BASE_URL=https://api.sariee.com
SARIEE_STORE_DOMAIN=aurealis.sariee.shop
SARIEE_REQUEST_REFERER=https://aurealis.sariee.shop
SARIEE_LOCALE=en
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=a-strong-password
```

Storefront browsing needs only the `SARIEE_*` store settings above. Add
`SARIEE_LOGIN_EMAIL` / `SARIEE_LOGIN_PASSWORD` (or a bearer token) only if you
need Sariee's company-portal API (the app's own admin UI doesn't call it). Full variable list: [Environment variables](#environment-variables).

### Database: SQLite vs Postgres

- **No `DATABASE_URL`** → a local SQLite file at `app/data/aurealis.db`
  (`better-sqlite3`, an *optional* dependency, git-ignored). Delete it and
  re-run `npm run seed` to start fresh.
- **`DATABASE_URL` set** → Postgres / Supabase, using `db/schema.postgres.sql`.
  Use the **pooled** (Transaction mode, port **6543**) connection string on
  serverless hosts — see [DEPLOY.md](DEPLOY.md).

Both backends sit behind one async interface in `db/database.js`
(`get / all / run / insertId / tx`), with `?` and `@name` placeholders. **A schema
change must be made in both `db/schema.sql` and `db/schema.postgres.sql`.**
`npm run seed` is idempotent and safe to re-run.

### Admin login

`npm run seed` creates the admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. If
those are unset it falls back to **`admin@aurealis.test` / `admin123`** — fine
on your own machine, **never** acceptable in production (this repo is public).
Always set both variables before seeding a real database. Customers just use
the Sign up page. Then visit `/admin`.

## Environment variables

See `.env.example` for annotated defaults. Summary:

| Variable | Needed | Purpose |
|---|---|---|
| `SESSION_SECRET` | **prod: required** (app refuses to start without it) | Signs session cookies |
| `DATABASE_URL` | prod | Postgres/Supabase; unset = local SQLite |
| `NODE_ENV` | prod | `production` enables secure cookies |
| `PORT` | no | Defaults to 3000 |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | when seeding | First admin account |
| `SARIEE_API_BASE_URL`, `SARIEE_STORE_DOMAIN`, `SARIEE_REQUEST_REFERER`, `SARIEE_LOCALE` | yes | Sariee store selection (`x-domain`, `x-locale`, `Referer`) |
| `SARIEE_TIMEOUT_MS` | no | Per-request timeout, default 20000 |
| `SARIEE_LOGIN_EMAIL`, `SARIEE_LOGIN_PASSWORD` *or* `SARIEE_API_BEARER_TOKEN` | only for `/api/company/*` | Company/admin auth for the admin proxy |
| `SARIEE_DEFAULT_COUNTRY` | no | Country for the checkout city picker, default `Egypt` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | for image uploads | Supabase Storage for admin images; bucket defaults to `site-images` and must be **public** |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | no | Real email delivery. Without `SMTP_HOST`, emails are only **logged** to the console |
| `STORE_OPS_EMAIL` | no | Inbox for cancellation requests; unset = recorded in the DB only |
| `CATALOG_CACHE_MS`, `GEO_CACHE_MS` | no | Cache TTLs (default 60 s / 1 h) |

## How the Sariee integration works

Full details and verified request shapes are in
[`../sariee/sariee-integration-guide.md`](../sariee/sariee-integration-guide.md).
The essentials:

- `lib/sariee/client.js` is the HTTP client; `endpoints.json` lists all 425
  documented endpoints; `lib/sariee/index.js` offers namespaces
  (`sariee.products`, `.cart`, `.checkout`, `.helpers`, `.store`, `.admin.call(id)`).
- Storefront calls send `x-domain`, `x-locale`, `Referer`. **`/api/company/*`
  calls must omit `x-domain`** (the client does this automatically).
- The cart is keyed by an `X-Cart-Token` header kept in the session
  (`req.session.sarieeCartToken`) — not cookies. `lib/scart.js` caches the cart
  snapshot in the session and sets quantities absolutely (Sariee's
  `add-update` *sets*, not increments).
- `lib/catalog.js` fetches every page of Sariee's product list (60 s cache),
  maps it to the view shape, then merges the local overlay and taxonomy.

## Security measures in place

`helmet` with a CSP (inline script/style allowed — the EJS views need them),
CSRF tokens on auth, checkout and all `/admin` POSTs, `express-rate-limit` on
login / signup / password reset (20 per 15 min), checkout (10 per 15 min), promo codes (15 per 15 min), bag and wishlist changes (120 per 5 min) and reviews (8 per hour),
an Origin/Fetch-Metadata check on the anonymous cart, wishlist and review posts (`middleware/same-origin.js`),
session regeneration on login, bcrypt hashing, hashed single-use reset tokens,
review moderation, image-only 5 MB upload limit, and generic responses on
password-reset requests to prevent account enumeration.

## Known issues

1. **Sariee's cart API has had server-side bugs** (`cart/init` on a non-empty
   cart, quantity updates, `checkout-action` — history in the integration
   guide). `lib/scart.js` works around them by trusting its session snapshot and
   falling back to local recalculation; if Sariee regresses, symptoms are
   500s on those calls.
2. **Uploads need Supabase Storage.** Without `SUPABASE_URL` +
   `SUPABASE_SERVICE_ROLE_KEY`, admin image uploads return a clear error; the
   rest of the admin works.
4. **No automated tests.** Changes are verified by running the app.

## Project layout

```
app/
  server.js              Express app, middleware wiring (helmet, sessions, CSRF locals), routes, 404/500
  api/index.js           Vercel serverless entry — exports the Express app
  vercel.json            Rewrites everything to /api; includeFiles "views/**" (required)
  db/
    database.js          Dual backend (SQLite / Postgres) behind one async interface
    schema.sql           SQLite schema          ┐ keep these two in sync
    schema.postgres.sql  Postgres schema        ┘
    seed.js              Creates schema + admin user (no catalog)
    session-store.js     express-session store backed by the DB
  routes/
    shop.js              Home, /shop, /product/:slug (+ reviews), /about, /shipping-policy, /refund-policy, /contact
    cart.js, checkout.js, auth.js, wishlist.js
    admin.js             Taxonomy, product curation, page content, review moderation
  lib/
    sariee/              client.js, index.js, endpoints.json (425 endpoints)
    catalog.js           Sariee products + overlay + taxonomy
    scart.js             Sariee-backed cart      orders.js   order history / ownership
    overlay.js           product_overlay + product_categories
    categories.js, content.js (editable pages + defaults), richtext.js, reviews.js, wishlist.js, cancellations.js
    geo.js               Country → state → city for checkout
    mailer.js            nodemailer, or console log if SMTP unset
    storage.js           Supabase Storage uploads
    format.js (EGP), validators.js, ah.js (async route wrapper)
  middleware/            auth.js (locals, requireAuth/Admin), csrf.js, rate-limit.js, upload.js
  views/                 EJS templates (+ partials/ and admin/)
  public/                assets/ (logo, favicons), js/app.js (progressive enhancement)
```
