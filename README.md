# AUTO PRINT SERVER — FINAL CLIENT REGISTRATION

## Registration credentials
- Client Key: `rksrajukumar`
- Registration Value: `RK-AutoPrint-2026-8xK9`

## Render Environment
The server accepts the registration value from either of these environment variable names:
- `rksrajukumar=RK-AutoPrint-2026-8xK9` **(matches the Render screen shown)**
- `CLIENT_REGISTRATION_KEY=RK-AutoPrint-2026-8xK9` (preferred/canonical name)

Also set:
- `CLIENT_KEY_NAME=rksrajukumar`
- `ADMIN_USER=<your admin username>`
- `ADMIN_PASSWORD=<your admin password>`

The registration endpoint is `POST /api/v1/client/register` and requires BOTH `clientKey` and `registrationKey` to match exactly.

The server returns a client ID and client token. The client then uses the token for heartbeat and job APIs.

No separate server-information file is required on the installed client PC; the connection URL and registration credentials are embedded in the client executable.
