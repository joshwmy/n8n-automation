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

Last validated **27 Aug 2026** against **n8n 2.34.4** running in Docker
(Docker 29.7.2, Compose v5.4.0, WSL2 backend) — the version `.env.example`
pins. Every workflow result below was confirmed twice: first against an
npm-installed n8n 2.34.4, then again inside the container, with identical
results.

**Docker host:**

| | Result |
|---|---|
| `docker compose config` | Passes (real Compose v5.4.0, exit 0) |
| Image pull + `docker compose up -d` | Succeeds — `docker.n8n.io/n8nio/n8n:2.34.4` |
| Container stays up | `Up (healthy)`, `RestartCount=0`, no restart loop |
| Healthcheck | Passes |
| `http://localhost:5678` | HTTP 200; `/healthz` returns `{"status":"ok"}` |
| Port binding | `127.0.0.1:5678->5678/tcp` — not reachable from the LAN |
| n8n version in container | 2.34.4 |
| SQLite location | `/home/node/.n8n/database.sqlite`, inside the named volume |
| Named-volume persistence | Verified — see below |

Persistence was proved by destroying the container, not merely restarting it:
the workflow was imported, then `docker compose down` (**no** `-v`) *removed*
the container, then `docker compose up -d` created a new one with a different
container ID — and `n8n list:workflow` still returned the imported workflow,
from volume `automationagency_n8n_data`.

**Verified by actually running the workflow:**

| | Result |
|---|---|
| Workflow imports into real n8n | Yes — `n8n import:workflow`, no errors |
| All 39 nodes load | Yes — every node type + `typeVersion` accepted |
| n8n migrations on the workflow | **None.** n8n re-exported all 39 nodes with parameters and `typeVersion` byte-identical, so the file in git *is* the canonical accepted form |
| Google Sheets nodes (`typeVersion 4.5`, resource locators, column mappings) | **Accepted at import — but this did NOT mean they ran.** Corrected 27 Aug 2026: with the API stubbed, "accepted and resolved" only ever described import and expression resolution. The first live run showed every mapping node then refused to execute (`columns.schema` empty) — see "Found by the live Google run" below |
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

### Found by the live Google run (27 Aug 2026)

Connecting a real Google Sheets credential and a throwaway spreadsheet
immediately exposed two defects that **every** offline check had passed over.
Both were latent production bugs; both are fixed, and
`tests/workflow-integrity.test.js` now guards the second.

**1. The first booking into an empty Booking Log was silently dropped.**
`Read Booking Log (Duplicate Check)` returns zero items when the sheet holds
only its header row, and n8n halts a branch whose node emits no items. The
execution reported `success`, stopped at that node, wrote no row and sent no
notification — with no error anywhere. Since a real Booking Log also starts
empty, this would have hit production on the first booking. Fixed with
`alwaysOutputData: true` on that node, which emits one empty item so the
duplicate check still runs (it already handled an empty item correctly).

**2. No Google Sheets write in the workflow had ever been able to run.**
All eight mapping nodes carried `"columns.schema": []`. n8n 2.34.4 accepts that
at import and rejects it at execution:
`` `columns.schema` is required when `columns.mappingMode` is `defineBelow` ``.
That affected every write in the workflow — booking logging, all four status
updates and all six lifecycle timestamps. The schema is now populated for all
28 columns on every mapping node, generated from
`config/booking-log-headers.csv`.

The lesson for reading the table above: **import success is not runtime
success**, and a stubbed external service hides the entire class of bug that
only the real API surfaces. "All 39 nodes load" and "n8n re-exported them
byte-identical" remain true, and neither implied the nodes could execute.

**Still not verified — needs live Google credentials:**

- the Google Sheets nodes against a real spreadsheet (every run so far stops at
  *"Node does not have any credentials set"*, which is the credential boundary,
  not a defect)
- the Gmail Trigger against a real inbox
- the Gmail send nodes — `owner_notification_email` is still the
  `TO_VALIDATE_OWNER_EMAIL` placeholder, and real n8n correctly rejects it with
  *"Invalid email address"*
- the two owner form-trigger URLs, which only exist while the workflow is active

**Needs your credentials / business configuration** — see the sections below:
Gmail OAuth, Google Sheets OAuth, the production Sheet ID, `owner_notification_email`,
studio location, policy wording, final message wording.

### Container log messages that are expected

`docker compose logs` prints three things on a healthy instance; none indicate
a problem with this pilot:

- **"Failed to start Python task runner … Python 3 is missing"** — n8n only
  needs this for Python Code nodes. Every Code node here is JavaScript, and
  `Registered runner "JS Task Runner"` appears in the same log.
- **Deprecation notices** (`N8N_UNVERIFIED_PACKAGES_ENABLED`,
  `N8N_RUNNERS_TASK_TIMEOUT`, `N8N_COMPRESSION_NODE_*`) — advance warning that
  defaults change in a *future* n8n version. The image tag is pinned, so
  nothing changes until `N8N_VERSION` is bumped; re-read them at that point.
- **"Last session crashed"** — only appears if the container was killed rather
  than shut down cleanly (for example a `docker compose up` interrupted
  mid-start). Harmless on the next clean boot.

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

### Business config

All business values (studio location, deposit/cancellation policy, message
templates, reminder timing, owner notification email) are confirmed and live
in `config/mehua-config.json` — the single source of truth. The workflow
itself carries none of these values: its four `Load Mehua Config` nodes read
them from the `CLIENT_CONFIG_JSON` environment variable at runtime, so the
workflow file never changes between clients. After editing
`config/mehua-config.json`, regenerate that variable and update `.env`:

```bash
node scripts/render-client-env.js config/mehua-config.json
```

`tests/workflow-integrity.test.js` guards against ever re-hardcoding a
client's values back into the workflow.

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
| `tests/workflow-integrity.test.js` | every connection resolves, no orphan nodes, Code nodes parse, Sheets nodes use the current node schema and actually map columns, all 28 sheet columns have a writer, cross-node `$('…')` references exist, the config-loader nodes stay generic and never hardcode a client's values, no secrets in the workflow |
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
