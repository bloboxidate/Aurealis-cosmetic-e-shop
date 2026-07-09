// Prepares a fresh database for the Sariee-backed storefront.
//
// The catalog now comes live from Sariee, and categories / page content are
// managed in the site-admin, so seeding NO LONGER inserts placeholder products
// or taxonomy. It only ensures the schema exists and creates the admin login.
//
// Safe to re-run. Works against SQLite or Postgres/Supabase (per DATABASE_URL).
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./database');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@aurealis.test';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

async function main() {
  await db.init();

  const existingAdmin = await db.get('SELECT id FROM users WHERE email = ?', [ADMIN_EMAIL]);
  if (!existingAdmin) {
    await db.run(
      'INSERT INTO users (email, password_hash, first_name, last_name, is_admin) VALUES (?, ?, ?, ?, 1)',
      [ADMIN_EMAIL, bcrypt.hashSync(ADMIN_PASSWORD, 10), 'Aurora', 'Admin']
    );
    console.log(`Admin created:  ${ADMIN_EMAIL}  /  ${ADMIN_PASSWORD}`);
  } else {
    console.log(`Admin already exists:  ${ADMIN_EMAIL}`);
  }

  console.log(`Seed complete (${db.backend}). Catalog comes from Sariee; add categories & content in /admin.`);
  await db.close();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
