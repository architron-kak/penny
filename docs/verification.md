# Verification — 25 October 2026

Validated locally with Node.js 22.23.4, Next.js 16.4.3, and headless Chromium. No real PayPal or LLM credentials were supplied.

- `npm run seed`: 616 synthetic transactions across three personas, with six months of data each.
- `npm test`: 22 tests passed across insights, ranking, LLM validation/fallback, payment invariants, and payment route handlers.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; all application and API routes compiled.
- `npm run dev`: started successfully using Turbopack, and served the tested application.
- Browser checks: Student → Family → Freelancer changes card order; AG Grid renders and filters transactions; subscription cancellation suggestions save and undo without reducing recurring cost; payment review disables approval without credentials; chat returns computed coffee spending; 390px mobile and 768px tablet layouts have no horizontal document overflow; mobile toast stays inside the viewport.
- API checks: health returns `ok`; invalid personas and missing approval flags return 400; cross-origin payment creation and wrong-browser capture return 403; unsigned/unconfigured webhooks cannot update payment records.
- Route tests use mocked PayPal responses to verify approval → create → PayPal status check → explicit capture → persisted completion, including retries and duplicate capture handling. These are not a live Sandbox integration test.
- No JavaScript runtime errors or AG Grid errors were observed in the browser checks. Deliberately rejected API requests produce the expected HTTP error messages in the browser console.

Still requires external setup: an end-to-end transaction with a real PayPal Sandbox merchant and buyer; a signature-verified webhook from that app; an optional real LLM-provider call; Render provisioning and deployment. The Render configuration is included, but no hosted deployment is claimed.

Screenshots in `docs/screenshots/` come from the running app. They show synthetic sample data.

## Penny / pennybot update — 3 November 2026

Project branding is **Penny**; the assistant is **pennybot**. Internal storage and cookie names remain stable. Checked using Node.js 26.12.1 and Chromium with isolated demo data and no external credentials.

- Lint, TypeScript, all 22 existing tests, and the production build pass.
- Native scroll reveals and chart animations execute when entering the viewport. Persona switching produces position-only layout transforms on the cards.
- A mutation observer recorded **zero mutations inside the adaptive grid while typing a question in chat** after initial animations had settled. This is a targeted browser check, not an FPS benchmark or a guarantee for all devices.
- Manual Calm mode survives reload. The system reduced-motion preference takes precedence and disables the manual toggle; card layout transforms are absent in this mode.
- Hidden-tab visibility changes do not initiate polling; returning to the visible tab triggers a refresh.
- AG Grid search, subscriptions, payment review, and fact-based chat still work. Missing PayPal credentials continue to disable payment approval.
- Mobile (390px) and tablet (768px) have no horizontal document overflow. No JavaScript runtime errors were observed.
- No continuous JavaScript scroll handlers, permanent `will-change` layers, or new production dependencies were added. The layout feature module is asynchronously loaded; native effects use transform/opacity and detach their observer after entry.

## Planning scenarios — 4 November 2026

Implemented the attached planning brief in the existing app. Verified using a separate temporary database, empty PayPal/LLM credentials, and headless Chromium.

- All **37 tests** pass. Added coverage for $100 → $60 → $60 after reservation/actual repayment, weekdays and year boundaries, partial repayment allocation/history, single refund credit, matching billing periods, delayed income/rent shortfall, old-store upgrades, draft clarification, preview isolation, concurrent confirmation replay, and payment-like text that must not create an order.
- `npm run lint`, `npm run typecheck`, and `npm run build` pass.
- Browser: clicking a card opens the appropriate pennybot explanation for the current persona. A $40 debt is proposed without saving, saved only on confirmation, then recorded as paid after a second confirmation. The home API, card, and chat show the same $60 limit before and after repayment; available balance becomes $160.
- Browser: weekday assumptions are previewed without being persisted; overdue refund confirmation increases balance once; the price-increase card shows $36/year and disappears on plan-change acknowledgment; transaction rows open refund tracking; income-delay previews leave the original income date unchanged.
- A **stubbed browser speech recognizer** populated an editable $20 grocery transcript. Dictation made no chat request and no payment request. Sending the mismatched amount created no order; editing to $45 offered the existing Sandbox review, with approval disabled because credentials were absent. No actual microphone/audio-service or live Sandbox payment is claimed.
- Mobile 390px: settled responsive layout and the planning chat/forms have no horizontal document overflow. No JavaScript errors were observed.
- Existing user runtime data was not reset for testing. The optional planning store upgrades lazily and retains previous Sandbox records.

The new desktop screenshot shows the Student scenario after the confirmed cash repayment. `screenshots/planning-chat-mobile.png` shows the detailed mobile planning chat. Planning remains an explicitly labeled synthetic, seed-date snapshot with a fictional headphone catalog; it is not a live bank feed.

## Free hosting storage — 4 November 2026

Replaced the paid-disk Render default with Render Free plus an external PostgreSQL URL, intended for Neon Free. Local JSON remains the default when `DATABASE_URL` is absent. The hosted Blueprint requires PostgreSQL and does not provision any paid disk/database.

- `npm run lint`, `npm run typecheck`, and `npm run build` pass.
- `PG_TEST_URL=... npm test` against a temporary isolated local PostgreSQL: **49 tests passed**, including five real database integration tests. Ordinary `npm test` runs 44 tests and skips those five if `PG_TEST_URL` is unset.
- Verified persistence after closing/reopening the application pool, rollback on callback failure without automatic callback retries, concurrent updates without lost writes, single-credit concurrent refund receipt, and legacy order/capture import with overwrite refusal.
- Production HTTP check on PostgreSQL: `/api/health` reports `storage: postgres`; the home purchase limit starts at $100, a confirmed $40 debt changes it to $60, and $60 plus the debt record remains after restarting the Next.js server. The configured JSON data path was never created.
- Remote URLs require certificate-verified TLS. Hosted mode without `DATABASE_URL` returns health 503 instead of using ephemeral JSON.
- Tests used a private temporary PostgreSQL cluster and an isolated application port. Existing local JSON/history and external provider accounts were not changed. No live Neon/Render deployment or remote Neon TLS connection is claimed; those require connected accounts and an actual provisioned database.

## Adaptive Home and daily shortcuts — 5 November 2026

Adaptive Home now caps output at seven cards: two evidence-based frequent-purchase shortcuts, four essential information cards, and one context alert. Weekly preference order persists in existing JSON/PostgreSQL state and refreshes on the first visit after Monday 00:00 UTC. New patterns update immediately; absent evidence produces fewer shortcuts. Detection requires three distinct purchase days in a rolling seven-day history window and uses the most repeated charge, with latest-charge tie breaking.

- `npm test`: 54 passed; five PostgreSQL integration tests skipped because no isolated `PG_TEST_URL` was supplied. New tests cover frequency evidence, amount selection, weekly rollover, new patterns, seven-card limits, daily order identity, server-side amount checking, consent and duplicate-order reuse.
- `npm run lint` and `npm run typecheck` passed. Production build passed before browser verification; the final copy-only refinement was also rebuilt.
- Chromium checked the production app with an isolated local JSON directory and LLM disabled: seven cards, two payment shortcuts, review dialog with zero approval/capture requests, savings preview without writes, confirmed savings persistence after reload, unchanged available balance, no browser errors and no horizontal overflow at 390 px.
- Browser screenshots were kept in `/tmp/penny-adaptive-qa/desktop.png` and `/tmp/penny-adaptive-qa/mobile.png`. No PayPal payment was initiated. Current changes were tested locally and have not been published to Render.
