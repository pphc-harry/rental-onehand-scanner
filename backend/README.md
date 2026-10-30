# Shared scanner backend source

Retained source imported on 2026-10-30 from psa-number-scanner-20261009. API/lib files, original scanner index, dependency lockfile and Vercel configuration are copied byte-for-byte. The repo root contains the current one-hand rental frontend; this folder contains the separately deployed shared backend and original scanner UI.

Rental: api/rental.js -> lib/rental.cjs / lib/rental-batch.cjs -> lib/google.cjs. Batch confirmation writes C checkbox and #00FF00 background plus D destination in one Sheets batchUpdate and verifies the returned values/format. A checked checkbox alone is still treated as scanned by the current frontend; this source import does not fix or establish the cause of missing highlights.

Install dependencies with `cd backend && npm ci`. A separate Vercel project must use this directory as its root and retain the existing approved environment configuration. Required environment variable names: SCANNER_GOOGLE_SERVICE_ACCOUNT and, for the original scanner guard, SCANNER_ACCESS_KEY. Values are intentionally absent. Do not deploy this folder as the frontend project or change the existing origin allowlist without an explicit deployment task.

Excluded: credentials, .env files, .vercel project bindings, node_modules, photos, real Sheet snapshots, operational QA logs, backup files and generated archives. No deployment or Google Sheet mutation is performed by this source import. Historical operational README/AUDIT files are not deployment instructions.

Run `npm run check` from repository root for frontend and backend syntax checks. Run `node scripts/test-rental.cjs` for mocked rental write safety tests, including missing green format rejection. No real Sheet writes occur in these tests.
