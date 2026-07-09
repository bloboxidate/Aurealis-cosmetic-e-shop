// Sariee integration — public surface.
//
//   const sariee = require('./lib/sariee');
//
//   // Storefront (customer) — convenience wrappers with the corrected payloads:
//   await sariee.products.listAll({ is_single: 1, per_page: 12 });
//   await sariee.cart.init(cartToken);
//   await sariee.checkout.action(cartToken, { paymentId: 0, customer, address });
//
//   // Anything else in the docs (all 425 endpoints, incl. the admin portal):
//   await sariee.call('get-api-company-administration-users');   // bearer auto-added
//
// The convenience wrappers encode the request shapes we verified live in
// `sariee/sariee postman.json`; `call()` reaches every documented endpoint.

const crypto = require('crypto');
const client = require('./client');
const { call, request, config } = client;

// A per-session cart token. Sariee accepts an opaque token; we mint a long
// random one and let the caller persist it (e.g. in the Express session).
function newCartToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ---- Auth ---------------------------------------------------------------
const auth = {
  register: (body) => call('post-api-frontend-register', { body }),
  login: (body) => call('post-api-frontend-login', { body }),
  forgetPassword: (body) => call('post-api-frontend-forget-password', { body }),
  resetPassword: (body) => call('post-api-frontend-reset-password', { body }),
};

// ---- Products -----------------------------------------------------------
const products = {
  listAll: (query = {}) => call('get-api-frontend-products-list-all', { query }),
  single: (query = {}) => call('get-api-frontend-products-single-product', { query }),
  relatedFeatured: (query = {}) => call('get-api-frontend-products-related-featured', { query }),
  bestSelling: (query = {}) => call('get-api-frontend-products-best-selling', { query }),
  recommended: (query = {}) => call('get-api-frontend-products-recommended', { query }),
  filterData: (query = {}) => call('get-api-frontend-products-filter-data', { query }),
};

// ---- Categories ---------------------------------------------------------
const categories = {
  all: (query = {}) => call('get-api-frontend-categories-all-categories', { query }),
  single: (query = {}) => call('get-api-frontend-categories-single-category', { query }),
  singleProducts: (query = {}) => call('get-api-frontend-categories-single-category-products', { query }),
};

// ---- Collections --------------------------------------------------------
const collections = {
  all: (query = {}) => call('get-api-frontend-collection', { query }),
  featured: (query = {}) => call('get-api-frontend-collection-featured', { query }),
  search: (query = {}) => call('get-api-frontend-collection-search', { query }),
  products: (query = {}) => call('get-api-frontend-collection-products', { query }),
  single: (query = {}) => call('get-api-frontend-collection-single-collection', { query }),
  show: (query = {}) => call('get-api-frontend-show-collection', { query }),
};

// ---- Cart ---------------------------------------------------------------
// All cart calls need the X-Cart-Token header (proven in B2–B3 of the report).
const cart = {
  init: (cartToken, body = {}) =>
    call('post-api-frontend-cart-init', { cartToken, body }),
  addUpdate: (cartToken, { productBarcodeId, quantity = 1 } = {}) =>
    call('post-api-frontend-cart-add-update', {
      cartToken,
      body: { product_barcode_id: productBarcodeId, quantity },
    }),
  // Removal is keyed by the cart_item_id returned in the cart's items[].id
  // (not the product barcode id). Accepts either name.
  remove: (cartToken, { cartItemId, cart_item_id } = {}) =>
    call('post-api-frontend-cart-remove', {
      cartToken, body: { cart_item_id: cart_item_id ?? cartItemId },
    }),
  // The API field is `promocode` (not `code`).
  promocode: (cartToken, { code, promocode } = {}) =>
    call('post-api-frontend-cart-promocode', {
      cartToken, body: { promocode: promocode ?? code },
    }),
  state: (cartToken, body) =>
    call('put-api-frontend-cart-state', { cartToken, body }),
};

// ---- Checkout -----------------------------------------------------------
const checkout = {
  availMethods: (cartToken, body = {}) =>
    call('post-api-frontend-checkout-avail-methods', { cartToken, body }),

  // The payload shape we fixed in B5: details.customer uses `mobile` (not
  // phone) and details.address is an OBJECT { street, building, city_id }.
  action: (cartToken, { paymentId = 0, customer, address } = {}) =>
    call('post-api-frontend-checkout-checkout-action', {
      cartToken,
      body: {
        payment_id: paymentId,
        details: {
          customer: {
            first_name: customer.first_name,
            last_name: customer.last_name,
            mobile: customer.mobile ?? customer.phone,
            email: customer.email,
          },
          address: {
            street: address.street,
            building: address.building,
            city_id: address.city_id,
          },
        },
      },
    }),

  callback: (provider, query = {}) =>
    call('get-api-frontend-checkout-callback-provider', { params: { provider }, query }),
  return: (provider, query = {}) =>
    call('get-api-frontend-checkout-return-provider', { params: { provider }, query }),
};

// ---- Helpers (geo / currency) ------------------------------------------
const helpers = {
  countries: (query = {}) => call('get-api-frontend-helper-countries', { query }),
  states: (query = {}) => call('get-api-frontend-helper-state', { query }),
  cities: (query = {}) => call('get-api-frontend-helper-cities', { query }),
  providerCountries: (query = {}) => call('get-api-frontend-helper-provider-countries', { query }),
  providerStates: (query = {}) => call('get-api-frontend-helper-provider-state', { query }),
  providerCities: (query = {}) => call('get-api-frontend-helper-provider-cities', { query }),
  currencyRate: (query = {}) => call('get-api-frontend-helper-currency-rate', { query }),
};

// ---- Misc storefront ----------------------------------------------------
const store = {
  activeTheme: () => call('get-api-frontend-active-theme'),
  blogPosts: (query = {}) => call('get-api-frontend-blog-post', { query }),
  blogPost: (query = {}) => call('get-api-frontend-blog-post-show', { query }),
  orderTracking: (query = {}) => call('get-api-frontend-order-tracking', { query }),
  singleOrder: (query = {}) => call('get-api-frontend-single-order', { query }),
};

// ---- Admin / Company portal --------------------------------------------
// Every /api/company/* endpoint is reachable via `call(id, …)`; the bearer
// token (SARIEE_COMPANY_TOKEN, or per-call `token`) is injected automatically.
// `admin.list()` enumerates the available ids so callers can discover them.
const admin = {
  call: (id, opts = {}) => call(id, opts),
  list: () => client.listEndpoints('company'),
};

module.exports = {
  // config + low-level
  config,
  request,
  call,
  authenticate: client.authenticate,
  newCartToken,
  getEndpoint: client.getEndpoint,
  listEndpoints: client.listEndpoints,
  endpoints: client.endpoints,
  SarieeError: client.SarieeError,
  // storefront namespaces
  auth,
  products,
  categories,
  collections,
  cart,
  checkout,
  helpers,
  store,
  // admin
  admin,
};
