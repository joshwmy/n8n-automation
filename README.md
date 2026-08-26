# Automation Agency — Working Repo

Local-first workspace for building, testing and documenting automation
prototypes (n8n workflows, integration scripts, client demo material)
before anything touches a client's real systems.

The current pilot is **Méhua Lashes — Booking & Deposit Concierge**: a Fresha
booking email becomes a tracked booking with a Rs 500 deposit lifecycle, a
reminder/escalation path, and an owner-verified confirmation. Full spec:
[`docs/mehua-deposit-concierge-spec.md`](docs/mehua-deposit-concierge-spec.md).

n8n is **agency infrastructure** — we run it, the client does not. The client
buys the outcome, not the workflow file.

## Validation status

Last validated **26 Aug 2026** against a real **n8n 2.34.4** (`n8n-nodes-base`
2.34.2) — the same version `.env.example` pins — run locally from npm.

**Verified by actually running it:**

| | Result |
|---|---|
| Workflow imports into real n8n | Yes — `n8n import:workflow`, no errors |
| All 39 nodes load | Yes — every node type + `typeVersion` accepted |
| n8n migrations on the workflow | **None.** n8n re-exported all 39 nodes with parameters and `typeVersion` byte-identical, so the file in git *is* the canonical accepted form |
| Google Sheets nodes (`typeVersion 4.5`, resource locators, column mappings) | Accepted and resolved at runtime |
| Expressions (`$json[...]`, `$now.toISO()`, `$('Node').item.json[...]`) | All resolved — no red/invalid expressions |
| TEST - Simulate New Booking path | Ran to completion |
| Overdue reminder path | Ran to completion, escalated to `OVERDUE` |
| Verification → confirmation path | Ran to completion, wrote `Confirmation Sent At` |
| Idempotency on rerun | Verified — the rerun routed to `Log Duplicate Booking Ignored`; `Log New Booking` never executed |
| Timezone | Timestamps written as `+04:00` (Indian/Mauritius) |
| n8n SQLite persistence across process restarts | Verified |

Branch runs used stubs **only** for the two external services (Google Sheets
API, Gmail send). Every Code node, IF node, connection and expression was the
real one, unmodified.

**Not yet verified — needs Docker, which is not installable on this machine
without your input:**

- `docker compose config`, `docker compose up -d`, container health
- persistence across `docker compose down && up` via the `n8n_data` **named volume**
- the Gmail Trigger against a real inbox, and the two form-trigger URLs

This is Windows 11 **Home**, so Docker Desktop needs the WSL2 backend, and WSL
is not installed. To unblock, in an **Administrator** PowerShell:

```powershell
wsl --install                                        # then reboot
winget install --id Docker.DockerDesktop --exact     # UAC prompt
```

Launch Docker Desktop once and wait for **"Engine running"**.

**Needs your credentials / business configuration** — see the sections below:
Gmail OAuth, Google Sheets OAuth, the production Sheet ID, `owner_notification_email`,
studio location, policy wording, final message wording.

## Structure

- `workflows/` — exported n8n workflow JSON (version-controlled source of truth;
  the live workflow inside n8n is the runtime copy).
- `config/` — client-specific configuration (`mehua-config.json`), kept separate
  from the generic automation logic.
- `tests/` — dependency-free Node test suites plus sanitized Fresha fixtures.
- `scripts/` — the offline demo, the test runner, the compose validator.
- `prototypes/` — one folder per prototype/demo build, each with its own README.
- `docs/` — architecture notes, ROI worksheets, client discovery notes.
- `reference/` — condensed notes on tools/APIs (not vendored third-party repos).

---

## Prerequisites

| Tool | Needed for | Notes |
|---|---|---|
| **Node.js 18+** | tests, demo, validation | That's all you need to run everything offline. |
| **Docker Desktop** | running n8n locally | Only required to actually start n8n. Not needed for the tests or the demo. |

Nothing here costs money and nothing requires a VPS.

Check what you have:

```bash
node --version
docker compose version
```

---

## First-time setup

```bash
cp .env.example .env
```

