#!/usr/bin/env node
/**
 * Structural validation of workflows/mehua-deposit-concierge.n8n.json.
 *
 * This exists because the workflow was hand-written against n8n's schema and
 * a whole class of bugs (nodes carrying parameters from an older node version,
 * update nodes with no columns mapped, expressions pointing at nodes that were
 * renamed) is invisible until you import it into a live n8n instance. These
 * checks catch that class from the CLI, with no n8n running.
 *
 * Run with: node tests/workflow-integrity.test.js
 */

const fs = require("fs");
const path = require("path");
const h = require("./lib/n8n-mock.js");

const { workflow, SHEET_COLUMNS, assert, summary } = h;
const nodesByName = {};
workflow.nodes.forEach((n) => {
  nodesByName[n.name] = n;
});

console.log("=== Workflow integrity ===\n");

// --------------------------------------------------------------------------
console.log("[settings] the workflow pins its own timezone");

// Every lifecycle timestamp is written by {{ $now.toISO() }}, so the workflow's
// timezone decides what lands in six Booking Log columns. Until 27 Aug 2026
// settings carried no timezone at all and the value came from the instance's
// GENERIC_TIMEZONE — which meant the first real Sheets write produced UTC
// ("2026-08-27T14:28:20.818Z") instead of the required +04:00, and a deploy to
// any host without that env var would silently shift every timestamp by four
// hours with nothing failing. Pin it in the workflow so it travels with the file.
assert(
  workflow.settings && workflow.settings.timezone === "Indian/Mauritius",
  "workflow.settings.timezone is Indian/Mauritius (got: " +
    JSON.stringify(workflow.settings && workflow.settings.timezone) +
    ")"
);

// --------------------------------------------------------------------------
console.log("[graph] nodes and connections");

assert(workflow.nodes.length > 0, "workflow has nodes");
assert(
  Object.keys(nodesByName).length === workflow.nodes.length,
  "every node name is unique"
);

let danglingConnections = 0;
Object.entries(workflow.connections).forEach(([source, conn]) => {
  if (!nodesByName[source]) {
    console.error("    dangling source:", source);
    danglingConnections += 1;
  }
  (conn.main || []).forEach((branch) => {
    (branch || []).forEach((target) => {
      if (!nodesByName[target.node]) {
        console.error("    dangling target:", source, "->", target.node);
        danglingConnections += 1;
      }
    });
  });
});
assert(danglingConnections === 0, "every connection resolves to a real node");

// Anything that is not a trigger must be reachable, or it is dead scaffolding.
const TRIGGER_TYPES = [
  "n8n-nodes-base.gmailTrigger",
  "n8n-nodes-base.manualTrigger",
  "n8n-nodes-base.scheduleTrigger",
  "n8n-nodes-base.formTrigger",
];
const reachable = new Set();
const walk = (name) => {
  if (reachable.has(name)) return;
  reachable.add(name);
  const conn = workflow.connections[name];
  if (!conn) return;
  (conn.main || []).forEach((branch) =>
    (branch || []).forEach((t) => walk(t.node))
  );
};
workflow.nodes
  .filter((n) => TRIGGER_TYPES.includes(n.type))
  .forEach((n) => walk(n.name));

const orphans = workflow.nodes
  .filter((n) => !reachable.has(n.name))
  .map((n) => n.name);
assert(
  orphans.length === 0,
  "every node is reachable from a trigger" +
    (orphans.length ? " (orphans: " + orphans.join(", ") + ")" : "")
);

// --------------------------------------------------------------------------
console.log("\n[code] Code nodes parse");

workflow.nodes
  .filter((n) => n.type === "n8n-nodes-base.code")
  .forEach((n) => {
    let ok = true;
    try {
      // eslint-disable-next-line no-new-func
      new Function(n.parameters.jsCode);
    } catch (err) {
      ok = false;
      console.error("    " + n.name + ": " + err.message);
    }
    assert(ok, "Code node parses: " + n.name);
  });

// --------------------------------------------------------------------------
console.log("\n[sheets] Google Sheets nodes use the current node schema");

const LEGACY_PARAMS = ["sheetId", "range", "columnToMatchOn", "valueToMatchOn"];
const sheetsNodes = workflow.nodes.filter(
  (n) => n.type === "n8n-nodes-base.googleSheets"
);

assert(sheetsNodes.length > 0, "workflow has Google Sheets nodes");

