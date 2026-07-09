// Vercel serverless entry. The Express app is a valid (req, res) handler, so we
// export it directly. All routes are rewritten here via vercel.json.
module.exports = require('../server');
