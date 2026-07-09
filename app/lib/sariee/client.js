// Sariee API client.
//
// Speaks to the live Sariee backend (api.sariee.com) for the store bound to
// aurealis.sariee.shop, using the request format we proved out in
// `sariee/sariee postman.json` after debugging the 412 / checkout issues:
//
//   * Every request carries the headers the docs omit:
//       x-domain:  <store domain>   ← without this the API 412s ("company_id on null")
//       x-locale:  <locale>
//       Referer:   <store url>
//       Accept:    application/json
//   * JSON requests add Content-Type: application/json and a JSON body.
//   * Cart / checkout calls carry an X-Cart-Token header.
//   * /api/company/* (admin portal) calls carry a Bearer token.
//
// Admin auth (two options, Option A preferred):
//   A) SARIEE_LOGIN_EMAIL + SARIEE_LOGIN_PASSWORD — the client logs in via
//      POST /api/company/auth/login, caches the rotating access_token in
//      memory, and re-logs-in when it nears expiry or a call returns 401.
//   B) SARIEE_API_BEARER_TOKEN — a static token used as-is.
//
// The endpoint catalogue in ./endpoints.json is generated verbatim from the
// official "Sariee API Documentation" Postman collection, so `call(id, ...)`
// can reach any of the 425 documented endpoints in the correct format.

// require() (not fs.readFileSync) so serverless bundlers (Vercel) trace and
// include endpoints.json — otherwise the function crashes on load.
const endpoints = require('./endpoints.json');
const byId = new Map(endpoints.map((e) => [e.id, e]));

// dotenv trims unquoted values, but trim defensively in case someone quotes.
const env = (k) => (process.env[k] || '').trim();

const domain = env('SARIEE_STORE_DOMAIN') || env('SARIEE_DOMAIN') || 'aurealis.sariee.shop';
const cfg = {
  baseUrl: (env('SARIEE_API_BASE_URL') || env('SARIEE_BASE_URL') || 'https://api.sariee.com').replace(/\/+$/, ''),
  domain,
  locale: env('SARIEE_LOCALE') || 'en',
  referer: env('SARIEE_REQUEST_REFERER') || `https://${domain}`,
  // Option B: static bearer for /api/company/*.
  staticToken: env('SARIEE_API_BEARER_TOKEN') || env('SARIEE_COMPANY_TOKEN') || '',
  // Option A: auto-login credentials.
  login: {
    email: env('SARIEE_LOGIN_EMAIL'),
    password: env('SARIEE_LOGIN_PASSWORD'),
  },
  timeoutMs: Number(env('SARIEE_TIMEOUT_MS') || 20000),
};

class SarieeError extends Error {
  constructor(message, { status, body, endpoint } = {}) {
    super(message);
    this.name = 'SarieeError';
    this.status = status;
    this.body = body;
    this.endpoint = endpoint;
  }
}

// Fill :placeholders in a path template from a params object.
function buildPath(template, params = {}) {
  return template.replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
    if (params[key] === undefined || params[key] === null) {
      throw new SarieeError(`Missing path param "${key}" for ${template}`, {});
    }
    return encodeURIComponent(String(params[key]));
  });
}

function buildQuery(query = {}) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) v.forEach((x) => usp.append(k, String(x)));
    else usp.append(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

// Low-level fetch with timeout + JSON parsing. Does not add auth — callers
// assemble headers. Used by both request() and the login flow.
async function doFetch(method, url, headers, payload, endpoint) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  let res;
  try {
    res = await fetch(url, { method, headers, body: payload, signal: ctrl.signal });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new SarieeError(`Request timed out after ${cfg.timeoutMs}ms: ${method} ${url}`, { endpoint });
    }
    throw new SarieeError(`Network error calling ${method} ${url}: ${err.message}`, { endpoint });
  }
  clearTimeout(timer);

  const text = await res.text();
  let data = text;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json') || (text && /^[\[{]/.test(text.trim()))) {
    try { data = JSON.parse(text); } catch (_) { /* keep raw text */ }
  }
  return { res, data };
}

// Storefront (/api/frontend/*) requests REQUIRE x-domain so the API can resolve
// the store. Company-portal (/api/company/*) requests must NOT send x-domain:
// with it, the API applies the storefront/customer auth guard and rejects a
// company-user bearer token as "UnAuthenticated" (403). So x-domain is opt-out.
function baseHeaders(extra = {}, { includeDomain = true } = {}) {
  const h = {
    'x-locale': cfg.locale,
    Referer: cfg.referer,
    Accept: 'application/json',
    ...extra,
  };
  if (includeDomain) h['x-domain'] = cfg.domain;
  return h;
}

// ---- Admin token management (Option A auto-login) -----------------------
const tokenCache = { token: '', expiresAt: 0 }; // expiresAt: epoch ms, 0 = unknown
let loginInFlight = null;

