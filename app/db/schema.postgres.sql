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

CREATE TABLE IF NOT EXISTS products (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug          text NOT NULL UNIQUE,
  name          text NOT NULL,
  subtitle      text NOT NULL DEFAULT '',
  category      text NOT NULL DEFAULT 'skincare',
  subcategory   text NOT NULL DEFAULT '',
  price_cents   integer NOT NULL DEFAULT 0,
  description   text NOT NULL DEFAULT '',
  details       text NOT NULL DEFAULT '',
  how_to_use    text NOT NULL DEFAULT '',
  ingredients   text NOT NULL DEFAULT '',
  color         text NOT NULL DEFAULT '#a5d1e4',
  image_url     text NOT NULL DEFAULT '',
  sizes         text NOT NULL DEFAULT '[]',
  badges        text NOT NULL DEFAULT '[]',
  is_bestseller integer NOT NULL DEFAULT 0,
  is_active     integer NOT NULL DEFAULT 1,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cart_items (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id  text NOT NULL,
  product_id  integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size        text NOT NULL DEFAULT '',
  qty         integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, product_id, size)
);

CREATE TABLE IF NOT EXISTS promo_codes (
  id     integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code   text NOT NULL UNIQUE,
  kind   text NOT NULL DEFAULT 'percent',
  value  integer NOT NULL DEFAULT 0,
  active integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orders (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_number   text NOT NULL UNIQUE,
  user_id        integer REFERENCES users(id) ON DELETE SET NULL,
  email          text NOT NULL,
  ship_first     text NOT NULL DEFAULT '',
  ship_last      text NOT NULL DEFAULT '',
  address        text NOT NULL DEFAULT '',
  city           text NOT NULL DEFAULT '',
  postal         text NOT NULL DEFAULT '',
  country        text NOT NULL DEFAULT '',
  ship_method    text NOT NULL DEFAULT 'standard',
  subtotal_cents integer NOT NULL DEFAULT 0,
  discount_cents integer NOT NULL DEFAULT 0,
  shipping_cents integer NOT NULL DEFAULT 0,
  total_cents    integer NOT NULL DEFAULT 0,
  promo_code     text NOT NULL DEFAULT '',
  status         text NOT NULL DEFAULT 'paid',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id               integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id         integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       integer REFERENCES products(id) ON DELETE SET NULL,
  name             text NOT NULL,
  size             text NOT NULL DEFAULT '',
  unit_price_cents integer NOT NULL DEFAULT 0,
  qty              integer NOT NULL DEFAULT 1
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

CREATE TABLE IF NOT EXISTS product_images (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
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

CREATE INDEX IF NOT EXISTS idx_cart_session ON cart_items(session_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_subcategories_cat ON subcategories(category_id);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);
