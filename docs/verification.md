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

## Minimal visual refresh — 12 November 2026

Introduced a scoped `app/modern.css` visual layer with a dark navigation rail, neutral white cards, one mint accent, system sans-serif typography and a three-card financial summary. Adaptive Home retains its seven-card limit and confirmed payment workflow. Mobile uses a bottom navigation with all five sections visible and safe-area spacing. AG Grid, chat, payment review and planning forms share the new colors and typography. No font downloads, images or new runtime dependencies were added; existing reduced-motion preferences remain supported.

Validation: TypeScript, ESLint and the production build passed. Chromium exercised production pages at widths 320, 390, 760, 800, 1024 and 1440 px without horizontal overflow or JavaScript errors. Checked all five sections, payment review and pennybot chat. Both secondary summary cards and all five navigation buttons remain visible on mobile. No payment was initiated. Screenshots are in `/tmp/penny-design-browser/` for this session.

## Short-window sidebar fix — 12 November 2026

Reproduced a clipped pennybot card at 1440×560: the flex item collapsed to 61 px and its button extended below the card. The desktop rail now scrolls instead of shrinking its children. At desktop heights up to 800 px, the assistant becomes a compact icon and working button. Mobile and collapsed-tablet navigation retain their layout.

Production build passed. Chromium verified card/button bounds and opened/closed chat at 1440×900, 1440×801, 1440×800, 1440×560, 1440×420 and 1280×540; also checked 1024×420 and 390×844 for horizontal overflow. No button clipping remained. Fix screenshots: `/tmp/penny-design-browser/sidebar-fixed.png`.

## Personal accounts and reviewed ledger — 13 November 2026

Added `/cabinet` with registration, sign-in, separate private storage, manual accounts in KZT/USD/EUR and reviewed income/expense entries. Public demo personas and Sandbox orders remain in their existing document. The private assistant prepares a server-owned draft; confirmation stores one entry, including concurrent retries. An optional category-only AI request sends the entered text after explicit opt-in.

- All **91 tests pass**, including seven integration tests against an isolated PostgreSQL cluster. New coverage includes salted passwords and hashed tokens, HTTPS cookie attributes, session revocation and password changes, request-size and login limits, cross-origin rejection, owner isolation, integer money arithmetic, invalid currencies, consent, draft expiry, rollback, persistence and concurrent confirmations.
- ESLint, TypeScript and the optimized production build pass.
- Chromium tested registration, three currencies, manual income, pennybot expense preview, confirmation, journal filtering/rendering, record cancellation and logout. Starting from 50,000 KZT, previewing 4,500 KZT left the balance unchanged; confirmation produced 45,500 KZT. USD and EUR balances remained independent. A second account could neither read nor modify the first account's records. Revoked cookies received HTTP 401.
- Responsive widths 320, 390, 760, 1024 and 1440 px showed no horizontal document overflow or browser runtime errors. Screenshots are in `/tmp/penny-private-browser/` for this session.
- Tests used synthetic QA accounts and an isolated local database, never existing user records or live payments. The finance cabinet records manual ledger entries; it does not synchronize banks or execute payments. Email verification/recovery, CSV import and receipt OCR are not implemented.

## One-click judge accounts — 13 November 2026

Added Student, Family and Freelancer buttons above the personal sign-in form at `/cabinet`. Each starts an independent, fictional workspace with KZT/USD/EUR accounts, 11 income/expense records and two recurring-spend patterns. No email, password or registration request is required. Temporary users are explicitly marked, expire after 24 hours, cannot set passwords and cannot replace an already authenticated personal account. Expired demo records are pruned on subsequent session/demo creation. Request limits and an active-demo cap bound temporary storage.

