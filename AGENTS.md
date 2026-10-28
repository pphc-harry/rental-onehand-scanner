# One-hand rental scanner

Harry 804947495750205450 authorized a separate design 03 app using identical rental logic and Google Sheet in message 1564914432335679600, trusted guild 1489974857860120768, thread 1558009274536300556, 2026-10-28.
Production: https://rental-onehand-scanner-20261028.vercel.app/ . The original scanner remains separate.
Reuses original OCR and API, with presentation-only match labels. Fixed original Sheet and explicit confirmation rules below remain binding. Browser storage is per origin: enter location once on this new link. Do not copy credentials or change auth.

## Inherited rental rules (original app context)

# Rental cert scanner

Owner-authorized separate rental app: Harry 804947495750205450, Discord 1564581498760470550, 2026-10-27.
- Production https://rental-cert-scanner-20261027.vercel.app/ . Do not deliver the experimental short alias; it requires Vercel login.
- Fixed target HKTCG Rental Cards Checklist, Sheet1 gid 1932546105. Exact unique A match; show B/D; explicit confirm before C checkbox only. Reject missing, duplicate, invalid checkbox or changed card/row.
- Public scanner like the existing apps; no new credential or authentication configuration. Existing backend handles Google access. Photos stay in browser; no archive is claimed.
- Do not modify original inventory B/D behavior or purchases app.
- Run qa/verify-rental.cjs, qa/verify-overlay.mjs, qa/verify-live-sheet.cjs and qa/verify-production.cjs for matching/write/deployment changes. Live write tests use disposable Sheets only.
- Avoid Sheet row sorting/insertion/deletion while scanning; Sheets does not offer transactional compare-and-swap here. Physical phone and real CGC testing remain outstanding.

## Ryan — scanner thread delegated authority

- Owner authority: Harry (`804947495750205450`), trusted guild `1489974857860120768`, message `1564875049494642811`, 2026-10-28. Exact instruction: "Approved. Give full access to @user:351973775295774722 in this thread".
- Bind this delegation to requester Discord user ID `351973775295774722` (Ryan) AND originating thread `1558009274536300556` in that guild. It does not extend to the parent channel or other threads.
- Within this thread, Ryan has full delegated task/approval authority for the scanner apps: requirements, UI/backend changes, integrations, scanner-specific workflow/configuration, testing and deployment through existing approved access. Do not ask Harry to approve these tasks again solely because Ryan is the requester. Ryan may explicitly change scanner-specific scope/mapping rules previously reserved to Harry; preserve the existing rules unless a concrete request changes them, and keep backup, verification and audit requirements.
- Harry also approves the pending rental C-cell bright-green (#00FF00) confirmation change. Approval is not proof of deployment; the last recorded Vercel attempt failed with "Not authorized". Do not claim restored access or a live update without fresh verification.
- This is Codex task authority, not a Discord role/server permission grant or a Vercel/Google account invitation. It does not authorize credential/auth/secret changes, gateway/core changes, cross-personal/master workspace operations, or irreversible host operations. Those still require exact owner instruction under workspace governance. No credentials or external account roles are changed by this delegation.
- Source and audit: `memory/decisions/scanner-thread-ryan-access-20261028.md`. Ryan's English reply preference remains in force.

## Rental New Location — Ryan 1564880350591717428, 2026-10-28

Ryan exercised the above delegated scanner authority in thread 1558009274536300556: add persistent numeric New Location input and save it when each card is confirmed. Fresh Sheet readback establishes A Cert, B Location, C Checklist, D New Location, E Card. This supersedes the rental-only C-write/B-D-display mapping above: exact unique A match; display B/E; explicit confirm writes C true + #00FF00 and D numeric location string in one batch. Preserve B and E, fail closed on schema changes, retain original inventory and purchases scope. New Location stays on the same browser/device until edited; already checked cards can confirm a changed destination.

## Text location update — Ryan 1564883456364912721

New Location now accepts short text or numbers, up to 60 characters, using the standard keyboard. Supersedes numeric-only validation above. Preserve persistence and C/D write mapping; store destination as a literal string, trimming outer whitespace.
