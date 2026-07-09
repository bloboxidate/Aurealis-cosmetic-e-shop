# Sariee Storefront API — Integration Guide

A practical, battle-tested guide to integrating the **Sariee** e-commerce backend
(`https://api.sariee.com`) into any website/backend. Everything marked **✅ verified**
was tested live against a real store (`aurealis.sariee.shop`) on 2026-07-09. Items marked
**⚠️ from-code** were taken from a working integration but not re-verified live.

> **Golden rule:** Call Sariee **only from your server** (never the browser). The store is
> resolved by an `x-domain` header; any server-side bearer/company token must never reach the client.

---

## 1. Base configuration

| Setting | Value |
|---|---|
| Base URL | `https://api.sariee.com` |
| Store selector | Header `x-domain: <your-store>.sariee.shop` (e.g. `aurealis.sariee.shop`) |
| Language | Header `x-locale: en` or `ar` |
| Content type | `Content-Type: application/json`, `Accept: application/json` |

### Two API surfaces
- **Frontend / storefront** — paths under `/api/frontend/*`. Resolved by the `x-domain`
  header. **No bearer token required.** This is what a customer-facing site uses.
- **Company / admin** — paths under `/api/company/*`. Require an `Authorization: Bearer <token>`
  (a company/admin token). Only needed for back-office features (e.g. reading all orders).

The backend is **Laravel** (validation returns HTTP 422 with a `data` map of field→message;
crashes return 500/412 with a PHP-style message — never show these to customers).

---

## 2. Authentication model

### Customer auth (storefront)
`POST /api/frontend/login` with `{ email, password }`. On success returns the customer
record **and** a customer `access_token` (a Sanctum token) you can use as
`Authorization: Bearer <access_token>` for customer-scoped calls (profile, orders).

### Store/company auth
For `/api/company/*` endpoints, supply a company bearer token. In the reference integration
this was either a static `SARIEE_API_BEARER_TOKEN` env var, or an auto-login flow
(company email/password → token, cached, re-login on 401).

### Guest checkout
The whole cart→checkout flow below works **without any login** — carts are keyed by a
client-generated `X-Cart-Token` header (see §4). Login is only needed for
account/order-history features.

---

## 3. Endpoint reference (verified examples)

All requests include these headers (omitted below for brevity):
```
x-domain: aurealis.sariee.shop
x-locale: en
Content-Type: application/json
Accept: application/json
```

### 3.1 Register — ✅ verified
```
POST /api/frontend/register
{
  "first_name": "Fix", "last_name": "Test",
  "email": "user@example.com", "phone": "1000000009",
  "password": "TestPass1234", "password_confirm": "TestPass1234"
}
→ 200 { "status": true, "message": "success", ... }
```

### 3.2 Login — ✅ verified
```
POST /api/frontend/login
{ "email": "user@example.com", "password": "TestPass1234" }
→ 200 {
  "status": true, "message": "success",
  "data": {
    "user": { "id": "...", "company_id": "a1b14c43-...", "email": "...", ... },
    "access_token": "107596|IR_BETAF9h9...",   // use as Bearer for customer calls
    "token": { "expires_at": "2026-08-08T...", ... }
  }
}
```
> **Gotcha (see §6.1):** `412 "Attempt to read property company_id on null"` means the
> account exists but is **not linked to the store resolved by `x-domain`** — not a server bug.

### 3.3 List products (to get a barcode id) — ✅ verified
```
GET /api/frontend/products/list-all?is_single=1&per_page=5
→ 200 { "data": [ { "id": "...", "barcodes": [ { "id": "a235b6b2-..." } ], ... } ] }
```
> Sariee identifies a purchasable variant by its **barcode id** (`barcodes[].id`),
> NOT the product id. You add items to the cart by barcode id.

### 3.4 Cart init — ✅ verified
```
POST /api/frontend/cart/init      (header: X-Cart-Token: <token>)
{}
→ 200 { "data": { "id": "<cart-id>", "items": [], "calculations": {...} } }
```

### 3.5 Add / update item — ✅ verified
```
POST /api/frontend/cart/add-update   (header: X-Cart-Token: <token>)
{ "product_barcode_id": "a235b6b2-...", "quantity": 1 }
→ 200 { "message": "Item Added To Cart",
        "data": { "id": "<same-cart-id>", "calculations": { "count_items": 1 } } }
```

### 3.6 Set shipping city — ⚠️ from-code
```
PUT /api/frontend/cart/state      (header: X-Cart-Token: <token>)
{ "city_id": "9b930aad-..." }
```

