-- Auréalis database schema (PostgreSQL / Supabase)
-- Run automatically by `npm run seed` when DATABASE_URL is set,
-- or paste into the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS users (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  first_name    text NOT NULL DEFAULT '',
  last_name     text NOT NULL DEFAULT '',
  is_admin      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  sid     text PRIMARY KEY,
  data    text NOT NULL,
  expires bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       text NOT NULL UNIQUE,
  name       text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subcategories (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id integer NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  slug        text NOT NULL,
  name        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  UNIQUE(category_id, slug)
);

-- Local presentation overlay on top of Sariee products, keyed by the Sariee
-- product id. Lets the site-admin organize/curate Sariee's catalog without
-- touching Sariee: assign local category/subcategory, order, featured slots,
-- and hide products from the storefront.
CREATE TABLE IF NOT EXISTS product_overlay (
  sariee_id        text PRIMARY KEY,
  category_slug    text NOT NULL DEFAULT '',
  subcategory_slug text NOT NULL DEFAULT '',
  sort_order       integer NOT NULL DEFAULT 0,
  is_featured      integer NOT NULL DEFAULT 0,
  is_bestseller    integer NOT NULL DEFAULT 0,
  is_hidden        integer NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Editable page content (About, Home, Shop, Footer, …) as JSON blobs by key.
CREATE TABLE IF NOT EXISTS site_content (
  key        text PRIMARY KEY,
  value      text NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Orders placed through this storefront, mapped to their Sariee order id so the
-- account page can pull live details from Sariee (Sariee is the source of truth).
CREATE TABLE IF NOT EXISTS sariee_orders (
  id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sariee_order_id text NOT NULL UNIQUE,
  user_id         integer REFERENCES users(id) ON DELETE SET NULL,
  email           text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sariee_orders_user ON sariee_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_sariee_orders_email ON sariee_orders(email);

-- Cancellation requests. Sariee has no cancel/void order endpoint (checked
-- across all 425 documented endpoints), so this can't be automatic — it just
-- records the request and emails store ops to action it manually in Sariee.
CREATE TABLE IF NOT EXISTS cancellation_requests (
  id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sariee_order_id text NOT NULL,
  user_id         integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note            text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_order ON cancellation_requests(sariee_order_id);

-- Password reset tokens (local accounts only — Sariee's customer auth is a
-- separate, unused system; this site's login is entirely local).
CREATE TABLE IF NOT EXISTS password_resets (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);

-- Wishlist, keyed by the signed-in user and the Sariee product id.
CREATE TABLE IF NOT EXISTS wishlist_items (
  id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id           integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sariee_product_id text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, sariee_product_id)
);
CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist_items(user_id);

-- Product reviews, local to this storefront (Sariee has no review feature).
-- is_approved gates public display — user-generated content on a live site
-- needs a moderation step before it's shown to other shoppers.
CREATE TABLE IF NOT EXISTS reviews (
  id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sariee_product_id text NOT NULL,
  user_id           integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating            integer NOT NULL,
  body              text NOT NULL DEFAULT '',
  is_approved       integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(sariee_product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_approved ON reviews(sariee_product_id, is_approved);

CREATE INDEX IF NOT EXISTS idx_subcategories_cat ON subcategories(category_id);
