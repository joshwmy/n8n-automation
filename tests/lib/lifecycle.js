/**
 * Drives one booking all the way through the workflow, using the workflow's
 * own Code nodes and Google Sheets column mappings against an in-memory
 * Booking Log.
 *
 * Shared by tests/mehua-lifecycle.test.js (which asserts on the result) and
 * scripts/demo.js (which prints it), so the demo and the test are provably
 * the same code path - not two drifting imitations of it.
 *
 * Nothing here touches a real Gmail inbox, a real Google Sheet, a real
 * customer, a real Juice transaction or a real WhatsApp account. The Gmail
 * "Notify Owner" nodes are the only steps deliberately not executed: they
 * would send mail, and in this workflow they only ever forward a draft that
 * has already been rendered by the preceding Code node.
 */

const fs = require("fs");
const path = require("path");
const h = require("./n8n-mock.js");

const HOUR_MS = 60 * 60 * 1000;

/** Split a fixture file into the { subject, text } shape the Gmail Trigger emits. */
function loadFixture(name) {
  const raw = fs.readFileSync(
    path.join(__dirname, "..", "fixtures", name),
    "utf8"
  );
  const parts = raw.split(/\r?\n\r?\n/);
  const headerBlock = parts[0];
  const body = parts.slice(1).join("\n\n");
  const subjectLine = headerBlock
    .split(/\r?\n/)
    .find((l) => l.indexOf("Subject:") === 0);
  const subject = subjectLine ? subjectLine.replace(/^Subject:\s*/, "") : "";
  return { subject, text: body };
}

/**
 * Run the email -> parse -> duplicate-check portion of the workflow.
 * Returns the parsed booking plus the duplicate verdict without writing
 * anything, so it can be called twice to prove idempotency.
 */
function processEmail(email, sheet, log) {
  log = log || function () {};
  log("Gmail Trigger: New Fresha Booking Email");
  const withConfig = h.runCodeNode("Load Mehua Config (Email Path)", [email])[0]
    .json;

  log("Parse Fresha Booking Email");
  const parsed = h.runCodeNode("Parse Fresha Booking Email", [withConfig])[0]
    .json;
  log(
    "  emailKind=" +
      parsed.emailKind +
      " parseOk=" +
      parsed.parseOk +
      " requiresHumanReview=" +
      parsed.requiresHumanReview
  );

  if (!parsed.parseOk) return { parsed, duplicate: null };

  log("Read Booking Log (Duplicate Check) -> Check Duplicate Booking");
  const existingRows = h.runSheetsNode("Read Booking Log (Duplicate Check)", sheet);
  const duplicate = h.runCodeNode("Check Duplicate Booking", existingRows, {
    "Parsed OK?": parsed,
  })[0].json;
  log(
    "  idempotencyKey=" +
      duplicate.idempotencyKey +
      " isDuplicate=" +
      duplicate.isDuplicate
  );

  return { parsed, duplicate };
}

/**
 * The full happy path: a real Fresha "New appointment" email becomes a logged
 * booking, gets a deposit request, falls overdue, is reported and verified by
 * the owner, and ends confirmed.
 *
 * `hoursSinceDepositRequest` back-dates the "Deposit Request Sent At" stamp so
 * the reminder branch can be exercised without waiting two real days.
 */
