# workflows/

n8n workflow JSON exports — the version-controlled source of truth. Import into n8n via **Workflows → Import from File**.

## mehua-deposit-concierge.n8n.json

Service 1 prototype for Méhua Lashes (Booking & Deposit Concierge). Built from the discovery/research docs in `reference/` — see `docs/mehua-deposit-concierge-spec.md` for the full spec and constraints.

**This was built without a live n8n connection** (Cowork can't reach `localhost:5678` from the cloud — see the project's tooling-setup notes) and without a real sample Fresha booking email, so treat it as a scaffold, not a finished workflow:

- Import it and check every node before trusting it — node types/parameters were hand-written against n8n's schema from memory, not tested against a running instance.
- Every node or field marked `TO_VALIDATE` in its notes needs real input before it's reliable: the email parsing regex, the Google Sheet ID, the owner's email/notification address, deposit amount and payment details, policy/location wording, and the reminder timing.
- The "Notify Owner" nodes currently draft messages and email them to the owner to copy into WhatsApp by hand — this is intentional (no WhatsApp Business Platform in Phase 1, see the spec), not a placeholder to fix.
- Payment verification is deliberately the one step with no automatic path — the owner form is the only way a booking gets marked verified.

Next concrete step to unblock the rest: get a real Fresha booking-confirmation email (forward one, or paste the raw text) so the parsing node can be rebuilt against real data instead of a guess.
