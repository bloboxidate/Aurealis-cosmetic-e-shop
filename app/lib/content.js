// Editable site content (table: site_content). Each page's content is a JSON
// blob stored under a key. Views read via get(key) which merges saved values
// over the defaults below, so pages render sensible copy before anything is
// edited and only overridden fields change.
const db = require('../db/database');

// Default copy — mirrors what the templates historically hard-coded, so the
// storefront looks identical until an admin edits it.
const DEFAULTS = {
  home: {
    hero_eyebrow: 'Inspired by the Northern Lights',
    hero_title: 'Born of the aurora.',
    hero_text: 'Skincare and makeup formulated around the colors of the aurora borealis — glow that shifts like light across the sky.',
    hero_cta: 'Shop the Collection',
    bestsellers_title: 'Bestsellers',
    bestsellers_text: 'Our most-loved essentials.',
  },
  about: {
    eyebrow: 'Our Story',
    title: "Light doesn't have one color. Neither does your glow.",
    body: 'Auréalis began on a winter night beneath the aurora borealis — watching color move across the sky in a way no single pigment could hold. We wanted skincare and makeup that felt like that: alive, shifting, never flat.\n\nEvery formula is built around clean, skin-loving ingredients and a palette drawn directly from the northern lights — sage, azure, lavender, honey, and apricot glow, woven through everything we make.',
  },
  shop: {
    title: 'All Products',
    intro: '',
  },
  footer: {
    tagline: 'Beauty inspired by the northern lights — radiant, ever-shifting glow.',
    email: '',
    phone: '',
    instagram: '',
    tiktok: '',
    copyright: '© Auréalis. All rights reserved.',
  },
};

function defaults(key) {
  return { ...(DEFAULTS[key] || {}) };
}

async function get(key) {
  const row = await db.get('SELECT value FROM site_content WHERE key = ?', [key]);
  let saved = {};
  if (row && row.value) {
    try { saved = JSON.parse(row.value); } catch (_) { saved = {}; }
  }
  return { ...defaults(key), ...saved };
}

// Fetch several keys at once -> { key: content }.
async function getMany(keys) {
  const out = {};
  for (const k of keys) out[k] = await get(k);
  return out;
}

async function set(key, patch = {}) {
  const current = await get(key);
  const value = { ...current, ...patch };
  const json = JSON.stringify(value);
  const exists = await db.get('SELECT key FROM site_content WHERE key = ?', [key]);
  if (exists) {
    await db.run('UPDATE site_content SET value = ? WHERE key = ?', [json, key]);
  } else {
    await db.run('INSERT INTO site_content (key, value) VALUES (?, ?)', [key, json]);
  }
  return value;
}

module.exports = { get, getMany, set, defaults, DEFAULTS };
