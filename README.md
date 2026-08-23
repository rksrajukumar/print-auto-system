# Auto Print Server - Simple

Node.js/Express server with a small JSON database. Designed to stay simple and easy to deploy.

## Required environment variables
- PORT: Render provides this automatically; local default is 10000.
- ADMIN_USER: admin username.
- ADMIN_PASSWORD: strong admin password.
- CLIENT_REGISTRATION_KEY: secret shared only with the client installer/config.
- DATA_DIR: persistent storage path (default ./data).

## API
- GET /health
- POST /api/v1/admin/login
- POST /api/v1/client/register
- POST /api/v1/client/heartbeat
- GET /api/v1/client/jobs
- GET /api/v1/client/jobs/:id/file
- POST /api/v1/client/jobs/:id/status
- GET /api/v1/admin/overview
- POST /api/v1/admin/jobs

## Important
For production, attach persistent storage to `DATA_DIR` or use a persistent database. The server intentionally has no hard-coded password or domain.
