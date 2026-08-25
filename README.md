# Auto Print Server — Default UPI QR Admin

This package keeps the existing Client registration, customer QR upload and print flow.

## Registration
- Client Key: `rksrajukumar`
- Registration Value: `RK-AutoPrint-2026-8xK9`
- Server URL: `https://print-auto-system-1.onrender.com`

## Default UPI
- Default UPI ID: `9097676711@upi`
- Default UPI QR: editable from the Admin Dashboard

## Admin Dashboard
After admin login, use **SERVER DEFAULT PAYMENT / UPI SETTINGS** to:
- edit the default UPI ID
- upload/replace the default UPI QR image (PNG/JPG/WEBP, max 2 MB)
- save the settings

The default UPI is used for customers when the selected client has no client-specific UPI ID/QR configured. Client-specific UPI settings still take priority.

## Client UPI
The existing **CLIENT PAYMENT / UPI SETTINGS** section remains available for per-client UPI ID and QR configuration.


### Admin Login
Default login if Render environment variables are not set:
- Username: `admin`
- Password: `CHANGE_ME`
For production, set `ADMIN_USER` and `ADMIN_PASSWORD` in Render Environment Variables.
