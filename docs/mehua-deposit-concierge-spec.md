# Méhua Lashes — Booking & Deposit Concierge (Service 1) — Build Spec

Status: Phase 1 prototype, human-in-the-loop. Source of truth for this spec, in priority order: Méhua Lashes discovery interview (`reference/Mehua_Lashes_Automation_Discovery_Completed.xlsx`, 17 Aug 2026) → agency research/decisions (`reference/Mauritius_Automation_Business_Final_Report.docx`, `reference/Mauritius_SME_Automation_Feasibility_Study.pdf`) → assumptions made in this workspace, marked `TO_VALIDATE` below where real facts are still missing. Full context also saved to this project's persistent memory as `mehua_context.md`.

## Why this and not something else

This is the highest-scored item in the discovery workbook's own Opportunity Scoring sheet (raw score 625, next-highest 500) and the pain the owner named unprompted, repeatedly, as her top frustration. It's also what she asked to have prototyped first when asked directly. Retention/reactivation (only ~30% of clients rebook) is the stronger *sales* pitch to strangers later, but this is the right thing to *build* first — see `mehua_context.md` for the full reasoning; not re-litigated here.

## Current manual flow (baseline, confirmed by interview)

Client books on Fresha → owner gets an email notification → client pays a deposit separately via Juice/bank transfer (clients "often forget") → client sends a WhatsApp screenshot of payment proof → owner manually checks her bank/Juice statement → owner manually sends confirmation + policy + location via WhatsApp. Baseline response time up to 48h; ~10 min and ~4 messages per enquiry conversation upstream of this.

## Target flow (what this prototype builds)

```
Fresha booking-confirmation email arrives in owner's Gmail inbox
  → n8n Gmail Trigger polls the inbox
  → parses client name, service, date/time, booking reference from the email
  → fails safely to NEEDS_HUMAN_REVIEW if required fields can't be parsed
    (never guesses a booking into existence)
  → logs a new row in the Google Sheet booking log (status: AWAITING_DEPOSIT)
  → drafts the Rs 500 Juice deposit-instructions message from a template
  → emails the draft to the owner so she can copy it into WhatsApp herself
    (n8n cannot send WhatsApp messages directly — see Constraints)

[separate scheduled check, every 4 hours]
  → scans the sheet for rows still AWAITING_DEPOSIT past the escalation
    window with no reminder sent recently
  → drafts a reminder from a template and emails it to the owner
  → updates status = OVERDUE

[separate entry point: owner-facing "report proof" form]
  → owner receives the WhatsApp payment screenshot from the client directly
    (outside n8n) — this does NOT verify anything by itself
  → owner submits the booking reference to flag it for verification
  → updates status = AWAITING_MANUAL_VERIFICATION

[separate entry point: owner-facing "review verification" form]
  → owner checks her Juice/bank statement herself, then explicitly marks
    the booking Verified or Rejected — this is the only place in the whole
    system that can set DEPOSIT_VERIFIED; no OCR/AI/screenshot analysis is
    used anywhere
  → if Verified: drafts the confirmation + policy + location message from
    a template, emails it to the owner to send via WhatsApp, status =
    DEPOSIT_VERIFIED
  → if Rejected: status = DEPOSIT_REJECTED, owner is notified it needs her
    direct follow-up — no automated message goes to the client
```

A parallel, dev-only path (`TEST - Simulate New Booking`) injects a fake booking with the same shape a real parsed email would produce, so the whole lifecycle above can be exercised without a real Gmail inbox, a real Fresha email, a real customer, a real Juice transaction, or a real WhatsApp account. See **Testing** below.

## Payment status states

`AWAITING_DEPOSIT` → `PROOF_RECEIVED`* → `AWAITING_MANUAL_VERIFICATION` → `DEPOSIT_VERIFIED` (or `DEPOSIT_REJECTED`), plus `OVERDUE` (escalation) and `NEEDS_HUMAN_REVIEW` (unparseable booking email). *`PROOF_RECEIVED` is logged as a timestamp (`Proof Received At`) rather than a separately-held status, since nothing else happens between "screenshot reported" and "awaiting verification" in this flow — the row moves straight to `AWAITING_MANUAL_VERIFICATION`.

