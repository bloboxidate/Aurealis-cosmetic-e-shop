// What the admin may save for each content key, and how each field is cleaned.
// The content table stores whatever it is given, so every admin write goes through clean() first:
// unknown fields are dropped, text is trimmed and capped, links are limited to safe schemes,
// switches become real booleans, and "required" copy that is left blank falls back to its default
// (a blank headline would otherwise replace the default and leave a hole in the page).
const content = require('./content');

// type: text (one line) | area (several lines) | rich (light markup, see richtext.js) | url | bool
const text = (max, req) => ({ type: 'text', max, req: !!req });
const area = (max, req) => ({ type: 'area', max, req: !!req });
const rich = (max) => ({ type: 'rich', max });
const url = (max) => ({ type: 'url', max });
const bool = () => ({ type: 'bool' });

const SCHEMA = {
  home: {
    hero_eyebrow: text(120, true), hero_title: text(120, true), hero_text: area(320, true), hero_cta: text(40, true),
    bestsellers_title: text(60, true), bestsellers_text: text(120),
    show_strip: bool(), show_bestsellers: bool(), show_aurora: bool(), show_collections: bool(),
    show_story: bool(), show_ritual: bool(), show_voices: bool(),
    aurora_eyebrow: text(60, true), aurora_line1: text(90, true), aurora_line2: text(60, true), aurora_line3: text(90, true), aurora_link: text(60, true),
    story_quote: area(420, true), story_link: text(40, true),
    ritual_eyebrow: text(40, true), ritual_title: text(100, true),
  },
  site: { intro_enabled: bool(), intro_tagline: text(60, true), sound_default: bool(), hero_video_enabled: bool() },
  announcement: { enabled: bool(), text: text(160), link_label: text(40), link_url: url(300) },
  about: { eyebrow: text(80), title: text(160), body: rich(8000) },
  shop: { title: text(100), intro: rich(1000) },
  shipping: { title: text(100), intro: rich(1000), body: rich(10000) },
  refund: { title: text(100), intro: rich(1000), body: rich(10000) },
  contact: { title: text(100), intro: rich(1500), email: text(120), phone: text(40), hours: area(400), address: area(400), extra: rich(3000) },
  footer: { tagline: area(240), email: text(120), phone: text(40), instagram: url(300), tiktok: url(300), copyright: text(120) },
};

// Fields the image-upload routes own; "reset to defaults" must never blank these.
const IMAGE_FIELDS = { home: ['hero_image'], about: ['image'] };

const SAFE_URL = /^(https?:\/\/|\/(?!\/)|mailto:|tel:|#)/i;

function cleanValue(spec, raw, fallback) {
  if (spec.type === 'bool') {
    const v = Array.isArray(raw) ? raw[raw.length - 1] : raw; // hidden "0" first, checkbox "1" last
    return v === '1' || v === 1 || v === true || v === 'true' || v === 'on';
  }
  let s = Array.isArray(raw) ? raw[raw.length - 1] : raw;
  s = String(s == null ? '' : s).replace(/\r\n?/g, '\n');
  s = spec.type === 'text' || spec.type === 'url' ? s.replace(/\s*\n\s*/g, ' ').trim() : s.trim();
  if (spec.max && s.length > spec.max) s = s.slice(0, spec.max);
  if (spec.type === 'url' && s && !SAFE_URL.test(s)) s = ''; // no javascript:, data:, etc.
  if (spec.req && !s) s = fallback;
  return s;
}

// -> { patch, rejected } for the fields of `key` present in `body`.
function clean(key, body) {
  const fields = SCHEMA[key];
  const patch = {};
  if (!fields) return { patch, known: false };
  const defs = content.defaults(key);
  for (const name of Object.keys(fields)) {
    if (!(name in body)) continue;
    patch[name] = cleanValue(fields[name], body[name], defs[name]);
  }
  return { patch, known: true };
}

// The page's editable defaults without its image fields, for "reset to defaults".
function resetPatch(key) {
  const defs = content.defaults(key);
  const skip = new Set(IMAGE_FIELDS[key] || []);
  const patch = {};
  for (const name of Object.keys(SCHEMA[key] || {})) if (!skip.has(name) && name in defs) patch[name] = defs[name];
  return patch;
}

module.exports = { SCHEMA, clean, resetPatch, SAFE_URL };
