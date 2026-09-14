# CLAUDE.md — Automation Agency Working Repo

Project-specific context only. General coding/agent behavior comes from
`~/.claude/rules/`; this file covers what's unique to this repo.

## What this repo is

Local-first workspace for n8n automation prototypes, built by a solo
automation agency. Current pilot: **Méhua Lashes — Booking & Deposit
Concierge** (Fresha booking email → tracked deposit lifecycle → owner
confirmation). n8n is agency infrastructure — the agency runs it, clients
don't. Full spec: `docs/mehua-deposit-concierge-spec.md`.

Status and validation history live in `README.md` — read it before assuming
what's proven vs. still placeholder. It is kept current; trust it over memory
of past sessions.

## Hard business rules (non-negotiable, not just style)

- **Payment verification is always human.** No OCR, AI, or screenshot
  analysis may ever set a booking to `DEPOSIT_VERIFIED`. Receiving a proof
  screenshot only moves a booking to `AWAITING_MANUAL_VERIFICATION`.
- **Placeholders must never reach a customer.** Anything tagged
  `TO_VALIDATE_*` or `TEMPORARY — OWNER WORDING TO VALIDATE` in
  `config/mehua-config.json` / the workflow is a deliberate gap, not an
  oversight. Don't invent business wording (studio location, policies,
  message copy) — that's the owner's decision, not ours.
- **No real client credentials or production data in git.** `.env`,
  `workflows/generated/`, `config/*.local.json` are gitignored on purpose —
  they hold real credential ids, spreadsheet ids, real emails. The committed
  `workflows/*.n8n.json` must keep its placeholders (`PLACEHOLDER_SET_MEHUA_SHEET_ID`,
  `TO_VALIDATE_OWNER_EMAIL`) and no `credentials` block.
- **`N8N_ENCRYPTION_KEY` is irreplaceable.** Losing or rotating it without
  re-authorizing every credential permanently breaks all stored OAuth
  credentials. Never regenerate it casually.

## Client config (externalized, not hardcoded)

`config/mehua-config.json` is the single source of truth for business values.
The workflow's four `Load Mehua Config` nodes carry **no client-specific
values** — they read `JSON.parse($env.CLIENT_CONFIG_JSON)` at runtime, so the
workflow file is identical across clients. After editing the config file,
regenerate the env var with `node scripts/render-client-env.js
config/mehua-config.json` and update `.env` (local and any deployed
instance) — `tests/workflow-integrity.test.js` fails the build if a
`Load Mehua Config` node ever regresses back to embedding a literal value.
Onboarding client #2 is a new config file + a new `.env`, not a fork of the
workflow. `config/booking-log-headers.csv` similarly must match the
workflow's Sheets column mappings.

## Before treating anything as "done"

`npm test` must pass — it runs compose validation, workflow-integrity,
Fresha parser, and full lifecycle suites, dependency-free (no Docker/n8n/
Google account required). Import success in n8n is **not** the same as
runtime success — this repo already hit two production bugs (silently
dropped first booking, `columns.schema` empty) that only surfaced on a real
Google API call. Don't declare a Sheets/Gmail change verified from import or
expression-resolution alone.

## Repo map

- `workflows/` — exported n8n workflow JSON, version-controlled source of
  truth. `workflows/generated/` (gitignored) holds real-credential copies
  produced by `scripts/wire-workflow.js` — never the other way around.
- `config/` — business config (`mehua-config.json`) and CSV schema, separate
  from generic logic. `*.local.json` here is gitignored real wiring data.
- `scripts/` — `n8n.js` (CLI wrapper: credentials/workflows/import/execute),
  `wire-workflow.js`, `render-client-env.js` (client config → `CLIENT_CONFIG_JSON`),
  `provision-test-sheet.js`, `make-branch-workflow.js`,
  `dump-test-sheet.js`, plus the test runner and compose validator.
- `tests/` — dependency-free Node suites and sanitized Fresha fixtures.
- `docs/` — spec, Google integration test procedure, payment automation
  research notes.

## Test-credential naming

Keep test and production credentials impossible to confuse:
`Google Sheets (TEST — throwaway)` / `Gmail (TEST — own inbox)` vs.
`Google Sheets (Mehua PROD)` / `Gmail (Mehua PROD)`. Never repoint test
credentials at production, or vice versa.

## Production cutover checklist

Do not activate any workflow against a real inbox/sheet without explicit
approval. Full sequence lives in the "Production migration" section of
`README.md` and section 7 of `docs/google-integration-test.md` — resolve the
four business placeholders, replace templates, get owner sign-off on
reminder timing, create PROD credentials, back up the encryption key, run one
full lifecycle on an empty prod-shaped sheet first.
