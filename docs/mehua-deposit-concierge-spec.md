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

One row per booking. Columns: `Booking Reference`, `Client Name`, `Service`, `Appointment Date`, `Appointment Time`, `Status` (one of the payment status states above), `Deposit Amount`, `Payment Method`, `Deposit Request Sent At`, `Reminder Sent At`, `Proof Received At`, `Verified At`, `Verified By`, `Verification Result`, `Confirmation Sent At`, `Notes`, `Source` (`email` or `test-simulation`).

## Testing

`tests/mehua-lifecycle.test.js` runs the exact JavaScript from the workflow's Code nodes (extracted from `workflows/mehua-deposit-concierge.n8n.json`, not reimplemented) through a small mock of n8n's Code-node context, and walks the full lifecycle end to end: simulate a booking → compute deposit fields (asserts Rs 500 / Juice) → render the deposit request → simulate the owner reporting proof → simulate the owner verifying → render the confirmation. It asserts the placeholders (Juice payment details, studio location, deposit policy) come through honestly rather than being silently invented. Run it with `node tests/mehua-lifecycle.test.js` — no n8n instance, real inbox, real customer or real payment required. Current status: passes.

## What's still genuinely missing (`TO_VALIDATE` — not guessed, needs Joshua/Méhua)

1. **A real sample Fresha booking-confirmation email** (forward one, or paste the raw text/headers) — the parsing node in the attached workflow is a placeholder until this exists; `config/fresha-email-fixture.example.txt` is an explicitly fictional stand-in used only to give the parser something concrete to run against, not evidence of Fresha's real format. Without a real sample, the extraction logic is a best guess, not a tested pattern — the workflow fails safely to `NEEDS_HUMAN_REVIEW` when it can't parse required fields, rather than guessing.
2. **How n8n reads the inbox** — Méhua's own Gmail via OAuth, an app-password IMAP connection, or a forwarding rule into a separate mailbox Joshua controls. Not decided.
3. ~~Juice payment details~~ — RESOLVED 25 Aug 2026: `5902 8505` (MCB Juice), owner-provided. Config and workflow updated; no longer a placeholder.
4. **Studio location and deposit/cancellation policy wording** — placeholders in `config/mehua-config.json`, not yet supplied.
5. **Reminder/escalation timing** — `reminder_escalation_hours: 48` in the config is from the source research ("no proof after 48h"), not yet confirmed directly with Méhua; the 20-hour reminder resend cooldown is our own assumption to avoid spamming the owner, not sourced from any document.
6. **Owner notification email address** — placeholder in the config, not yet supplied.
7. **Google Sheet ID and exact column mapping** — the workflow references a placeholder sheet ID; needs to be created and wired up once imported into a real n8n instance.

## What this prototype deliberately does NOT do

Automate payment matching/bank access, build a CRM or lead-record system, automate social-media content, or touch retention/reactivation (that's Service 2, built and measured separately, second). Several things that looked like automation opportunities in the interview turned out to be existing-tool configuration gaps already handled (Instagram/WhatsApp quick replies, Fresha's waitlist, Fresha's review prompts) — not rebuilt here.

## Success metric

Owner touches per booking drop from "multiple manual touches" (check bank, draft confirmation, send policy/location) to one action: submitting the verification form. Do not claim a rebooking-rate or revenue improvement from this pilot — that belongs to Service 2.
