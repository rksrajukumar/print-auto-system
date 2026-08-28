# Auto Print Server — Clients / PCs Dashboard

Added a working Clients / PCs dashboard to the existing Express server.

## Included
- Client list with Active / Offline status
- Client ID, PC name, last seen and printer information
- Per-client QR preview
- **Download QR** button using the existing QR endpoint
- **Update UPI** modal for each client
- UPI ID + optional UPI Number saved per client
- View client details
- Disable client
- Search, status filter, refresh and CSV export

## API added
`POST /api/v1/admin/clients/:id/upi`

Body:
```json
{"upiId":"shop@upi","upiNumber":"9876543210"}
```

The existing registration, heartbeat, jobs and QR endpoints remain in place.
