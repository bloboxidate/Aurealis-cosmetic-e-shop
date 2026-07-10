// Image uploads for admin-editable storefront images (hero, category tiles,
// about-us) — stored in Supabase Storage since Vercel's filesystem doesn't
// persist between requests, and this project already runs on Supabase for
// its Postgres database. Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'site-images';

let client; // undefined = not checked yet, false = checked and unconfigured
function getClient() {
  if (client !== undefined) return client;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    client = false;
  } else {
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return client;
}

function isConfigured() {
  return !!getClient();
}

// Upload a file buffer under `${keyPrefix}/<random>.<ext>` and return its
// public URL. `keyPrefix` groups uploads by feature (e.g. "content/home",
// "categories") for easier browsing in the Supabase dashboard.
async function uploadImage(buffer, mimetype, keyPrefix) {
  const sb = getClient();
  if (!sb) {
    throw new Error('Image uploads aren\'t configured yet — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  const ext = (mimetype.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '');
  const objectPath = `${keyPrefix}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(objectPath, buffer, {
    contentType: mimetype,
    upsert: true,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  const { data } = sb.storage.from(BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

module.exports = { uploadImage, isConfigured, BUCKET };
