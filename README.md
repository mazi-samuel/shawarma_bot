# Shawarma Bot

A multi-tenant WhatsApp ordering bot platform for shawarma & pastry vendors. **Everything happens
inside WhatsApp** — there is no website, no dashboard, no login form, for either customers or
vendors. Registering a business, managing its menu/FAQs, and updating order status are all done by
chatting with the bot, the same way ordering is.

- **WhatsApp**: Meta WhatsApp Cloud API (official), one shared platform Meta App
- **Payments**: Paystack — each vendor uses their **own** Paystack account
- **Stack**: Next.js (App Router, TypeScript) + Drizzle ORM + Postgres, deployed on Vercel — but
  the web server here only ever answers two webhook URLs and a placeholder "/". There's nothing to
  click.

## The three phone numbers involved

1. **The platform's own WhatsApp number** — handles new-vendor registration and the operator's
   linking commands. This is the one number the platform operator sets up themselves.
2. **Each vendor's own WhatsApp number** — once linked, this is what the vendor gives to their
   customers. Customers message it to order; the vendor's own registered phone messages the *same*
   number to manage it.
3. **The operator's personal phone** — not a WhatsApp Business number, just whoever runs the
   platform's own regular number, recognized by an env var.

There are no passwords anywhere in this system. A vendor's admin identity **is** their registered
phone number (`vendors.adminPhone`): any message sent to their live WhatsApp number from that exact
phone is treated as an admin command instead of a customer order (see
`src/lib/bot/state-machine.ts`, the `phone === vendor.adminPhone` check at the top of
`handleIncomingMessage`). That phone can never place a customer order on its own vendor — a known,
intentional tradeoff (test ordering needs a second phone/number).

## How it works end to end

1. A prospective vendor messages the **platform's** WhatsApp number. The bot asks for their
   business name and currency, entirely by chatting, and creates a vendor record — no WhatsApp
   number yet.
2. **The one unavoidable manual step**: WhatsApp/Meta has no message-based API for provisioning a
   new phone number — every WhatsApp bot platform (Twilio, 360dialog, Wati, this one) requires a
   human to add the number in Meta's own developer console. The platform operator gets notified
   automatically (also over WhatsApp) with the exact command to run once they've done that:
   ```
   link <slug> <phone_number_id> <token>
   ```
   Sent from the operator's own phone to the platform number. That's it — one command, and the
   vendor's number goes live. The vendor is notified automatically, from their own new number.
3. From then on, the vendor manages everything by messaging their own number (the one their
   customers now use) — type `menu` to get the admin menu: **Orders** (view + advance status),
   **Menu** (add/hide/delete items via a short guided chat), **FAQs** (add/delete), **Settings**
   (Paystack key, greeting message, currency).
4. Customers message that same number and see the ordinary ordering flow: category → item →
   quantity → cart review → checkout → Paystack payment link → paid → status updates as the vendor
   advances the order through their own chat.
5. Each vendor's Paystack webhook (`/api/webhook/paystack/<slug>` — shown to them from their
   Settings menu) confirms payment; the customer and the vendor's admin phone both get pinged.

## Multi-tenancy & security model

- **One shared Meta App for the whole platform.** `WHATSAPP_APP_SECRET`/`WHATSAPP_VERIFY_TOKEN`
  are platform env vars; every vendor's (and the platform's own) number lives under this one app.
  Routing an inbound message to the right handler happens per-message via the `phone_number_id`
  Meta includes in every webhook payload.
- **Each vendor brings their own Paystack account**, so their money settles to their own bank —
  that's why the Paystack webhook is per-vendor (`/api/webhook/paystack/<slug>`) rather than
  shared.
- **Every table is vendor-scoped** (`menu_items`, `customers`, `orders`, `conversation_state`,
  `faqs`), and admin actions are only ever executed against the vendor tied to the `phone_number_id`
  the message arrived on — verified in testing that one vendor's admin phone gets the ordinary
  *customer* flow when messaging a different vendor's number, never admin access (see below).

## One-time setup for going to production

### 1. Database
Vercel Postgres or Neon — copy the connection string into `DATABASE_URL`.

