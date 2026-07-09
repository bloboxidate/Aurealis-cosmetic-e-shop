// express-session store backed by the shared async DB layer.
// Works on both SQLite and Postgres because it only uses db.get/run.
const session = require('express-session');
const db = require('./database');

const Store = session.Store;

class DbStore extends Store {
  constructor() {
    super();
    // Prune expired sessions hourly.
    setInterval(() => {
      db.run('DELETE FROM sessions WHERE expires < ?', [Date.now()]).catch(() => {});
    }, 60 * 60 * 1000).unref();
  }

  get(sid, cb) {
    db.get('SELECT data, expires FROM sessions WHERE sid = ?', [sid])
      .then((row) => {
        if (!row) return cb(null, null);
        if (Number(row.expires) < Date.now()) {
          return db.run('DELETE FROM sessions WHERE sid = ?', [sid]).then(() => cb(null, null));
        }
        cb(null, JSON.parse(row.data));
      })
      .catch(cb);
  }

  set(sid, sess, cb) {
    const maxAge = sess.cookie && sess.cookie.maxAge ? sess.cookie.maxAge : 1000 * 60 * 60 * 24 * 30;
    const params = { sid, data: JSON.stringify(sess), expires: Date.now() + maxAge };
    db.run(
      'INSERT INTO sessions (sid, data, expires) VALUES (@sid, @data, @expires) ' +
      'ON CONFLICT(sid) DO UPDATE SET data = @data, expires = @expires',
      params
    ).then(() => cb && cb(null)).catch((e) => cb && cb(e));
  }

  destroy(sid, cb) {
    db.run('DELETE FROM sessions WHERE sid = ?', [sid])
      .then(() => cb && cb(null)).catch((e) => cb && cb(e));
  }

  touch(sid, sess, cb) {
    const maxAge = sess.cookie && sess.cookie.maxAge ? sess.cookie.maxAge : 1000 * 60 * 60 * 24 * 30;
    db.run('UPDATE sessions SET expires = ? WHERE sid = ?', [Date.now() + maxAge, sid])
      .then(() => cb && cb(null)).catch((e) => cb && cb(e));
  }
}

module.exports = DbStore;