**Only an explicit owner action (the "Review Deposit Verification" form, result = Verified) may set `DEPOSIT_VERIFIED`.** Receiving a screenshot never does this by itself. No OCR, AI model, screenshot analysis or text recognition is used to approve a payment anywhere in this workflow.

## Hard constraints (do not build around these — they are the owner's explicit boundaries)

- **Payment verification stays 100% human.** Never attempt automatic bank/Juice-statement matching. This is the named worst-case failure mode in the source research (a false "verified" state damages the brand) and the owner's own stated requirement.
- **Nothing sends to a client automatically without the owner reviewing it first**, unless she later explicitly authorises unattended sending. Every "send" step in this build is really "draft it and notify the owner" — she copy-pastes into WhatsApp herself.
- **Trigger via email-parsing only.** Fresha has no public API, no webhooks, no Zapier/Make listing — confirmed in the research (only a read-only finance-data connector exists, not usable for triggers). Browser automation against Fresha was explicitly evaluated and rejected (fragile, ToS risk).
- **No bank/payment details stored in this or any third-party tool** — only the fact that a deposit was verified, by whom, and when.
- **No WhatsApp Business Platform (paid API) in Phase 1** — stay on the free WhatsApp Business App; that's why every WhatsApp step here is "draft + notify owner," not "send."

## Confirmed deposit rule

`deposit_amount_mur = 500`, `payment_method = "Juice"`, `juice_payment_details = "5902 8505 (MCB Juice)"`. All three are now confirmed, owner-provided data, not assumptions. This is the existing manual Juice number already given to customers — not a PIN/OTP/password. See `config/mehua-config.json`. (For the broader question of whether/how this manual flow should eventually be automated, see `docs/mauritius-payment-automation-options.md` — nothing about the Phase 1 manual flow changes today.)

## Centralized configuration

All client-specific values (deposit amount/method/payment details, studio location, deposit/cancellation policy wording, owner notification email, reminder timing, and the three message templates) live in one place: `config/mehua-config.json`. This is the canonical source of truth — edit it there. The n8n workflow embeds a copy of the same object in four identical "Load Mehua Config" Code nodes (one per entry point), because n8n has no clean cross-branch config include without setting up an Execute Workflow sub-node, which hasn't been done yet. **Known limitation:** those four copies must be kept in sync by hand until that's built — see `workflows/README.md`.

Message templates (`deposit_request_template`, `deposit_reminder_template`, `booking_confirmation_template`) use `{{merge_field}}` placeholders filled by the workflow's own small `renderTemplate()` function, not n8n's expression engine — this keeps all wording in the config file instead of scattered across nodes. Every template is marked `TEMPORARY — OWNER WORDING TO VALIDATE` and must never be presented as Méhua's actual existing wording, and none of them are sent automatically to a real customer during Phase 1.

## Google Sheet — booking log schema

One row per booking, `Booking Log!A:AB` (28 columns). Updated 25 Aug 2026 to add the idempotency/dedup fields, human-review flag, and timestamps the real-parser + duplicate-detection work needed:

`Booking Reference` (human-typeable code the owner enters into the two owner forms - e.g. `MH-260909-7F2K` - distinct from the idempotency key below), `Client ID` (constant `mehua_lashes` from config, kept as a column for future multi-tenant reuse), `Idempotency Key` (Fresha Booking Ref when available, else the composite key - used ONLY by automated duplicate detection, never shown to the owner), `Fresha Booking Ref` (expected blank for real new-booking rows - see "Real Fresha email analysis"), `Client Name`, `Customer Contact` (email or phone, whichever was captured), `Contact Match Strength` (`email` / `phone` / `name_only` - how strong the idempotency match is), `Service`, `Staff Name`, `Appointment Date`, `Appointment Time`, `Status` (one of the payment status states above), `Requires Human Review`, `Review Reason`, `Deposit Amount`, `Deposit Currency`, `Payment Method`, `Deposit Request Sent At`, `Reminder Sent At`, `Proof Received At`, `Verified At`, `Verified By`, `Verification Result`, `Confirmation Sent At`, `Created At`, `Updated At`, `Notes`, `Source` (`email` or `test-simulation`).