// Parse Sariee's `expires_at` (e.g. "2026-07-09 18:30:00", assumed UTC) into
// epoch ms. Returns 0 if unparseable, in which case we lean on 401-retry.
function parseExpiry(s) {
  if (!s || typeof s !== 'string') return 0;
  const iso = s.includes('T') ? s : s.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z');
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

async function login() {
  const { email, password } = cfg.login;
  if (!email || !password) {
    throw new SarieeError(
      'Sariee admin auth not configured: set SARIEE_LOGIN_EMAIL + SARIEE_LOGIN_PASSWORD (Option A) or SARIEE_API_BEARER_TOKEN (Option B).',
      {}
    );
  }
  const url = cfg.baseUrl + '/api/company/auth/login';
  const { res, data } = await doFetch(
    'POST', url,
    baseHeaders({ 'Content-Type': 'application/json' }, { includeDomain: false }),
    JSON.stringify({ email, password })
  );
  const accessToken = data && data.data && data.data.access_token;
  if (!res.ok || !accessToken) {
    const msg = (data && typeof data === 'object' && data.message) || `HTTP ${res.status}`;
    throw new SarieeError(`Sariee admin login failed: ${msg}`, { status: res.status, body: data });
  }
  tokenCache.token = accessToken;
  tokenCache.expiresAt = parseExpiry(data.data.token && data.data.token.expires_at);
  return accessToken;
}

// Resolve a bearer token for /api/company/* calls. Static token wins; else
// use the cached auto-login token, refreshing when missing/near-expiry.
async function getCompanyToken(force = false) {
  if (cfg.staticToken) return cfg.staticToken;

  const now = Date.now();
  const fresh = tokenCache.token &&
    (tokenCache.expiresAt === 0 || tokenCache.expiresAt - now > 60000);
  if (!force && fresh) return tokenCache.token;

  // Coalesce concurrent logins into one in-flight request.
  if (!loginInFlight) {
    loginInFlight = login().finally(() => { loginInFlight = null; });
  }
  return loginInFlight;
}

// Core request. Options:
//   method, path (already resolved), scope ('frontend'|'company'|'other'),
//   query, body, cartToken, token (override bearer), headers (extra)
async function request({ method = 'GET', path: reqPath, scope = 'frontend',
  query, body, cartToken, token, headers = {}, endpoint, _retried } = {}) {
  const url = cfg.baseUrl + reqPath + buildQuery(query);

  const h = baseHeaders(headers, { includeDomain: scope !== 'company' });

  let payload;
  if (body !== undefined && body !== null && method !== 'GET' && method !== 'HEAD') {
    h['Content-Type'] = 'application/json';
    payload = typeof body === 'string' ? body : JSON.stringify(body);
  }

  if (cartToken) h['X-Cart-Token'] = cartToken;

  // Admin portal endpoints authenticate with a bearer token.
  const usingAutoLogin = scope === 'company' && token === undefined && !cfg.staticToken;
  let bearer = '';
  if (token !== undefined) bearer = token;
  else if (scope === 'company') bearer = await getCompanyToken();
  if (bearer) h.Authorization = `Bearer ${bearer}`;

  const { res, data } = await doFetch(method, url, h, payload, endpoint);

  // Auto-login token expired mid-flight → refresh once and retry. Sariee
  // reports an invalid/expired company token as 401, or 403 "UnAuthenticated".
  const authExpired = res.status === 401 ||
    (res.status === 403 && data && typeof data === 'object' && /unauthenticated/i.test(data.message || ''));
  if (authExpired && usingAutoLogin && !_retried) {
    await getCompanyToken(true);
    return request({ method, path: reqPath, scope, query, body, cartToken, token, headers, endpoint, _retried: true });
  }

  if (!res.ok) {
    const msg = (data && typeof data === 'object' && (data.message || data.error))
      || `HTTP ${res.status}`;
    throw new SarieeError(`Sariee ${method} ${reqPath} failed: ${msg}`, {
      status: res.status, body: data, endpoint,
    });
  }
  return { status: res.status, data, headers: res.headers };
}

// Call any documented endpoint by its registry id.
//   call('get-api-frontend-products-list-all', { query: { is_single: 1, per_page: 5 } })
//   call('patch-api-company-administration-notifications-notification-id-read',
//        { params: { notification_id: '…' } })
async function call(id, opts = {}) {
  const ep = byId.get(id);
  if (!ep) throw new SarieeError(`Unknown Sariee endpoint id: "${id}"`, {});
  const resolvedPath = buildPath(ep.path, opts.params || {});
  return request({
    method: ep.method,
    path: resolvedPath,
    scope: ep.scope,
    query: opts.query,
    body: opts.body,
    cartToken: opts.cartToken,
    token: opts.token,
    headers: opts.headers,
    endpoint: ep,
  });
}

function getEndpoint(id) { return byId.get(id) || null; }
function listEndpoints(scope) {
  return scope ? endpoints.filter((e) => e.scope === scope) : endpoints.slice();
}

// Force a fresh admin login (e.g. on startup health-check). Returns the token.
function authenticate() { return getCompanyToken(true); }

module.exports = {
  config: cfg,
  SarieeError,
  request,
  call,
  authenticate,
  getEndpoint,
  listEndpoints,
  endpoints,
};
