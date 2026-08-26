#!/usr/bin/env node
/**
 * End-to-end lifecycle test for the Mehua deposit concierge.
 *
 * Runs the SAME node definitions that live inside the n8n workflow - the Code
 * nodes' JavaScript and the Google Sheets nodes' column mappings, both read
 * straight out of workflows/mehua-deposit-concierge.n8n.json - against an
 * in-memory Booking Log. Nothing is reimplemented here, so a change to the
 * workflow that breaks the lifecycle breaks this test.
 *
 * No n8n instance, real Gmail inbox, real Fresha email, real customer, real
 * Juice transaction or real WhatsApp account is involved.
 *
 * Run with: node tests/mehua-lifecycle.test.js
 */

const h = require("./lib/n8n-mock.js");
const { runLifecycle, processEmail, loadFixture } = require("./lib/lifecycle.js");

const { assert, summary, MockSheet, runCodeNode, runSheetsNode } = h;

console.log("=== Mehua deposit concierge: full lifecycle ===");

// --------------------------------------------------------------------------
// The happy path, driven by a real (sanitized) Fresha "New appointment".
// --------------------------------------------------------------------------
const sheet = new MockSheet();
const run = runLifecycle({ sheet, log: (m) => console.log("  " + m) });

console.log("\n[booking parsed]");
assert(run.parsed.emailKind === "new_booking", "real Fresha email classifies as new_booking");
assert(run.parsed.parseOk === true, "required fields parsed from the real email");
assert(run.parsed.clientName === "Fake Customer One", "client name extracted");
assert(run.parsed.bookingDate === "2026-09-09", "appointment date extracted");
assert(run.parsed.bookingTime === "10:00", "appointment time extracted");

console.log("\n[booking recorded - deposit pending]");
const row = sheet.rows[0];
assert(sheet.rows.length === 1, "exactly one row was written to the Booking Log");
assert(run.booking.status === "AWAITING_DEPOSIT", "a new booking starts AWAITING_DEPOSIT");
assert(row["Deposit Amount"] === 500, "deposit amount is the confirmed Rs 500");
assert(row["Deposit Currency"] === "MUR", "deposit currency is MUR");
assert(row["Payment Method"] === "Juice", "payment method is Juice");
assert(row["Client ID"] === "mehua_lashes", "client id is stamped for multi-tenant reuse");
assert(row["Source"] === "email", "source records that this came from an email");
assert(
  row["Contact Match Strength"] === "email",
  "idempotency match strength recorded as the strongest tier available"
);
assert(
  Boolean(row["Deposit Request Sent At"]),
  "Deposit Request Sent At was persisted (the update node maps columns)"
);

console.log("\n[deposit request draft]");
assert(run.drafts.deposit.includes("Rs 500"), "deposit draft states Rs 500");
assert(
  run.drafts.deposit.includes("5902 8505 (MCB Juice)"),
  "deposit draft carries the real owner-provided Juice number, not an invented one"
);
assert(run.drafts.deposit.includes("TEMPORARY"), "deposit draft is marked TEMPORARY wording");
assert(
  run.drafts.deposit.includes("Fake Customer One"),
  "deposit draft is addressed to the parsed customer"
);

console.log("\n[reminder / escalation]");
assert(run.dueForReminder.length === 1, "a booking 50h past the 48h window is due for a reminder");
assert(run.overdueRow.Status === "OVERDUE", "the row is escalated to OVERDUE at that point");
assert(run.drafts.reminder.includes("Rs 500"), "reminder draft states Rs 500");
assert(
  Boolean(sheet.rows[0]["Reminder Sent At"]),
  "Reminder Sent At was persisted, so the cooldown can suppress repeats"
);

