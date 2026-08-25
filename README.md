# Automation Agency — Working Repo

Local-first workspace for building, testing and documenting automation
prototypes (n8n workflows, integration scripts, client demo material)
before anything touches a client's real systems.

## Structure

- `workflows/` — exported n8n workflow JSON (version-controlled source of truth;
  the live workflow inside n8n is the runtime copy).
- `prototypes/` — one folder per prototype/demo build, each with its own README.
- `docs/` — architecture notes, ROI worksheets, client discovery notes. See `docs/mehua-deposit-concierge-spec.md` (Service 1 build spec) and `docs/mauritius-payment-automation-options.md` (payment-automation options research/comparison — the main payment-strategy reference; research + architecture only, nothing built yet).
- `reference/` — condensed notes on tools/APIs (not vendored copies of third-party repos).

## Local n8n (Docker)

`docker-compose.yml` runs a single local n8n instance for Phase 1 — no Postgres
(n8n's built-in SQLite is enough while Google Sheets is the operational
datastore), no reverse proxy, no tunnel. Bound to `127.0.0.1:5678` only — not
reachable from the LAN or the internet.

```
cp .env.example .env      # then fill in a real N8N_ENCRYPTION_KEY (see comments in the file)
docker compose up -d
```

Open http://localhost:5678 once it's running. Data (workflows, credentials,
execution history) persists in the `n8n_data` Docker volume across restarts.
`docker compose down` stops it; add `-v` to also delete the volume (wipes
saved credentials and the encryption key's associated data — rarely what you
want).

`.env` is gitignored and must never be committed — see `.env.example` for
every variable it needs and what each one does.

## Rules

- No real client credentials, tokens, or production data in this repo. See `.gitignore`.
- Workflows here are the *reusable/agency-owned* logic — see project instructions
  for the client-ownership model (clients buy the outcome, not the workflow file).
- Local development and simulated data are the Phase 1 default. Nothing here
  should assume a public URL, tunnel, or exposed local service unless explicitly
  approved.
