# Scanner inventory hard rule

Owner instruction: Harry (804947495750205450), trusted guild 1489974857860120768, message 1558041831080722473, 2026-10-09.

- Search PSA certificate numbers ONLY in Buy Sheet column B (Card Cert), using full-number exact matching and preserving leading zeros.
- Never search or fall back to other columns or tabs, even when B has no match. Reading C/D for schema or checkbox validation is not certificate matching.
- Only a unique B-column match permits checking and yellow-highlighting column D of that same row.
- No B match or multiple B matches means no Sheet mutation. A number appearing only outside B must never trigger a write.
- Keep this scope unless Harry explicitly changes this rule. Run `node qa/verify-b-only.cjs` and `node qa/verify-inventory.cjs` when changing inventory reconciliation.

## Separate rental integration exception

Harry (804947495750205450), trusted guild 1489974857860120768, message 1564581498760470550, 2026-10-27, explicitly authorized the separate rental app integration and deployment requested in this thread. This exception is limited to api/rental.js and lib/rental.cjs: fixed HKTCG Rental Cards Checklist spreadsheet 1XGWNnSCZtcTZ6LWHy7AMdwyqZEXoK6zNggKx7cdnkj8, Sheet1 gid 1932546105; exact unique cert matching only in A; show B location and D card; set only that row's C checkbox after user confirmation and fresh matching. No match, duplicate or changed details must not write. The original inventory B/D rules above remain unchanged. Production frontend: https://rental-cert-scanner-20261027.vercel.app/ . Verification: ../rental-cert-scanner-20261027/qa/verify-rental.cjs and qa/verify-live-sheet.cjs; original B-only/inventory regressions also remain required for shared backend deployments.

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
