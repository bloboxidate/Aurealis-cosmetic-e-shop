# Auréalis — functional store

A real, working e-commerce site built on top of the Auréalis design mockups.
Node.js + Express, with a **dual database backend**:

- **SQLite** by default — zero setup, runs entirely on your machine.
- **Postgres / Supabase** when you set a `DATABASE_URL` — for production, where your
  data must survive redeploys. Same app code, same features; just flip the env var.

## What it does
- **Storefront** — home, shop with category/subcategory filters + sorting, product detail pages
- **Cart** — add/remove/change quantity, promo codes, persists per browser session (guests too)
- **Accounts** — sign up, log in/out, order history (passwords hashed with bcrypt)
- **Checkout** — real order creation with a **simulated** payment (no card is charged)
- **Admin panel** at `/admin`:
  - Dashboard stats + recent orders
  - **Products** — add/edit/delete, with **drag-and-drop image upload** (multiple images per product)
  - **Categories** — create/edit/delete categories & subcategories (drives the store nav + product dropdowns)
  - **Orders** — view every order and its details
  - **Customers** — list all customers; open one to see their profile and full order history

## Run it locally on SQLite (Windows / macOS / Linux)

```bash
cd app
npm install       # installs dependencies (first time only)
npm run seed      # creates the database and fills in the product catalog
npm start         # starts the server
```

Then open **http://localhost:3000**

## Run it on Supabase (Postgres) for production

1. Create a free project at [supabase.com](https://supabase.com).
2. In Supabase: **Project Settings → Database → Connection string → URI**. Copy it and
   replace `[YOUR-PASSWORD]` with your database password.
   - Deploying to a serverless host (Vercel etc.)? Use the **Connection pooling**
     (Transaction mode) string instead — it ends in port `6543`.
3. In the `app/` folder, copy `.env.example` to `.env` and set:
   ```
   DATABASE_URL=postgresql://postgres.xxxx:YOUR-PASSWORD@...supabase.com:6543/postgres
   SESSION_SECRET=some-long-random-string
   ```
4. Create the tables + seed data (run once):
   ```bash
   npm run seed
   ```
   This applies `db/schema.postgres.sql` and inserts the catalog into Supabase.
   (You can also paste that file into the Supabase SQL editor manually if you prefer.)
5. `npm start` — the console will say `running (postgres)`. Done.

Switching back to local SQLite is just removing/commenting out `DATABASE_URL`.

### Logins
- **Admin:** `admin@aurealis.test` / `admin123`  → then visit `/admin`
- **Customers:** create any account via the Sign up page
- **Promo code:** `AURORA10` (10% off) — try it in the cart

## Notes
- The database lives in `app/data/aurealis.db` (created on first `npm run seed`). Delete that
  file and re-run `npm run seed` to start fresh.
- Product images: drag & drop them onto the product form in the admin panel (or click to
  choose). The first image is the "main" photo shown on cards. Files are saved to
  `app/public/uploads/`. Products with no image fall back to their aurora accent colour.
  - **Production caveat:** uploaded files live on the server's local disk. That's fine
    locally and on a host with a persistent disk, but on ephemeral/serverless hosts
    (Vercel etc.) uploads are wiped on redeploy. For that setup, switch uploads to
    **Supabase Storage** (a small change to the upload handler in `routes/admin.js`).
- Payments are simulated. To take real payments later, wire the checkout route to Stripe.

## Project layout
```
app/
  server.js            # Express app + middleware wiring
  db/                  # schema.sql, database connection, seed data, session store
  routes/              # shop, cart, auth, checkout, admin
  lib/                 # products, cart, formatting helpers
  middleware/          # auth + shared view locals
  views/               # EJS templates (mirror the original designs)
  public/              # logo, client JS, uploaded images
```