console.log("\n[confirmation]");
assert(
  run.verifiedRowsRead.length === 1,
  "Read Verified Row returns exactly the verified booking, not the whole sheet"
);
assert(run.finalRow.Status === "DEPOSIT_VERIFIED", "booking ends DEPOSIT_VERIFIED");
assert(run.finalRow["Verified By"] === "Mehua (demo)", "who verified is recorded");
assert(run.finalRow["Verification Result"] === "Verified", "verification result is recorded");
assert(Boolean(run.finalRow["Verified At"]), "Verified At timestamp is recorded");
assert(Boolean(run.finalRow["Confirmation Sent At"]), "Confirmation Sent At is recorded");
assert(
  run.drafts.confirmation.includes("TO_VALIDATE_STUDIO_LOCATION"),
  "confirmation shows the unresolved studio location placeholder rather than inventing one"
);
assert(
  run.drafts.confirmation.includes("TO_VALIDATE_DEPOSIT_POLICY"),
  "confirmation shows the unresolved deposit policy placeholder rather than inventing one"
);

// --------------------------------------------------------------------------
// Idempotency: the same email processed again must not create a booking.
// --------------------------------------------------------------------------
console.log("\n[idempotency] same Fresha email arrives a second time");
const rowsBefore = sheet.rows.length;
const replay = processEmail(loadFixture("fresha-booking-01.txt"), sheet);
assert(replay.duplicate.isDuplicate === true, "replayed email is detected as a duplicate");
assert(
  replay.duplicate.duplicateOfBookingReference === run.bookingReference,
  "duplicate points back at the original booking reference"
);
assert(sheet.rows.length === rowsBefore, "no second row is written for the same booking");

const ignored = runCodeNode("Log Duplicate Booking Ignored", [replay.duplicate])[0].json;
assert(
  ignored.event === "duplicate_booking_ignored",
  "the duplicate branch emits an observable no-op event"
);

// A third pass, to show the state stays stable rather than merely deferring.
const replay2 = processEmail(loadFixture("fresha-booking-01.txt"), sheet);
assert(replay2.duplicate.isDuplicate === true, "a third pass is still a duplicate");
assert(sheet.rows.length === rowsBefore, "the Booking Log is still one row");

// --------------------------------------------------------------------------
// A recognized non-booking Fresha email must not touch the Booking Log.
// --------------------------------------------------------------------------
console.log("\n[recognized non-booking] Fresha cancellation notice");
const cancelSheet = new MockSheet();
const cancelRun = runLifecycle({
  sheet: cancelSheet,
  fixture: "fresha-booking-03.txt",
});
assert(
  cancelRun.parsed.emailKind === "recognized_other:cancellation",
  "cancellation email is recognized as such"
);
assert(cancelRun.parsed.parseOk === false, "cancellation never parses into a booking");
assert(
  cancelRun.parsed.requiresHumanReview === false,
  "a recognized cancellation is expected input, not something a human must review"
);
assert(
  cancelRun.parsed.isRecognizedNonBooking === true,
  "cancellation is flagged for the no-op branch"
);
assert(cancelSheet.rows.length === 0, "no row is written for a cancellation");

const noop = runCodeNode("Log Recognized Non-Booking Event (Ignored)", [cancelRun.parsed])[0]
  .json;
assert(
  noop.event === "recognized_non_booking_event_ignored",
  "the recognized-non-booking branch emits an observable no-op event"
);

// --------------------------------------------------------------------------
// An unrecognized email must fail safely and stay visible.
// --------------------------------------------------------------------------
console.log("\n[malformed] an email that is not a Fresha notification at all");
const junkSheet = new MockSheet();
const junkConfig = runCodeNode("Load Mehua Config (Email Path)", [
  { subject: "Lunch?", text: "are we still on for friday" },
])[0].json;
const junkParsed = runCodeNode("Parse Fresha Booking Email", [junkConfig])[0].json;
assert(junkParsed.emailKind === "unknown", "unrelated email classifies as unknown");
assert(junkParsed.parseOk === false, "unrelated email never parses into a booking");
assert(junkParsed.requiresHumanReview === true, "unknown format is routed for human review");
assert(
  junkParsed.isRecognizedNonBooking === false,
  "unknown is not confused with a recognized non-booking event"
);

const reviewRow = runSheetsNode(
  "Log Unparseable Booking (NEEDS_HUMAN_REVIEW)",
  junkSheet,
  { json: junkParsed, now: h.makeNow() }
);
assert(reviewRow.Status === "NEEDS_HUMAN_REVIEW", "it is logged as NEEDS_HUMAN_REVIEW");
assert(reviewRow["Requires Human Review"] === true, "the human-review flag is set on the row");
assert(
  typeof reviewRow["Review Reason"] === "string" && reviewRow["Review Reason"].length > 0,
  "a reason is recorded so the failure is investigable"
);
assert(
  !reviewRow["Booking Reference"],
  "no booking reference is minted for an email that never parsed"
);

