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

// The ambient-sound track. Vercel rejects request bodies over about 4.5 MB, so the cap sits just under that.
const AUDIO_TYPES = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'm4a', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav' };
const AUDIO_MAX_MB = 4;
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AUDIO_MAX_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!AUDIO_TYPES[file.mimetype]) return cb(new Error('Please choose an MP3, M4A, OGG or WAV file.'));
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

// Same wrapper for the audio upload; a too-large file gets a plain-language message.
function audio(fieldName) {
  const mw = audioUpload.single(fieldName);
  return (req, res, next) => {
    mw(req, res, (err) => {
      if (err) return res.status(400).json({ ok: false, message: err.code === 'LIMIT_FILE_SIZE' ? `That file is over ${AUDIO_MAX_MB} MB. Compress it (a 128 kbps MP3 is about 1 MB per minute) and try again.` : err.message });
      next();
    });
  };
}

module.exports = { single, audio, AUDIO_TYPES };
