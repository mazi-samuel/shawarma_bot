# Shawarma Bot

A multi-tenant WhatsApp ordering bot platform for shawarma & pastry vendors. Any number of
independent vendors can sign up, get their own WhatsApp ordering flow, take payments, and manage
orders from their own admin dashboard — all on one deployment.

- **WhatsApp**: Meta WhatsApp Cloud API (official), one shared platform Meta App, vendors added as
  phone numbers under it
- **Payments**: Paystack — each vendor uses their **own** Paystack account, so their money settles
  to their own bank account
- **Stack**: Next.js (App Router, TypeScript) + Drizzle ORM + Postgres, deployed on Vercel

## How it works

1. A vendor signs up at `/onboard` (business name, admin password, currency) → gets a unique slug,
   a starter menu + FAQ set, and their own admin dashboard at `/admin/<slug>`.
2. From `/admin/<slug>/settings`, the vendor plugs in their own WhatsApp Phone Number ID + access
   token (added under the platform's shared Meta App) and their own Paystack secret key. Until
   those are set, the bot works in demo mode (see below) but can't send real WhatsApp messages or
   take real payments.
3. Customer messages that vendor's WhatsApp number → sees a main menu (Order / Track / FAQ / Talk
   to someone). **Routing to the right vendor happens automatically** per-message via the
   `phone_number_id` Meta includes in every webhook payload — one shared webhook URL serves every
   vendor.
4. Ordering: category list → item list (price + prep time shown) → quantity → cart review with
   total and estimated prep time → checkout.
5. Checkout creates an order and sends back a Paystack payment link, generated with that vendor's
   own secret key.
6. Each vendor configures their **own unique webhook URL** in their **own** Paystack dashboard
   (shown on their Settings page) — `/api/webhook/paystack/<slug>` — since Paystack payloads don't
   carry an account identifier, the URL path is what routes it, and the signature is verified
   against that vendor's own key.
7. When Paystack confirms payment, the customer gets a confirmation + ETA, and that vendor's own
   notification number gets pinged with the order details.
8. The vendor marks the order **Preparing** → **Ready** → **Completed** from their dashboard; each
   transition messages the customer automatically. "Ready" is vendor-triggered, not a timer, since
   only the vendor knows when the food is actually done.
9. FAQ answers come from a small keyword-matched table per vendor, editable from
   `/admin/<slug>/faqs`.

## Multi-tenancy model (why it's built this way)

- **One shared Meta App for the whole platform.** WhatsApp app-level secrets
  (`WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`) are platform env vars, not per-vendor — every
  vendor's number gets added as a phone number under this one app (the same model WhatsApp BSPs
  like Twilio/360dialog/Wati use). What's per-vendor is each vendor's own `phone_number_id` +
  access token, stored in the `vendors` table and used to route and send.
- **Each vendor brings their own Paystack account.** So their money goes to their own bank, not
  a shared pool. That's why the Paystack webhook URL is per-vendor
  (`/api/webhook/paystack/<slug>`) rather than shared.
- **Every table is vendor-scoped**: `menu_items`, `customers`, `orders`, `conversation_state`,
  `faqs` all carry a `vendor_id`. All admin API routes verify the logged-in session's vendor
  matches the vendor named in the URL before touching any data — one vendor can never read or
  modify another's orders, menu, or settings (verified in testing — see below).
- **Admin auth is a signed session cookie**, not shared Basic Auth — login at
  `/admin/<slug>/login` with that vendor's own password (bcrypt-hashed, set at signup, changeable
  from Settings).

## Demo mode

The seeded demo vendor (`demo-shawarma`) has **fake WhatsApp credentials** — the conversation
logic, ordering, cart math, admin dashboard, and multi-tenant routing all work fully, but it
cannot send/receive real WhatsApp messages or take a real payment until you swap in real
credentials from its Settings page. This is intentional: it lets you verify the entire platform
works before you've set up any real Meta/Paystack accounts.

- Admin login: `http://localhost:3000/admin/demo-shawarma/login`, password from `DEMO_ADMIN_PASSWORD`
  in `.env.local` (defaults to `demo1234`).
- Drive its conversation flow with the included simulator (see "Testing without real accounts"
  below) instead of a real phone.

## One-time setup for going to production

### 1. Database

Already running locally against a Docker Postgres container (see below). For production, use
Vercel Postgres or Neon — copy the connection string into `DATABASE_URL`.

### 2. Platform Meta App (one-time, not per-vendor)

