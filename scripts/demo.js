#!/usr/bin/env node
/**
 * Méhua Lashes deposit concierge - offline end-to-end demo.
 *
 * Walks one real (sanitized) Fresha booking email through the whole pilot:
 *
 *   booking received -> parsed -> recorded -> deposit pending
 *   -> reminder due -> proof reported -> deposit verified -> confirmed
 *
 * It runs the workflow's OWN Code nodes and Google Sheets column mappings,
 * read out of workflows/mehua-deposit-concierge.n8n.json, against an
 * in-memory Booking Log - so what you see here is the real logic, not a
 * separate mock of it. That means it needs no n8n instance, no Google
 * credentials, no Gmail OAuth, and no real customer or payment.
 *
 * Run with: node scripts/demo.js     (or: npm run demo)
 */

const { runLifecycle, processEmail, loadFixture } = require("../tests/lib/lifecycle.js");
const { MockSheet } = require("../tests/lib/n8n-mock.js");

const line = (c) => console.log(c.repeat(74));

line("=");
console.log("  MEHUA LASHES - BOOKING & DEPOSIT CONCIERGE (offline demo)");
console.log("  No n8n, no Google Sheet, no Gmail, no real customer or payment.");
line("=");

const sheet = new MockSheet();
const run = runLifecycle({ sheet, log: (m) => console.log(m) });

// -- the resulting Booking Log row ----------------------------------------
console.log("\n");
line("-");
console.log("  BOOKING LOG ROW (the 28-column Google Sheet schema)");
line("-");
const row = sheet.rows[0];
const width = Math.max.apply(
  null,
  Object.keys(row).map((k) => k.length)
);
Object.keys(row).forEach((col) => {
  const value = row[col] === "" ? "-" : String(row[col]);
  console.log("  " + col.padEnd(width) + "  " + value);
});

// -- the three drafted messages -------------------------------------------
const showDraft = (title, text) => {
  if (!text) return;
  console.log("\n");
  line("-");
  console.log("  " + title);
  console.log("  (drafted for the owner to send by hand - nothing is sent automatically)");
  line("-");
  console.log(text);
};

showDraft("1. DEPOSIT REQUEST", run.drafts.deposit);
showDraft("2. DEPOSIT REMINDER (after the escalation window)", run.drafts.reminder);
showDraft("3. BOOKING CONFIRMATION (only after the owner verified)", run.drafts.confirmation);

// -- idempotency ------------------------------------------------------------
console.log("\n");
line("-");
console.log("  IDEMPOTENCY: the same Fresha email is delivered again");
line("-");
const before = sheet.rows.length;
const replay = processEmail(loadFixture("fresha-booking-01.txt"), sheet, (m) =>
  console.log("  " + m)
);
console.log("  -> isDuplicate: " + replay.duplicate.isDuplicate);
console.log("  -> matches existing booking: " + replay.duplicate.duplicateOfBookingReference);
console.log("  -> rows before: " + before + ", rows after: " + sheet.rows.length);

// -- a non-booking Fresha email ---------------------------------------------
console.log("\n");
line("-");
console.log("  SAFETY: a Fresha cancellation email must not become a booking");
line("-");
const cancelSheet = new MockSheet();
const cancel = processEmail(loadFixture("fresha-booking-03.txt"), cancelSheet, (m) =>
  console.log("  " + m)
);
console.log("  -> rows written: " + cancelSheet.rows.length + " (no booking created)");
console.log("  -> requiresHumanReview: " + cancel.parsed.requiresHumanReview);

console.log("\n");
line("=");
console.log("  FINAL STATE: " + run.finalRow.Status + "  (" + run.bookingReference + ")");
console.log("  Deposit: Rs " + row["Deposit Amount"] + " via " + row["Payment Method"]);
console.log("");
console.log("  Placeholders still showing TO_VALIDATE above are business values");
console.log("  Mehua has not supplied yet - see docs/mehua-deposit-concierge-spec.md.");
line("=");
