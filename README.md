# Auto Print Server — Customer QR Upload

Client registration remains:
- Client Key: `rksrajukumar`
- Registration Value: `RK-AutoPrint-2026-8xK9`
- Render variable accepted: `rksrajukumar` or `CLIENT_REGISTRATION_KEY`

## Customer upload links
After a client registers, its admin record contains a unique client ID. The customer URL is:
`https://print-auto-system-1.onrender.com/upload/<CLIENT_ID>`

The dashboard QR section can use:
`/api/v1/public/client/<CLIENT_ID>/qr.svg`

A customer upload creates a `QUEUED` job for that client PC and selected/default printer. The Windows client must poll the client jobs endpoint and print queued jobs for automatic printing.

## Render
Set the environment variable shown in your Render dashboard:
`rksrajukumar=RK-AutoPrint-2026-8xK9`

Recommended canonical variable:
`CLIENT_REGISTRATION_KEY=RK-AutoPrint-2026-8xK9`
