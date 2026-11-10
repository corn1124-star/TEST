# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Existing codebase: Google Apps Script web app (HTML Service, V8). `client/Index.html` includes the other `client/**/*.html` files; no build step or front-end framework. Server code is `server/**/*.js`. Deployed with clasp. Data lives in Google Sheets and BigQuery (switchable data source).

## Users

- **Warehouse admins (Quản trị viên):** record receive/issue (Nhập kho / Xuất kho) directly, run stocktakes, approve staff requests, manage users, SKUs, stock slips (Phiếu kho) and backups, and restore deleted transactions. See all Cost Centres.
- **Team staff (Nhân viên):** submit receive/issue requests for their own Cost Centre, then track, edit, or delete them until approved. See only their own Cost Centre.

Both use it on desktop and on phones at the warehouse.

## Product Purpose

Grab Inventory ("SEC WH") tracks stock in a warehouse: receive/issue transactions, current stock on hand by bin location (warehouse · shelf · level), history, reports (receive–issue–stock, stock on hand, alerts), stocktake, and SKU management. Success means stock figures the team can trust and requests that clear quickly without anyone editing a spreadsheet by hand.

## Positioning

Staff requests pass through admin approval before touching the books. Stocktake compares counted quantity against the system and labels each line Khớp / Dư / Thiếu (match / over / short) so the admin decides on the adjustment. Deletes are soft and restorable, and blocked if they would push stock negative. Access is scoped by role and Cost Centre.

## Operating Context

- Sign-in with a company Google account; allowed users are listed in the Team sheet (per the landing error help). Personal Gmail does not work.
- Main navigation: Home · Stock (Kho: stock, stocktake, history) · Reports · Manage (approvals & users, SKU, stock slips). "My requests" and the user guide sit in the account menu. Admin-only areas are hidden from staff.
- First-run guided tour and a "?" help button on each page explain terms.
- Email notifications for requests and admin events; photo attachments; scheduled backups.
- Terminology (Vietnamese UI): Nhập kho = import/receive, Xuất kho = export/issue, Tồn kho = stock on hand, Phiếu kho = stock slip, Kiểm kê = stocktake, Cost Centre.

## Capabilities and Constraints

- Bilingual Vietnamese/English (I18N tables per feature file). New copy needs both.
- Must work on phones; the tab bar moves to the bottom edge on small screens.
- Runs inside Apps Script's HTML Service: no bundler, no npm front-end dependencies; HTML files are inlined/included server-side. `clasp push` sends only `appsscript.json`, `.html`, and `.js`; `.claspignore` excludes `.claude/` and `.impeccable/`.
- Web app access is domain-restricted and executes as the accessing user.
- Negative stock is treated as a data error and surfaced as a warning on Home.

## Brand Commitments

Keep the Grab identity (confirmed by the user). Specific colors, logo, and typography are not recorded here; `document` or new work should read them from the shipped code.

## Evidence on Hand

Real, working app with ~65 files in `client/` and `server/`. No testimonials, customer logos, or benchmarks exist or should be invented. Deployed version noted as v4.1.3 (deployment @7).

## Product Principles

1. **Trustworthy numbers over speed of entry.** Approval, soft delete, and negative-stock checks exist to protect the stock figures; never trade them away for fewer clicks.
2. **Two roles, one app.** Staff see only what they can act on; admin power tools stay out of staff's way.
3. **Warehouse reality.** Used standing at a shelf on a phone as much as at a desk; tasks must be fast to scan and hard to get wrong.
4. **Bilingual by default.** Every string, error, and help text exists in Vietnamese and English.
5. **Reversible actions.** Prefer recoverable operations and clear confirmation over silent destructive ones.

## Accessibility & Inclusion

No formal standard stated. Bilingual (Vietnamese/English) and mobile use are required.
