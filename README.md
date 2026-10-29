# 03 · One-hand Rental Scanner

Production: https://rental-onehand-scanner-20261028.vercel.app/

This repository contains the 03 frontend: location check sessions (name + location → that location's cards → scan to tick → list of cards not scanned), camera framing, OCR, full-page review, dark/light themes, IndexedDB checklist and pending confirmations, and batch synchronization.

## Work on a new version

```sh
git clone https://github.com/pphc-harry/rental-onehand-scanner.git
cd rental-onehand-scanner
git switch -c feature/my-version
# Make changes in public/
npm run check
git add public/
git commit -m "Describe your change"
git push -u origin feature/my-version
gh pr create --base main
```

PRs and pushes run syntax/config/local asset checks in GitHub Actions. These checks do not exercise camera hardware or write to Google Sheets.

## Local preview

Run `python3 -m http.server 8080 --directory public` and open http://localhost:8080 for UI work. This static server does not proxy `/api/rental`; matching/sync require a Vercel deployment or equivalent rewrite. OCR downloads Tesseract from its existing CDN. For PSA, the label barcode is read first with the browser's built-in BarcodeDetector, or with barcode-detector (zxing-wasm) from the same CDN where the browser has none; the printed number is read only when no barcode is found. Camera access requires localhost or HTTPS.

## Deployment and backend boundary

Vercel serves `public/` using `vercel.json`. `/api/rental` is rewritten to the existing shared backend at https://psa-number-scanner.vercel.app/api/rental. The shared backend source and credentials are not part of this frontend repository. It remains independently deployed.

Creating this repository does not connect Vercel Git integration or enable automatic PR preview/production deployments. Keep the current production project and domain. Before using a new preview origin for matching/sync, verify the shared backend origin policy; arbitrary preview domains are not guaranteed to work. Do not remove origin restrictions or copy credentials into the repository.

## Data contract

Each session starts with a scanner name and a location picked from the downloaded list. A card belongs to its D New Location when set, otherwise its B Location. Exact unique cert match in A, and the card must belong to the session location; otherwise nothing is written. Display B (with D when it differs) and E card. Explicit Mark scanned saves locally first. Sync runs every five entries, 10 seconds after the last scan, on Finish, or with Sync now, and writes C checkbox with #00FF00 and D = the session location as literal text (up to 60 characters). The scanner name stays on this device (session records and CSV export) and is not sent to the backend. While a session is open the list reloads every 10 seconds; cards ticked in C after the session started count as scanned on another phone and cannot be marked again. Preserve B/E and fail closed on schema changes. Avoid moving Sheet rows while scanning. Pending data belongs to the browser origin; a new preview URL has separate storage. Closed pages do not continue syncing. Do not clear browser data until pending entries have synced.

## Scope and verification

Frontend source is imported unchanged from the current 03 workspace version on 2026-10-28. Local QA outputs, backups, photos, Sheet snapshots, deployment metadata and credentials are excluded. See AGENTS.md for scanner change constraints. Historical QA scripts referenced there live in the operator workspace and are not portable repository tests. Physical iPhone/Safari validation remains outstanding.
