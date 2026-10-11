// Shipping fee from Sariee's 2026 rate card (sariee/shipping prices.pdf): door-to-door, EGP, VAT included.
// The fee is the first-2-kg price of the destination zone plus the zone's per-kg rate for every started kilo above 2.
// Zones are keyed by Sariee's state (governorate) names, which is what the checkout city list is grouped by.
// A 1% cash-on-delivery fee (also from the rate card) is added on top for COD orders only.

const BASE_KG = 2;
const COD_PERCENT = 1;

// zone: [price of the first 2 kg, price per extra kg], in whole EGP
const RATES = {
  1: [80, 7],    // Cairo, Giza
  2: [85, 8],    // Alexandria
  3: [92, 10],   // Delta
  4: [97, 12],   // Canal
  5: [125, 12],  // Upper Egypt, Red Sea, Marsa Matrouh
  6: [160, 13],  // Sinai, New Valley
};

const ZONE_STATES = {
  1: ['Cairo', 'Giza'],
  2: ['Alexandria'],
  // The rate card lists only "Delta"; Qalyubia is assumed to belong to it (it is not under Cairo/Giza on the card).
  3: ['Beheira', 'Dakahlia', 'Damietta', 'Gharbia', 'Kafr el-Sheikh', 'Monufia', 'Qalyubia', 'Sharqia'],
  4: ['Port Said', 'Ismailia', 'Suez'],
  // Faiyum and Beni Suef are treated as Upper Egypt.
  5: ['Aswan', 'Asyut', 'Beni Suef', 'Faiyum', 'Luxor', 'Minya', 'Qena', 'Sohag', 'Red Sea', 'Matrouh'],
  6: ['North Sinai', 'South Sinai', 'New Valley'],
};

const ZONE_BY_STATE = new Map();
for (const [zone, states] of Object.entries(ZONE_STATES)) for (const s of states) ZONE_BY_STATE.set(s.toLowerCase(), Number(zone));

// A governorate that is not on the card is charged the dearest zone rather than undercharged, and logged.
function zoneFor(stateName) {
  const z = ZONE_BY_STATE.get(String(stateName || '').trim().toLowerCase());
  if (z) return z;
  console.warn('[shipping] no zone for state "%s", using zone 6', stateName);
  return 6;
}

// Total weight in kg of cart lines ({ qty, weight_kg }). Products with no weight in Sariee count as 0, so they fall in
// the first-2-kg price.
function cartWeightKg(items) {
  const kg = (items || []).reduce((sum, it) => sum + (Number(it.weight_kg) || 0) * (Number(it.qty) || 0), 0);
  return Math.round(kg * 1000) / 1000;
}

// -> { zone, cents } for a state and a total weight.
function quote(stateName, weightKg) {
  const zone = zoneFor(stateName);
  const [base, extra] = RATES[zone];
  const extraKg = Math.max(0, Math.ceil(Math.round((Number(weightKg) || 0) * 1000) / 1000 - BASE_KG));
  return { zone, cents: (base + extraKg * extra) * 100 };
}

// 1% of what the customer owes before this fee, rounded to the nearest piastre.
function codFeeCents(baseCents) {
  return Math.round(Math.max(0, baseCents) * COD_PERCENT / 100);
}

module.exports = { quote, zoneFor, cartWeightKg, codFeeCents, COD_PERCENT };
