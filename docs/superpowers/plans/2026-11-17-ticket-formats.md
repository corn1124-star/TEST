# Ticket formats + Phiếu giao hàng Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the "Phiếu kho" page, print Phiếu nhập and Phiếu xuất in the new shared format (single left signature, black only, no address label, no "In lúc" footer) and add a one-sheet Phiếu giao hàng for every export ticket.

**Architecture:** All work is client-side in `client/pages/AdminAndTickets.html`: `buildPrintHtml` gains a `kind` argument (`'delivery'` or omitted = by `g.type`), the export ticket card gets a second button that calls a new `printDelivery(idx)`. No server, Sheet, or `getTickets` change; the delivery note reuses the export ticket's `items`, `locList`, `ticketId`.

**Tech Stack:** Apps Script HtmlService client (plain JS in `<script>`), QA harness in `qa/` (Node + headless Chrome, `createDriver`), Vietnamese UI strings in `client/app/I18n.html`.

**Spec:** `docs/superpowers/specs/2026-11-17-ticket-formats-design.md` (approved in chat 2026-11-17: "Đồng ý" to the defaults). Mockup of the approved look: `.superpowers/brainstorm/1418-1794882757/content/ticket-set-v8.html` (git-ignored; open it for exact layout).

## Global Constraints

- Paper tickets are always bilingual (VI + EN), independent of the app's VI/EN switch; UI button label is localized in both languages.
- A4 landscape, margins `12mm 14mm`, printable width exactly 269mm. CSS stays inline in the print document.
- Everything printed is `#000` on `#fff`: no gray, no colored fill. The logo is the existing `.hd-logo` data-URI image, left as is (colored).
- Removed from print: label "Địa chỉ (Address):" (address text stays), the "In lúc … · user" footer, any decorative horizontal rule (under header, around "Giao đến", above signatures). The item table keeps its black cell grid.
- Phiếu nhập / Phiếu xuất: ONE signature box "NGƯỜI LẬP PHIẾU / Prepared by" on the LEFT; no "NGƯỜI NHẬN HÀNG", never "Admin lập phiếu". 8 columns incl. "Vị trí (Bin)".
- Phiếu giao hàng: THREE signature boxes (NGƯỜI LẬP PHIẾU / Prepared by, SHIPPER / Shipper, NGƯỜI NHẬN HÀNG / Received by), no time fields, 7 columns (no Bin), exactly ONE sheet per export ticket even with several locations; "Giao đến / Deliver to" lists `g.locList`.
- Header right of all three: "Số phiếu (No.)" + "Ngày (Date)". Document numbers: `PN_…`, `PX_…` unchanged; delivery note `PGH_…` = `ticketId` with the `PX_` prefix replaced by `PGH_`.
- "In tất cả" (`printAllTickets`) and the Import ticket card are unchanged: no delivery note there.
- Do NOT `clasp push`/deploy and do NOT push to GitHub. Local commits only. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Run tests from `qa/` with node on PATH: `export PATH="/c/Users/thanh.phan/tools/node/node-v26.13.0-win-x64:$PATH"`; run suites one at a time.

## Review Focus

- Export ticket whose rows have two different Locations: still ONE delivery note, "Giao đến" shows both (Task 2 test).
- Export ticket where no row has a Location: "Giao đến" cell is empty, never "undefined" or "null" (Task 2 test).
- Requester / item name / location containing `<`, `&`, `"`: escaped in the delivery note (Task 2 test).
- A 40-row ticket: header row repeats and the total row does not repeat on every page; one signature block (Task 1 test on the CSS and markup; manual print check in Task 3).
- App language EN: the printed delivery note is still bilingual and the card button reads "Print delivery note" (Task 2 test).

---

## File structure

- Modify `client/pages/AdminAndTickets.html`: `TICKET_TXT`, `buildPrintHtml`, `renderTickets` (card buttons), new `deliveryNoteId`, `printDelivery`.
- Modify `client/app/I18n.html`: key `ticket.printDelivery` (VI and EN).
- Create `qa/test-tickets.mjs`: all new assertions about the printed documents and the card buttons.
- Modify `qa/test-group3.mjs` (test 3.10, line ~705): old label expectations.
- Modify `server/config/Version.js`, `QA-CHECKLIST.md`, spec line about tests (Task 3).

---

### Task 1: New shared format for Phiếu nhập / Phiếu xuất

**Files:**
- Modify: `client/pages/AdminAndTickets.html` (`TICKET_TXT` ~L953, `buildPrintHtml` ~L1027-1281)
- Create: `qa/test-tickets.mjs`
- Modify: `qa/test-group3.mjs:705`

**Interfaces:**
- Produces: `TICKET_TXT` loses `addr` and `printed`; gains `no: ['Số phiếu','No.']`. `buildPrintHtml(list: Ticket[], kind?: 'delivery'): string` (this task implements only the default path; Task 2 adds `'delivery'`). Print document markers later tasks and tests rely on: `<div class="ticket">` per ticket, `<table class="sg">` signature table, `<td class="sgc">` one per signature box, `<table class="it">` item table, header number cell `<div class="no">`.