function runLifecycle(options) {
  options = options || {};
  const log = options.log || function () {};
  const sheet = options.sheet || new h.MockSheet();
  const fixture = options.fixture || "fresha-booking-01.txt";
  const hoursSinceDepositRequest =
    options.hoursSinceDepositRequest === undefined
      ? 50
      : options.hoursSinceDepositRequest;

  const now = new Date();
  const depositSentAt = new Date(
    now.getTime() - hoursSinceDepositRequest * HOUR_MS
  );

  const email = loadFixture(fixture);
  const result = { sheet, drafts: {} };

  // -- 1. booking detected ------------------------------------------------
  log("\n--- 1. Fresha email arrives ---");
  const firstPass = processEmail(email, sheet, log);
  result.parsed = firstPass.parsed;
  result.duplicate = firstPass.duplicate;

  if (!firstPass.parsed.parseOk) {
    log("Parsed OK? -> false. Nothing further runs on the booking path.");
    return result;
  }

  // -- 2. booking recorded ------------------------------------------------
  log("\n--- 2. Booking recorded ---");
  const booking = h.runCodeNode("Compute Deposit Fields", [
    firstPass.duplicate,
  ])[0].json;
  result.booking = booking;
  log("Compute Deposit Fields -> status=" + booking.status);

  const row = h.runSheetsNode("Log New Booking (AWAITING_DEPOSIT)", sheet, {
    json: booking,
    now: h.makeNow(now),
  });
  log(
    "Log New Booking -> row " +
      row["Booking Reference"] +
      " (" +
      row.Status +
      ", Rs " +
      row["Deposit Amount"] +
      " via " +
      row["Payment Method"] +
      ")"
  );

  // -- 3. deposit request drafted ----------------------------------------
  log("\n--- 3. Deposit request drafted for the owner ---");
  result.drafts.deposit = h.runCodeNode("Render Deposit Request Message", [row], {
    "Compute Deposit Fields": booking,
  })[0].json.messageDraft;
  log("Render Deposit Request Message -> draft ready");
  log("(Notify Owner - Deposit Instructions: not executed, would send email)");

  h.runSheetsNode("Update - Deposit Request Sent At", sheet, {
    nodeOutputs: { "Compute Deposit Fields": booking },
    now: h.makeNow(depositSentAt),
  });
  log(
    "Update - Deposit Request Sent At -> " +
      depositSentAt.toISOString() +
      " (" +
      hoursSinceDepositRequest +
      "h ago)"
  );

  // -- 4. reminder / escalation ------------------------------------------
  log("\n--- 4. Scheduled overdue check ---");
  const configForOverdue = h.runCodeNode("Load Mehua Config (Overdue Path)", [
    {},
  ])[0].json;
  const allRows = h.runSheetsNode("Read Booking Log", sheet);
  const dueRows = h
    .runCodeNode("Filter Rows Needing Reminder (OVERDUE)", allRows, {
      "Load Mehua Config (Overdue Path)": configForOverdue,
    })
    .map((i) => i.json);
  result.dueForReminder = dueRows;
  log(
    "Filter Rows Needing Reminder -> " +
      dueRows.length +
      " row(s) past the " +
      configForOverdue.config.reminder_escalation_hours +
      "h window"
  );

  if (dueRows.length) {
    result.drafts.reminder = h.runCodeNode("Render Deposit Reminder Message", [
      dueRows[0],
    ])[0].json.messageDraft;
    log("Render Deposit Reminder Message -> draft ready");
    log("(Notify Owner - Reminder Draft: not executed, would send email)");

    const overdueRow = h.runSheetsNode("Update Status - OVERDUE", sheet, {
      nodeOutputs: { "Filter Rows Needing Reminder (OVERDUE)": dueRows[0] },
      now: h.makeNow(now),
    });
    // Snapshot: later steps move this same row on to VERIFIED/REJECTED.
    result.overdueRow = Object.assign({}, overdueRow);
    log("Update Status - OVERDUE -> " + overdueRow.Status);
  }

  const bookingRef = row["Booking Reference"];

  // -- 5. owner reports the WhatsApp screenshot --------------------------
  log("\n--- 5. Owner Form: Report Proof Received ---");
  const proofRow = h.runSheetsNode(
    "Update Status - AWAITING_MANUAL_VERIFICATION",
    sheet,
    { json: { "Booking Reference": bookingRef }, now: h.makeNow(now) }
  );
  log("-> " + proofRow.Status + " (screenshot reported, NOT verified)");

  // -- 6. owner verifies against her own Juice/bank statement ------------
  log("\n--- 6. Owner Form: Review Deposit Verification ---");
  const verificationSubmission = {
    "Booking Reference": bookingRef,
    "Verified By": options.verifiedBy || "Mehua (demo)",
    "Verification Result": options.verificationResult || "Verified",
  };
  const verifyNodeName =
    verificationSubmission["Verification Result"] === "Verified"
      ? "Update Status - DEPOSIT_VERIFIED"
      : "Update Status - DEPOSIT_REJECTED";
  const verifiedRow = h.runSheetsNode(verifyNodeName, sheet, {
    json: verificationSubmission,
    now: h.makeNow(now),
  });
  log("-> " + verifiedRow.Status + " by " + verifiedRow["Verified By"]);

  if (verifiedRow.Status !== "DEPOSIT_VERIFIED") {
    log("(Notify Owner - Deposit Rejected: not executed. No client message.)");
    result.finalRow = verifiedRow;
    result.bookingReference = bookingRef;
    return result;
  }

  // -- 7. confirmation ----------------------------------------------------
  log("\n--- 7. Confirmation drafted ---");
  const foundRows = h.runSheetsNode("Read Verified Row", sheet, {
    nodeOutputs: {
      "Owner Form - Review Deposit Verification": verificationSubmission,
    },
  });
  result.verifiedRowsRead = foundRows;
  log("Read Verified Row -> " + foundRows.length + " row");

  const configForVerify = h.runCodeNode("Load Mehua Config (Verify Path)", [
    {},
  ])[0].json;
  result.drafts.confirmation = h.runCodeNode(
    "Render Confirmation Message",
    [foundRows[0]],
    { "Load Mehua Config (Verify Path)": configForVerify }
  )[0].json.messageDraft;
  log("Render Confirmation Message -> draft ready");
  log("(Notify Owner - Final Confirmation: not executed, would send email)");

  const finalRow = h.runSheetsNode("Update - Confirmation Sent At", sheet, {
    nodeOutputs: { "Read Verified Row": foundRows[0] },
    now: h.makeNow(now),
  });
  log("Update - Confirmation Sent At -> " + finalRow["Confirmation Sent At"]);

  result.finalRow = finalRow;
  result.bookingReference = bookingRef;
  return result;
}

module.exports = { loadFixture, processEmail, runLifecycle, HOUR_MS };