sheetsNodes.forEach((n) => {
  const p = n.parameters;

  // typeVersion >= 4 is what supports the `columns` resource mapper. Older
  // typeVersions expect dataMode/fieldsUi instead, and silently lose the
  // mapping on import.
  assert(
    typeof n.typeVersion === "number" && n.typeVersion >= 4,
    n.name + ": typeVersion >= 4 (got " + n.typeVersion + ")"
  );

  const legacy = LEGACY_PARAMS.filter((k) => k in p);
  assert(
    legacy.length === 0,
    n.name +
      ": no pre-v4 parameters left" +
      (legacy.length ? " (found: " + legacy.join(", ") + ")" : "")
  );

  ["documentId", "sheetName"].forEach((k) => {
    assert(
      p[k] && p[k].__rl === true && typeof p[k].value === "string",
      n.name + ": " + k + " is a resource locator"
    );
  });

  assert(
    ["append", "update", "read"].includes(p.operation),
    n.name + ": known operation (" + p.operation + ")"
  );

  // A parameter n8n does not recognise is dead weight at best and a stale
  // leftover from an older node version at worst - it is silently ignored on
  // import, so nothing else would ever surface it.
  const ALLOWED_PARAMS = [
    "authentication",
    "resource",
    "operation",
    "documentId",
    "sheetName",
    "columns",
    "options",
    "filtersUI",
    "combineFilters",
  ];
  const unknownParams = Object.keys(p).filter(
    (k) => !ALLOWED_PARAMS.includes(k)
  );
  assert(
    unknownParams.length === 0,
    n.name +
      ": no unrecognised parameters" +
      (unknownParams.length ? " (found: " + unknownParams.join(", ") + ")" : "")
  );
});

// --------------------------------------------------------------------------
console.log("\n[sheets] write nodes actually map columns");

sheetsNodes
  .filter((n) => ["append", "update"].includes(n.parameters.operation))
  .forEach((n) => {
    const cols = n.parameters.columns || {};
    const value = cols.value || {};
    const mapped = Object.keys(value);

    assert(
      mapped.length > 0,
      n.name + ": maps at least one column (an update with none writes nothing)"
    );

    const unknown = mapped.filter((c) => !SHEET_COLUMNS.includes(c));
    assert(
      unknown.length === 0,
      n.name +
        ": every mapped column exists in the 28-column schema" +
        (unknown.length ? " (unknown: " + unknown.join(", ") + ")" : "")
    );

    if (n.parameters.operation === "update") {
      const match = (cols.matchingColumns || [])[0];
      assert(Boolean(match), n.name + ": update declares a matching column");
      assert(
        mapped.includes(match),
        n.name +
          ": the matching column (" +
          match +
          ") is itself mapped, or there is nothing to match on"
      );
    }

    // n8n 2.34.4 accepts an empty columns.schema at IMPORT and then refuses to
    // run the node: "`columns.schema` is required when `columns.mappingMode` is
    // `defineBelow`". Every Sheets node shipped with "schema": [] until the
    // first live run on 27 Aug 2026 hit exactly that. Import success is
    // therefore not evidence the node works — assert the schema is populated.
    const schema = cols.schema || [];
    assert(
      schema.length > 0,
      n.name + ": columns.schema is populated (n8n refuses to run defineBelow without it)"
    );
    assert(
      schema.length === SHEET_COLUMNS.length,
      n.name +
        ": columns.schema describes all " +
        SHEET_COLUMNS.length +
        " Booking Log columns (found " +
        schema.length +
        ")"
    );

    const schemaIds = schema.map((s) => s.id);
    const missingFromSchema = SHEET_COLUMNS.filter((c) => !schemaIds.includes(c));
    assert(
      missingFromSchema.length === 0,
      n.name +
        ": columns.schema covers every header" +
        (missingFromSchema.length ? " (missing: " + missingFromSchema.join(", ") + ")" : "")
    );

    // A mapped column marked removed:true is dropped by n8n at run time, which
    // would silently stop writing that column.
    const mappedButRemoved = schema
      .filter((s) => s.removed === true && mapped.includes(s.id))
      .map((s) => s.id);
    assert(
      mappedButRemoved.length === 0,
      n.name +
        ": no mapped column is marked removed in the schema" +
        (mappedButRemoved.length ? " (" + mappedButRemoved.join(", ") + ")" : "")
    );
  });

// --------------------------------------------------------------------------
console.log("\n[sheets] the 28-column schema is fully served");

const writtenColumns = new Set();
sheetsNodes
  .filter((n) => ["append", "update"].includes(n.parameters.operation))
  .forEach((n) =>
    Object.keys((n.parameters.columns || {}).value || {}).forEach((c) =>
      writtenColumns.add(c)
    )
  );

const neverWritten = SHEET_COLUMNS.filter((c) => !writtenColumns.has(c));
assert(
  neverWritten.length === 0,
  "every Booking Log column has a node that can write it" +
    (neverWritten.length
      ? " (never written: " + neverWritten.join(", ") + ")"
      : "")
);

// --------------------------------------------------------------------------
console.log("\n[sheets] the copy-paste header row matches the schema");

// config/booking-log-headers.csv exists so the Booking Log header row can be
// pasted in rather than retyped. It must never drift from SHEET_COLUMNS.
const headerCsv = fs
  .readFileSync(path.join(__dirname, "..", "config", "booking-log-headers.csv"), "utf8")
  .trim();
assert(
  headerCsv === SHEET_COLUMNS.join(","),
  "config/booking-log-headers.csv matches the 28-column schema exactly"
);

