# Deploying Auréalis to Vercel

The storefront is a Node/Express app that reads its catalog live from Sariee and
stores site settings (categories, product curation, page content, sessions,
admin users) in Postgres. It runs on Vercel as a single serverless function.

## 1. Prerequisites

- A **Postgres database** (Supabase works well). You already have one — its
  connection string is your `DATABASE_URL`.
- Your **Sariee** store credentials (already in `.env`).
- The repo pushed to GitHub/GitLab/Bitbucket.

> SQLite (`better-sqlite3`) is only for local dev and is an *optional*
> dependency. Production must use Postgres via `DATABASE_URL`.

## 2. One-time: create the schema + admin user

Vercel can't run a seed step for you, so do it once from your machine against
the **production** database:

```bash
cd app
# point at the prod DB just for this command:
DATABASE_URL="postgresql://…your-supabase-uri…" \
ADMIN_EMAIL="you@example.com" ADMIN_PASSWORD="a-strong-password" \
npm run seed
```

This creates the tables (idempotent) and your first admin login. It inserts **no
placeholder products** — the catalog comes from Sariee.

## 3. Import the project into Vercel

1. **New Project → import your repo.**
2. Set **Root Directory** to `app`. ← important (the app lives in `app/`, not the repo root).
3. Framework preset: **Other** (the included `vercel.json` handles routing).
4. Add the **Environment Variables** below.
5. **Deploy.**

## 4. Environment variables (Vercel → Settings → Environment Variables)

| Name | Value |
|------|-------|
| `DATABASE_URL` | your Postgres/Supabase connection string |
| `SESSION_SECRET` | a long random string (`openssl rand -hex 32`) |
| `NODE_ENV` | `production` |
| `SARIEE_API_BASE_URL` | `https://api.sariee.com` |
| `SARIEE_STORE_DOMAIN` | `aurealis.sariee.shop` |
| `SARIEE_REQUEST_REFERER` | `https://aurealis.sariee.shop` |
| `SARIEE_LOCALE` | `en` |
| `SARIEE_LOGIN_EMAIL` | your Sariee company-portal email |
| `SARIEE_LOGIN_PASSWORD` | your Sariee company-portal password |

(Only set `SARIEE_API_BEARER_TOKEN` instead of the login pair if you use a static token.)

## 5. After deploying

- Visit `/admin`, sign in with the admin you seeded, and set up your
  **Categories**, assign/curate **Products**, and edit **Page Content**.
- The public storefront reflects changes immediately.

## Notes

- **Never commit `.env`** — it holds real credentials (already in `.gitignore`).
- Static assets in `app/public/` are served by Vercel automatically.
- The DB schema is ensured on cold start (idempotent), but the seed step above
  is still needed once to create your admin user.
