# Penny

A little clarity for your money. **Penny** is an adaptive money workspace built for the PayPal AI Hackathon. **pennybot**, its AI assistant, helps you understand your habits and prepares payment suggestions. Your home rearranges around your spending, and payments only move forward when **you** approve them.

Adaptive Home shows **at most seven cards**: up to two frequent-purchase shortcuts first, followed by debts, subscriptions, a savings jar and cash flow; the last card surfaces the most urgent income-delay, refund or price alert, or an available-budget insight. With insufficient history there are fewer cards rather than invented payment suggestions.

A shortcut requires purchases on at least three distinct days in the latest seven-day history window. Its amount is the most repeated recent charge (ties use the latest charge), never the sum of past purchases. A 28-day history breaks frequency ties. The weekly preference order is reviewed on the first visit after Monday 00:00 UTC; new habits and urgent information update immediately. This uses persisted server state and needs no background worker. Synthetic history remains anchored to its data snapshot, shown separately from the calendar review date.

**Pay $…** opens a review dialog. Only explicit approval creates a Sandbox order; the server checks the displayed amount, and a second approval for the same daily shortcut reuses its order. PayPal approval and explicit completion on return remain required. These are test payments to Penny's configured Sandbox merchant, not actual payments to the named shop. Savings goals are previewed and confirmed local records of funds already set aside; they do not move money and should be excluded from the available balance.

![Penny desktop dashboard](docs/screenshots/desktop.png)

[Mobile preview](docs/screenshots/mobile.png)

**This is a working demo, with synthetic spending history and real PayPal Sandbox Orders integration.** It never reads your personal PayPal history. PayPal's Transaction Search API is merchant-side; we do not represent it as a consumer banking feed. Sandbox payments transfer test funds to the configured demo merchant, not the named grocery shop or subscription provider.

## Hackathon integrations and judge access

- **Hosted demo:** https://penny-g1zu.onrender.com
- **Public source:** https://github.com/architron-kak/penny · **License:** [MIT](LICENSE).
- **PayPal Sandbox Orders API v2:** creates checkout orders and captures explicitly approved payments. Server-side **PayPal OAuth 2.0** obtains the API access token. Each payment requires review in Penny, approval in PayPal Sandbox, and explicit completion after returning to Penny.
- **Google Gemini 3.5 Flash Lite:** the hosted AI model, accessed through Google's OpenAI-compatible endpoint. It classifies transaction descriptions, explains Adaptive Home cards, and selects relevant server-computed facts for pennybot's answers. Zod validates model output; deterministic rules handle unavailable or invalid responses. Financial calculations and payment execution remain server-controlled.
- **Render (additional sponsor):** hosts the Next.js application as a Node web service with HTTPS.
- **AG Grid Community (additional sponsor):** powers the interactive Transactions and Subscriptions tables, including sorting, filtering, resizable columns, custom cell renderers and row action buttons. Penny uses AG Grid Community; AG Studio and Studio Agent Framework are not integrated.
- **Neon PostgreSQL:** stores the demo state, planning records and Sandbox order history across application restarts.
- **Browser Web Speech API:** optional dictation fills an editable chat field in supported browsers. The user reviews and sends it; dictation never executes a payment.
- **Other technologies:** Next.js, React, TypeScript, Tailwind CSS, Framer Motion, AG Grid Community and Zod.

The supplied `.env.example` selects Gemini. To configure AI locally, put your Gemini key in the ignored `.env.local` file:

```dotenv
LLM_PROVIDER=compatible
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
LLM_MODEL=gemini-3.5-flash-lite
LLM_API_KEY=YOUR_GEMINI_API_KEY
```

No registration or application login is required for the hosted demo. Select **Student**, **Family** or **Freelancer** in the persona menu. These are shared synthetic workspaces; use sample data. Explore Adaptive Home, Transactions, Subscriptions and pennybot chat. For example, ask **"Summarize my spending this month"**. Open the savings card to preview a goal, or explore debt and income-delay forecasts. Planning records save only after explicit confirmation.

To test checkout, open a frequent-purchase **Pay $…** shortcut or a prepared suggestion in **Payments**, review the amount, and select **Approve & continue to PayPal**. A **PayPal Sandbox personal/buyer account** is required only to complete this optional checkout. Use a test buyer created in the PayPal Developer Dashboard, approve the test payment, return to Penny and click **Complete Sandbox payment**. Check Payments, Transactions and Agent activity for the result. No live PayPal account or real money is needed. Developer API keys and merchant secrets are already configured server-side and must not be shared with judges. If the free hosted service is waking from inactivity, wait for it to load and retry.

