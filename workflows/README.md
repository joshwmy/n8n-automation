# workflows/

n8n workflow JSON exports — the version-controlled source of truth. Import into n8n via **Workflows → Import from File**.

## mehua-deposit-concierge.n8n.json

Service 1 prototype for Méhua Lashes (Booking & Deposit Concierge). Full spec, constraints and current `TO_VALIDATE` list: `docs/mehua-deposit-concierge-spec.md`. Configuration (deposit amount/method, message templates, policy wording, etc.) lives in `config/mehua-config.json`, not hardcoded in nodes — see that file and the spec's "Centralized configuration" section.

**This was built without a live n8n connection** (Cowork can't reach `localhost:5678` from the cloud), so treat it as a scaffold that has never actually been imported and run yet — see "Local n8n test instructions" from Claude for the exact steps to do that.

- Import it and check every node before trusting it — node types/parameters were hand-written against n8n's schema from memory, not tested against a running instance. The workflow JSON itself has been validated (valid JSON, all connections resolve, all embedded Code-node JavaScript passes `node --check`) — but that's not the same as a working n8n import.
- **The Fresha email parser (`Parse Fresha Booking Email`) is now built from 3 genuine Fresha emails**, not a guess — see `docs/mehua-deposit-concierge-spec.md` "Real Fresha email analysis". It classifies the email kind first: only the real new-booking notification format ("New appointment") is parsed into a bookable record. Fresha's two other email formats sampled (cancellation notice, "complete form" reminder) are recognized but intentionally routed to `NEEDS_HUMAN_REVIEW` instead of being misparsed as new bookings — Phase 1 does not act on cancellations or profile-completion reminders. `config/fresha-email-fixture.example.txt` is kept only as a labeled historical artifact; it is no longer authoritative — the real fixtures are in `tests/fixtures/`.
- **Duplicate booking detection is wired in**: `Read Booking Log (Duplicate Check)` → `Check Duplicate Booking` → `Is Duplicate?` sits between `Parsed OK?` and `Compute Deposit Fields`. A match on `Idempotency Key` (Fresha's own booking ref when available, otherwise a composite of customer contact + date + time + service — see spec) routes to a terminal, intentionally no-op `Log Duplicate Booking Ignored` node instead of creating a second booking/deposit/reminder.
- Remaining `TO_VALIDATE` fields needing real input: the Google Sheet ID and exact header names (28-column schema, see spec), the owner's notification email, and the studio location/policy wording. (Juice payment details were resolved 25 Aug 2026 — `5902 8505`, owner-provided — and are now filled in everywhere they were a placeholder.)
- The "Notify Owner" nodes draft messages and email them to the owner to copy into WhatsApp by hand — intentional (no WhatsApp Business Platform in Phase 1), not a placeholder to fix.
- Payment verification is deliberately the one step with no automatic path — the "Review Deposit Verification" owner form is the only way a booking can become `DEPOSIT_VERIFIED`. No OCR/AI/screenshot analysis is used anywhere.
- **Known limitation:** the "Load Mehua Config" Code node is duplicated identically at all four entry points (Gmail trigger, test trigger, Cron, verification form), because n8n has no clean cross-branch config include without an Execute Workflow sub-node, which isn't set up yet. Keep all four in sync with `config/mehua-config.json` by hand for now, or wire up a shared sub-workflow later.
- A `TEST - Simulate New Booking (Dev Only)` manual-trigger branch lets the whole lifecycle run without a real Gmail inbox, real Fresha email, real customer, real Juice transaction or real WhatsApp account — see `tests/mehua-lifecycle.test.js`. Its output shape now matches the real parser's `new_booking` output field-for-field, including the duplicate-detection key, so running it twice on the same day is itself a live duplicate-detection test (same composite key both times).

Next concrete step: import into a real local n8n instance and run the fixtures — this is genuinely untested against a live n8n runtime, only validated as well-formed JSON with syntactically valid Code-node JavaScript.

## Related: payment automation research

This workflow's Phase 1 deposit step is entirely manual (`MANUAL_JUICE_TRANSFER`: customer sends Rs 500 to the Juice number in `config/mehua-config.json`, owner verifies by hand). Whether/how to automate that step later — MCB Juice Merchant QR, MIPS, MauCAS, Peach Payments, etc. — is researched separately in `docs/mauritius-payment-automation-options.md`. That document is architecture/research only; nothing about this workflow's manual flow has changed.
