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
