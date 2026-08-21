# Auto Print Server
1. Install Node.js 18+.
2. Run `npm install`.
3. Run `npm start`.
4. Open `http://SERVER-IP:3000`.
5. Create each Client PC from the Admin panel and use the generated secret only for that PC's background installer.

Customer flow: upload -> amount/UPI shown -> customer pays -> taps Payment Done -> job enters the PC queue. Payment verification is intentionally NOT implemented.

Server controls client-specific UPI ID, UPI number, payment QR, client enable/disable, upload link and upload QR.