## Run locally

Requires **Node.js 22+** and npm. No LLM key is required. The app also starts without PayPal credentials; payment actions are clearly disabled until they are configured.

```bash
npm install
cp .env.example .env.local
# Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env.local to enable payments.
npm run seed
npm run dev
```

Open **http://localhost:3000**. `APP_URL` must match the browser origin exactly (scheme, host, and port). Restart the server after changing environment variables. To use a different port, update `APP_URL` too.

`npm run seed` creates three deterministic datasets (roughly 200 transactions per persona over six months), writes reviewable files to `data/seed/`, and initializes the ignored JSON database in `data/runtime/`. If the database does not exist, the first API request seeds it automatically. Dates default to today; all demo insights are anchored to the seed date so that the demo remains reproducible.

```bash
npm run seed -- --date=2026-10-25
# Refuses to overwrite existing payment records unless you explicitly reset:
npm run seed -- --reset
```

Resetting erases local demo state, including order history; it does not reverse Sandbox captures. Do not reset data while the server is processing payments.

## Get PayPal Sandbox credentials

1. Sign into the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/).
2. Under **Apps & Credentials**, select **Sandbox** and create a REST app linked to a Sandbox **business** account.
3. Copy that app's client ID and secret to `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` in `.env.local`.
4. Under **Testing Tools → Sandbox Accounts**, create or open a separate **personal** buyer account. Use its test email/password on the Sandbox checkout page. Do not log in with the merchant account.
5. Restart Penny. The payments view will show **Sandbox connected**.

The server's PayPal endpoint is fixed to `https://api-m.sandbox.paypal.com`. There is no live-mode switch. Credentials are used only on the server, and no `.env` file should be committed.

## Demo walkthrough

1. Start with **Student** and click **Headphones · up to $100.00**. The card opens its full explanation in pennybot: $200 available, ten $5 lunches, $30 essential bills, and a $20 reserve. The local fictional catalog offers only models within the computed limit. Change the lunch schedule to **Weekdays only** to recalculate actual UTC dates; previewing assumptions does not save them.
2. Say **“I owe Ali $40 by Friday”**, review the proposed record, and click **Confirm and save debt**. The headphone card now shows **$60**. Say **“I already returned Ali $40 in cash”** and explicitly confirm the cash record. Balance becomes **$160**, the debt is settled, and the headphone limit stays **$60**. The same figure is returned by the home and chat APIs.
3. Open **Show my debts** to add multiple debts and installments, record partial payments/receipts, inspect history, or try another schedule. Every change is previewed on the server and requires confirmation to save. Incoming debts are excluded until actually received.
4. Switch to **Family**. Click the overdue **$35 refund** card to inspect the original purchase and explicitly confirm **money arrived**. Its card disappears and available balance is credited once. In **Transactions**, use **Track refund** on a purchase to enter an amount and promised date.
5. Click **Home Cinema · $8 → $11/mo**. pennybot shows the two dated charges and the **$36 annual difference**, with no claim about why it rose. **I changed my plan** acknowledges the alert; it does not cancel or change a subscription.
6. Switch to **Freelancer** and click the income-delay card. Compare daily balances at the original date and seven days later, including the first shortage on rent. Try **0** or another number of days. The original income date remains unchanged; the explicit save button only saves the watch scenario.
7. In chat, optionally use the experimental microphone. Recognition **only fills the editable text box**. Correct the amount/recipient, then press Send. **“Pay groceries $20”** reports that there is no matching prepared suggestion; **“Pay groceries $45”** for Student opens a review action for its existing Sandbox suggestion. No utterance or chat request creates/captures an order. **“I already returned Ali $40 in cash”** is a separate local debt-recording proposal.
8. Payments retain the original steps: click **Approve & continue to PayPal**, confirm with a Sandbox buyer, return, then explicitly click **Complete Sandbox payment**. Successful captures appear in Payments/Transactions and reduce the local available balance once. They go to the configured Sandbox merchant, never a friend or named retailer.
9. Inspect **Agent activity**, AG Grid filters, and **Motion / Calm**. Existing animations and reduced-motion behavior are preserved.

For a fresh independent demo without erasing existing orders, run with an isolated directory: `DATA_DIR=./data/runtime/planning-demo npm run dev`. Initial data is created automatically. All planning dates use the displayed **seed-date UTC snapshot**, rather than silently advancing the demo clock. Installments on the income date are funded after that day's expected income; dates before it are reserved in the purchase budget.