- [ ] **Step 1: Write the failing tests** in `qa/test-tickets.mjs` (same skeleton as `qa/test-tablesort.mjs`: `build({quiet:true})`, `createDriver`, `check(name, ok, detail)`, exit code 1 on any FAIL). Add a helper `printed(page, idx)` that installs a `window.open` stub collecting `document.write` HTML (copy `PRINT_HOOK` from `qa/test-group3.mjs:664`), clicks `#tkList .ticket-card:nth-child(idx) .ticket-head > .btn`, returns the HTML. Tests, run for one Import and one Export ticket (find indexes with `TICKETS.rows.findIndex(g => g.type === ...)`):
  - `import+export: exactly one .sgc box and its text is "NGƯỜI LẬP PHIẾU"; "NGƯỜI NHẬN HÀNG", "Received by", "Admin" absent`.
  - `import+export: signature box is left-aligned` (the `table.sg` has the box in the first cell; remaining cells empty: assert `html` contains `<td class="sgc">` exactly once and `table.sg td.sgc` rule has no `text-align:right`).
  - `import+export: "Địa chỉ" and "Address)" absent, address text present` (`<span class="seg">Tầng 15</span>` still there).
  - `import+export: no "In lúc" footer` (`!html.includes('In lúc')`, no `class="ft"`).
  - `import+export: header shows Số phiếu (No.) = ticketId and Ngày (Date) = dateVn inside <div class="no">`.
  - `import+export: print CSS uses only #000/#fff`: take `html.slice(0, html.indexOf('.bar{'))`, every `#[0-9a-f]{3,6}` match is `#000` or `#fff`.
  - `import+export: no decorative rule`: CSS contains no `.ln` rule and no `border-bottom` on `.hdBox`/`.hd`; markup has no `class="ln"`.
  - `import+export: 8 columns incl. "Vị trí"` (`<col` count inside `table.it` = 8, header contains `Bin`).
  - `long ticket: thead repeats, tfoot does not`: via `init` override make one ticket 40 items; CSS contains `thead{display:table-header-group}` and `tfoot{display:table-row-group}` and `table.it tr{page-break-inside:avoid}`; html has one `<table class="sg">`.
- [ ] **Step 2: Run to verify failure:** `cd qa && node test-tickets.mjs` → the new assertions FAIL (old labels still there).
- [ ] **Step 3: Implement** in `AdminAndTickets.html`: edit `TICKET_TXT` as above; rewrite the header block of `buildPrintHtml` (left: logo + org + address text via existing `addrHtml`, no label; right: `<div class="no">` with "Số phiếu (No.): <b>ticketId</b><br>Ngày (Date): <b>dateVn</b>"), delete the `.dt` date line under the title, delete the `.ft` footer and the `printedAt`/`printedBy` variables, replace `table.sg` markup with a single left box (`<td class="sgc">` first cell at 34% width, other cells empty, no `.ln` row), add the print-pagination CSS from the tests. Keep info block, 8-column table, `addrHtml`, `codeHtml`, logo and the `printScript` untouched.
- [ ] **Step 4: Update `qa/test-group3.mjs:705`** to `['PHIẾU XUẤT KHO','PHIẾU NHẬP KHO','EXPORT TICKET','Prepared by','Cartons'].filter(...).length >= 4` and add `!html.includes('Địa chỉ') && !html.includes('In lúc')` to the same check's description/condition.
- [ ] **Step 5: Run** `node test-tickets.mjs` (all PASS) then `node test-group3.mjs` (no new FAIL versus `git stash` baseline; note any pre-existing OBS lines).
- [ ] **Step 6: Commit** `git add client/pages/AdminAndTickets.html qa/test-tickets.mjs qa/test-group3.mjs && git commit -m "Phieu nhap/xuat: khung moi, mot o ky, chu den, bo In luc va nhan Dia chi"` (+ trailer).

---

### Task 2: Phiếu giao hàng (document + button + i18n)

**Files:**
- Modify: `client/pages/AdminAndTickets.html` (`TICKET_TXT`, `buildPrintHtml`, `renderTickets` ~L871, new functions after `printTicket` ~L886)
- Modify: `client/app/I18n.html` (VI near L345, EN near L710)
- Modify: `qa/test-tickets.mjs`

**Interfaces:**
- Consumes (Task 1): `buildPrintHtml(list, kind?)`, `TICKET_TXT`, `<td class="sgc">`, `<div class="no">`.
- Produces: `TICKET_TXT.docDel = ['PHIẾU GIAO HÀNG','DELIVERY NOTE']`, `TICKET_TXT.deliverTo = ['Giao đến','Deliver to']`, `TICKET_TXT.sgShip = ['SHIPPER','Shipper']`; `deliveryNoteId(g: Ticket): string` (= `g.ticketId.replace(/^PX_/, 'PGH_')`); `printDelivery(idx: number): void` (no-op unless `TICKETS.rows[idx].type === 'Export'`; calls `openPrintWindow(buildPrintHtml([row], 'delivery'))`); i18n key `ticket.printDelivery` = VI "In phiếu giao hàng" / EN "Print delivery note". Card button: second `.btn.ghost.sm.tk-deliver` directly inside `.ticket-head`, rendered only when `g.type === 'Export'`, `onclick="printDelivery(idx)"`, same classes as the existing print button, icon `'truck'` if the icon set has it else `'printer'`.

