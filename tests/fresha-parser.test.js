#!/usr/bin/env node
/**
 * UNIT / LOGIC TEST for the Fresha email parser and the duplicate-booking
 * check - runs the SAME JavaScript that lives inside the n8n workflow's
 * "Parse Fresha Booking Email" and "Check Duplicate Booking" Code nodes
 * (extracted verbatim from workflows/mehua-deposit-concierge.n8n.json)
 * through a tiny mock of n8n's Code-node runtime.
 *
 * This is NOT an ACTUAL N8N EXECUTION TEST - it proves the extraction logic
 * is correct in isolation, not that n8n itself will run these nodes without
 * error. See tests/mehua-lifecycle.test.js for the full simulated lifecycle,
 * and workflows/README.md / the Claude session's final instructions for how
 * to actually exercise this inside a running n8n instance.
 *
 * Run with: node tests/fresha-parser.test.js
 */

const fs = require("fs");
const path = require("path");

const workflowPath = path.join(__dirname, "..", "workflows", "mehua-deposit-concierge.n8n.json");
const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));

function getNodeCode(name) {
  const node = workflow.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`Node not found in workflow: ${name}`);
  return node.parameters.jsCode;
}

function runNode(code, itemJson, otherNodeOutputs = {}) {
  const $input = {
    all: () => [{ json: itemJson }],
    item: { json: itemJson },
  };
  const $ = (nodeName) => {
    if (!otherNodeOutputs[nodeName]) {
      throw new Error(`Mock $('${nodeName}') has no recorded output - add it to otherNodeOutputs`);
    }
    return { first: () => ({ json: otherNodeOutputs[nodeName] }) };
  };
  const fn = new Function("$input", "$", "return (function(){\n" + code + "\n})();");
  return fn($input, $)[0].json;
}

// The duplicate-check node reads $input.all() as SHEET ROWS (not the parsed
// booking - that comes from $('Parsed OK?')), so it needs a distinct runner.
function runDuplicateCheck(code, parsedBooking, existingRows) {
  const $input = {
    all: () => existingRows.map((json) => ({ json })),
  };
  const $ = (nodeName) => {
    if (nodeName !== "Parsed OK?") throw new Error(`Unexpected $('${nodeName}') lookup`);
    return { first: () => ({ json: parsedBooking }) };
  };
  const fn = new Function("$input", "$", "return (function(){\n" + code + "\n})();");
  return fn($input, $)[0].json;
}

function loadFixture(name) {
  const raw = fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
  const [headerBlock, ...rest] = raw.split(/\r?\n\r?\n/);
  const body = rest.join("\n\n");
  const subjectLine = headerBlock.split(/\r?\n/).find((l) => l.startsWith("Subject:"));
  const subject = subjectLine ? subjectLine.replace(/^Subject:\s*/, "") : "";
  return { subject, text: body };
}

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failures += 1;
  } else {
    console.log("  ok:", msg);
  }
}

const parserCode = getNodeCode("Parse Fresha Booking Email");
const dupCheckCode = getNodeCode("Check Duplicate Booking");
const FAKE_CONFIG = { client_id: "mehua_lashes", currency: "MUR" };

function parse(fixtureOrItem) {
  const item = typeof fixtureOrItem === "string" ? loadFixture(fixtureOrItem) : fixtureOrItem;
  return runNode(parserCode, { config: FAKE_CONFIG, subject: item.subject, text: item.text });
}

console.log("=== Fresha parser: 3 real (sanitized) fixtures ===\n");

