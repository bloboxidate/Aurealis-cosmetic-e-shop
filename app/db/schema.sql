-- Auréalis database schema (SQLite)
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name   TEXT NOT NULL DEFAULT '',
  last_name    TEXT NOT NULL DEFAULT '',
  is_admin     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Session store (managed by the custom better-sqlite3 session store)
CREATE TABLE IF NOT EXISTS sessions (
  sid     TEXT PRIMARY KEY,
  data    TEXT NOT NULL,
  expires INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subcategories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE(category_id, slug)
);

-- Local presentation overlay on top of Sariee products, keyed by Sariee id.
CREATE TABLE IF NOT EXISTS product_overlay (
  sariee_id        TEXT PRIMARY KEY,
  category_slug    TEXT NOT NULL DEFAULT '',
  subcategory_slug TEXT NOT NULL DEFAULT '',
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_featured      INTEGER NOT NULL DEFAULT 0,
  is_bestseller    INTEGER NOT NULL DEFAULT 0,
  is_hidden        INTEGER NOT NULL DEFAULT 0,
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Editable page content (About, Home, Shop, Footer, …) as JSON blobs by key.
CREATE TABLE IF NOT EXISTS site_content (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Orders placed through this storefront, mapped to their Sariee order id.
CREATE TABLE IF NOT EXISTS sariee_orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  sariee_order_id TEXT NOT NULL UNIQUE,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email           TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sariee_orders_user ON sariee_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_sariee_orders_email ON sariee_orders(email);

-- Cancellation requests. Sariee has no cancel/void order endpoint (checked
-- across all 425 documented endpoints), so this can't be automatic — it just
-- records the request and emails store ops to action it manually in Sariee.
CREATE TABLE IF NOT EXISTS cancellation_requests (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  sariee_order_id TEXT NOT NULL,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note            TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_order ON cancellation_requests(sariee_order_id);

-- Password reset tokens (local accounts only — Sariee's customer auth is a
-- separate, unused system; this site's login is entirely local).
CREATE TABLE IF NOT EXISTS password_resets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);

-- Wishlist, keyed by the signed-in user and the Sariee product id.
CREATE TABLE IF NOT EXISTS wishlist_items (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sariee_product_id TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, sariee_product_id)
);
CREATE INDEX IF NOT EXISTS idx_wishlist_user ON wishlist_items(user_id);

-- Product reviews, local to this storefront (Sariee has no review feature).
-- is_approved gates public display — user-generated content on a live site
-- needs a moderation step before it's shown to other shoppers.
CREATE TABLE IF NOT EXISTS reviews (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  sariee_product_id TEXT NOT NULL,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating            INTEGER NOT NULL,
  body              TEXT NOT NULL DEFAULT '',
  is_approved       INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(sariee_product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_approved ON reviews(sariee_product_id, is_approved);

CREATE INDEX IF NOT EXISTS idx_subcategories_cat ON subcategories(category_id);