// --------------------------------------------------------------------------
console.log("\n[expressions] cross-node references point at real nodes");

const workflowJson = fs.readFileSync(h.WORKFLOW_PATH, "utf8");
const referenced = new Set();
// Matches $('Node Name') as it appears in both expressions and Code nodes.
const refRe = /\$\(\\?['"]([^'"\\]+)\\?['"]\)/g;
let m;
while ((m = refRe.exec(workflowJson)) !== null) referenced.add(m[1]);

assert(referenced.size > 0, "found cross-node references to check");
referenced.forEach((name) => {
  assert(
    Boolean(nodesByName[name]),
    "$('" + name + "') refers to an existing node"
  );
});

// --------------------------------------------------------------------------
console.log("\n[status] only documented statuses are written to the sheet");

const configFile = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "..", "config", "mehua-config.json"),
    "utf8"
  )
);
const allowedStatuses = configFile.payment_status_values;

sheetsNodes.forEach((n) => {
  const value = (n.parameters.columns || {}).value || {};
  const status = value.Status;
  // Only literal statuses can be checked statically; expression-driven ones
  // are covered by the lifecycle test instead.
  if (typeof status === "string" && status[0] !== "=") {
    assert(
      allowedStatuses.includes(status),
      n.name + ': writes a documented status ("' + status + '")'
    );
  }
});

// --------------------------------------------------------------------------
console.log(
  "\n[config] the four Load Mehua Config nodes load CLIENT_CONFIG_JSON, not hardcoded values"
);

const configNodeNames = workflow.nodes
  .filter((n) => n.name.indexOf("Load Mehua Config") === 0)
  .map((n) => n.name);

assert(configNodeNames.length === 4, "all four Load Mehua Config nodes are present");

// Regression guard: these nodes must stay generic loaders so a second client
// is a new config file, not a fork of this workflow. If someone re-inlines a
// business value here, catch it before it ships.
const configNodeCode = workflow.nodes
  .filter((n) => configNodeNames.includes(n.name))
  .map((n) => ({ name: n.name, code: n.parameters.jsCode }));

const firstCode = configNodeCode[0].code;
configNodeCode.slice(1).forEach((n) => {
  assert(n.code === firstCode, n.name + " has the same loader code as " + configNodeCode[0].name);
});
assert(
  firstCode.includes("$env.CLIENT_CONFIG_JSON"),
  "the loader reads $env.CLIENT_CONFIG_JSON rather than embedding values"
);
["mehua_lashes", "Sadally", "Vacoas", configFile.owner_notification_email].forEach((literal) => {
  assert(
    !firstCode.includes(literal),
    "loader code does not hardcode client-specific value " + JSON.stringify(literal)
  );
});

const configs = configNodeNames.map((name) => ({
  name,
  config: h.runCodeNode(name, [{}])[0].json.config,
}));

const firstConfig = JSON.stringify(configs[0].config);
configs.slice(1).forEach((c) => {
  assert(
    JSON.stringify(c.config) === firstConfig,
    c.name + " is identical to " + configs[0].name
  );
});

// The loaded config is a subset of the JSON file (it drops the _comment /
// _status documentation keys), so compare only the keys it actually carries.
function compareAgainstFile(embedded, fromFile, trail) {
  Object.keys(embedded).forEach((key) => {
    const a = embedded[key];
    const b = fromFile ? fromFile[key] : undefined;
    const label = trail ? trail + "." + key : key;
    if (a && typeof a === "object" && !Array.isArray(a)) {
      compareAgainstFile(a, b, label);
    } else {
      assert(
        JSON.stringify(a) === JSON.stringify(b),
        "config." + label + " matches config/mehua-config.json"
      );
    }
  });
}
compareAgainstFile(configs[0].config, configFile, "");

// --------------------------------------------------------------------------
console.log("\n[secrets] no credentials are embedded in the workflow");

assert(
  !/"credentials"\s*:/.test(workflowJson),
  "no credential blocks are committed in the workflow JSON"
);
const SECRET_PATTERNS = [
  /AIza[0-9A-Za-z\-_]{20,}/, // Google API key
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /"client_secret"/i,
  /ya29\.[0-9A-Za-z\-_]+/, // Google OAuth access token
];
SECRET_PATTERNS.forEach((re) => {
  assert(!re.test(workflowJson), "no secret matching " + re + " in workflow JSON");
});

// --------------------------------------------------------------------------
console.log(
  "\n[placeholders] unresolved business values stay visible, not silently defaulted"
);

const placeholders = (
  workflowJson.match(/(PLACEHOLDER|TO_VALIDATE)_[A-Z_]+/g) || []
)
  .filter((v, i, a) => a.indexOf(v) === i)
  .sort();
console.log("  still to be supplied before a live run:");
placeholders.forEach((p) => console.log("    - " + p));
assert(
  placeholders.length > 0,
  "unresolved values are explicit placeholders, not invented defaults"
);

summary("Workflow integrity");
