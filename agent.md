# Penny — Project Brief for the Coding Agent

The project is named **Penny**. Its AI assistant is named **pennybot**.

## Goal
Build a working web app for the PayPal AI Hackathon (Devpost). Judges must be able to
run it locally from the README or open a hosted demo. A mockup or static prototype is
NOT acceptable. PayPal (Sandbox) and AI must both be central to the product.

## One-line concept
An AI money assistant whose home screen rebuilds itself around each user's habits.
The AI only PROPOSES payments; money moves only after the user clicks Approve.

## Hard rules
1. Human-in-the-loop: the agent may create a PayPal order, but capture happens ONLY
   after an explicit user approval action. Never auto-capture.
2. PayPal Sandbox only. No real credentials, no real money. Secrets live in `.env`;
   commit `.env.example`, never `.env`.
3. The app must run WITHOUT an LLM key: if `LLM_API_KEY` is missing, fall back to a
   rule-based classifier and template explanations. Judges may not have a key.
4. LLM output must be structured JSON, validated with a schema (zod) before use.
   On invalid output: retry once, then fall back to rules.
5. Be honest in the UI and README: PayPal's Transaction Search API is merchant-side,
   so the user's "payment history" is a synthetic seed dataset. Orders API and
   webhooks are real Sandbox calls.
6. Keep it small and finished. A polished end-to-end flow beats many half-features.

## Stack
- Next.js (App Router) + TypeScript, Tailwind CSS, Framer Motion
- AG Grid (community) for the transactions/subscriptions table
- Next.js route handlers as backend; SQLite (better-sqlite3) or a JSON file for data
- LLM: provider-agnostic wrapper in `lib/llm.ts` (env: `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`)
- PayPal: REST API via fetch (OAuth2 client credentials), no deprecated SDKs
- Deploy: Render (web service), config in `render.yaml`
- License: MIT (LICENSE file in repo root)

## Demo personas (seed data)
Create 3 users with different habits so the Adaptive Home difference is visible:
- "Student": many small purchases, 4 subscriptions (1-2 unused), coffee/food heavy
- "Family": large grocery spend, utilities, kids' activities, 2 subscriptions
- "Freelancer": irregular income-like patterns, software subscriptions, travel
Each persona: ~150-250 transactions over 6 months (date, merchant, description,
amount, currency USD), plus a list of subscriptions (merchant, monthly price,
last_used_date). A persona switcher in the header swaps the active user.

## Features (in priority order)
### P0 — must work
1. **Transaction classification.** Merchant/description -> category (groceries,
   food & coffee, transport, subscriptions, shopping, utilities, other). LLM batch
   call, rules fallback, results cached in DB.
2. **Insights engine.** From transactions compute: monthly spend per category,
   average vs current month, recurring merchants, unused subscriptions
   (no activity > 45 days), budget remaining per category.
3. **Adaptive Home.** A grid of cards: SpendingSummary, CategoryBudget,
   SubscriptionAlert, SuggestedPayment, MerchantShortcut. Each card has a numeric
   `priority` score computed deterministically (frequency, amount, recency,
   urgency such as "budget almost exhausted"). The LLM writes the one-sentence
   "why this card is on top". Cards reorder with Framer Motion layout animations
   when the persona changes. Show the score/reason in a small "why?" tooltip.
4. **Prepared payment flow (the PayPal core).**
   - Agent creates a suggestion, e.g. "Pay your monthly grocery top-up, $120".
   - User clicks Approve -> backend `POST /v2/checkout/orders` (intent CAPTURE)
     -> redirect/popup to PayPal Sandbox approval -> return -> backend
     `POST /v2/checkout/orders/{id}/capture` -> success state in UI.
   - Store order id, status, amount, timestamps. Show a payment history list.
   - Reject/Dismiss action is also available and recorded.
5. **Transactions table (AG Grid).** Columns: date, merchant, category, amount,
   source. Filtering, sorting, category chips, and a custom cell renderer for
   category badges and amount coloring. Separate tab for subscriptions with
   "Cancel suggestion" action (local state change only).

### P1 — if time allows
6. **PayPal webhooks.** Endpoint `POST /api/paypal/webhook` with signature
   verification (`/v1/notifications/verify-webhook-signature`). On
   `PAYMENT.CAPTURE.COMPLETED` update the order and push the change to the UI
   (polling or SSE). Document how to test with the Sandbox webhook simulator.
7. **Chat with the assistant.** Small panel: "Where did my money go in
   coffee this month?" answered by LLM using computed aggregates (tool-style:
   backend computes numbers, LLM only phrases them; never let the LLM invent numbers).
8. **Agent activity log.** Visible list of what the AI did and why
   (classified N transactions, proposed payment X, user approved). Good for the demo.

### P2 — only if everything above is done
9. Real Sandbox subscription plan via Subscriptions API (create plan + subscription).

## Suggested structure
```
/app                 pages + route handlers (/api/...)
/components          cards, grid, persona switcher, payment modal
/lib/paypal.ts       auth token cache, createOrder, captureOrder, verifyWebhook
/lib/llm.ts          provider wrapper + zod validation + fallback
/lib/insights.ts     aggregates, unused subs, budget math
/lib/ranking.ts      card priority scoring (pure functions, unit-tested)
/lib/classify.ts     LLM + rules classifier
/data/seed           persona datasets (generated by scripts/seed.ts)
/scripts/seed.ts     deterministic generator (seeded RNG)
README.md  LICENSE  .env.example  render.yaml
```

## API sketch
- `GET  /api/home?user=:id` -> ordered cards with priority + reason
- `GET  /api/transactions?user=:id`
- `POST /api/suggestions/:id/approve` -> creates PayPal order, returns approval URL
- `POST /api/paypal/capture` (orderId) -> captures, stores result
- `POST /api/suggestions/:id/dismiss`
- `POST /api/paypal/webhook`

## Acceptance criteria
- `npm install && npm run seed && npm run dev` works from a clean clone using only
  `.env.example` values + Sandbox credentials.
- Switching persona visibly re-orders cards with animation.
- Full flow works: suggestion -> Approve -> Sandbox approval -> capture -> UI shows paid.
- Works with and without `LLM_API_KEY`.
- No secrets in git history. Lint and typecheck pass. Unit tests for `ranking.ts`
  and `insights.ts`.
- README contains: what it is, architecture diagram (mermaid), setup steps,
  env vars table, how to get Sandbox credentials, how to run the demo,
  which AI tools are used and how, known limitations (synthetic history).

## Work plan
1. Scaffold project, seed generator, DB, personas.
2. Classification + insights + ranking (with tests).
3. Adaptive Home UI with animation and persona switcher.
4. PayPal Orders create/capture flow end to end.
5. AG Grid tables.
6. Webhooks, chat, activity log.
7. Deploy to Render, write README, final cleanup.
After each step: run the app, fix errors, commit with a clear message.

## Do NOT
- Do not auto-capture payments or skip the approval step.
- Do not hardcode credentials or commit `.env`.
- Do not claim the app reads a user's real PayPal history.
- Do not add features outside this brief without asking.
- Do not use third-party logos or copyrighted assets in the UI or demo.