- **99 tests passed**, including seven isolated PostgreSQL integration tests. New tests cover all three profiles, visitor isolation, confirmation, resuming without reseeding, session rotation and logout, cross-origin/body validation, personal-account protection, password restrictions, expiry/cleanup, persistent creation limits and capacity handling. ESLint, TypeScript and the production build passed.
- Chromium exercised the production build backed by isolated PostgreSQL: all three one-click profiles, independent Student sessions, cross-owner rejection, expense preview/confirmation, unchanged second-visitor history, persistence after reload, AG Grid journal and profile switching. No password-login/registration requests or JavaScript runtime errors occurred.
- Login and cabinet layouts passed overflow checks at 320, 390, 760, 1024 and 1440 px. Local screenshots are `/tmp/penny-private-browser/judge-local-*.png`. No external AI call or payment was made for these checks.

## Unified English workspace and personal Adaptive Home — 13 November 2026

The main URL now opens the one-click/personal workspace. Every signed-in account has server-computed Adaptive Home by currency: up to two frequent-expense shortcuts, debts, subscriptions, savings, cash flow and a context insight, capped at seven cards. New accounts receive onboarding instead of invented purchases. Preferences persist per user/currency and review on Monday in the account's time zone; confirmed records update amounts immediately. Debt totals and savings targets use a reviewed, ownership-checked settings endpoint without changing balances.

All interface labels, validation messages and newly seeded demo records are English. Student, Family and Freelancer have three USD accounts each. A versioned, idempotent upgrade affects only temporary demo records, retains their IDs and history, and invalidates obsolete unconfirmed drafts; personal records retain their currency and content. The PayPal playground is linked at `/demo`, while existing root checkout callbacks remain compatible. Both workspaces share voice input; private pennybot answers balance and card questions from the same server facts.

- **109 tests passed**, including seven PostgreSQL integration tests. Coverage includes seven-card ordering, modal purchase amounts, exclusion of stale/future/voided records, separate currencies/accounts, weekly review and immediate evidence updates, personal plan isolation/confirmation, USD demo migration and English assistant questions. TypeScript, ESLint and the production build passed.
- Chromium exercised all three USD profiles, independent visitor copies, confirmed shortcut records, confirmed settings, subscription journal filtering, assistant answers, private registration/onboarding, and PayPal navigation/cancel-return compatibility. No JavaScript errors or document overflow at 320, 390, 760, 1024 and 1440 px.
- A mutation observer recorded **zero DOM mutations inside the adaptive card grid while typing in pennybot**. Cards use memoized props/callbacks; history is computed on the server. Currency formatting reuses cached Intl formatters. No new runtime dependencies, polling loops or continuous animation handlers were added. This is a targeted check, not an FPS benchmark.
- Fixed the English “My balance” intent and a changing implicit textarea label after controlled-value updates. Voice was tested with a stubbed recognizer: it filled an editable message without sending a request. Real microphone/provider access is not claimed. No payment was initiated and private AI opt-in remained off during QA.
- Updated English screenshots: `screenshots/personal-adaptive-desktop.png` and `screenshots/personal-adaptive-mobile.png`. They contain fictional sample data.

## Sandbox dashboard design for every account — 13 November 2026

Replaced the simplified signed-in layout with the Sandbox dashboard shell. Legacy Sandbox and signed-in workspaces use shared frame, brand, navigation, assistant and chart components with the same visual tokens. Both demo and personal accounts have Overview, Transactions, Subscriptions, Payments and Agent activity; the topbar wallet opens accounts. Overview retains a maximum of seven personalized cards, adds the Sandbox summary chart/budget/subscription strip and recent activity.