Then open `.env` and set **one** value — everything else has a working default:

- `N8N_ENCRYPTION_KEY` — n8n encrypts saved credentials with this. Generate one:
  - PowerShell: `-join ((48..57)+(97..102)|Get-Random -Count 64|%{[char]$_})`
  - macOS/Linux: `openssl rand -hex 32`

Keep that key somewhere safe outside git. If you lose it, n8n can no longer
decrypt the credentials already stored in its volume.

`.env` is gitignored and must never be committed.

## Starting

```bash
docker compose up -d
```

## Stopping

```bash
docker compose down
```

`docker compose down -v` also deletes the volume — that wipes saved
credentials and all workflow/execution history. Rarely what you want.

## Viewing logs

```bash
docker compose logs -f
```

## Checking it came up

```bash
docker compose ps
```

The `n8n` service should be `running (healthy)`. First boot takes up to a
minute while n8n runs its database migrations — the healthcheck's
`start_period` allows for that.

## n8n access

<http://localhost:5678>

Bound to `127.0.0.1` only: not reachable from the LAN, not tunneled, not
public. n8n's own SQLite database and all workflow data live in the `n8n_data`
Docker volume, so they survive `docker compose down && docker compose up -d`.

You will be asked to create an owner account on first launch. That account is
local to this instance.

---

## Workflow setup

The workflow is **not** auto-provisioned — import it once:

1. Open <http://localhost:5678>.
2. **Workflows → Import from File →** `workflows/mehua-deposit-concierge.n8n.json`.
3. Fill in the placeholders below.
4. Attach credentials (below), then **Activate** the workflow.

The file carries a top-level `id`, so it also imports from the CLI:

```bash
n8n import:workflow --input=workflows/mehua-deposit-concierge.n8n.json
```

(The CLI importer requires that `id`; the UI importer does not.)

### Google Sheet

Create a Google Sheet with a tab named exactly **`Booking Log`**, whose first
row is the 28 column headers in `config/booking-log-headers.csv`. Paste that
line into cell A1 and use **Data → Split text to columns** — don't retype it.
That file is generated from the same schema the workflow and tests use, and
`npm test` fails if the two ever drift.

Every Google Sheets node in the workflow points at the literal placeholder
`PLACEHOLDER_SET_MEHUA_SHEET_ID`. Replace it with your sheet's ID (the long
string in the sheet's URL between `/d/` and `/edit`) **before** importing:

```bash
sed -i 's/PLACEHOLDER_SET_MEHUA_SHEET_ID/your_real_sheet_id_here/g' \
  workflows/mehua-deposit-concierge.n8n.json
```

Do not commit that substitution — the placeholder is what belongs in git.
Alternatively, import as-is and set the Document field on each Sheets node
from the "From list" picker in the n8n UI.

### Business values still to be filled in

These are deliberate placeholders, not oversights. They live in
`config/mehua-config.json`, and the same object is embedded in the four
`Load Mehua Config` nodes (keep them in sync — `npm test` checks this):

- `studio_location`
- `deposit_policy`
- `cancellation_policy`
- `owner_notification_email`
- the three message templates (currently marked `TEMPORARY — OWNER WORDING TO VALIDATE`)
- `reminder_escalation_hours` (48) and `reminder_resend_cooldown_hours` (20) —
  both configurable, neither confirmed with the owner yet

Rs 500 / Juice / the Juice number are confirmed and already filled in.

---

## Google / Gmail configuration

Both credentials are manual OAuth setup — they cannot be committed to git,
and nothing in this repo will create them for you.

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or
   reuse) a project.
2. **APIs & Services → Library →** enable **Gmail API** and **Google Sheets API**.
3. **APIs & Services → OAuth consent screen →** External, and add the mailbox
   account as a Test user.
4. **Credentials → Create Credentials → OAuth client ID → Web application.**
5. In n8n, create a **Gmail OAuth2** credential and a **Google Sheets OAuth2**
   credential. n8n shows you the exact redirect URL to paste back into the
   Google client's *Authorised redirect URIs* — copy it from n8n rather than
   typing it by hand.
