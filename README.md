# Auto Print Server - Final

Production-ready server package for the Auto Print client/customer QR print workflow.

## Render settings

- Runtime: Docker
- Dockerfile: included
- Port: `10000` (Render may inject `PORT`; the server honors it)
- Start command is provided by the Dockerfile.

### Required environment variables

- `ADMIN_USER`
- `ADMIN_PASSWORD`
- `CLIENT_KEY_NAME` = `rksrajukumar`
- `CLIENT_REGISTRATION_KEY` = your private registration key

Optional:

- `PUBLIC_URL` = `https://print-auto-system-1.onrender.com`
- `DATA_DIR` = `./data`
- `MAX_JOB_RETRIES` = `3`
- `FAILED_FILE_RETENTION_MS` = `86400000`
- `CLEANUP_INTERVAL_MS` = `900000`

Do not commit real passwords or registration keys to GitHub.

## Client connection

The Windows client should use:

- Server URL: `https://print-auto-system-1.onrender.com`
- Client key: `rksrajukumar`
- Registration key: the same value configured as `CLIENT_REGISTRATION_KEY`
- Poll interval: 5 seconds

The server provides client registration, heartbeat, job polling, file download, print-status updates, customer upload, QR generation, payment QR, admin overview, retry and cancellation APIs.

## Health check

`GET /health` must return JSON with `ok: true`.

## Important Render note

The default `./data` directory is local to the running instance. If client/job data must survive Render restarts or redeploys, attach a persistent disk and set `DATA_DIR` to its mount path.
