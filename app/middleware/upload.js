// Multer with memory storage (no disk writes — the buffer goes straight to
// Supabase Storage, since Vercel's filesystem isn't persistent). Image-only,
// 5MB cap, and errors return JSON instead of falling through to Express's
// generic HTML error page — these routes are only ever called via fetch().
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) return cb(new Error('Only image uploads are allowed.'));
    cb(null, true);
  },
});

// Wraps multer's single-file middleware so failures (bad type, too large)
// come back as { ok: false, message } instead of an unhandled error.
function single(fieldName) {
  const mw = upload.single(fieldName);
  return (req, res, next) => {
    mw(req, res, (err) => {
      if (err) return res.status(400).json({ ok: false, message: err.message });
      next();
    });
  };
}

module.exports = { single };
