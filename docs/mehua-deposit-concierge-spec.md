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
  → logs a new row in the Google Sheet booking log (status: New)
  → drafts the deposit-instructions message (amount, payment methods)
  → emails the draft to the owner so she can copy it into WhatsApp herself
    (n8n cannot send WhatsApp messages directly — see Constraints)
  → updates the row: status = Instructions Sent, timestamp

[separate scheduled check, every few hours]
  → scans the sheet for rows still "Instructions Sent" or "Reminder Sent"
    older than the reminder/escalation window
  → drafts a reminder and emails it to the owner
  → updates status = Reminder Sent

[separate entry point: owner-facing form]
  → owner receives the WhatsApp payment screenshot from the client directly
    (outside n8n) and checks her bank/Juice statement herself
  → owner opens a simple n8n form, enters the booking reference, marks it verified
  → n8n drafts the confirmation + policy + location message and emails it to
    the owner to send via WhatsApp
  → updates the row: status = Confirmed, verified_at, verified_by
```

## Hard constraints (do not build around these — they are the owner's explicit boundaries)

- **Payment verification stays 100% human.** Never attempt automatic bank/Juice-statement matching. This is the named worst-case failure mode in the source research (a false "verified" state damages the brand) and the owner's own stated requirement.
- **Nothing sends to a client automatically without the owner reviewing it first**, unless she later explicitly authorises unattended sending. Every "send" step in this build is really "draft it and notify the owner" — she copy-pastes into WhatsApp herself.
- **Trigger via email-parsing only.** Fresha has no public API, no webhooks, no Zapier/Make listing — confirmed in the research (only a read-only finance-data connector exists, not usable for triggers). Browser automation against Fresha was explicitly evaluated and rejected (fragile, ToS risk).
- **No bank/payment details stored in this or any third-party tool** — only the fact that a deposit was verified, by whom, and when.
- **No WhatsApp Business Platform (paid API) in Phase 1** — stay on the free WhatsApp Business App; that's why every WhatsApp step here is "draft + notify owner," not "send."

## Google Sheet — booking log schema

One row per booking. Columns: `Booking Reference`, `Client Name`, `Service`, `Appointment Date/Time`, `Status` (New / Instructions Sent / Reminder Sent / Verified / Confirmed / Flagged), `Instructions Sent At`, `Reminder Sent At`, `Verified At`, `Verified By`, `Confirmation Sent At`, `Notes`.

## What's still genuinely missing (`TO_VALIDATE` — not guessed, needs Joshua/Méhua)

1. **A real sample Fresha booking-confirmation email** (forward one, or paste the raw text/headers) — the parsing node in the attached workflow is a placeholder until this exists. Without it, the extraction logic is a best guess at Fresha's typical format, not a tested pattern.
2. **How n8n reads the inbox** — Méhua's own Gmail via OAuth, an app-password IMAP connection, or a forwarding rule into a separate mailbox Joshua controls. Not decided.
3. **Deposit amount and payment methods wording** — exact text/numbers to put in the drafted message (bank details, Juice number, amount per service). Not supplied yet.
4. **Reminder/escalation timing** — the source docs mention "N hours" generically and "no proof after 48h" as the escalation point, but no fixed number has been confirmed with Méhua.

## What this prototype deliberately does NOT do

Automate payment matching/bank access, build a CRM or lead-record system, automate social-media content, or touch retention/reactivation (that's Service 2, built and measured separately, second). Several things that looked like automation opportunities in the interview turned out to be existing-tool configuration gaps already handled (Instagram/WhatsApp quick replies, Fresha's waitlist, Fresha's review prompts) — not rebuilt here.

## Success metric

Owner touches per booking drop from "multiple manual touches" (check bank, draft confirmation, send policy/location) to one action: submitting the verification form. Do not claim a rebooking-rate or revenue improvement from this pilot — that belongs to Service 2.
