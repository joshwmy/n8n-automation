# workflows/

n8n workflow JSON exports — the version-controlled source of truth. Import into n8n via **Workflows → Import from File**.

## mehua-deposit-concierge.n8n.json

Service 1 prototype for Méhua Lashes (Booking & Deposit Concierge). Full spec, constraints and current `TO_VALIDATE` list: `docs/mehua-deposit-concierge-spec.md`. Configuration (deposit amount/method, message templates, policy wording, etc.) lives in `config/mehua-config.json`, not hardcoded in nodes — see that file and the spec's "Centralized configuration" section.

**This was built without a live n8n connection** (Cowork can't reach `localhost:5678` from the cloud) and without a real sample Fresha booking email, so treat it as a scaffold, not a finished workflow:

- Import it and check every node before trusting it — node types/parameters were hand-written against n8n's schema from memory, not tested against a running instance. The workflow JSON itself has been validated (valid JSON, all connections resolve, all embedded Code-node JavaScript passes `node --check`) — but that's not the same as a working n8n import.
- Every node or field noted `TO_VALIDATE` needs real input before it's reliable: the email parsing regex, the Google Sheet ID and column mapping, the owner's notification email, and the studio location/policy wording. (Juice payment details were resolved 25 Aug 2026 — `5902 8505`, owner-provided — and are now filled in everywhere they were a placeholder.)
- The "Notify Owner" nodes draft messages and email them to the owner to copy into WhatsApp by hand — intentional (no WhatsApp Business Platform in Phase 1), not a placeholder to fix.
- Payment verification is deliberately the one step with no automatic path — the "Review Deposit Verification" owner form is the only way a booking can become `DEPOSIT_VERIFIED`. No OCR/AI/screenshot analysis is used anywhere.
- **Known limitation:** the "Load Mehua Config" Code node is duplicated identically at all four entry points (Gmail trigger, test trigger, Cron, verification form), because n8n has no clean cross-branch config include without an Execute Workflow sub-node, which isn't set up yet. Keep all four in sync with `config/mehua-config.json` by hand for now, or wire up a shared sub-workflow later.
- A `TEST - Simulate New Booking (Dev Only)` manual-trigger branch lets the whole lifecycle run without a real Gmail inbox, real Fresha email, real customer, real Juice transaction or real WhatsApp account — see `tests/mehua-lifecycle.test.js`.

Next concrete step to unblock the rest: get a real Fresha booking-confirmation email (forward one, or paste the raw text) so the parsing node can be rebuilt against real data instead of the fictional fixture in `config/fresha-email-fixture.example.txt`.

## Related: payment automation research

This workflow's Phase 1 deposit step is entirely manual (`MANUAL_JUICE_TRANSFER`: customer sends Rs 500 to the Juice number in `config/mehua-config.json`, owner verifies by hand). Whether/how to automate that step later — MCB Juice Merchant QR, MIPS, MauCAS, Peach Payments, etc. — is researched separately in `docs/mauritius-payment-automation-options.md`. That document is architecture/research only; nothing about this workflow's manual flow has changed.
