# Auto Print Server - Final Key Flow

Node.js/Express server for the Auto Print client. The client uses the same shared registration key configured on the server to register a Windows PC and then receives a per-device bearer token.

## Production environment variables
- `PORT`: Render provides this automatically (local default `10000`).
- `ADMIN_USER`: admin username.
- `ADMIN_PASSWORD`: strong admin password.
- `CLIENT_REGISTRATION_KEY`: shared registration secret. For the current client build, the configured value is `CLIENT_REGISTRATION_KEY`.
- `DATA_DIR`: persistent storage path (default `./data`).

**Security:** keep the registration key in Render Environment Variables. Do not commit real secrets to GitHub.

## Current deployment
- Public URL: `https://print-auto-system-1.onrender.com`
- Client registration key: `CLIENT_REGISTRATION_KEY`

## API
- `GET /health`
- `POST /api/v1/admin/login`
- `POST /api/v1/client/register`
- `POST /api/v1/client/heartbeat`
- `GET /api/v1/client/jobs`
- `GET /api/v1/client/jobs/:id/file`
- `POST /api/v1/client/jobs/:id/status`
- `GET /api/v1/admin/overview`
- `POST /api/v1/admin/jobs`

## Client key flow
1. Windows client sends `registrationKey=CLIENT_REGISTRATION_KEY` to `/api/v1/client/register`.
2. Server compares it with `process.env.CLIENT_REGISTRATION_KEY`.
3. On a match, the server creates/reuses the device record and returns a unique `clientId` and bearer `token`.
4. The client uses that token for heartbeat, job polling, file download and job status updates.
5. A wrong/missing registration key returns `403 invalid_registration_key`.
6. A wrong/expired client token returns `401 invalid_client_token`.

## Deployment note
For production, attach persistent storage to `DATA_DIR` or use a persistent database. The server does not require a hard-coded domain. The client build embeds the current public URL and registration key.