### 3.7 Apply promo code — ⚠️ from-code
```
POST /api/frontend/cart/promocode   (header: X-Cart-Token: <token>)
{ "promocode": "SUMMER10" }
→ data.discount (number) on success; non-2xx = invalid
```

### 3.8 Available payment methods — ✅ verified
```
POST /api/frontend/checkout/avail-methods   (header: X-Cart-Token: <token>)
{}
→ 200 { "data": { "methods": {
    "offline": [ { "paymentId": 0, "name_en": "Cash On Delivery", "name_ar": "..." } ],
    "online":  [ ]
} } }
```
> Methods are **grouped** (`offline[]` / `online[]`). Flatten them; each has a `paymentId`
> you pass as `payment_id` at checkout. Cash on Delivery is `paymentId: 0`.

### 3.9 Checkout — ✅ verified  ← **the one everybody gets wrong**
```
POST /api/frontend/checkout/checkout-action   (header: X-Cart-Token: <token>)
{
  "payment_id": 0,
  "details": {
    "customer": {
      "first_name": "Test",
      "last_name":  "Buyer",
      "mobile":     "1000000001",     // NOTE: "mobile", NOT "phone"
      "email":      "buyer@example.com"
    },
    "address": {
      "street":   "12 Nasr Road, Apt 4",
      "building": "5",                 // REQUIRED whenever customer is present
      "city_id":  "9b930aad-..."       // city_id lives INSIDE address
    }
  }
}
→ 200 { "status": true, "message": "success",
        "data": { "order_id": "a2378841-...", "discount": 0, "total": 500 } }
```

**The `details` object is strict:**
- Must have **nested** `customer` and `address` objects (not flat fields).
- Customer phone field is **`mobile`**, not `phone`.
- `address` is an **object**, not an array.
- `address.building` is **required** — omit/empty ⇒ `422
  {"details.address.building":"The details.address.building field is required when details.customer is present."}`
- `city_id` goes **inside `address`**, not at the top of `details`.

If you send the wrong shape you get the misleading crash
`500 "Undefined array key \"details\""` — it is a payload-shape problem, not a server bug.

### 3.10 Fetch an order — ⚠️ from-code (endpoints tried in order)
```
GET /api/frontend/single-order?order_id=<ref>
GET /api/frontend/single-order?id=<ref>
GET /api/frontend/order-tracking?order_id=<ref>
GET /api/company/builder/profile/orders        (needs company bearer)
GET /api/frontend/profile/orders               (needs customer bearer / session)
```

---

## 4. Cart token model (critical)

Sariee's storefront cart is identified by a **client-generated** `X-Cart-Token` header —
a random 32-byte value the *storefront JS* creates (`crypto.getRandomValues`) and keeps in a
7-day cookie. You generate one per checkout session and send it on **every** cart call
(`init`, `add-update`, `state`, `promocode`, `avail-methods`, `checkout-action`).

```js
// server-side token generator
function generateCartToken() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}
```

**✅ verified:** with the same `X-Cart-Token`, `init` and `add-update` return the **same
cart id** and the item persists — the server binds one stable cart to your token.

**⚠️ verified pitfall:** relying on the server's `sariee_session` **cookie** instead of an
explicit `X-Cart-Token` does **not** keep a stable cart across calls (each request produced a
different cart id in testing). **Always send your own `X-Cart-Token`.** Do not depend on cookies.

---

## 5. Recommended request sequence (guest checkout)

```
1. token = generateCartToken()
2. POST /cart/init            (X-Cart-Token: token)              → cart created
3. for each line:
     POST /cart/add-update    (X-Cart-Token: token) {barcode,qty}
4. (optional) PUT /cart/state (X-Cart-Token: token) {city_id}
5. (optional) POST /cart/promocode (X-Cart-Token: token) {promocode}
6. POST /checkout/avail-methods (X-Cart-Token: token)           → pick payment_id
7. POST /checkout/checkout-action (X-Cart-Token: token) {payment_id, details:{customer,address}}
     → data.order_id
```

**Trust the catalog, not the client:** resolve each `product_barcode_id` and price from
Sariee's own product API server-side. Never let the browser dictate barcode ids, prices, or amounts.

---

## 6. Gotchas we actually hit (save yourself the debugging)