The two Log nodes (`Log New Booking`, `Log Unparseable Booking`) map these explicitly by column header (`columns.mappingMode: defineBelow`) rather than relying on key-name auto-matching. **TO_VALIDATE on import:** the mapping assumes the real sheet's header row uses these exact column names - verify and adjust if Joshua's actual sheet differs.

The two append nodes cover 20 of the 28 columns. The remaining eight are lifecycle state written later by the update nodes, each matching on `Booking Reference`: `Deposit Request Sent At` (`Update - Deposit Request Sent At`), `Reminder Sent At` (`Update Status - OVERDUE`), `Proof Received At` (`Update Status - AWAITING_MANUAL_VERIFICATION`), `Verified At` / `Verified By` / `Verification Result` (`Update Status - DEPOSIT_VERIFIED` and `Update Status - DEPOSIT_REJECTED`), `Confirmation Sent At` (`Update - Confirmation Sent At`), and `Notes` (`Log Unparseable Booking`). `tests/workflow-integrity.test.js` asserts that every one of the 28 columns has a node that can write it, so this cannot silently regress. (Until 26 Aug 2026 the update nodes mapped *no* columns at all and none of these were ever written - see `workflows/README.md`.)

### Duplicate detection

Before a parsed `new_booking` is logged, `Read Booking Log (Duplicate Check)` reads the whole sheet and `Check Duplicate Booking` compares the new booking's `Idempotency Key` against every existing row's `Idempotency Key`. If a match is found, `Is Duplicate?` routes to `Log Duplicate Booking Ignored` - a terminal, intentionally no-op node (not writing a new row is the correct behavior; n8n's own execution log makes the branch observable). No match routes to `Compute Deposit Fields` exactly as before. This satisfies the requirement that the same Fresha booking can never create two booking records, two deposit drafts, or two reminder lifecycles.

## Testing

Run everything with `npm test` (nothing to install, and no n8n instance, real inbox, real customer or real payment required). Four suites:

- `scripts/validate-compose.js` — validates `docker-compose.yml` (via `docker compose config` when Docker is installed, else a YAML parse), that every `${VAR}` it reads is documented in `.env.example`, that `.env` is gitignored and untracked, and that the persistence / restart / `127.0.0.1`-only guarantees still hold.
- `tests/workflow-integrity.test.js` — structural validation of the workflow JSON: connections resolve, no orphan nodes, Code nodes parse, Google Sheets nodes use the current node schema (`typeVersion >= 4`, resource locators, real column mappings), all 28 Booking Log columns have a node that can write them, every cross-node `$('…')` reference exists, the four embedded config copies match `config/mehua-config.json`, and no credentials or secrets are committed.
- `tests/fresha-parser.test.js` — the parser and duplicate check against the three real (sanitized) Fresha fixtures plus malformed, unknown-format and missing-required-field cases.
- `tests/mehua-lifecycle.test.js` — the whole lifecycle, driven through the workflow's **own** Code nodes *and* its **own** Google Sheets column mappings against an in-memory 28-column Booking Log (`tests/lib/n8n-mock.js`, `tests/lib/lifecycle.js`). A real Fresha "New appointment" email is parsed → deduplicated → logged `AWAITING_DEPOSIT` (asserts Rs 500 / Juice) → deposit request drafted and stamped → escalated to `OVERDUE` past the 48h window → proof reported → verified by explicit owner action → confirmation drafted and stamped. It also asserts that the reminder cooldown suppresses a repeat reminder, that a verified booking is never chased, that re-delivering the same email a second and third time creates no new row, that a recognized cancellation writes nothing at all, that an unrecognized email lands as `NEEDS_HUMAN_REVIEW` with a stated reason and no minted booking reference, and that a rejected deposit drafts no confirmation. Placeholders (Juice details, studio location, deposit policy) are asserted to come through honestly rather than being silently invented.

Current status: all four suites pass. `npm run demo` walks the same lifecycle with human-readable output — see "Demo" in the root README.

### Validated against real n8n (26–27 Aug 2026)

Re-run on 27 Aug 2026 inside Docker (n8n 2.34.4, Docker 29.7.2, Compose v5.4.0) with results identical to the npm run described below, plus: `docker compose config` passes, the container comes up healthy with no restart loop, and named-volume persistence survives a full `docker compose down` (container destroyed, no `-v`) followed by `up -d`. The proof-received branch was also exercised, so all five lifecycle timestamp mappings — `Deposit Request Sent At`, `Reminder Sent At`, `Proof Received At`, `Verified At`, `Confirmation Sent At` — are confirmed to resolve, every one in `+04:00`. See "Validation status" in the root README.


The offline suites above were confirmed against an actual **n8n 2.34.4** instance: the workflow imported cleanly, all 39 nodes loaded, and n8n re-exported every node with parameters and `typeVersion` unchanged — so no n8n migration is pending and the committed JSON is the canonical accepted form. The TEST booking path, the overdue reminder path and the verification/confirmation path each ran to completion, with stubs only for the Google Sheets API and Gmail send; a rerun of the same booking routed to `Log Duplicate Booking Ignored` without writing a second row. Timestamps came out in `Indian/Mauritius` (`+04:00`). The full result table is in the root README under "Validation status". Docker (container startup and named-volume persistence) and the two live Google credentials remain unverified.

Because the lifecycle test executes the workflow's real Sheets column mappings rather than a reimplementation, a change to the workflow that breaks the deposit lifecycle now fails the test suite. It still does not prove the workflow runs inside n8n — see `workflows/README.md`.

## Real Fresha email analysis (25 Aug 2026 — 3 genuine samples)

Three genuine Fresha emails were provided (forwarded from the owner's own test booking, 13–14 Dec 2025 and 8 Aug 2026). They replace `config/fresha-email-fixture.example.txt` (explicitly fictional) as the authority for parser design. **Critical finding: they are not three copies of the same email type — they are two structurally different formats, one of which is not even the email the workflow needs to parse for new bookings.**

### Format A — "New appointment" (owner-facing, plain-text style)

This is the email Fresha sends to the **business's own inbox** when a client books online — i.e. the actual email the Gmail Trigger will see and must parse to create a deposit record. Confirmed sender across all 3 samples: `mail@updates.fresha.com`, display name `{Business Name}` (e.g. "Méhua Lashes"). Subject observed: `New appointment` (no date/time, no booking ref in the subject).

Body structure (stable order, stable literal markers in **bold**):

```
Appointment confirmed

Hi {account holder name},

**The following appointment has been booked online**

{service} with {staff name}
{Weekday}, {D} {Mon} {YYYY}, {HH:MM}

**At this location:**

{business name} - {business name}
{address line}

**Customer details:**

{customer name}
{customer email}
{customer phone}
Powered by Fresha
```

Fields present: service, staff name (via `"{service} with {staff}"`), appointment date+time (one line, parseable), business name/address, customer name, customer email, customer phone. **Fields absent: booking/reference ID, price, duration, booking status text.** This is a real, structural absence — not a parsing gap. Format A never carries a Fresha booking reference anywhere in the 3 samples.

### Format B — client-facing HTML "card" notifications

Two of the three samples (the "action required / complete form" reminder and the cancellation notice) are a different Fresha email type entirely: outward notifications to the **client**, sharing one stable HTML/MJML structure. Same confirmed sender (`mail@updates.fresha.com`). These would only land in the owner's inbox in production if the owner used her own address as the test client (as happened here) — in real use they go to the customer's inbox, not the business's.

Stable structure across both:

```
Hi {client first name}, {status-specific headline}
{business name} (linked) — {address}

[date badge] {Weekday D Month at HH:MM}
{service name}

[staff avatar] with {staff name} (linked)
{staff role}

[status badge: "Cancelled" | "Action required"]

Appointment details
{service name}                MUR {price}
{duration} with {staff name}

Total                         MUR {price}

Booking ref: {8-char alnum, uppercase — e.g. EC174CE2}

Location
{business name}
{address}

Cancellation policy
Please cancel at least {N hours} before appointment.

[cancellation only: Rebook appointment links]
[reminder only: Complete form / Manage appointment links + "Important info" bullet list]

We sent you this email because you have booked with {business}, which partners with Fresha for appointments and payments.
```

Fields present here that Format A lacks: **a stable `Booking ref:` identifier** (confirmed format: 8 uppercase alphanumeric characters, e.g. `EC174CE2` — identical across both Format B samples because both concern the same underlying booking), price, duration, cancellation-policy text. Field absent here that Format A has: customer email/phone (Format B never discloses the client's own contact details back to them).

### What this means for the parser

Fresha **does** expose a stable booking reference, but not in the email type that actually triggers new-booking processing. The three samples must not be treated as "three interchangeable new-booking emails" — doing so would be actively unsafe (e.g. parsing a cancellation email as a new booking). The parser classifies every incoming email into exactly one of three outcomes, refined 25 Aug 2026 per Joshua's explicit instruction that a recognized cancellation/reminder must not be treated the same as a genuine parse failure:

1. **`new_booking` (Format A), parses successfully** → continues into the deposit workflow (duplicate check, then `Compute Deposit Fields`, then the deposit-request draft). `requiresHumanReview: false`.
2. **`recognized_other:*` (Format B — cancellation or action-required-form-reminder)** → a real, known Fresha email type that is simply out of scope for what Phase 1 automates. `isRecognizedNonBooking: true`, `requiresHumanReview: false`. Routed by the `Recognized Non-Booking Event?` node to `Log Recognized Non-Booking Event (Ignored)` — a terminal, intentionally no-op node. **No booking, no deposit, and no row is written to the Booking Log for these.** n8n's own execution log makes the branch observable without touching the sheet. This is not cancellation automation; it is only "do nothing, safely, instead of misfiring."
3. **`unknown` (genuinely unparseable/unrecognized), or a `new_booking`-shaped email missing a required field** → `requiresHumanReview: true`, `isRecognizedNonBooking: false`, routed to `Log Unparseable Booking (NEEDS_HUMAN_REVIEW)` and written to the sheet with a `reviewReason` explaining exactly what was missing or unrecognized.

`NEEDS_HUMAN_REVIEW` is reserved for outcome 3 only — a recognized Format B email is expected input, not an error a human needs to review.

### Fields: required / optional / not available (Format A — the actual trigger)

| Field | Status | Notes |
|---|---|---|
| customer_name | REQUIRED | "Customer details:" block, line 1 |
| service | REQUIRED | Parsed from `"{service} with {staff}"` line |
| appointment_date | REQUIRED | Parsed from the date/time line |
| appointment_time | REQUIRED | Same line as date |
| staff_name | OPTIONAL | Same `"... with {staff}"` line; present in all 3 samples but not treated as blocking |
| customer_email | OPTIONAL (but strongly preferred) | Present in Format A; used as the primary idempotency contact match when available |
| customer_phone | OPTIONAL (but strongly preferred) | Present in Format A; fallback contact match |
| business name / address | OPTIONAL | Present, not currently used downstream beyond the confirmation template's studio_location |
| booking/reference ID (`fresha_booking_id`) | **NOT AVAILABLE** in Format A | Confirmed present in Format B under a stable `Booking ref:` label, but that email type is not the new-booking trigger. Do not assume it will appear in the emails this workflow parses. |
| price / duration / status text | NOT AVAILABLE in Format A | Present in Format B only; not required for the deposit workflow |

### Booking ID and idempotency (resolved per spec item 9)

Fresha does have a stable booking/reference ID system (confirmed by the `Booking ref: EC174CE2` field in both Format B samples), but **the new-booking notification email this workflow actually parses does not include it.** `fresha_booking_id` is therefore `NOT AVAILABLE` for Phase 1's trigger path, not merely unconfirmed.

The idempotency key is a composite, in priority order:

```
1. customer_email + appointment_date + appointment_time + service   (strongest available)
2. customer_phone (normalized, digits only) + appointment_date + appointment_time + service   (if no email)
3. lowercased customer_name + appointment_date + appointment_time + service   (weakest — logged as such)
```

This is explicitly weaker than a genuine provider booking ID: a client who is renamed, rebooks under a different contact method, or whose name is spelled differently between two bookings could in principle produce a different key for what a human would call "the same booking." It is, however, the strongest signal actually present in the email Fresha sends. The match tier used (`email` / `phone` / `name_only`) is recorded on every parsed booking (`contactMatchStrength`) so a `name_only` match is visibly weaker in the log, not silently trusted the same as an email match. If a future email sample or Fresha inbox integration surfaces a genuine `fresha_booking_id` in the new-booking notification, switch the idempotency key to that immediately — this composite key is a documented fallback, not the target design.

## What's still genuinely missing (`TO_VALIDATE` — not guessed, needs Joshua/Méhua)

1. ~~A real sample Fresha booking-confirmation email~~ — RESOLVED 25 Aug 2026: three genuine Fresha emails analysed (see "Real Fresha email analysis" above). The parser is now built against the real "New appointment" format, not the fictional `config/fresha-email-fixture.example.txt` (kept in the repo only as a labeled historical artifact — no longer authoritative). `fresha_booking_id` was confirmed NOT available in the new-booking trigger email; a documented composite key is used instead (see above).
2. **How n8n reads the inbox** — Méhua's own Gmail via OAuth, an app-password IMAP connection, or a forwarding rule into a separate mailbox Joshua controls. Not decided.
3. ~~Juice payment details~~ — RESOLVED 25 Aug 2026: `5902 8505` (MCB Juice), owner-provided. Config and workflow updated; no longer a placeholder.
4. **Studio location and deposit/cancellation policy wording** — placeholders in `config/mehua-config.json`, not yet supplied.
5. **Reminder/escalation timing** — `reminder_escalation_hours: 48` in the config is from the source research ("no proof after 48h"), not yet confirmed directly with Méhua; the 20-hour reminder resend cooldown is our own assumption to avoid spamming the owner, not sourced from any document.
6. **Owner notification email address** — placeholder in the config, not yet supplied.
7. **Google Sheet ID and exact column mapping** — every Google Sheets node references the literal placeholder `PLACEHOLDER_SET_MEHUA_SHEET_ID`, with the tab name set to `Booking Log`. Create the sheet with the 28 headers above, then either find-and-replace that placeholder before importing or pick the document from n8n's "From list" selector on each node. Exact steps: "Workflow setup" in the root README.
8. **Which mailbox n8n reads** — related to item 2: Méhua's own Gmail via OAuth, or a forwarding rule copying Fresha mail into a mailbox the agency controls. The second keeps the client boundary cleaner (the agency never holds the client's mailbox credentials) and is the recommended default, but it has not been agreed with her.

## What this prototype deliberately does NOT do

Automate payment matching/bank access, build a CRM or lead-record system, automate social-media content, or touch retention/reactivation (that's Service 2, built and measured separately, second). Several things that looked like automation opportunities in the interview turned out to be existing-tool configuration gaps already handled (Instagram/WhatsApp quick replies, Fresha's waitlist, Fresha's review prompts) — not rebuilt here.

## Success metric

Owner touches per booking drop from "multiple manual touches" (check bank, draft confirmation, send policy/location) to one action: submitting the verification form. Do not claim a rebooking-rate or revenue improvement from this pilot — that belongs to Service 2.
