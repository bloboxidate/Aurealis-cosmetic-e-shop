// Dual-backend database layer.
//   • No DATABASE_URL  -> SQLite file (local dev, zero setup)
//   • DATABASE_URL set -> Postgres / Supabase (production)
//
// Both backends are exposed through the SAME async interface so the rest of the
// app never cares which one is active:
//   await db.get(sql, params)      -> one row (or undefined)
//   await db.all(sql, params)      -> array of rows
//   await db.run(sql, params)      -> { changes }
//   await db.insertId(sql, params) -> id of the inserted row
//   await db.tx(async (t) => ...)  -> transaction; t has get/all/run/insertId
//
// `params` may be an array (for `?` placeholders) or an object (for `@name`
// placeholders). The pg path translates both to `$1..$n`; SQLite uses them
// natively.
const path = require('path');
const fs = require('fs');

const usePg = !!process.env.DATABASE_URL;

// ---- placeholder translation (only needed for Postgres) ----
function toPg(sql, params) {
  if (Array.isArray(params)) {
    let i = 0;
    return { text: sql.replace(/\?/g, () => '$' + ++i), values: params };
  }
  if (params && typeof params === 'object') {
    const values = [];
    const seen = {};
    const text = sql.replace(/@(\w+)/g, (_, k) => {
      if (!(k in seen)) {
        values.push(params[k]);
        seen[k] = '$' + values.length;
      }
      return seen[k];
    });
    return { text, values };
  }
  return { text: sql, values: [] };
}

function ensureReturningId(text) {
  return /returning/i.test(text) ? text : text.replace(/;?\s*$/, ' RETURNING id');
}

let api;

if (usePg) {
  // ---------------- Postgres / Supabase ----------------
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Supabase requires SSL
    max: 5,
  });

  const clientApi = (runner) => ({
    async get(sql, params) {
      const { text, values } = toPg(sql, params);
      const res = await runner.query(text, values);
      return res.rows[0];
    },
    async all(sql, params) {
      const { text, values } = toPg(sql, params);
      const res = await runner.query(text, values);
      return res.rows;
    },
    async run(sql, params) {
      const { text, values } = toPg(sql, params);
      const res = await runner.query(text, values);
      return { changes: res.rowCount };
    },
    async insertId(sql, params) {
      const { text, values } = toPg(sql, params);
      const res = await runner.query(ensureReturningId(text), values);
      return res.rows[0] ? res.rows[0].id : undefined;
    },
  });

  const top = clientApi(pool);
  api = {
    backend: 'postgres',
    ...top,
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(clientApi(client));
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
    async init() {
      const schema = fs.readFileSync(path.join(__dirname, 'schema.postgres.sql'), 'utf8');
      await pool.query(schema);
    },
    async close() { await pool.end(); },
  };
} else {
  // ---------------- SQLite (better-sqlite3, wrapped async) ----------------
  const Database = require('better-sqlite3');
  const DATA_DIR = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const sdb = new Database(path.join(DATA_DIR, 'aurealis.db'));
  sdb.pragma('journal_mode = WAL');
  sdb.pragma('foreign_keys = ON');

  const sqliteApi = {
    async get(sql, params) {
      const s = sdb.prepare(sql);
      return Array.isArray(params) ? s.get(...params) : s.get(params || {});
    },
    async all(sql, params) {
      const s = sdb.prepare(sql);
      return Array.isArray(params) ? s.all(...params) : s.all(params || {});
    },
    async run(sql, params) {
      const s = sdb.prepare(sql);
      const info = Array.isArray(params) ? s.run(...params) : s.run(params || {});
      return { changes: info.changes };
    },
    async insertId(sql, params) {
      const s = sdb.prepare(sql);
      const info = Array.isArray(params) ? s.run(...params) : s.run(params || {});
      return info.lastInsertRowid;
    },
  };

  api = {
    backend: 'sqlite',
    ...sqliteApi,
    async tx(fn) {
      sdb.exec('BEGIN');
      try {
        const result = await fn(sqliteApi);
        sdb.exec('COMMIT');
        return result;
      } catch (e) {
        try { sdb.exec('ROLLBACK'); } catch (_) {}
        throw e;
      }
    },
    async init() {
      const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
      sdb.exec(schema);
    },
    async close() { sdb.close(); },
  };
}

module.exports = api;
