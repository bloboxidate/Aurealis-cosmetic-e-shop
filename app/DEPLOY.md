# Deploying Auréalis to Vercel

The storefront is a Node/Express app that reads its catalog live from Sariee and
stores site settings (categories, product curation, page content, accounts,
sessions, wishlist, reviews) in Postgres. It runs on Vercel as a single
serverless function (`api/index.js` exports the Express app; `vercel.json`
rewrites every path to it).

## 1. Prerequisites

- A **Postgres database** (Supabase works well) — its connection string is your `DATABASE_URL`.
- A **Supabase Storage bucket** for admin image uploads (hero, About, category images):
  create one named `site-images` (or choose another and set `SUPABASE_STORAGE_BUCKET`)
  and make it **public** — the app stores the public URL (`getPublicUrl`).
- Your **Sariee** store settings (see the table below).
- The repo pushed to GitHub/GitLab/Bitbucket.

> SQLite (`better-sqlite3`) is only for local dev and is an *optional*
> dependency. Production must use Postgres via `DATABASE_URL`.

### Use the pooled connection string

On Vercel, `DATABASE_URL` **must be Supabase's "Connection pooling" string
(Transaction mode, port `6543`)**, not the direct connection (port `5432`).
Every cold start opens a new pool and Vercel runs many instances at once; the
direct connection exhausts Supabase's client limit ("max clients reached" /
`EMAXCONNSESSION`) and takes the site down. The app already uses `max: 1`
connection per instance to stay small.

## 2. One-time: create the schema + admin user

Run the seed once from your machine against the **production** database:

```bash
cd app
# point at the prod DB just for this command:
DATABASE_URL="postgresql://…your-pooled-supabase-uri…" \
ADMIN_EMAIL="you@example.com" ADMIN_PASSWORD="a-strong-password" \
npm run seed
```

This creates the tables (idempotent) and your first admin login. It inserts **no
placeholder products** — the catalog comes from Sariee.

**Always set `ADMIN_EMAIL` and `ADMIN_PASSWORD` explicitly.** If they're unset
the seed falls back to the publicly documented dev login
(`admin@aurealis.test` / `admin123`), which must never exist on a live site.

## 3. Import the project into Vercel

1. **New Project → import your repo.**
2. Set **Root Directory** to `app`. ← important (the app lives in `app/`, not the repo root).
3. Framework preset: **Other** (the included `vercel.json` handles routing).
4. Add the **Environment Variables** below. Tip: use Vercel's **Import .env**
   feature rather than typing values by hand — a single malformed value once
   caused a multi-hour outage where Sariee looked "unreachable" from Vercel
   while being fine everywhere else.
5. **Deploy.**

`vercel.json` also sets `maxDuration: 30` and
`"includeFiles": "views/**"`. **Keep `includeFiles`**: Vercel's bundler doesn't
reliably trace EJS templates, and without it views 404/500 in production while
working locally.

## 4. Environment variables (Vercel → Settings → Environment Variables)

**Required**

| Name | Value |
|------|-------|
| `DATABASE_URL` | Supabase **pooled** (port 6543) Postgres URI |
| `SESSION_SECRET` | a long random string (`openssl rand -hex 32`). The app refuses to start in production without it |
| `NODE_ENV` | `production` (Vercel sets this itself; keep it so cookies are `secure`) |
| `SARIEE_API_BASE_URL` | `https://api.sariee.com` |
| `SARIEE_STORE_DOMAIN` | `aurealis.sariee.shop` |
| `SARIEE_REQUEST_REFERER` | `https://aurealis.sariee.shop` |
| `SARIEE_LOCALE` | `en` |

**Needed for specific features**

| Name | Feature |
|------|---------|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Admin image uploads. Without them uploads fail with a clear message; everything else works. The service-role key is a secret — server-side only |
| `SUPABASE_STORAGE_BUCKET` | Bucket name if not `site-images` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Real emails (order confirmation, password reset, cancellation). Without `SMTP_HOST` the emails are **only logged** — so password-reset links never reach customers |
| `STORE_OPS_EMAIL` | Inbox for customer cancellation requests (Sariee has no cancel API). Unset = stored in the DB, not emailed |
| `SARIEE_LOGIN_EMAIL`, `SARIEE_LOGIN_PASSWORD` | Sariee company-portal login, used only for Sariee's company-portal API. (Or set `SARIEE_API_BEARER_TOKEN` instead of the pair.) The app's own admin UI doesn't need them |

**Optional tuning**: `SARIEE_TIMEOUT_MS` (default 20000), `SARIEE_DEFAULT_COUNTRY`
(default `Egypt`), `CATALOG_CACHE_MS` (default 60000), `GEO_CACHE_MS` (default 3600000).

## 5. After deploying

- Visit `/admin`, sign in with the admin you seeded, and set up your
  **Categories**, assign/curate **Products**, and edit **Page Content**.
- The public storefront reflects changes immediately (the Sariee product list
  is cached for ~60 s).
- Place **no test orders** on the live site unless you intend to: checkout creates a
  real Sariee order.

## 6. Schema changes later

On every cold start the app tries to re-apply `db/schema.postgres.sql`
(`CREATE TABLE IF NOT EXISTS …`). If that file isn't readable in the serverless
bundle, the app logs a warning and **skips** the step rather than crashing —
meaning a new table or column would silently not be created. After any schema
change, re-run `npm run seed` against the production database (it is
idempotent) rather than relying on cold-start init, and check the Vercel
Runtime Logs for `Schema file not read`.

## Notes

- **Never commit `.env`** — it holds real credentials (already in `.gitignore`).
- Static assets in `app/public/assets` and `app/public/js` are served by the app with cache headers.
- Vercel **Speed Insights** is wired into `views/partials/head.ejs` (and allowed in
  the CSP in `server.js`); enable it in the Vercel dashboard to see data.
- Admin image uploads go to Supabase Storage, not the local disk, because Vercel's
  filesystem isn't persistent.
