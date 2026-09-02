# AUTO PRINT SERVER
Root deployment files are intentionally at SERVER/ root.

Render:
- Root Directory: `SERVER`
- Build: `npm install`
- Start: `node server.js`

Database: run `database/schema.sql`.
Set MYSQL_* and BASE_URL environment variables.

Payment webhook is NOT included. The customer page uses the agreed "Payment Done / Submit Print" flow.