### 6.1 Login `412 "... company_id on null"`
Not a server bug. The account is not linked to the company that `x-domain` resolves to
(e.g. it was created against a different store). A freshly registered account on the *same*
`x-domain` logs in fine (✅ verified: returns `company_id` + `access_token`). In your UI,
**map any 412 / 5xx / PHP-looking message to a generic "login unavailable" error** — never
surface Sariee's raw internal text to customers.

### 6.2 Checkout `500 "Undefined array key details"`
Payload shape, not a server bug. Use the exact nested `details.customer` / `details.address`
structure in §3.9. The fix that resolved it: `phone`→`mobile`, address-array→address-object,
add required `building`, move `city_id` inside `address`.

### 6.3 `building` is mandatory
If your form only has one address line, map it to `street` and send a non-empty placeholder
for `building` (e.g. `"-"`), or add a dedicated "Building / apartment" field to capture it properly.

### 6.4 Locations are hierarchical
Governorate/**state** first, then its **cities**. Fetch states, then cities for the selected
state; the `city_id` you send at checkout is a **city**, not a state.

### 6.5 Real orders
`checkout-action` creates a **real order** every time it returns 200. Guard test runs and
clean up test orders.

---

## 7. Security checklist
- [ ] All Sariee calls happen **server-side** (API routes / backend), never from the browser.
- [ ] Server/company bearer token stored in env, never shipped to the client.
- [ ] Cap request body size and validate input (schema) before calling Sariee.
- [ ] Re-resolve product barcode ids + prices from Sariee server-side; ignore client amounts.
- [ ] Map upstream 4xx/5xx to safe, generic customer-facing messages (no raw PHP errors).
- [ ] Set `Cache-Control: no-store` on auth/checkout responses.
- [ ] On customer login, store the returned `access_token`/session in an **httpOnly**, secure cookie.

---

## 8. Copy-paste prompt for an AI coding agent

> Paste this into your new project's AI agent (adjust stack as needed).

```
You are integrating the Sariee storefront API into <MY NEW SITE / STACK, e.g. "a Remix app"
/ "an Express + React backend">.

Base URL: https://api.sariee.com
Store is selected by header `x-domain: <MY-STORE>.sariee.shop`; language by `x-locale: en|ar`.
All frontend endpoints are under /api/frontend/* and need NO bearer — they are resolved by
x-domain. Call Sariee ONLY from the server; never expose tokens to the browser.

Implement a guest checkout flow with these server-side steps, all sharing ONE client-generated
`X-Cart-Token` header (random 32-byte hex, generated per checkout):
1. POST /api/frontend/cart/init  {}                      (X-Cart-Token)
2. POST /api/frontend/cart/add-update {product_barcode_id, quantity}  (X-Cart-Token) — repeat per line
3. optional PUT /api/frontend/cart/state {city_id}       (X-Cart-Token)
4. optional POST /api/frontend/cart/promocode {promocode}(X-Cart-Token)
5. POST /api/frontend/checkout/avail-methods {}          (X-Cart-Token) — pick a paymentId
6. POST /api/frontend/checkout/checkout-action           (X-Cart-Token) with EXACTLY:
   {
     "payment_id": <paymentId, 0 = Cash on Delivery>,
     "details": {
       "customer": { "first_name": "...", "last_name": "...", "mobile": "...", "email": "..." },
       "address":  { "street": "...", "building": "...", "city_id": "..." }
     }
   }
   Response: data.order_id on success.

STRICT REQUIREMENTS / known gotchas:
- details.customer uses "mobile" (NOT "phone").
- details.address is an OBJECT (NOT an array); city_id lives inside address.
- address.building is REQUIRED (422 if missing); if the form has one address line, put it in
  "street" and default building to "-".
- Wrong details shape => misleading 500 "Undefined array key details" (it's a payload bug).
- Resolve product_barcode_id and prices from GET /api/frontend/products/list-all server-side
  (barcodes[].id is the purchasable variant id). Never trust client-supplied amounts.
- Login: POST /api/frontend/login {email,password} -> data.access_token (Sanctum) + data.user.
  A 412 "company_id on null" means the account isn't linked to this x-domain store, not a bug;
  map any 412/5xx/PHP-looking upstream message to a generic error and store the returned token
  in an httpOnly secure cookie.
- Locations are hierarchical: fetch states, then cities for the chosen state; checkout wants a city_id.

Add input validation, body-size limits, no-store cache headers on auth/checkout, and never leak
Sariee's raw error text to end users.
```

---

*Compiled 2026-07-09 from live testing against `aurealis.sariee.shop` and a working
Next.js reference integration.*
