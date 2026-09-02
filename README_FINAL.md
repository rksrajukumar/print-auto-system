# Auto Print System — WebSocket + Printer Selection Fixed

## Final flow
Customer QR/Upload -> HTTPS Server -> Print Queue -> WebSocket -> Windows Client Service -> Selected Windows Printer

## Server
- Express HTTPS/HTTP application with WebSocket endpoint `/ws/client`
- Client registration and persistent token
- Live job notification over WebSocket
- Polling remains as a fallback
- All client printers are stored from Windows client heartbeats
- Admin can select one printer per Client PC
- Customer-created jobs inherit the selected printer
- Queued jobs without a printer inherit the currently selected printer when fetched
- Automatic reconnect is implemented on the Windows client

## Client
- Detects all Windows installed printers
- Sends printer list to server on registration/heartbeat
- Connects to server using HTTPS + WebSocket/WSS
- Automatically reconnects if WebSocket disconnects
- Uses selected server printer for jobs
- Falls back to configured/default Windows printer only if no server selection exists
- Existing print/status/retry logic is retained

## Build
Server:
1. `npm install`
2. Set `PORT`, `CLIENT_REGISTRATION_KEY` (or existing alias), admin credentials.
3. `npm start`

Client on Windows:
1. `npm install`
2. Create `config.json` from `config/config.example.json` with production server URL, client key and registration key.
3. `npm run build` (requires Node.js 20 + pkg on Windows).
4. Compile `installer/AutoPrintClient.iss` with Inno Setup.

Note: this package contains the corrected source. A Windows `.exe` cannot be reliably produced in this Linux build environment because the supplied build uses Windows `pkg`/Inno Setup.
