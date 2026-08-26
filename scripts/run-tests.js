#!/usr/bin/env node
/**
 * Runs every check in the repo and reports one overall pass/fail.
 *
 * Deliberately dependency-free (no test framework): each suite is a plain
 * Node script that exits non-zero on failure, so this only has to spawn them
 * and collect exit codes.
 *
 * Run with: npm test    (or: node scripts/run-tests.js)
 */

const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

const SUITES = [
  ["Compose validation", "scripts/validate-compose.js"],
  ["Workflow integrity", "tests/workflow-integrity.test.js"],
  ["Fresha parser", "tests/fresha-parser.test.js"],
  ["Mehua lifecycle", "tests/mehua-lifecycle.test.js"],
];

const results = [];

SUITES.forEach((suite) => {
  const name = suite[0];
  const file = suite[1];
  console.log("\n" + "#".repeat(74));
  console.log("# " + name + "  (" + file + ")");
  console.log("#".repeat(74));
  const r = spawnSync(process.execPath, [file], { cwd: ROOT, stdio: "inherit" });
  results.push({ name: name, file: file, status: r.status });
});

console.log("\n" + "=".repeat(74));
console.log("SUMMARY");
console.log("=".repeat(74));

let failed = 0;
results.forEach((r) => {
  const label = r.status === 0 ? "PASS" : "FAIL";
  if (r.status !== 0) failed += 1;
  console.log("  " + label + "  " + r.name + "  (" + r.file + ")");
});

if (failed) {
  console.log("\n" + failed + " of " + results.length + " suites FAILED.");
  process.exit(1);
}
console.log("\nAll " + results.length + " suites passed.");
