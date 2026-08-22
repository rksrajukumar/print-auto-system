# AUTO PRINT SERVER — FINAL BUILD

Target domain: https://stem-1.onrender.com

This server package keeps the Auto Print Server dashboard/customer flow and adds automatic Windows Client registration.

## Main behavior
- Dashboard keeps the Payment & Clients Management layout.
- Windows Client Service registers automatically at `/api/client/register`.
- Each PC gets a unique Client ID/token on first install.
- Client sends hostname/default printer and stays online through heartbeat/WebSocket.
- Clients / PCs can show Active/Offline status.
- Each client has its own upload URL and QR code.
- Customer jobs are routed to the selected Client ID.
- WebSocket pushes queued jobs to the matching client.
- Jobs auto-cancel after 5 minutes when the target PC is offline/no response.
- Job files are removed after printed/cancelled/error.

## Deployment
1. Install Node.js 20+ and MySQL.
2. Copy `server/.env.example` to `server/.env` and set secure values.
3. Execute `deploy/mysql.sql` after changing the database password.
4. Run `cd server && npm install && npm start`.
5. Put Nginx in front with WebSocket proxying (`deploy/nginx.conf`).
6. Set `PUBLIC_BASE_URL=https://stem-1.onrender.com` when this is the public URL.

## Important
The dashboard design is HTML/CSS in `server/public/admin.html`. Replace it only if you intentionally want a new UI. The API contract is designed for the matching Auto Print Client package.

Payment remains UPI display only. This build does not verify a UPI transaction.
