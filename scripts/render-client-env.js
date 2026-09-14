#!/usr/bin/env node
/**
 * Print a CLIENT_CONFIG_JSON=... line for .env, from a client config file.
 *
 * The workflow's "Load Mehua Config" nodes carry no client-specific values -
 * they read CLIENT_CONFIG_JSON from the environment at runtime. Onboarding a
 * new client is: copy config/mehua-config.json to config/<client>.json, fill
 * it in, then run this against that file and paste the output into that
 * client's .env. The workflow file itself never changes.
 *
 * Usage:
 *   node scripts/render-client-env.js config/mehua-config.json
 */

const fs = require("fs");
const path = require("path");

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/render-client-env.js <path-to-client-config.json>");
  process.exit(1);
}

const resolved = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
if (!fs.existsSync(resolved)) {
  console.error("ERROR: file not found: " + file);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(resolved, "utf8"));

if (!config.client_id) {
  console.error("ERROR: config file has no client_id — refusing to render");
  process.exit(1);
}

// Minified to a single line so it survives being pasted into a .env file.
console.log("CLIENT_CONFIG_JSON=" + JSON.stringify(config));
