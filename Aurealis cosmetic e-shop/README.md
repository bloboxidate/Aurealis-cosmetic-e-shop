# Auréalis — cosmetic e-shop

Aurora-inspired skincare and makeup. This repo holds the **design mockups** the
brand started from and the **working storefront** built from them, which sells
through the [Sariee](https://sariee.com) commerce platform.

Live at **www.auréalis.com** (Vercel).

## What's in here

| Path | What it is |
|---|---|
| [`app/`](app/) | **The real store** — Node.js + Express + EJS, Sariee-backed catalog/cart/checkout, Postgres for accounts and site settings, a site-admin panel. Start with [`app/README.md`](app/README.md); deployment in [`app/DEPLOY.md`](app/DEPLOY.md). |
| [`sariee/`](sariee/) | Sariee API knowledge: the [integration guide](sariee/sariee-integration-guide.md) (verified request shapes and gotchas) plus the Postman collections it came from, including the cart-bug debugging trail. |
| `*.dc.html` (`Home`, `Shop`, `Product`, `Cart`, `Checkout`, `Login`, `Signup`, `About`, `Aurealis Homepage Options`) | The original static **design mockups**. Open them in a browser. They are reference only and are not served by the app. |
| `support.js`, `image-slot.js` | Runtime scripts the mockups load (a generated design-canvas runtime and a drag-and-drop image placeholder). Not part of the store. Don't edit `support.js` — it's generated. |
| `assets/`, `uploads/`, `screenshots/`, `apple-icon.png`, `.thumbnail` | Brand and design source material: logos, moodboard, PDF page captures, a screenshot. The app's own copies of the logo and favicons are in `app/public/assets/`. |

The brand palette comes from the northern lights — sage, azure, lavender, honey
and apricot — with Cormorant Garamond (headings) and Manrope (body).

## Quick start

```bash
cd app
npm install
cp .env.example .env    # fill in SESSION_SECRET and the SARIEE_* store settings
npm run seed            # schema + first admin (no products — the catalog is in Sariee)
npm start               # http://localhost:3000
```

> **Checkout creates real Sariee orders**, even from localhost. See
> [`app/README.md`](app/README.md) before testing the purchase flow.

## How it fits together

```
 Browser ──► Express app (app/) ──► Sariee API   products · cart · promo codes · orders · geo
                  │
                  └──► Postgres / SQLite          accounts · categories · product overlay · page content
                  └──► Supabase Storage           admin-uploaded images
```

Sariee is the source of truth for everything commerce-related; the app's own
database only holds what Sariee can't — customer accounts, how the catalog is
*presented* (categories, ordering, featured/hidden flags), editable page copy,
wishlists and reviews.

## Working on this repo

- `main` is deployed. Feature work has gone through short-lived branches and PRs.
- `CLAUDE.md` lists the non-obvious traps for anyone (human or AI) changing the code.
- There is no automated test suite; verify changes by running the app.