console.log("[fixture 1] Format A - real new-booking trigger email");
let out = parse("fresha-booking-01.txt");
assert(out.emailKind === "new_booking", "fixture 1 classifies as new_booking");
assert(out.parseOk === true, "fixture 1 parses successfully (parseOk === true)");
assert(out.requiresHumanReview === false, "fixture 1 does not require human review");
assert(out.clientName === "Fake Customer One", `fixture 1 clientName correct (got ${out.clientName})`);
assert(out.service === "Classic Full Set", `fixture 1 service correct (got ${out.service})`);
assert(out.staffName === "Amy Stylist", `fixture 1 staffName correct (got ${out.staffName})`);
assert(out.bookingDate === "2026-09-09", `fixture 1 bookingDate correct (got ${out.bookingDate})`);
assert(out.bookingTime === "10:00", `fixture 1 bookingTime correct (got ${out.bookingTime})`);
assert(out.customerEmail === "fake.customer.one@example.com", "fixture 1 customerEmail captured");
assert(out.customerPhone === "+230 5000 0001", "fixture 1 customerPhone captured");
assert(out.freshaBookingRef === null, "fixture 1 has NO Fresha booking ref (confirmed structural absence in Format A)");
assert(out.contactMatchStrength === "email", "fixture 1 idempotency match strength is 'email' (strongest)");
assert(typeof out.compositeKey === "string" && out.compositeKey.includes("fake.customer.one@example.com"), "fixture 1 composite key built from email");
assert(out.idempotencyKey === out.compositeKey, "fixture 1 idempotencyKey falls back to compositeKey (no Fresha ref available)");
assert(typeof out.bookingReference === "string" && out.bookingReference.startsWith("MH-"), "fixture 1 got a human-typeable booking reference");

console.log("\n[fixture 2] Format B - action-required 'complete form' reminder (NOT a new booking)");
out = parse("fresha-booking-02.txt");
assert(out.emailKind === "recognized_other:action_required_form", `fixture 2 classifies as recognized_other:action_required_form (got ${out.emailKind})`);
assert(out.parseOk === false, "fixture 2 does NOT parse as a bookable record (parseOk === false)");
assert(out.requiresHumanReview === true, "fixture 2 routes to NEEDS_HUMAN_REVIEW");
assert(out.reviewReason.includes("out of scope"), "fixture 2 reviewReason explains it's out of scope, not a parse failure");
assert(out.freshaBookingRef === "FB77AC21", `fixture 2 DOES expose a real Fresha booking ref (got ${out.freshaBookingRef})`);
assert(out.clientName === null && out.bookingReference === null, "fixture 2 creates no booking fields/reference");

console.log("\n[fixture 3] Format B - cancellation notice (NOT a new booking)");
out = parse("fresha-booking-03.txt");
assert(out.emailKind === "recognized_other:cancellation", `fixture 3 classifies as recognized_other:cancellation (got ${out.emailKind})`);
assert(out.parseOk === false, "fixture 3 does NOT parse as a bookable record (parseOk === false)");
assert(out.requiresHumanReview === true, "fixture 3 routes to NEEDS_HUMAN_REVIEW");
assert(out.freshaBookingRef === "FB77AC21", "fixture 3 also exposes the real Fresha booking ref");
assert(out.clientName === null && out.bookingReference === null, "fixture 3 creates no booking fields/reference (never a duplicate new booking either)");

console.log("\n=== Failure / edge cases ===\n");

console.log("[malformed] completely empty email body");
out = parse({ subject: "", text: "" });
assert(out.emailKind === "unknown", "empty body classifies as unknown");
assert(out.parseOk === false, "empty body never parses");
assert(out.requiresHumanReview === true, "empty body routes to NEEDS_HUMAN_REVIEW");

console.log("\n[unknown format] unrelated, non-Fresha email");
out = parse({
  subject: "Your invoice is ready",
  text: "Hi there,\n\nYour invoice #4471 for MUR 2,000 is attached.\n\nThanks,\nAccounts",
});
assert(out.emailKind === "unknown", "unrelated email classifies as unknown, not misparsed as a booking");
assert(out.parseOk === false, "unrelated email never parses");

