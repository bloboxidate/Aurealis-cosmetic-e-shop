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

CREATE TABLE IF NOT EXISTS products (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  subtitle     TEXT NOT NULL DEFAULT '',
  category     TEXT NOT NULL DEFAULT 'skincare',   -- skincare | makeup
  subcategory  TEXT NOT NULL DEFAULT '',           -- serums | moisturizers | cleansers | mists ...
  price_cents  INTEGER NOT NULL DEFAULT 0,
  description  TEXT NOT NULL DEFAULT '',
  details      TEXT NOT NULL DEFAULT '',
  how_to_use   TEXT NOT NULL DEFAULT '',
  ingredients  TEXT NOT NULL DEFAULT '',
  color        TEXT NOT NULL DEFAULT '#a5d1e4',    -- accent used behind the product image
  image_url    TEXT NOT NULL DEFAULT '',           -- optional real photo; falls back to color
  sizes        TEXT NOT NULL DEFAULT '[]',         -- JSON array of size labels
  badges       TEXT NOT NULL DEFAULT '[]',         -- JSON array e.g. ["Cruelty-Free","Vegan"]
  is_bestseller INTEGER NOT NULL DEFAULT 0,
  is_active    INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- One cart row per session (guest or logged-in). Items reference it.
CREATE TABLE IF NOT EXISTS cart_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT NOT NULL,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size        TEXT NOT NULL DEFAULT '',
  qty         INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id, product_id, size)
);

CREATE TABLE IF NOT EXISTS promo_codes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,
  kind        TEXT NOT NULL DEFAULT 'percent',     -- percent | fixed
  value       INTEGER NOT NULL DEFAULT 0,          -- percent (0-100) or cents
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number  TEXT NOT NULL UNIQUE,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  email         TEXT NOT NULL,
  ship_first    TEXT NOT NULL DEFAULT '',
  ship_last     TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  city          TEXT NOT NULL DEFAULT '',
  postal        TEXT NOT NULL DEFAULT '',
  country       TEXT NOT NULL DEFAULT '',
  ship_method   TEXT NOT NULL DEFAULT 'standard',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  total_cents    INTEGER NOT NULL DEFAULT 0,
  promo_code    TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'paid',       -- simulated: paid on placement
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  size         TEXT NOT NULL DEFAULT '',
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  qty          INTEGER NOT NULL DEFAULT 1
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

CREATE TABLE IF NOT EXISTS product_images (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
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

CREATE INDEX IF NOT EXISTS idx_cart_session ON cart_items(session_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_subcategories_cat ON subcategories(category_id);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);
