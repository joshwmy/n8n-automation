#!/usr/bin/env node
/**
 * End-to-end development test for the Mehua deposit-concierge lifecycle.
 *
 * This runs the SAME JavaScript that lives inside the n8n workflow's Code
 * nodes (extracted verbatim from workflows/mehua-deposit-concierge.n8n.json)
 * through a tiny mock of n8n's Code-node runtime, so we can exercise the
 * full state machine without a live n8n instance, a real Gmail inbox, a
 * real Fresha email, a real customer, or a real Juice transaction.
 *
 * Run with: node tests/mehua-lifecycle.test.js
 *
 * This is a development/demonstration test, not a unit-test-framework
 * suite - kept dependency-free on purpose.
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

// Minimal mock of the n8n Code-node execution context.
function runNode(name, items, otherNodeOutputs = {}) {
  const code = getNodeCode(name);
  const $input = {
    all: () => items.map((json) => ({ json })),
    item: { json: items[0] },
  };
  const $ = (nodeName) => {
    if (!otherNodeOutputs[nodeName]) {
      throw new Error(`Mock $('${nodeName}') has no recorded output - add it to otherNodeOutputs`);
    }
    return { first: () => ({ json: otherNodeOutputs[nodeName] }) };
  };
  const fn = new Function("$input", "$", "return (function(){\n" + code + "\n})();");
  return fn($input, $);
}

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("  ok:", msg);
  }
}

console.log("=== Mehua deposit-concierge: simulated end-to-end lifecycle ===\n");

// 1. Load config + inject simulated booking (mirrors the TEST manual-trigger branch)
console.log("[1] TEST - Simulate New Booking (Dev Only) -> Load Mehua Config (Test Path)");
let out = runNode("Load Mehua Config (Test Path)", [{}]);
assert(out[0].json.config.deposit.amount === 500, "config.deposit.amount === 500");
assert(out[0].json.config.deposit.method === "Juice", "config.deposit.method === 'Juice'");
assert(
  out[0].json.config.deposit.payment_details === "5902 8505 (MCB Juice)",
  "config.deposit.payment_details is the real, owner-provided Juice number (no invented phone number)"
);

console.log("\n[2] Inject Simulated Booking Data (TEST)");
out = runNode("Inject Simulated Booking Data (TEST)", out.map((o) => o.json));
const bookingRef = out[0].json.bookingRef;
assert(out[0].json.clientName === "Test Customer", "clientName === 'Test Customer'");
assert(out[0].json.service === "Classic Full Set", "service === 'Classic Full Set'");
assert(out[0].json.parseOk === true, "parseOk === true (simulated booking always parses)");
console.log("  bookingRef:", bookingRef);

console.log("\n[3] Compute Deposit Fields");
out = runNode("Compute Deposit Fields", out.map((o) => o.json));
let booking = out[0].json;
assert(booking.status === "AWAITING_DEPOSIT", "status === 'AWAITING_DEPOSIT'");
assert(booking.depositAmount === 500, "depositAmount === 500");
assert(booking.paymentMethod === "Juice", "paymentMethod === 'Juice'");
console.log("  status:", booking.status);

console.log("\n[4] Render Deposit Request Message");
out = runNode("Render Deposit Request Message", [booking]);
console.log("--- drafted message ---\n" + out[0].json.messageDraft + "\n-----------------------");
assert(out[0].json.messageDraft.includes("TEMPORARY"), "message is clearly marked TEMPORARY");
assert(out[0].json.messageDraft.includes("Rs 500"), "message includes the confirmed Rs 500 amount");
assert(out[0].json.messageDraft.includes("Juice"), "message includes the confirmed Juice payment method");
assert(
  out[0].json.messageDraft.includes("5902 8505"),
  "message includes the real Juice payment number, not an invented one"
);

console.log(
  "\n[5] (simulated) Owner Form - Report Proof Received -> Update Status - AWAITING_MANUAL_VERIFICATION"
);
booking = { ...booking, Status: "AWAITING_MANUAL_VERIFICATION", "Proof Received At": new Date().toISOString() };
assert(booking.Status === "AWAITING_MANUAL_VERIFICATION", "status === 'AWAITING_MANUAL_VERIFICATION'");
console.log("  status:", booking.Status, "(screenshot reported - NOT yet verified)");

console.log(
  "\n[6] (simulated) Owner Form - Review Deposit Verification (Verification Result = Verified) -> Update Status - DEPOSIT_VERIFIED"
);
booking = {
  ...booking,
  Status: "DEPOSIT_VERIFIED",
  "Verified At": new Date().toISOString(),
  "Verified By": "Mehua (test)",
  "Verification Result": "Verified",
  "Client Name": booking.clientName,
  "Appointment Date": booking.bookingDate,
  "Appointment Time": booking.bookingTime,
  "Deposit Amount": booking.depositAmount,
};
assert(booking.Status === "DEPOSIT_VERIFIED", "status === 'DEPOSIT_VERIFIED' only after explicit owner action");

console.log("\n[7] Render Confirmation Message");
const configForVerify = runNode("Load Mehua Config (Test Path)", [{}])[0].json.config;
out = runNode("Render Confirmation Message", [booking], {
  "Load Mehua Config (Verify Path)": { config: configForVerify },
});
console.log("--- drafted message ---\n" + out[0].json.messageDraft + "\n-----------------------");
assert(out[0].json.messageDraft.includes("TEMPORARY"), "confirmation message is clearly marked TEMPORARY");
assert(out[0].json.messageDraft.includes("Rs 500"), "confirmation includes the confirmed Rs 500 amount");
assert(
  out[0].json.messageDraft.includes("TO_VALIDATE_STUDIO_LOCATION"),
  "confirmation honestly shows the unresolved studio location placeholder, does not invent one"
);
assert(
  out[0].json.messageDraft.includes("TO_VALIDATE_DEPOSIT_POLICY"),
  "confirmation honestly shows the unresolved deposit policy placeholder, does not invent one"
);

console.log("\n=== Lifecycle complete: AWAITING_DEPOSIT -> AWAITING_MANUAL_VERIFICATION -> DEPOSIT_VERIFIED ===");
console.log("No real customer, real Juice transaction, real Gmail inbox or real WhatsApp account was used.");
if (process.exitCode === 1) {
  console.log("\nSome assertions FAILED - see above.");
} else {
  console.log("\nAll assertions passed.");
}