1. Create a Meta App at [developers.facebook.com](https://developers.facebook.com/) → **My Apps →
   Create App → Business** type.
2. Add the **WhatsApp** product to the app.
3. Under **App Settings → Basic**, copy the **App Secret** into `WHATSAPP_APP_SECRET`.
4. Pick any random string for `WHATSAPP_VERIFY_TOKEN`.
5. Deploy this app first so you have a public URL.
6. Under **WhatsApp → Configuration → Webhook**, set:
   - Callback URL: `https://<your-deployment>/api/webhook/whatsapp`
   - Verify token: your `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to the **messages** field.
7. Complete Meta Business verification to lift the 5-test-recipient cap and unlock unlimited
   messaging.

### 3. Per-vendor setup (repeat for each new vendor — no code changes needed)

1. Vendor signs up at `/onboard`.
2. In the platform's Meta App, add the vendor's WhatsApp Business phone number (**WhatsApp → API
   Setup → Add phone number**) to get their `phone_number_id` and an access token (use a permanent
   System User token for production, not the 24h temporary one).
3. Vendor (or you, on their behalf) enters that phone_number_id + token in
   `/admin/<slug>/settings`.
4. Vendor creates their own Paystack account, grabs their **Secret Key** from
   **Settings → API Keys & Webhooks**, and enters it in `/admin/<slug>/settings`.
5. In that same Paystack dashboard page, vendor sets their **Webhook URL** to the one shown on
   their Settings page (`https://<your-deployment>/api/webhook/paystack/<slug>`).

That's the entire onboarding flow — genuinely no engineering work per new vendor.

## Local development

Everything below has been run and verified end-to-end tonight (see "What's been verified"), using
a local Docker Postgres and mock WhatsApp/Paystack servers in place of real accounts.

```bash
npm install

# Postgres via Docker (already running as `shawarma-postgres` on port 5433 if you're
# picking this up on the same machine — check with `docker ps`; if it's not running:)
docker run -d --name shawarma-postgres -e POSTGRES_PASSWORD=shawarma \
  -e POSTGRES_DB=shawarma_bot -p 5433:5432 postgres:16-alpine

cp .env.example .env.local   # already done — DATABASE_URL points at the container above
npm run db:generate          # generate SQL migrations from the schema (only after schema changes)
npm run db:migrate           # apply them
npm run db:seed              # create the demo-shawarma vendor + starter menu/FAQs
npm run dev
```

Visit `http://localhost:3000/onboard` to create a new vendor, or
`http://localhost:3000/admin/demo-shawarma/login` (password `demo1234`) for the seeded demo.

### Testing without real accounts

Two mock servers stand in for Meta/Paystack so the full conversation + payment flow can be
exercised without real credentials:

```bash
npm run mock:whatsapp   # logs every outbound WhatsApp message to the console, port 4001
npm run mock:paystack   # fakes /transaction/initialize and /transaction/verify, port 4002
```

Then uncomment `WHATSAPP_GRAPH_BASE_URL` and `PAYSTACK_BASE_URL` in `.env.local` (they redirect
outbound API calls to the mocks instead of the real APIs) and restart `npm run dev`.

Simulate an inbound WhatsApp message (signed exactly like Meta signs real webhooks):

```bash
WHATSAPP_APP_SECRET=demo_app_secret_not_real \
  ./scripts/simulate-whatsapp-message.sh 000000000000demo 2348011111111 "hi"
```

First argument is the vendor's `phone_number_id` (`000000000000demo` for the seeded demo vendor —
this is what routes the message to the right vendor), second is the fake customer's number, third
is what they typed (or an interactive reply id like `order`, `cat_shawarma`, `item_1`, `qty_2`,
`checkout`). Run it repeatedly with different text to walk through the whole ordering flow.

Simulate a Paystack payment confirmation:

```bash
REF="<the order_... reference from the checkout message the bot sent>"
BODY="{\"event\":\"charge.success\",\"data\":{\"reference\":\"$REF\",\"amount\":500000,\"status\":\"success\"}}"
SIG=$(echo -n "$BODY" | openssl dgst -sha512 -hmac "<vendor's paystackSecretKey>" | awk '{print $2}')
curl -X POST http://localhost:3000/api/webhook/paystack/<vendor-slug> \
  -H "Content-Type: application/json" -H "x-paystack-signature: $SIG" -d "$BODY"
```

### What's been verified tonight (against real local Postgres + mock APIs, not just typechecked)

