# Deployment checklist

1. Set environment variables from `.env.example` in Render/server hosting.
2. Install with `npm install`.
3. Start with `npm start`.
4. Verify `/health`.
5. Register a Windows client using the configured registration key.
6. Confirm the client appears online in admin overview.
7. Configure client-specific UPI if needed.
8. Open the client upload URL and submit a small test PDF.
9. Verify QUEUED -> DOWNLOADED -> PRINTING -> COMPLETED.
10. Verify the server-side job file is deleted after COMPLETED.
11. Test FAILED -> RETRY and CANCELLED -> file deletion.
12. Never publish production credentials in GitHub.
