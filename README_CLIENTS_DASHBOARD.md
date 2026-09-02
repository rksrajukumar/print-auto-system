# Auto Print Server — Clients Dashboard + Simple Public Upload

This package keeps the supplied `server.js` unchanged.

## Public customer flow
1. Open `/upload/<CLIENT_ID>` from the client QR.
2. Select one or multiple files (PDF/JPG/PNG/DOC/DOCX, max 20 MB each).
3. Choose B/W or Colour, paper size and copies.
4. See the calculated amount and scan the client/default UPI QR.
5. Confirm payment and tap **Payment Done & Submit for Printing**.
6. Each selected file is submitted to the existing public upload endpoint and becomes a queued print job.

## Dashboard
- Clients / PCs list
- Client UPI edit
- Client QR download
- Default (Main) Payment edit
- Default payment QR preview

No changes were made to the server.js file in this version.
