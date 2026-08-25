# Auto Print Server Final

## Render environment
- `CLIENT_KEY_NAME=rksrajukumar`
- `CLIENT_REGISTRATION_KEY=RK-AutoPrint-2026-8xK9`
- `PUBLIC_URL=https://print-auto-system-1.onrender.com`
- `ADMIN_USER=admin`
- `ADMIN_PASSWORD=<your-admin-password>`

## Customer flow
QR → Upload → B/W/Color → Copies → A4/A3 → Amount → UPI → return to page → `I HAVE PAID` → `PRINT NOW` → client queue → default printer.

No payment gateway, no UTR field, no Admin payment verification, and no Client confirmation button.

## Important payment note
Without a gateway/webhook the server cannot prove that a UPI payment happened. `I HAVE PAID` is a customer declaration. The shop owner may inspect the payment on their phone, but there is no confirmation control in the system.
