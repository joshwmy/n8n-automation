/**
 * A very small mock of the parts of n8n that this workflow actually uses.
 *
 * The point is that tests exercise the REAL node definitions taken straight
 * out of workflows/mehua-deposit-concierge.n8n.json - the Code nodes' actual
 * JavaScript and the Google Sheets nodes' actual column mappings - rather
 * than a reimplementation that could drift from the workflow.
 *
 * It supports only the expression forms the workflow really contains:
 *   ={{ $json['Column'] }}          ={{ $json.field }}
 *   ={{ $now.toISO() }}             ={{ $('Node Name').item.json['Column'] }}
 * plus plain literal strings. Anything else throws loudly instead of
 * silently returning undefined.
 */

const fs = require("fs");
const path = require("path");

const WORKFLOW_PATH = path.join(
  __dirname,
  "..",
  "..",
  "workflows",
  "mehua-deposit-concierge.n8n.json"
);

/** The 28-column Booking Log schema, in sheet order (A:AB). */
const SHEET_COLUMNS = [
  "Booking Reference",
  "Client ID",
  "Idempotency Key",
  "Fresha Booking Ref",
  "Client Name",
  "Customer Contact",
  "Contact Match Strength",
  "Service",
  "Staff Name",
  "Appointment Date",
  "Appointment Time",
  "Status",
  "Requires Human Review",
  "Review Reason",
  "Deposit Amount",
  "Deposit Currency",
  "Payment Method",
  "Deposit Request Sent At",
  "Reminder Sent At",
  "Proof Received At",
  "Verified At",
  "Verified By",
  "Verification Result",
  "Confirmation Sent At",
  "Created At",
  "Updated At",
  "Notes",
  "Source",
];

function loadWorkflow() {
  return JSON.parse(fs.readFileSync(WORKFLOW_PATH, "utf8"));
}

const workflow = loadWorkflow();

function getNode(name) {
  const node = workflow.nodes.find((n) => n.name === name);
  if (!node) throw new Error("Node not found in workflow: " + name);
  return node;
}

// --------------------------------------------------------------------------
// Expression evaluation
// --------------------------------------------------------------------------

/** Stand-in for n8n's Luxon $now, with the one method the workflow calls. */
function makeNow(fixedDate) {
  const d = fixedDate ? new Date(fixedDate) : new Date();
  return { toISO: () => d.toISOString() };
}

/**
 * Build the node accessor used as $('Node Name') inside expressions and Code
 * nodes. Mirrors n8n: .item.json is the linked item, .first().json the first.
 */
function makeNodeAccessor(nodeOutputs) {
  return (nodeName) => {
    if (!(nodeName in nodeOutputs)) {
      throw new Error(
        "Mock $('" + nodeName + "') has no recorded output - pass it in nodeOutputs"
      );
    }
    const json = nodeOutputs[nodeName];
    return { item: { json }, first: () => ({ json }), all: () => [{ json }] };
  };
}

/**
 * Evaluate one n8n parameter value. Non-string values and strings that do not
 * start with "=" are literals and pass straight through.
 */
function evalExpression(raw, ctx) {
  ctx = ctx || {};
  if (typeof raw !== "string" || raw[0] !== "=") return raw;

  const body = raw.slice(1);
  const $json = ctx.json || {};
  const $now = ctx.now || makeNow();
  const $ = makeNodeAccessor(ctx.nodeOutputs || {});

  const run = (src) => {
    try {
      // eslint-disable-next-line no-new-func
      return new Function("$json", "$now", "$", "return (" + src + ");")($json, $now, $);
    } catch (err) {
      throw new Error("Failed to evaluate expression {{" + src + "}}: " + err.message);
    }
  };

  // A value that is exactly one {{ ... }} keeps its native type (number,
  // boolean, null); mixed text/expression is concatenated as a string.
  const only = body.match(/^\s*\{\{([\s\S]*)\}\}\s*$/);
  if (only) return run(only[1]);
  return body.replace(/\{\{([\s\S]*?)\}\}/g, (_, src) => String(run(src)));
}

// --------------------------------------------------------------------------
// Code nodes
// --------------------------------------------------------------------------

/**
 * Run a Code node's real JavaScript. items is an array of plain json objects;
 * returns n8n-shaped [{ json }].
 */