- Full order lifecycle: menu browsing → cart → checkout → Paystack init → payment webhook → paid →
  preparing → ready, with the correct WhatsApp message sent to the customer at every step and to
  the vendor on new paid orders.
- Cart math (multi-quantity totals) and prep-time ETA (longest item in the cart, not the sum) are
  correct.
- FAQ keyword matching.
- Order tracking ("track my order").
- Cancel-order flow, both pre- and mid-cart.
- **Multi-tenant isolation**: two independently onboarded vendors, each with their own
  `phone_number_id`, route correctly and never see each other's menu, orders, or conversation
  state. Vendor A's login session gets a 401 against vendor B's admin API and vice versa.
- WhatsApp webhook: signature rejection on a bad signature, GET verify handshake (correct token
  accepted, wrong token rejected), and message-id deduplication (Meta's at-least-once retries
  don't double-process an order).
- Admin auth: login, wrong password rejected, password change, and old sessions correctly
  continuing to work after a password change (a known tradeoff of stateless sessions — see
  Known limitations).
- Self-service vendor signup end-to-end, including automatic slug collision handling.

**Not verified — needs your real accounts**: an actual WhatsApp message delivered to a real phone,
and an actual Paystack charge run through Paystack's real servers. The mock servers prove the
integration code is correct (right endpoints, right payload shapes, right signature schemes) but
can't prove Meta's or Paystack's production systems behave identically to the mocks.

## Deploying

```bash
vercel deploy
```

Set all the env vars from `.env.example` in the Vercel project settings, then run the DB migration
against the production database (`DATABASE_URL` pointed at prod, `npm run db:migrate`). Do **not**
set `WHATSAPP_GRAPH_BASE_URL` or `PAYSTACK_BASE_URL` in production — those exist purely for local
mock testing.

## Project structure

```
src/
  app/
    api/webhook/whatsapp/route.ts               Shared WhatsApp webhook (verify + receive, routes by phone_number_id)
    api/webhook/paystack/[vendorSlug]/route.ts  Per-vendor Paystack webhook
    api/vendors/route.ts                        Public vendor signup
    api/admin/[vendorSlug]/
      login/route.ts, logout/route.ts           Session cookie auth
      orders/, menu/, faqs/, settings/          Vendor-scoped CRUD (all session-guarded)
    admin/[vendorSlug]/
      login/page.tsx                            Login form (outside the auth-gated layout)
      (protected)/layout.tsx                    Redirects to login if session invalid
      (protected)/page.tsx, menu/, faqs/, settings/   Dashboard pages
    onboard/page.tsx                            Vendor self-signup
  lib/
    db/schema.ts                     Drizzle schema — vendors + everything scoped by vendor_id
    vendor/vendor.ts                 Vendor lookup/creation, password hashing
    auth/session.ts                  Signed session token (HMAC, stateless)
    auth/require-vendor.ts           Guards vendor-scoped API routes
    whatsapp/client.ts               Send text/list/button messages (takes creds as a param)
    whatsapp/webhook-handler.ts      Parse + verify inbound webhook payloads, extract phone_number_id
    paystack/client.ts               Initialize/verify transactions (takes vendor's key as a param)
    bot/state-machine.ts             Core conversation logic (vendor passed through every call)
    bot/menu-flow.ts, faq.ts, messages.ts, notify.ts
scripts/
  simulate-whatsapp-message.sh       Sends a correctly-signed fake webhook message
  mocks/mock-whatsapp-graph.js       Fake Graph API — logs outbound messages
  mocks/mock-paystack.js             Fake Paystack — fakes initialize/verify
seed/menu-seed.ts                    Creates the demo-shawarma vendor + starter menu/FAQs
```

## Known limitations / not built yet

- **Pickup only** — no delivery address flow.
- **No multi-language support.**
- **FAQ is keyword-matched, not a full NLU/LLM.** Swap `src/lib/bot/faq.ts` for an LLM-backed
  fallback if questions get more varied.
- **No discount codes / loyalty program.**
- **Sessions aren't invalidated on password change** — a stateless signed cookie stays valid until
  it expires (30 days) even after the password is changed. Fine for a solo-vendor admin login;
  would want a token-versioning column on `vendors` if that matters more.
- **No platform-operator dashboard** — no built-in way to see all vendors at a glance or
  deactivate one; that's currently a direct database operation.
- WhatsApp free-form (non-template) messages only work within the 24-hour customer service
  window. Every notification here follows a customer-initiated order, so this holds in practice —
  but proactive outreach (e.g. "we're back open!") outside that window needs a Meta-approved
  Message Template.
