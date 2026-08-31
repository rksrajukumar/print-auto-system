# Auto Print Server — Master Specification

## Purpose
Backend for customer QR upload, payment display, client registration, print-job queueing, status tracking, cancellation/retry, admin control and file cleanup.

## End-to-end flow
CUSTOMER UPLOAD -> JOB CREATED -> QUEUED -> CLIENT POLLS -> DOWNLOAD -> DOWNLOADED -> PRINTING -> COMPLETED -> SERVER DELETES FILE.

Failure: DOWNLOADED/PRINTING -> FAILED -> automatic RETRY up to MAX_JOB_RETRIES. Terminal failure remains FAILED and is cleaned after FAILED_FILE_RETENTION_MS.

Cancel: QUEUED/RETRY/FAILED -> CANCELLED -> file deleted immediately.

## Customer upload
- POST /api/v1/public/client/:clientId/upload
- JSON: fileName, fileBase64, printType (BW/COLOR), paperSize (A4/A3), copies (1..100)
- Maximum file size: 20 MiB
- Filename is sanitized and stored under a random server-side disk name.
- Job stores client, printer, print options, amount and payment UPI information.

## Client API
- POST /api/v1/client/register
- POST /api/v1/client/heartbeat
- GET /api/v1/client/jobs
- GET /api/v1/client/jobs/:id/file
- POST /api/v1/client/jobs/:id/status
- POST /api/v1/client/jobs/:id/cancel

## Status state machine
QUEUED -> DOWNLOADED -> PRINTING -> COMPLETED
QUEUED -> RETRY
RETRY -> DOWNLOADED
QUEUED/RETRY/FAILED -> CANCELLED
DOWNLOADED/PRINTING -> FAILED
FAILED -> RETRY (within retry limit)
COMPLETED and CANCELLED are terminal.

## Admin API
- POST /api/v1/admin/login
- GET /api/v1/admin/overview
- POST /api/v1/admin/jobs
- POST /api/v1/admin/jobs/:id/cancel
- POST /api/v1/admin/jobs/:id/retry
- GET/POST /api/v1/admin/payment/default
- POST /api/v1/admin/clients/:id/upi
- POST /api/v1/admin/clients/:id/disable

## Public customer status
- GET /api/v1/public/client/:clientId/jobs/:jobId

## Cleanup
- COMPLETED/CANCELLED files are deleted immediately.
- FAILED files are retained only for FAILED_FILE_RETENTION_MS.
- Orphan files in the jobs directory are removed during cleanup.

## Security requirements
- Keep ADMIN_PASSWORD and CLIENT_REGISTRATION_KEY in deployment environment variables.
- Do not commit production secrets.
- Use HTTPS in production.
- Use a persistent DATA_DIR if job files/database must survive container restarts. Render ephemeral disks do not provide permanent persistence unless configured separately.

## Payment note
Current UPI flow generates a payment URI/QR and customer confirmation is not bank-side verification. A real payment gateway/webhook must be integrated if automatic payment verification is required.