If you cancel at PayPal, no capture is requested. You may resume the prepared order from Payments. A new order is not created on every retry. Approve/capture requests use stable PayPal idempotency IDs; capture checks the remote order's approved status, amount, currency, and suggestion reference. The approving browser's HttpOnly session must match the capture request. Repeated captures and webhook deliveries do not duplicate local records.

## Architecture

```mermaid
flowchart TD
  UI[Next.js / React adaptive dashboard]
  API[Next.js Node route handlers]
  JSON[(State document · local JSON or PostgreSQL)]
  Seed[Seeded synthetic persona history]
  Classifier[Batch classification + Zod validation]
  Rules[Deterministic fallback rules]
  LLM[Optional OpenAI / compatible LLM]
  Engine[Insights + deterministic ranking]
  PP[PayPal Sandbox REST API]
  Buyer[Explicit user / buyer approvals]
  UI --> API
  Seed --> JSON
  API <--> JSON
  API --> Classifier
  Classifier --> LLM
  Classifier --> Rules
  JSON --> Engine
  Engine --> UI
  Buyer -->|Approve in Penny| API
  API -->|Create CAPTURE-intent order| PP
  PP -->|Sandbox approval page| Buyer
  Buyer -->|Return + click Complete payment| API
  API -->|Verify order + capture| PP
  PP -->|Signature-verified completion webhook| API
```

Next.js App Router, TypeScript, Tailwind CSS 4 with custom CSS, Framer Motion, AG Grid Community, Zod, and fetch-based PayPal REST integration. Local JSON storage uses atomic rename plus a filesystem lock. When `DATABASE_URL` is set, the same state document is stored as one PostgreSQL JSONB row. Writes use a single checked-out connection and `SELECT ... FOR UPDATE` inside an explicit transaction, so concurrent financial confirmations are serialized and failures roll back. The small connection pool uses verified TLS for remote databases. OAuth tokens are cached server-side until near expiration. Money is summed in integer cents.

### AI behavior

- `lib/llm.ts`: provider wrapper for OpenAI and OpenAI-compatible Chat Completions endpoints. Requests JSON output; validates every response with Zod. One retry on request/parsing/validation failure, then rules. No API key means no remote LLM request.
- `lib/classify.ts`: batches distinct merchant/description pairs; validates category enums, complete coverage, and unique input IDs. Caches results persistently. Adding a key upgrades rules-based classifications on the next load.
- `lib/insights.ts`: computes all monetary aggregates on the server, unused subscriptions (>45 days), category budgets, previous full-month spend, previous five-month average, and recurring merchants.
- `lib/ranking.ts`: pure, unit-tested scores based on budget pressure, unused subscriptions, payment review, merchant frequency, total amount, and recency. The LLM cannot alter scores or initiate payments.
- Card explanations are short validated strings cached by their inputs. Without a key, templates explain the same ranking.
- Chat asks the model to choose relevant IDs from a closed set of computed facts; the server renders the selected fact templates. The model cannot invent amounts or invoke a payment. Without a key, keyword rules select those facts.

