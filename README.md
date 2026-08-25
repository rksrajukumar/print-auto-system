# AUTO PRINT SERVER — FINAL DASHBOARD + CLIENT CONNECTION

## Client registration
The Windows Client EXE contains the server URL and registration key flow. On installation it calls:
`POST /api/v1/client/register`

The server records and displays in the Admin Dashboard:
- unique Client ID
- device ID
- PC name
- hostname
- Windows platform
- detected/default printer list
- registration time and count
- last heartbeat
- client IP

The client then sends heartbeat updates. The dashboard refreshes every 5 seconds and marks a client Online when the last heartbeat is within 90 seconds.

## Required Render environment variables
`CLIENT_REGISTRATION_KEY=CLIENT_REGISTRATION_KEY`
`ADMIN_USER=<your admin username>`
`ADMIN_PASSWORD=<your admin password>`

Use a persistent disk for `DATA_DIR` in production so the JSON database survives service recreation.

## Dashboard
The included webpage is a dark Admin Dashboard styled after the supplied reference image. It is responsive and uses live API data rather than hard-coded client information.

No separate server-information/config file is required on the client PC; the connection details are embedded in the Client EXE.