console.log("\n[missing customer name] new-booking-shaped email with no Customer details block");
out = parse({
  subject: "New appointment",
  text: "Appointment confirmed\n\nHi Jane Owner,\n\nThe following appointment has been booked online\n\nClassic Full Set with Amy Stylist\nWednesday, 9 Sep 2026, 10:00\n\nAt this location:\n\nMehua Lashes - Mehua Lashes\nSome Address\n\nPowered by Fresha",
});
assert(out.emailKind === "new_booking", "still classified as new_booking (booked-online marker present)");
assert(out.parseOk === false, "fails safely: parseOk === false when customer name is missing");
assert(out.requiresHumanReview === true, "routes to NEEDS_HUMAN_REVIEW");
assert(out.reviewReason.includes("customer name not found"), `reviewReason names the missing field (got: ${out.reviewReason})`);
assert(out.bookingReference === null, "no booking reference is generated for a failed parse - never guesses a booking into existence");

console.log("\n[missing appointment date/time] booked-online line present but date/time line unparseable");
out = parse({
  subject: "New appointment",
  text: "Appointment confirmed\n\nHi Jane Owner,\n\nThe following appointment has been booked online\n\nClassic Full Set with Amy Stylist\nDate to be confirmed by phone\n\nAt this location:\n\nMehua Lashes\n\nCustomer details:\n\nFake Customer\nfake@example.com\n+230 5000 0000\nPowered by Fresha",
});
assert(out.parseOk === false, "fails safely: parseOk === false when date/time can't be parsed");
assert(out.reviewReason.includes("appointment date/time not found"), `reviewReason names the missing field (got: ${out.reviewReason})`);

console.log("\n[missing service] booked-online marker present but not followed by the expected two-line service+date shape");
// Note: in this parser, "service" and "appointment date/time" are extracted from the SAME
// regex match (the two lines immediately after "has been booked online"). If that match
// fails at all, service and date/time are missing together - there is no way for this
// email shape to lose only the service while keeping a valid date. That is an accurate
// reflection of the real Fresha layout (both live on adjacent lines in one block), not a
// test gap - see docs/mehua-deposit-concierge-spec.md.
out = parse({
  subject: "New appointment",
  text: "Appointment confirmed\n\nHi Jane Owner,\n\nThe following appointment has been booked online\nSome unexpected single-line layout with no service/date block at all\n\nCustomer details:\n\nFake Customer\nfake@example.com\nPowered by Fresha",
});
assert(out.parseOk === false, "fails safely when the service+date block doesn't match the expected shape");
assert(out.reviewReason.includes("service not found"), `reviewReason names the missing service (got: ${out.reviewReason})`);
assert(out.reviewReason.includes("appointment date/time not found"), `reviewReason also names the missing date/time, since both come from the same match (got: ${out.reviewReason})`);

console.log("\n=== Duplicate detection (Check Duplicate Booking node) ===\n");

const parsedBooking = parse("fresha-booking-01.txt");

console.log("[duplicate] same Idempotency Key already present in the sheet");
out = runDuplicateCheck(dupCheckCode, parsedBooking, [
  { "Booking Reference": "MH-OLDROW-0001", "Idempotency Key": parsedBooking.idempotencyKey },
]);
assert(out.isDuplicate === true, "matching Idempotency Key is detected as a duplicate");
assert(out.duplicateOfBookingReference === "MH-OLDROW-0001", "duplicate points back to the existing booking's reference");

console.log("\n[not duplicate] no matching row in the sheet");
out = runDuplicateCheck(dupCheckCode, parsedBooking, [
  { "Booking Reference": "MH-OTHERROW-0002", "Idempotency Key": "someone.else@example.com|2026-01-01|09:00|lash lift" },
]);
assert(out.isDuplicate === false, "no matching row -> not flagged as duplicate");
assert(out.duplicateOfBookingReference === null, "no duplicate reference when not a duplicate");

console.log("\n[not duplicate] empty sheet (first booking ever)");
out = runDuplicateCheck(dupCheckCode, parsedBooking, []);
assert(out.isDuplicate === false, "empty log -> not a duplicate");

console.log("\n=== Summary ===");
if (failures > 0) {
  console.log(`\n${failures} assertion(s) FAILED.`);
  process.exitCode = 1;
} else {
  console.log("\nAll assertions passed.");
}