function runCodeNode(name, items, nodeOutputs) {
  const node = getNode(name);
  if (node.type !== "n8n-nodes-base.code") {
    throw new Error(name + " is not a Code node (" + node.type + ")");
  }
  const code = node.parameters.jsCode;
  const $input = {
    all: () => items.map((json) => ({ json })),
    item: { json: items[0] },
  };
  const $ = makeNodeAccessor(nodeOutputs || {});
  // eslint-disable-next-line no-new-func
  const fn = new Function("$input", "$", "return (function(){\n" + code + "\n})();");
  return fn($input, $);
}

// --------------------------------------------------------------------------
// Google Sheets, in memory
// --------------------------------------------------------------------------

/** Google Sheets writes an empty cell for null/undefined, not the text "null". */
function blankNulls(values) {
  const out = {};
  Object.keys(values).forEach((k) => {
    out[k] = values[k] === null || values[k] === undefined ? "" : values[k];
  });
  return out;
}

/**
 * An in-memory stand-in for the Booking Log worksheet. Rows are plain objects
 * keyed by column header, exactly like the real Google Sheets node returns.
 */
class MockSheet {
  constructor(columns) {
    this.columns = columns || SHEET_COLUMNS;
    this.rows = [];
    this.appendCount = 0;
  }

  /** Reject any column the real 28-column sheet does not have. */
  assertKnownColumns(obj, where) {
    for (const key of Object.keys(obj)) {
      if (this.columns.indexOf(key) === -1) {
        throw new Error(
          where + ': column "' + key + '" is not in the Booking Log schema'
        );
      }
    }
  }

  append(values) {
    this.assertKnownColumns(values, "append");
    const row = {};
    this.columns.forEach((c) => {
      row[c] = "";
    });
    Object.assign(row, blankNulls(values));
    this.rows.push(row);
    this.appendCount += 1;
    return row;
  }

  update(matchColumn, values) {
    this.assertKnownColumns(values, "update");
    const target = values[matchColumn];
    const row = this.rows.find((r) => r[matchColumn] === target);
    if (!row) {
      throw new Error(
        "update: no row where " + matchColumn + " === " + JSON.stringify(target)
      );
    }
    Object.assign(row, blankNulls(values));
    return row;
  }

  read(filters) {
    if (!filters || !filters.length) return this.rows.slice();
    return this.rows.filter((r) =>
      filters.every((f) => String(r[f.lookupColumn]) === String(f.lookupValue))
    );
  }
}

/**
 * Execute a Google Sheets node from the workflow against a MockSheet, using
 * that node's own parameters. This is what makes the column mappings testable.
 */
function runSheetsNode(name, sheet, ctx) {
  ctx = ctx || {};
  const node = getNode(name);
  if (node.type !== "n8n-nodes-base.googleSheets") {
    throw new Error(name + " is not a Google Sheets node (" + node.type + ")");
  }
  const p = node.parameters;
  const resolve = (obj) => {
    const out = {};
    Object.keys(obj).forEach((k) => {
      out[k] = evalExpression(obj[k], ctx);
    });
    return out;
  };

  if (p.operation === "append") {
    return sheet.append(resolve(p.columns.value));
  }
  if (p.operation === "update") {
    const matchColumn = (p.columns.matchingColumns || [])[0];
    if (!matchColumn) throw new Error(name + ": update node has no matchingColumns");
    return sheet.update(matchColumn, resolve(p.columns.value));
  }
  if (p.operation === "read") {
    const filters = ((p.filtersUI || {}).values || []).map((f) => ({
      lookupColumn: f.lookupColumn,
      lookupValue: evalExpression(f.lookupValue, ctx),
    }));
    const rows = sheet.read(filters);
    return p.options && p.options.returnFirstMatch ? rows.slice(0, 1) : rows;
  }
  throw new Error(name + ": unsupported operation " + p.operation);
}

// --------------------------------------------------------------------------
// Assertions
// --------------------------------------------------------------------------

const state = { failures: 0, passes: 0 };

function assert(cond, msg) {
  if (cond) {
    state.passes += 1;
    console.log("  ok:", msg);
  } else {
    state.failures += 1;
    process.exitCode = 1;
    console.error("  FAIL:", msg);
  }
}

function summary(title) {
  console.log("\n=== " + title + " ===");
  console.log(state.passes + " passed, " + state.failures + " failed");
  if (state.failures) console.log("Some assertions FAILED - see above.");
  else console.log("All assertions passed.");
}

module.exports = {
  SHEET_COLUMNS,
  WORKFLOW_PATH,
  loadWorkflow,
  workflow,
  getNode,
  evalExpression,
  makeNow,
  runCodeNode,
  runSheetsNode,
  MockSheet,
  assert,
  summary,
  state,
};