See the official [Chat Completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) for the optional API contract and [PayPal Orders v2](https://developer.paypal.com/docs/api/orders/v2/) for order creation/capture.

### Planning and confirmation

`lib/planning.ts` performs the purchase forecast, weekday enumeration, debt allocation, dated cash forecasts, price comparison, and catalog filtering using integer cents. `lib/planning-chat.ts` recognizes the supported English/Russian intents and returns computed facts, draft actions, and clarifying questions; all six main scenarios work without an LLM key. General spending chat continues to use the existing optional structured LLM wrapper.

The home page shows a single conclusion per card. Clicking it sends its topic/entity to chat for the active persona. Detailed assumptions, evidence transactions, models, daily comparisons, and editing controls live in pennybot. If a merchant-only transaction does not establish that it was lunch, the forecast asks for confirmation. Missing balance, reserve, lunch cost, or income date also produces a question. The lunch allowance and the explicit non-lunch habit allowance are disjoint; category-budget totals are not subtracted a second time.

Planning mutations use `/api/planning/preview` to simulate a change on a clone, followed by `/api/planning` with `confirmed: true` and a stable request UUID. Repayments reduce both available balance and the corresponding remaining installments. Receiving a debt/refund increases balance only after explicit confirmation. Repeated request IDs and repeated refund-receipt confirmations cannot double-apply money. Local records never call PayPal.

Old databases are lazily upgraded with an optional versioned `planning` store and stable synthetic demo-example IDs. Existing transactions are preserved, example records are appended once, and Sandbox order/capture history is retained. The original local `pennybot.json` path and session cookie stay unchanged; an optional one-time PostgreSQL import preserves the same state document. A new seed has a few additional synthetic transactions/subscriptions beyond the original datasets.

Price alerts require matching USD merchant charges and equal monthly/annual periods, with plausible billing intervals. They show the increase and its annualized difference only; acknowledging a plan change does not alter billing. Expected refunds are bounded by the original purchase amount across all tracked refunds.

Voice support uses the browser's experimental [SpeechRecognition API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), which is unavailable in some browsers and may use the browser provider's online speech service. Permission/recognition failures leave text input available. Friend transfers, arbitrary new PayPal recipients/amounts, and non-USD payments are unsupported. The microphone never submits the transcript or bypasses the existing payment approval flow.

### Environment variables

| Variable                  | Default                                               | Purpose                                                                                             |
| ------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `APP_URL`                 | local: `http://localhost:3000`; Render: automatic URL | Optional explicit origin for custom domains; used for return URLs, origin checks and HTTPS cookies. |
| `RENDER_EXTERNAL_URL`     | Provided automatically by Render                      | Default public HTTPS origin on Render when `APP_URL` is unset.                                      |
| `DATA_DIR`                | `./data/runtime`                                      | Local JSON storage directory, used only when `DATABASE_URL` is empty.                               |
| `DATABASE_URL`            | empty                                                 | Server-only PostgreSQL URL; required on Render Free. Keep it out of Git and browser code.           |
| `REQUIRE_REMOTE_DATABASE` | `false` locally; `true` in Render Blueprint           | Refuse ephemeral JSON fallback if hosted PostgreSQL is missing.                                     |
| `PAYPAL_CLIENT_ID`        | empty                                                 | Sandbox REST app client ID; required for payments.                                                  |
| `PAYPAL_CLIENT_SECRET`    | empty                                                 | Sandbox secret; server only.                                                                        |
| `PAYPAL_WEBHOOK_ID`       | empty                                                 | ID of the webhook registered on the same Sandbox app.                                               |
| `LLM_PROVIDER`            | `openai`                                              | `openai` or `compatible`; unrecognized providers fall back to rules.                                |
| `LLM_API_KEY`             | empty                                                 | Optional; missing/failed key activates rules.                                                       |
| `LLM_MODEL`               | `gpt-4.1-mini`                                        | Model identifier supported by your provider.                                                        |
| `LLM_BASE_URL`            | empty                                                 | Required for `compatible`, e.g. an endpoint ending in `/v1`; keep credentials out of URLs.          |
| `PORT`                    | `3000`                                                | Next.js serving port; Render sets this automatically.                                               |

### API

| Method | Route                            | Behavior                                                                                                   |
| ------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| GET    | `/api/home?user=student`         | Persona, ranked cards, aggregates, records, capability status; sets demo session cookie.                   |
| GET    | `/api/transactions?user=student` | Classified transaction rows.                                                                               |
| POST   | `/api/suggestions/:id/approve`   | `{ user, approved: true }`; creates Sandbox order and returns approval URL.                                |
| POST   | `/api/suggestions/:id/dismiss`   | `{ user }`; records dismissal of an unapproved suggestion.                                                 |
| POST   | `/api/paypal/capture`            | `{ orderId, userApproved: true }`; validates and captures an approved order owned by this browser session. |
| POST   | `/api/paypal/webhook`            | Signature-verified capture completion; never initiates capture.                                            |
| POST   | `/api/subscriptions/:id`         | `{ user, action: "suggest-cancel" \| "undo" }`; local suggestion only.                                     |
| POST   | `/api/chat`                      | `{ user, message }`; answer based on server-computed facts.                                                |
| GET    | `/api/planning?user=student`     | Current profile, purchase limit, debts/refunds, and forecasts.                                             |
| POST   | `/api/planning/preview`          | `{ user, command }`; compute a draft on a clone without saving.                                            |
| POST   | `/api/planning`                  | `{ user, command, confirmed: true, requestId }`; validate and persist a local planning action once.        |
| GET    | `/api/health`                    | Basic health check without creating or modifying payment records.                                          |

Mutation requests require an `Origin` header matching `APP_URL`. Demo personas are public sample workspaces, not authenticated financial accounts.

## Webhooks

1. Host on HTTPS or expose your local server using an HTTPS tunnel. Set `APP_URL` to that public origin.
2. In your Sandbox REST app, add webhook URL `https://YOUR-HOST/api/paypal/webhook` and subscribe to `PAYMENT.CAPTURE.COMPLETED`.
3. Save its ID as `PAYPAL_WEBHOOK_ID`, restart/redeploy, then complete a normal payment through this app.
4. Penny sends the original event and signature headers to PayPal's `/v1/notifications/verify-webhook-signature`. Only `SUCCESS` is accepted. Matching completed capture events update existing approved orders, deduplicate by event/capture ID, and appear in the UI on its next 30-second poll.
5. Use PayPal's [webhook simulator](https://developer.paypal.com/dashboard/webhooksSimulator) to exercise delivery to your endpoint. Simulated events may not pass REST verification against a real registered webhook ID and do not refer to local Penny orders. A rejected simulated event or a verified event with no matching order never marks a payment paid. Do not disable verification to accommodate the simulator; validate the full completion flow with a real Sandbox buyer payment and use the dashboard's event resend feature to test replay handling.

The webhook does not capture on `CHECKOUT.ORDER.APPROVED`; only a user action in the app invokes capture. See [PayPal signature verification](https://developer.paypal.com/docs/api/webhooks/v1/#verify-webhook-signature_post).

## Checks

### Animation and performance

- Scroll reveals and chart growth run once per mounted block using a shared `IntersectionObserver` and the browser's Web Animations API. They animate `transform`/`opacity`; content stays visible if animation support is unavailable. Observed elements are released after entering view and animations are cancelled on unmount or when the tab is hidden.
- Card reordering uses Motion's position-only layout animation with stable keys. Layout measurements depend on the persona/card order, so typing in chat and unchanged polling results do not restart the grid animation. Motion's layout feature bundle is loaded asynchronously through `LazyMotion`.
- The active navigation indicator moves between views. A thin native CSS reading-progress line is shown in browsers supporting scroll timelines; other browsers omit it. Pointer hover effects are limited to devices with a fine pointer.
- Use the **Motion / Calm** button in the header to reduce animations. The preference persists locally, and the operating system's reduced-motion setting always takes precedence. This applies to reveals, charts, card layout, chat, notifications, CSS transitions, smooth chat scrolling, and AG Grid rows.
- Polling pauses in hidden tabs and refreshes on return. Superseded home requests are aborted, unchanged snapshots are reused, and chart/card leaves are memoized. AG Grid remains loaded only when its tab is opened.
- Existing local `pennybot.json` and browser-session cookies keep their original internal names to preserve saved demo data after renaming the project to Penny.

See the implementation guidance for [Motion lazy loading](https://motion.dev/docs/react-lazy-motion) and [layout animation](https://motion.dev/docs/react-layout-animations).

### Commands

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm start
# Optional real database integration tests, against an isolated local database only:
PG_TEST_URL=postgresql://YOUR_USER@127.0.0.1:55439/postgres npm test
```

Tests additionally cover the $100 → $60 → $60 purchase/debt invariant, actual weekdays, partial repayments, refund receipt idempotency, billing-period comparison, income-delay shortfalls, legacy upgrades, confirmation-only mutations, and voice-style requests that must not create orders. Tests cover monetary aggregation, time boundaries, unused-subscription thresholds, deterministic seed data and ranking, persona differences, schema validation and retry fallback, and payment approval/amount/idempotency invariants. External PayPal and LLM calls in unit tests are mocked; a successful automated test is not a claim that a live Sandbox payment has been verified.

## Free deployment: Render Free + Neon Free

The default `render.yaml` uses a **free Node Web Service**, no paid disk, and an external PostgreSQL database. Render Free loses local file changes when it spins down/restarts, so hosted financial records must not use the JSON fallback. The Blueprint enforces this with `REQUIRE_REMOTE_DATABASE=true`; missing `DATABASE_URL` makes the health endpoint return 503.

1. Create a **Free** Neon project/database. Choose a region near the Render service. Copy its PostgreSQL connection string, preferably the pooled URL, into Render's secret `DATABASE_URL` setting. Do not commit it or place it in `.env.example`.
2. Connect Render to the public GitHub repository `architron-kak/penny`. Create a **Blueprint** from `render.yaml` on `main` and confirm the service plan is **Free**. The Blueprint does not create a paid database or disk.
3. Provide `DATABASE_URL`, `PAYPAL_CLIENT_ID`, and `PAYPAL_CLIENT_SECRET` during setup. If testing without payments, empty PayPal credentials leave review/analysis available and payment approval disabled. `LLM_API_KEY` remains optional.
4. Keep `APP_URL` unset for Render's default domain. The app uses `RENDER_EXTERNAL_URL` for origin checks, HTTPS cookies, and PayPal return/cancel URLs. For a custom domain, set `APP_URL` explicitly. Do not copy the localhost `APP_URL` from `.env.local` into Render.
5. Build: `npm ci --include=dev && npm run build`. Start: `npm start`; Next.js uses Render's assigned `PORT`. Health: `/api/health` reports storage configuration without continuously waking the remote database.
6. Open the home page. Its first database access creates `penny_state` and initializes the seeded document if absent. Future restarts/redeploys read the existing PostgreSQL document. Do not run `npm run seed -- --reset` on your hosted database.
7. After deployment, add `PAYPAL_WEBHOOK_ID` only after registering the deployed HTTPS webhook in your Sandbox app. `LLM_API_KEY` can also be added later. Auto-deploys are disabled with `autoDeployTrigger: "off"`.

The app creates the `penny_state` table, so the database role must be allowed to create tables in its selected schema. Remote connections use certificate-verified TLS. Only loopback connections to local development/test PostgreSQL may use plain TCP. This single-document store is intended for a small shared hackathon demo, not high-throughput multi-tenant banking.

### Preserve existing local history

If you want to bring existing local JSON history into PostgreSQL, import it **before opening the hosted home page**, into an empty dedicated destination:

```bash
# Set DATABASE_URL privately in .env.local or your shell first.
npm run db:import
# Or explicitly choose a source file:
npm run db:import -- --from=./data/runtime/pennybot.json
```

The importer validates the state document, preserves order/capture history, does not modify the source JSON, and refuses to overwrite a database that already has a state row. With `DATABASE_URL` empty, normal local development continues to use JSON exactly as before.

### Free-tier limitations

Both services must remain on their **Free** plans and within their included quotas. This is deployment configuration, not a claim that accounts have been created or the app is already hosted. Render Free sleeps after inactivity, so the first request can be slow; its PostgreSQL free trial is time-limited and is not used by this configuration. Neon Free has storage/compute limits and may suspend compute when idle. Review [Render Free limitations](https://render.com/docs/free) and [Neon Free limits](https://neon.com/pricing) before launching. No automatic plan upgrade is configured by this repository.

After deployment, check `/api/health`, try a confirmed planning action, restart the web service, and verify the record remains. Complete one Sandbox buyer payment before claiming the hosted payment flow is verified.

## Known limitations

- All consumer spending history, planning balances/incomes/obligations, headphone models/prices, merchants, subscription usage, and budgets are synthetic. Sandbox captures are labeled separately. All amounts are USD.
- No user authentication: the three personas share demonstration state. Payment capture is tied to the approving browser session, but this is not a production account system. Deploy privately for judging or use a disposable Sandbox app. This demo has no production rate-limiting or multi-tenant isolation.
- A cancellation suggestion does not cancel a real subscription. Real subscription plan creation (P2) is deliberately outside this finished flow.
- The current demo month may be partial; the comparison explicitly uses the previous full month, not a like-for-like projection. Future captures beyond the seed date remain in the table/history but do not alter the historical snapshot aggregates; reseeding can refresh the snapshot with the reset caveat above.
- Cash forecasts include only the single configured next income and explicit obligations plus estimated habits; they are scenarios, not a bank balance feed or a guarantee. The other-habits allowance excludes lunch and must be maintained separately from lunch. The planning clock is anchored to the seed-date snapshot.
- Natural-language support covers the demonstrated English/Russian patterns; use the in-chat forms to specify exact amounts, dates, and installment schedules when a phrase is ambiguous.
- In rules mode, explanations and chat use templates. Optional model calls can add latency; failure falls back after one retry. Explanations are schema-checked, not guaranteed free of all semantic errors.
- Webhook signature verification requires registered Sandbox credentials, a webhook ID, and a reachable HTTPS endpoint. No unverified webhook fallback exists.
- No external logos or copyrighted image assets are used; icons come from Lucide (ISC). The sprout mark and UI are code-based.

MIT licensed. See [LICENSE](LICENSE).