- Integrated owner-scoped PayPal Sandbox order creation and explicit capture inside the account workspace, including private return links, provider idempotency identifiers, shortcut amount validation and retry recovery. Same-day habitual payment attempts reuse the first order across fresh UI reviews; completed shortcuts show “Paid today”. Captures do not modify personal ledger balances. Captures validate the remote order/reference/amount and a single completed USD capture. Private checkout is completed explicitly; the existing legacy webhook flow is unchanged.
- Subscription tables come from owned ledger entries. Review flags persist separately and do not cancel billing. Monthly budgets are editable through the reviewed plan form. Chart series, subscription charges and activity derive from the same owned state; expired demo cleanup also removes its payment/activity records.
- **122 tests passed**, including seven real PostgreSQL integration tests. New tests cover consent, foreign-origin rejection, order ownership, creation/retry identity, changed amounts, provider approval, capture response variants, mismatched capture amounts, concurrent completion, unchanged ledger balances, charts and subscription review isolation. Provider calls are mocked; no live buyer payment is claimed. ESLint, TypeScript and the optimized production build passed.
- Chromium checked all three USD demo profiles and a newly registered personal account against isolated PostgreSQL. Both expose the same five-section navigation. Checked reviewed ledger records, monthly budget, review flags/activity, account creation, assistant drawer and payment reviews with **zero order-creation requests before approval**. No payment was initiated.
- Responsive checks passed at 320, 390, 760, 1024 and 1440 px; desktop rail controls remained inside their card at 420/560 px heights. Compared computed sidebar widths/colors between Sandbox and personal workspaces: identical. No browser runtime errors. A mutation observer found **zero adaptive-grid mutations while typing in the assistant**.
- Updated screenshots in `docs/screenshots/personal-adaptive-*.png`; `personal-workspace-empty.png` shows a real account with user-entered synthetic QA data and the same full interface.

## Checkout assist / visible cashier totals — 13 November 2026

Added an opt-in visual checkout dialog to the shared account controls. English speech produces visible captions, conservative amount/currency extraction and a large amount display. Interim speech is never treated as a payable amount. Multiple numbers/currencies, malformed decimals, negative/zero totals and unsupported currencies require correction. A checked amount/currency acknowledgement is required, resets on edits and leads only to the existing expense form or PayPal Sandbox review. Neither listening nor selecting an amount saves a record or creates an order.

- All **159 tests passed**, including seven isolated PostgreSQL integration checks and 37 new spoken-amount cases. ESLint, TypeScript and the optimized build passed.
- Chromium with a stubbed recognizer checked interim/final speech, $24.50 recognition, explicit amount check, check reset after correction, ambiguous amounts, denied microphone permission, late events after panel closure, unsupported-browser manual fallback and non-USD checkout blocking. Microphone release ran after final speech and panel closure. No runtime errors or horizontal overflow at 320, 390, 760 and 1440 px.
- Preparing a Sandbox review made **zero order-creation requests**. Recording a corrected $6.25 expense left the ledger untouched until its existing confirmation step, then added exactly one record. No real microphone/provider session or buyer payment was exercised. Speech accuracy in real-world noise remains unmeasured.
- Speech support follows the browser's Web Speech API. Audio is not recorded/stored by Penny or sent to Gemini; browser speech services may process audio externally. Typed text and manual amount input work without microphone permission.

## Opt-in automatic ambient captions — 13 November 2026

Added account/device-scoped Auto listening, off by default. Explicit enablement stores a boolean preference. Reopening the authenticated workspace automatically opens Checkout assist and attempts continuous microphone recognition while visible. A browser permission/start failure requires manual recovery and does not loop. Final phrases keep recognition running; users pause to review before any financial handoff. Hidden tabs release the microphone, foreground return resumes an unpaused session, and explicit pause/close stays respected until a new visit or manual restart. Pending PayPal completion dialogs are never covered by auto-opening.

- All **163 tests passed**, including seven isolated PostgreSQL integration tests and four new preference tests: default off, per-account persistence/opt-out, blocked storage and subscription cleanup. ESLint, TypeScript and production build passed.
- Chromium with a simulated recognizer verified opt-in, continuous mode, exactly one start after reload, saved opt-out, pause/close, hidden/visible transitions, cross-account isolation, permission failures without retry loops, manual recovery, preserved PayPal return confirmation, multiple-number and long-caption rejection, and zero financial API requests from ambient recognition. No runtime errors.
- Re-ran manual checkout regression: explicit amount checks, edit resets, typed/permission/unsupported-browser fallbacks, safe expense confirmation and Sandbox review remained valid at 320/390/760/1440 px. No real microphone/noisy-store accuracy or Sandbox buyer payment is claimed.
