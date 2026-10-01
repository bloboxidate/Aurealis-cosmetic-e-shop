// Editable site content (table: site_content). Each page's content is a JSON
// blob stored under a key. Views read via get(key) which merges saved values
// over the defaults below, so pages render sensible copy before anything is
// edited and only overridden fields change.
const db = require('../db/database');
const ttl = require('./ttl'); // short in-memory read cache; writes below bust it

// Default copy — mirrors what the templates historically hard-coded, so the
// storefront looks identical until an admin edits it.
const DEFAULTS = {
  home: {
    hero_eyebrow: 'Inspired by the Northern Lights',
    hero_title: 'Born of the aurora.',
    hero_text: 'Skincare and makeup formulated around the colors of the aurora borealis — glow that shifts like light across the sky.',
    hero_cta: 'Shop the Collection',
    hero_image: '',
    bestsellers_title: 'Bestsellers',
    bestsellers_text: 'Our most-loved essentials.',
  },
  about: {
    eyebrow: 'Our Story',
    title: "Light doesn't have one color. Neither does your glow.",
    body: 'Auréalis began on a winter night beneath the aurora borealis — watching color move across the sky in a way no single pigment could hold. We wanted skincare and makeup that felt like that: alive, shifting, never flat.\n\nEvery formula is built around clean, skin-loving ingredients and a palette drawn directly from the northern lights — sage, azure, lavender, honey, and apricot glow, woven through everything we make.',
    image: '',
  },
  shop: {
    title: 'All Products',
    intro: '',
  },
  // Policy pages. Draft wording — the store owner should review and edit these
  // in /admin/content. Body supports the light formatting in lib/richtext.js.
  shipping: {
    title: 'Shipping Policy',
    intro: 'How your Auréalis order gets to you.',
    body: '## Where we deliver\nWe currently deliver within Egypt. You choose your governorate and city at checkout.\n\n## Delivery fees and times\nThe shipping fee for your order is calculated and shown at checkout before you place it. We will contact you on the mobile number you provide if we need to arrange delivery.\n\n## Payment on delivery\nOrders are paid in cash when they arrive (Cash on Delivery). Please have the amount ready for the courier.\n\n## Tracking and changes\nAfter you order you can see its status in your account. If you need to change your address or contact details, reach us as soon as possible through the [Contact page](/contact).',
  },
  refund: {
    title: 'Refund Policy',
    intro: 'Our promise if something isn’t right.',
    body: '## Our promise\nWe want you to love what you receive. If something isn’t right, get in touch and we will help.\n\n## If your order arrives damaged or incorrect\nContact us through the [Contact page](/contact) with your order number and a photo of the item, and we will arrange a replacement or refund.\n\n## How to request a refund\n- Contact us with your order number and the reason.\n- We will confirm whether the item is eligible and explain the next steps.\n- Approved refunds are returned using the same method the order was paid with, or as agreed with you.\n\n## Cancelling an order\nYou can ask us to cancel from your account page. Orders that have already shipped may not be cancellable.',
  },
  contact: {
    title: 'Contact Us',
    intro: 'Questions about an order, a product or anything else? We’d love to hear from you.',
    email: '',   // blank = use the footer email
    phone: '',   // blank = use the footer phone
    hours: '',
    address: '',
    extra: '',
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

module.exports = ttl.wrap({ get, getMany, set, defaults, DEFAULTS }, 'content', ['get'], ['set']);
