# AUTO PRINT SERVER FINAL

## Render deployment
Build/Start:
- Build: `npm install`
- Start: `npm start`

Environment variables:
- `BASE_URL=https://YOUR-RENDER-SERVICE.onrender.com`
- `DATABASE_URL=your MySQL connection URL`
- `CLIENT_REGISTRATION_KEY=RK-AutoPrint-2026-8xK9`
- `ADMIN_USERNAME=admin`
- `ADMIN_PASSWORD=Admin@12345`
- `JWT_SECRET=<long random secret>`

## Main routes
- `/` Admin dashboard
- `/upload/CLIENT_ID` Customer upload page
- `/default-payment.html` Payment settings placeholder
- `/health` Health check
- `/api/v1/client/register` Windows client registration
- `/api/v1/client/heartbeat` Client heartbeat
- `/api/v1/client/jobs` Client queued jobs
- `/api/v1/client/jobs/:jobId/file` Client job download
- `/api/v1/client/jobs/:jobId/status` Client status
- `/api/v1/public/client/:clientId/qr.svg` Customer QR
- `/api/v1/public/upload/:clientId` Customer upload
- `/api/v1/public/job/:jobId` Job status

## Notes
The server uses MySQL and creates its required tables automatically on startup.
The temporary admin password is `Admin@12345`; change it from the dashboard after first login.
Allowed uploads: PDF/JPG/JPEG/PNG, maximum 25 MB per file.
Completed job files are removed from server storage after the client reports COMPLETED.