### 2. Platform Meta App + platform number (one-time)
1. Create a Meta App at [developers.facebook.com](https://developers.facebook.com/) → **My Apps →
   Create App → Business** type, add the **WhatsApp** product.
2. Under **App Settings → Basic**, copy the **App Secret** into `WHATSAPP_APP_SECRET`. Pick any
   random string for `WHATSAPP_VERIFY_TOKEN`.
3. Deploy this app so you have a public URL, then under **WhatsApp → Configuration → Webhook**,
   set the callback URL to `https://<your-deployment>/api/webhook/whatsapp`, verify token to your
   `WHATSAPP_VERIFY_TOKEN`, and subscribe to the **messages** field.
4. Under **WhatsApp → API Setup**, add a phone number for the platform itself (this is the number
   prospective vendors will message to register) — set `PLATFORM_PHONE_NUMBER_ID` and
   `PLATFORM_WHATSAPP_TOKEN` (use a permanent System User token for production).
5. Set `OPERATOR_PHONE_NUMBER` to your own WhatsApp number (digits only, no `+`).
6. Complete Meta Business verification to lift the 5-test-recipient cap.

### 3. Per-vendor setup (repeat for each new vendor — no code changes needed)
1. Vendor messages the platform number and registers (business name, currency).
2. You get notified automatically with the exact `link` command to send once you've added their
   number to the Meta App (**WhatsApp → API Setup → Add phone number**).
3. Send that command from your own phone to the platform number. Done — the vendor is live.
4. Vendor sets their own Paystack key from their admin **Settings** menu, and points their
   Paystack account's webhook at the URL shown there.

## Local development

```bash
npm install

docker run -d --name shawarma-postgres -e POSTGRES_PASSWORD=shawarma \
  -e POSTGRES_DB=shawarma_bot -p 5433:5432 postgres:16-alpine

cp .env.example .env.local
npm run db:generate
npm run db:migrate
npm run db:seed     # creates the demo-shawarma vendor + starter menu/FAQs
npm run dev
```

### Testing without real WhatsApp/Paystack accounts

Two mock servers stand in for Meta/Paystack, verified against a real local Postgres:

```bash
npm run mock:whatsapp   # logs every outbound WhatsApp message, port 4001
npm run mock:paystack   # fakes /transaction/initialize and /transaction/verify, port 4002
```

Uncomment `WHATSAPP_GRAPH_BASE_URL`/`PAYSTACK_BASE_URL` in `.env.local`, restart `npm run dev`,
then drive the whole system with the included simulator — it signs requests exactly like Meta does:

```bash
export WHATSAPP_APP_SECRET=demo_app_secret_not_real

# Register a new vendor from scratch, purely over WhatsApp:
./scripts/simulate-whatsapp-message.sh 000000000000platform 2348055555555 "hi"
./scripts/simulate-whatsapp-message.sh 000000000000platform 2348055555555 "My Business Name"
./scripts/simulate-whatsapp-message.sh 000000000000platform 2348055555555 "curr_NGN"

# As the operator, list vendors and link the new one (use real values from Meta in production):
./scripts/simulate-whatsapp-message.sh 000000000000platform 2348099999999 "vendors"
./scripts/simulate-whatsapp-message.sh 000000000000platform 2348099999999 "link my-business-name 111111111111demo demo-token"

# As the vendor's own admin phone, message their now-live number:
./scripts/simulate-whatsapp-message.sh 111111111111demo 2348055555555 "menu"

# As a customer, message the same number:
./scripts/simulate-whatsapp-message.sh 111111111111demo 2348066666666 "hi"
```

First argument is always the `phone_number_id` being messaged (this is what routes to the right
vendor, or to the platform flow); second is the sender's phone; third is what they typed or an
interactive reply id (`order`, `cat_shawarma`, `item_1`, `qty_2`, `checkout`, `menu_items`,
`add_item`, `orders`, `faqs`, `settings`, etc. — see `src/lib/bot/admin-flow.ts` and
`state-machine.ts` for the full id vocabulary). Give each call a distinct `[message_id]` 4th
argument if you're scripting a fast sequence — message IDs are deduplicated exactly like Meta's
real at-least-once delivery, so reusing one gets silently ignored.

For the demo vendor (seeded by `npm run db:seed`): `phone_number_id` is `000000000000demo`,
`adminPhone` is `VENDOR_PHONE_NUMBER` from `.env.local` (defaults to `2348000000001`).

### What's been verified (against a real local Postgres + mocks, not just typechecked)

- **Full vendor lifecycle purely over WhatsApp**: registration (business name → currency →
  account created) → operator notified automatically with the exact link command → operator links
  it → vendor notified from their own new number → vendor sets their Paystack key via chat → adds
  a menu item via a guided chat flow → adds an FAQ via chat.
- **Full order lifecycle** through that same freshly-registered vendor: a different phone orders
  the item the admin just added, checks out, pays (simulated Paystack webhook), vendor advances
  paid → preparing → ready from their own chat, customer gets the right message at every step.
- **Admin identity isolation**: the demo vendor's admin phone messaging a *different* vendor's
  number gets the ordinary customer flow, not admin access — confirmed directly, not assumed.
- Re-registering before being linked returns a status message instead of restarting the wizard.
- WhatsApp webhook signature rejection, GET verify handshake, and message-id deduplication.
- A concurrency caveat found and consciously left as-is (see Known limitations) rather than a
  logic bug — see the note below.

**Not verified — needs real accounts**: an actual message delivered to a real phone, and an actual
Paystack charge processed by Paystack's real servers. The mocks prove the integration code is
correct (right endpoints, right payload shapes, right signature schemes) but can't prove Meta's or
Paystack's production systems behave identically.

## Deploying

```bash
vercel deploy
```

Set every var from `.env.example` in the Vercel project settings, then run the DB migration
against production (`DATABASE_URL` pointed at prod, `npm run db:migrate`). Do **not** set
`WHATSAPP_GRAPH_BASE_URL` or `PAYSTACK_BASE_URL` in production — those exist purely for local mock
testing.

## Project structure

```
src/
  app/
    api/webhook/whatsapp/route.ts               Shared webhook — routes by phone_number_id to
                                                  either the platform flow or a vendor's flow
    api/webhook/paystack/[vendorSlug]/route.ts   Per-vendor Paystack webhook
    page.tsx                                     Static placeholder — not a functional UI
  lib/
    db/schema.ts              vendors (adminPhone-based identity) + everything vendor-scoped
    vendor/vendor.ts          Vendor lookup/creation, WhatsApp linking, settings updates
    bot/conversation.ts       Shared conversation-state helpers (used by both flows below)
    bot/state-machine.ts      Customer ordering flow; routes to admin-flow.ts by adminPhone match
    bot/admin-flow.ts         Vendor admin flow: orders, menu, FAQs, settings — all via chat
    bot/platform.ts           Vendor registration + operator "link"/"vendors" commands
    bot/menu-flow.ts, faq.ts, messages.ts, notify.ts
    whatsapp/client.ts        Send text/list/button messages (creds passed per-call)
    whatsapp/webhook-handler.ts   Parse + verify inbound payloads, extract phone_number_id
    paystack/client.ts        Initialize/verify transactions (vendor's own key passed per-call)
scripts/
  simulate-whatsapp-message.sh    Sends a correctly-signed fake webhook message
  mocks/mock-whatsapp-graph.js    Fake Graph API — logs outbound messages
  mocks/mock-paystack.js          Fake Paystack — fakes initialize/verify
seed/menu-seed.ts             Creates the demo-shawarma vendor + starter menu/FAQs
```

## Known limitations / not built yet

- **Concurrency**: two messages from the same phone number arriving within milliseconds of each
  other (not realistic human typing speed, but theoretically possible) can race on
  `conversation_state` — the second read can see stale state from before the first write commits.
  Not fixed tonight because a correct fix (row-level locking via a Postgres transaction held for
  the duration of message handling, including the external Paystack/WhatsApp API calls in between)
  is a real architectural change worth doing carefully, not patching at 2am. Real WhatsApp usage —
  a human typing one message, waiting, typing the next — essentially never hits this window.
- **Pickup only** — no delivery address flow.
- **No multi-language support.**
- **FAQ is keyword-matched, not a full NLU/LLM.**
- **No discount codes / loyalty program.**
- **A vendor's admin phone can't also be a test customer of its own bot** — the phone-is-the-
  identity model means that number always gets the admin flow on that vendor's number. Use a
  second phone/number to test the customer experience.
- **No platform-operator overview beyond the `vendors` command** — no way to deactivate a vendor
  without a direct database operation.
- WhatsApp free-form (non-template) messages only work within the 24-hour customer-service window.
  Every message here follows a customer- or vendor-initiated conversation, so this holds in
  practice — but proactive outreach (e.g. "we're back open!") outside that window would need a
  Meta-approved Message Template.
