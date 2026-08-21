# AUTO PRINT SERVER — MODIFIED v2

## New architecture

### 1. Client installation
The shop PC runs `client/install-client.bat`.
The client calls the server `/api/client/register`.
The SERVER generates a unique Client ID such as `PC_xxxxxxxxxxxxxxxx` and a private client secret.
The ID is stored locally in `client/client-config.json`.

### 2. Customer page is automatically bound to that Client ID
The server creates:
`http://SERVER:3000/upload.html?client=CLIENT_ID`

The Admin page can display the QR for that exact URL.
A customer scanning that QR can only create a job for that shop/client.

### 3. Customer flow
1. Customer scans QR.
2. Upload document.
3. Select B/W or Color, copies, A4/A3, pages.
4. Server calculates total.
5. Customer pays by UPI.
6. Job remains `payment_pending`.
7. `PRINT NOW` is hidden/locked until the server receives a VERIFIED payment webhook.
8. After verification, customer sees `PRINT NOW`.
9. Clicking it changes the job to `queued`.
10. The shop client polls its own queue and downloads/prints the job.
11. Job becomes `completed` or `failed`.

## PAYMENT VERIFICATION DISABLED
Payment verification is intentionally disabled in this build.

The customer page shows the UPI payment details and then immediately enables `PRINT NOW`.
Clicking `PRINT NOW` sends the job to the shop PC queue.

This build therefore does NOT verify whether the UPI payment was actually completed. Use it only if that is the workflow you want.

## Printing
The client uses the Windows default printer. For reliable PDF printing with copies, paper size and B/W/color, install SumatraPDF and set:
`SUMATRA_PATH=C:\Program Files\SumatraPDF\SumatraPDF.exe`

Then the client passes the selected copy/paper/color settings to the PDF printer command.

## Server
1. Install Node.js 18+.
2. Run `npm install`.
3. Set the webhook secret.
4. Run `npm start`.
5. Open the Admin page at `http://SERVER-IP:3000`.

## Security
For production, put the server behind HTTPS, protect the Admin page with authentication, and use a proper payment provider webhook/signature verification rather than a simple shared secret.

## Files
- `server.js` — server/API/database
- `public/index.html` — admin
- `public/upload.html` — customer page
- `client/client.js` — shop PC auto-print agent
- `client/install-client.bat` — client registration/installation
