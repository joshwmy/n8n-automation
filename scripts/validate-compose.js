#!/usr/bin/env node
/**
 * Validates docker-compose.yml without requiring Docker to be installed.
 *
 * `docker compose config` is the authoritative check and is used whenever
 * Docker is available. When it is not (a fresh laptop, CI without Docker),
 * this falls back to a YAML parse via Python + PyYAML, and in either case
 * always runs the checks Docker itself does not do:
 *
 *   - every ${VAR} the compose file reads is documented in .env.example
 *   - .env is gitignored and not tracked by git
 *   - the n8n service keeps its persistence / restart / local-bind guarantees
 *
 * Run with: node scripts/validate-compose.js   (or: npm run validate:compose)
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const COMPOSE = path.join(ROOT, "docker-compose.yml");
const ENV_EXAMPLE = path.join(ROOT, ".env.example");

let failures = 0;
let warnings = 0;

function ok(msg) {
  console.log("  ok:", msg);
}
function fail(msg) {
  console.error("  FAIL:", msg);
  failures += 1;
}
function warn(msg) {
  console.warn("  warn:", msg);
  warnings += 1;
}
function check(cond, msg) {
  if (cond) ok(msg);
  else fail(msg);
}

const compose = fs.readFileSync(COMPOSE, "utf8");

function run(cmd, args) {
  return spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", shell: false });
}

// --------------------------------------------------------------------------
console.log("=== docker-compose.yml validation ===\n");
console.log("[syntax]");

const dockerVersion = run("docker", ["compose", "version"]);
if (dockerVersion.status === 0) {
  // --env-file .env.example validates interpolation without needing a real
  // .env, and without ever reading real secrets.
  const cfg = run("docker", [
    "compose",
    "--env-file",
    ".env.example",
    "-f",
    "docker-compose.yml",
    "config",
    "-q",
  ]);
  check(
    cfg.status === 0,
    "docker compose config accepts the file" +
      (cfg.status === 0 ? "" : ": " + (cfg.stderr || "").trim())
  );
} else {
  const py = run("python", [
    "-c",
    "import sys,yaml;yaml.safe_load(open(sys.argv[1],encoding='utf-8'));print('ok')",
    COMPOSE,
  ]);
  if (py.status === 0) {
    ok("YAML parses (via Python + PyYAML; Docker is not installed)");
    warn(
      "Docker is not installed, so `docker compose config` could not run. " +
        "Re-run this after installing Docker Desktop for the authoritative check."
    );
  } else {
    warn("Neither Docker nor Python+PyYAML is available - YAML syntax was NOT verified.");
  }
}

// --------------------------------------------------------------------------
console.log("\n[environment variables]");

// ${VAR}, ${VAR:-default}, ${VAR:?message}
const referenced = new Set();
const varRe = /\$\{([A-Z0-9_]+)(?::[-?][^}]*)?\}/g;
let m;
while ((m = varRe.exec(compose)) !== null) referenced.add(m[1]);

const envExample = fs.readFileSync(ENV_EXAMPLE, "utf8");
const documented = new Set(
  envExample
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && l[0] !== "#" && l.indexOf("=") !== -1)
    .map((l) => l.split("=")[0].trim())
);

check(referenced.size > 0, "compose file reads environment variables");
Array.from(referenced)
  .sort()
  .forEach((name) => {
    check(documented.has(name), name + " is documented in .env.example");
  });

// Variables with no safe default must use the :? guard, so a missing value
// fails loudly at `up` instead of silently starting a broken container.
["N8N_ENCRYPTION_KEY", "N8N_VERSION"].forEach((name) => {
  const guarded = new RegExp("\\$\\{" + name + ":\\?").test(compose);
  check(guarded, name + " uses the ${VAR:?...} guard so a missing value fails fast");
});

// --------------------------------------------------------------------------
console.log("\n[secrets]");

const gitignore = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
check(/^\.env$/m.test(gitignore), ".env is listed in .gitignore");
check(fs.existsSync(ENV_EXAMPLE), ".env.example exists as the template");

const tracked = run("git", ["ls-files", "--error-unmatch", ".env"]);
check(tracked.status !== 0, ".env is not tracked by git");

check(
  !/N8N_ENCRYPTION_KEY\s*[:=]\s*["']?[A-Za-z0-9]{16,}/.test(compose),
  "no encryption key is hardcoded in the compose file"
);

// --------------------------------------------------------------------------
console.log("\n[pilot guarantees]");

check(
  /image:\s*\S+:\$\{N8N_VERSION/.test(compose),
  "image tag comes from N8N_VERSION (pinned, not :latest)"
);
check(/restart:\s*unless-stopped/.test(compose), "restart policy is unless-stopped");
check(
  /-\s*n8n_data:\/home\/node\/\.n8n/.test(compose),
  "n8n data directory is on a named volume, so it survives a restart"
);
check(
  /^volumes:/m.test(compose) && /^\s{2}n8n_data:/m.test(compose),
  "the n8n_data volume is declared"
);
check(
  /"127\.0\.0\.1:\$\{N8N_PORT/.test(compose),
  "the host port is bound to 127.0.0.1 only, not the LAN"
);
check(/healthcheck:/.test(compose), "a healthcheck is defined");
check(/GENERIC_TIMEZONE=/.test(compose), "timezone is configured for the Schedule Trigger");

// --------------------------------------------------------------------------
console.log("\n=== Compose validation ===");
console.log(failures + " failed, " + warnings + " warning(s)");
if (failures) {
  console.log("docker-compose.yml is NOT valid - see FAIL lines above.");
  process.exit(1);
}
console.log("docker-compose.yml is valid.");