// --------------------------------------------------------------------------
// The rejection path must not draft anything for the client.
// --------------------------------------------------------------------------
console.log("\n[rejection] owner marks the deposit Rejected");
const rejectSheet = new MockSheet();
const rejectRun = runLifecycle({
  sheet: rejectSheet,
  verificationResult: "Rejected",
  verifiedBy: "Mehua (demo)",
});
assert(rejectRun.finalRow.Status === "DEPOSIT_REJECTED", "booking ends DEPOSIT_REJECTED");
assert(
  rejectRun.drafts.confirmation === undefined,
  "no confirmation message is drafted for a rejected deposit"
);
assert(
  !rejectSheet.rows[0]["Confirmation Sent At"],
  "Confirmation Sent At stays empty on the rejection path"
);

// --------------------------------------------------------------------------
// The reminder cooldown must suppress a second reminder.
// --------------------------------------------------------------------------
console.log("\n[reminder cooldown] a booking reminded 1h ago is not reminded again");
const cooldownConfig = runCodeNode("Load Mehua Config (Overdue Path)", [{}])[0].json;
const HOUR = 3600 * 1000;
const justReminded = [
  Object.assign({}, sheet.rows[0], {
    Status: "OVERDUE",
    "Deposit Request Sent At": new Date(Date.now() - 100 * HOUR).toISOString(),
    "Reminder Sent At": new Date(Date.now() - 1 * HOUR).toISOString(),
  }),
];
const stillDue = runCodeNode("Filter Rows Needing Reminder (OVERDUE)", justReminded, {
  "Load Mehua Config (Overdue Path)": cooldownConfig,
});
assert(stillDue.length === 0, "the resend cooldown suppresses a duplicate reminder");

const longAgoReminded = [
  Object.assign({}, justReminded[0], {
    "Reminder Sent At": new Date(Date.now() - 30 * HOUR).toISOString(),
  }),
];
const dueAgain = runCodeNode("Filter Rows Needing Reminder (OVERDUE)", longAgoReminded, {
  "Load Mehua Config (Overdue Path)": cooldownConfig,
});
assert(dueAgain.length === 1, "past the cooldown, a reminder becomes due again");

console.log("\n[reminder] a verified booking is never reminded");
const verifiedRows = [
  Object.assign({}, sheet.rows[0], {
    Status: "DEPOSIT_VERIFIED",
    "Deposit Request Sent At": new Date(Date.now() - 100 * HOUR).toISOString(),
    "Reminder Sent At": "",
  }),
];
const verifiedDue = runCodeNode("Filter Rows Needing Reminder (OVERDUE)", verifiedRows, {
  "Load Mehua Config (Overdue Path)": cooldownConfig,
});
assert(verifiedDue.length === 0, "a DEPOSIT_VERIFIED booking is not chased for a deposit");

// --------------------------------------------------------------------------
// The dev-only TEST branch must still mirror the real parser's output shape.
// --------------------------------------------------------------------------
console.log("\n[dev test branch] TEST - Simulate New Booking");
const testConfig = runCodeNode("Load Mehua Config (Test Path)", [{}])[0].json;
const simulated = runCodeNode("Inject Simulated Booking Data (TEST)", [testConfig])[0].json;
assert(simulated.parseOk === true, "the simulated booking parses");
assert(simulated.emailKind === "new_booking", "it mirrors the real parser's emailKind");
assert(simulated.source === "test-simulation", "it is labelled as a simulation, not an email");
assert(
  typeof simulated.idempotencyKey === "string" && simulated.idempotencyKey.length > 0,
  "it carries an idempotency key, so duplicate detection applies to it too"
);
["bookingReference", "clientName", "service", "bookingDate", "bookingTime", "contactMatchStrength"].forEach(
  (field) => {
    assert(
      Object.keys(simulated).includes(field),
      "simulated booking carries the real parser field: " + field
    );
  }
);

summary("Mehua lifecycle");
