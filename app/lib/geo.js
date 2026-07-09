// Geo helper for checkout — Sariee models addresses as country → state → city,
// and the checkout requires a concrete city_id. We build a cached list of the
// default country's cities grouped by state so the checkout form can offer one
// city <select> (grouped by governorate) that yields a valid city_id.

const sariee = require('./sariee');

const TTL_MS = Number(process.env.GEO_CACHE_MS || 60 * 60 * 1000); // 1h
const DEFAULT_COUNTRY = process.env.SARIEE_DEFAULT_COUNTRY || 'Egypt';

let cache = null; // { at, country, states: [{ id, name, cities: [{id,name}] }] }

async function build() {
  const countriesRes = await sariee.helpers.countries({});
  const countries = (countriesRes.data && countriesRes.data.data) || [];
  const country = countries.find((c) => (c.name || '').toLowerCase() === DEFAULT_COUNTRY.toLowerCase())
    || countries[0];
  if (!country) return { country: null, states: [] };

  const statesRes = await sariee.helpers.states({ country_id: country.id });
  const states = (statesRes.data && statesRes.data.data) || [];

  // Fetch each state's cities in parallel.
  const withCities = await Promise.all(states.map(async (st) => {
    let cities = [];
    try {
      const r = await sariee.helpers.cities({ state_id: st.id });
      cities = (r.data && r.data.data) || [];
    } catch (_) { /* leave empty */ }
    return { id: st.id, name: st.name, cities: cities.map((c) => ({ id: c.id, name: c.name })) };
  }));

  return {
    country: { id: country.id, name: country.name },
    states: withCities.filter((s) => s.cities.length),
  };
}

// Grouped city list for the default country, cached.
async function cityGroups() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const value = await build();
  cache = { at: Date.now(), value };
  return value;
}

// Validate a city_id belongs to the known set (defensive).
async function isValidCity(cityId) {
  const g = await cityGroups();
  return g.states.some((s) => s.cities.some((c) => c.id === cityId));
}

function invalidate() { cache = null; }

module.exports = { cityGroups, isValidCity, invalidate, DEFAULT_COUNTRY };
