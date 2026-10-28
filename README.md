# 03 · One-hand Rental Scanner

Production: https://rental-onehand-scanner-20261028.vercel.app/

This repository contains the deployed 03 frontend: camera framing, OCR, full-page review, dark/light themes, IndexedDB checklist and pending confirmations, and five-card batch synchronization.

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

Run `python3 -m http.server 8080 --directory public` and open http://localhost:8080 for UI work. This static server does not proxy `/api/rental`; matching/sync require a Vercel deployment or equivalent rewrite. OCR downloads Tesseract from its existing CDN. Camera access requires localhost or HTTPS.

## Deployment and backend boundary

Vercel serves `public/` using `vercel.json`. `/api/rental` is rewritten to the existing shared backend at https://psa-number-scanner.vercel.app/api/rental. The shared backend source and credentials are not part of this frontend repository. It remains independently deployed.

Creating this repository does not connect Vercel Git integration or enable automatic PR preview/production deployments. Keep the current production project and domain. Before using a new preview origin for matching/sync, verify the shared backend origin policy; arbitrary preview domains are not guaranteed to work. Do not remove origin restrictions or copy credentials into the repository.

## Data contract

Exact unique cert match in A; display B current location and E card. Explicit Confirm saves locally first. Every five entries (or Sync now) synchronize C checkbox with #00FF00 and D literal New Location text (up to 60 characters). Preserve B/E and fail closed on schema changes. Avoid moving Sheet rows while scanning. Pending data belongs to the browser origin; a new preview URL has separate storage. Closed pages do not continue syncing. Do not clear browser data until pending entries have synced.

## Scope and verification

Frontend source is imported unchanged from the current 03 workspace version on 2026-10-28. Local QA outputs, backups, photos, Sheet snapshots, deployment metadata and credentials are excluded. See AGENTS.md for scanner change constraints. Historical QA scripts referenced there live in the operator workspace and are not portable repository tests. Physical iPhone/Safari validation remains outstanding.