6. Complete the OAuth flow from inside n8n, then attach the credentials to the
   Gmail and Google Sheets nodes.

The Gmail Trigger filters on `from:mail@updates.fresha.com` — the confirmed
sender for both Fresha email formats. Narrow it to
`from:mail@updates.fresha.com subject:"New appointment"` if you want only
new-booking notifications to start an execution.

**Still undecided** (see the spec's `TO_VALIDATE` list): whether n8n reads
Méhua's own Gmail via OAuth, or a forwarding rule copies Fresha mail into a
mailbox the agency controls. The second is usually the cleaner client
boundary.

---

## Testing

No installs, no n8n, no Google account, no Docker required:

```bash
npm test
```

That runs four suites:

| Suite | What it proves |
|---|---|
| `scripts/validate-compose.js` | compose file is valid, every `${VAR}` is documented, `.env` is gitignored and untracked, the persistence/restart/local-bind guarantees hold |
| `tests/workflow-integrity.test.js` | every connection resolves, no orphan nodes, Code nodes parse, Sheets nodes use the current node schema and actually map columns, all 28 sheet columns have a writer, cross-node `$('…')` references exist, the four embedded config copies match `config/mehua-config.json`, no secrets in the workflow |
| `tests/fresha-parser.test.js` | the parser against the three real (sanitized) Fresha fixtures plus malformed/unknown/missing-field cases |
| `tests/mehua-lifecycle.test.js` | the full deposit lifecycle, idempotency, reminder cooldown, rejection path — driven through the workflow's own nodes |

Individually:

```bash
npm run test:parser
npm run test:lifecycle
npm run test:workflow
npm run validate:compose
```

`npm run validate:compose` uses `docker compose config` when Docker is
installed and falls back to a YAML parse otherwise — it tells you which one
it used.

---

## Demo

```bash
npm run demo
```

Walks one real (sanitized) Fresha booking email through the whole pilot and
prints what happened at each step:

```
booking received → parsed → recorded → deposit pending
  → reminder due → proof reported → deposit verified → confirmed
```

It prints the resulting 28-column Booking Log row and the three drafted
messages, then re-delivers the same email to show duplicate detection refusing
to create a second booking, and feeds in a Fresha cancellation to show it is
recognized and ignored rather than misread as a booking.

This runs the workflow's **own** Code nodes and Sheets column mappings against
an in-memory sheet — it is the real logic, not a parallel fake. So you can
demo the pilot before any Google or Gmail credential exists.

To demo inside n8n itself once it is running and configured, use the
`TEST - Simulate New Booking (Dev Only)` manual trigger — it injects a booking
with the same shape the real parser produces.

---

## Production migration (later, ~$5–10/month VPS)

The compose file is deliberately portable. To move it:

1. Copy `docker-compose.yml` and `.env` to the VPS; `docker compose up -d`.
2. Change the port binding from `127.0.0.1:5678:5678` to `5678` and put a
   reverse proxy (Caddy is the least work) in front of it for TLS.
3. Set `N8N_HOST` to the real hostname, `N8N_PROTOCOL=https`, and
   `N8N_SECURE_COOKIE=true`.
4. Add `WEBHOOK_URL=https://your-host/` so the two owner-facing form triggers
   generate reachable URLs.
5. Keep the **same** `N8N_ENCRYPTION_KEY`, or saved credentials will not decrypt.
6. Back up the `n8n_data` volume.

Postgres is not needed at pilot scale — SQLite plus Google Sheets as the
operational datastore is enough, and swapping it in later is an env-var change.

---

## Rules

- No real client credentials, tokens, or production data in this repo. See `.gitignore`.
- Workflows here are the *reusable/agency-owned* logic — clients buy the outcome,
  not the workflow file.
- Local development and simulated data are the Phase 1 default. Nothing here
  should assume a public URL, tunnel, or exposed local service unless explicitly
  approved.
- Payment verification is human, always. No OCR, AI or screenshot analysis may
  mark a deposit verified.