- [ ] **Step 1: Write the failing tests** in `qa/test-tickets.mjs` (select the delivery button with `#tkList .ticket-card:nth-child(k) .tk-deliver`):
  - `only Export cards have .tk-deliver; Import cards have none`.
  - `export card: print and delivery buttons are siblings with the same classes besides tk-deliver` (same `className` after removing `tk-deliver`, same computed height).
  - `delivery note: title "PHIẾU GIAO HÀNG" and "DELIVERY NOTE"; number is PGH_ + ticketId.slice(3); one .ticket block`.
  - `delivery note: three .sgc boxes in order "NGƯỜI LẬP PHIẾU", "SHIPPER", "NGƯỜI NHẬN HÀNG"; no time fields` (no "Giờ", "Time").
  - `delivery note: 7 columns, no "Bin"/"Vị trí" header; every item code of the export ticket present; total quantity equals ticket totalQty`.
  - `delivery note: "Giao đến" lists both locations` (override one export ticket so its rows have Locations `Văn phòng Quận 7` and `Văn phòng Quận 1`; assert one write, one `.ticket`, both names present, joined by ", ").
  - `delivery note: no Location on any row → "Giao đến" value cell empty, html has no "undefined"/"null"`.
  - `delivery note: requester "<b>&Co" and item name with quotes are escaped`.
  - `lang=en: card button text "Print delivery note"; printed document still contains "PHIẾU GIAO HÀNG" and "Received by"`.
  - `print-all html has no "PHIẾU GIAO HÀNG"`.
  - `delivery note: print CSS only #000/#fff, no "Địa chỉ", no "In lúc"` (same helpers as Task 1).
- [ ] **Step 2: Run to verify failure** (`node test-tickets.mjs`): new delivery assertions FAIL (button missing).
- [ ] **Step 3: Implement** `deliveryNoteId`, `printDelivery`, the `kind === 'delivery'` branches in `buildPrintHtml` (title from `docDel`, info block row 2 = "Giao đến" in one wide row with `font-size:12.5pt;font-weight:bold`, colgroup `12+42+auto+18+18+18+56mm` without Bin, three `.sgc` boxes with equal widths, header number = `deliveryNoteId(g)`, document `<title>` = `docDel[0]`), the card button in `renderTickets`, and the i18n key in both languages. Escape every inserted value with `escapeHtml`.
- [ ] **Step 4: Run** `node test-tickets.mjs` (all PASS), `node test-group3.mjs`, `node smoke.mjs` (92/92 expected as before).
- [ ] **Step 5: Commit** `git add client/pages/AdminAndTickets.html client/app/I18n.html qa/test-tickets.mjs && git commit -m "Them Phieu giao hang cho phieu xuat (mot to, 3 o ky) va nut In phieu giao hang"` (+ trailer).

---

### Task 3: Release housekeeping and docs

**Files:**
- Modify: `server/config/Version.js` (`APP_VERSION = '4.4.0'`, `APP_BUILD_ID = '20261117-ticket1'`)
- Modify: `QA-CHECKLIST.md`, `qa/README.md` (list `test-tickets.mjs`)
- Modify: `docs/superpowers/specs/2026-11-17-ticket-formats-design.md`

- [ ] **Step 1:** In the spec section 5, replace the sentence "Hiện **chưa có test** nào cho `buildPrintHtml`…" with the truth: print is covered by test 3.10 in `qa/test-group3.mjs`, which this change updates, plus the new `qa/test-tickets.mjs`; set the status line to "đã duyệt 2026-11-17 (đồng ý với mặc định)".
- [ ] **Step 2:** `QA-CHECKLIST.md`: add to group 3 a line for `test-tickets.mjs` (formats, delivery note), and under "Kiểm bằng tay trên app thật" a block: print one Phiếu nhập, one Phiếu xuất and one Phiếu giao hàng to PDF/real printer in black and white; check one ticket of about 40 rows (header repeats on page 2, total and signatures only on the last page and not alone on a page, if they are alone note it for the user); check an old export row whose Location is the pick-up place (the admin must eyeball "Giao đến" before printing).
- [ ] **Step 3:** Bump version constants; run the whole QA set one suite at a time (`for f in test-*.mjs smoke.mjs; do node $f || break; done`), expecting all green.
- [ ] **Step 4: Commit** `git commit -am "Build 20261117-ticket1 (v4.4.0): format phieu moi + phieu giao hang, cap nhat QA-CHECKLIST va spec"` (+ trailer). Stop here: tell the user the build is ready locally and that `clasp push`/deploy and GitHub push need their explicit word.
