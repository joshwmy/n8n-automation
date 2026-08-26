# tests/fixtures/

Sanitized regression fixtures derived from 3 genuine Fresha emails (analysed 25 Aug 2026 — see `docs/mehua-deposit-concierge-spec.md`, "Real Fresha email analysis"). All customer names, emails, phone numbers, and booking references below are fake development data; the structure, stable labels, and field ordering are preserved from the real emails.

- `fresha-booking-01.txt` — Format A, "New appointment" (the actual owner-inbox trigger for new bookings). Should classify as `new_booking` and parse into a full bookable record.
- `fresha-booking-02.txt` — Format B, "complete form" / action-required reminder (client-facing, not a new-booking trigger). Should classify as `recognized_other:action_required_form` and route to the terminal no-op `Log Recognized Non-Booking Event (Ignored)` node — no booking, no deposit and no sheet row. It is **not** `NEEDS_HUMAN_REVIEW`: a recognized Fresha email type is expected input, not a parse failure.
- `fresha-booking-03.txt` — Format B, cancellation notice (client-facing, not a new-booking trigger). Should classify as `recognized_other:cancellation` and route to the same no-op node, on the same reasoning — no booking should be created from this.

`NEEDS_HUMAN_REVIEW` is reserved for the third outcome only: a genuinely unrecognized email, or a new-booking email missing a required field.

Do not add real customer data to this directory. The raw originals (which do contain real PII) were provided directly to Claude in-conversation and were never written into this repo or any file under version control.

See `tests/fresha-parser.test.js` for the tests that exercise these fixtures, plus additional failure cases (malformed email, missing required fields, unknown format, duplicate booking) constructed inline rather than as files.
