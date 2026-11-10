# SEC WH QA harness

Runs the Apps Script web app (`../SEC WH/client/Index.html`) in a **real headless Chrome without Google**:
the HtmlService templates are rendered offline, `google.script.run` is replaced by a mock that answers from
realistic fixtures, and a tiny Chrome DevTools Protocol driver lets a test click/type/screenshot.
Node 22 builtins only. Nothing under `../SEC WH/client` or `../SEC WH/server` is ever modified.

```
build.mjs      render client/Index.html -> dist/index.html (+ inject mock + fixtures)
mock.js        window.google.script mock (inlined into dist/index.html, runs before any app script)
fixtures.mjs   createFixtures(): data + stateful handlers for every server function the client calls
driver.mjs     createDriver(): launch Chrome, open the app, click/type/eval/screenshot/errors/calls
smoke.mjs      boots as admin/staff on desktop/mobile and visits every page   (~15 s)
example-test.mjs  copy-and-edit template for a real UI test
results/       outputs (screens/*.png, *.json)
dist/          build output (git-ignore it)
```

## Run it

```bash
export PATH="$PATH:/c/Users/thanh.phan/AppData/Local/Programs/node-v22.14.0-win-x64"
cd "/c/Users/thanh.phan/Downloads/SEC WH QA"
node build.mjs            # -> dist/index.html (about 20 ms)
node smoke.mjs            # builds, runs 4 scenarios, prints PASS/FAIL table, exit code 1 on failure
node example-test.mjs     # sample UI test
```

`node build.mjs` flags: `--project <dir>` (default `../SEC WH`), `--out <file>`, `--no-history` (the built file omits
`google.script.history/url` by default), `--fake-history` (default: fake history present), `--quiet`.
`createDriver()` builds `dist/index.html` automatically when it is missing; call `build()` yourself (or pass
`{ rebuild: true }`) after the app source changed. The page is opened by `file://` URL, e.g.
`file:///C:/.../dist/index.html?role=staff&lang=en`.

### A minimal test

```js
import { build } from './build.mjs';
import { createDriver } from './driver.mjs';

build({ quiet: true });                                   // always test the current source
const page = await createDriver();
try {
  await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });   // resolves when #landing is gone
  await page.eval('goto("kho")');
  await page.waitFor('#page-kho.active');
  await page.type('#kSearch', 'Áo');
  await page.click('#segOut');                                     // "Xuất kho"
  console.log(await page.calls('bootstrapAll'));                   // [{fn, args, t, id}]
  console.log(page.consoleErrors());                               // must be []
  await page.screenshot('results/screens/mytest-kho-D.png');
} finally {
  await page.close();                                              // ALWAYS (kills Chrome tree, removes temp profile)
}
```

## Driver API (`driver.mjs`)

`const page = await createDriver({ chromePath?, headless = true, rebuild = false, keepProfile = false })`
Chrome is `C:\Program Files\Google\Chrome\Application\chrome.exe` (override with `CHROME_PATH` or `chromePath`).
It is started with `--headless=new --remote-debugging-port=0 --user-data-dir=<fresh temp dir> --no-first-run`;
the port is read from `DevToolsActivePort`. `close()` runs `taskkill /T /F` and deletes the profile; the same cleanup
also runs on `process.exit`, uncaught exceptions and Ctrl-C, so a crashing test does not leave Chrome behind.
Google Fonts requests are blocked (the app falls back to system fonts) so nothing needs a network.

| call | meaning |
|---|---|
| `open({role='admin', lang='vi', viewport='D', noHistory=false, waitLanding=true, init, latency, boot, now, tour, page, reducedMotion=false, query={}})` | Navigate (also callable repeatedly; each call is a fresh page load with fresh fixture state). `viewport` `'D'` = 1440x900 DPR1; `'M'` = 390x844 DPR2 + touch emulation + coarse pointer + mobile UA. Waits until `#landing` is `.gone` or `hidden` (set `waitLanding:false` for boot-error tests). Returns the URL. |
| `eval(exprOrFn, ...args)` | Evaluate in the page (`awaitPromise`, `returnByValue`, user gesture). A function is serialised with its JSON args: `page.eval((n) => document.querySelectorAll('tr').length + n, 1)`. Throws on exceptions. |
| `click(selector, {force, timeout})` | Scrolls into view, checks the element is visible/enabled/not covered, sends real mouse events. Selector: CSS or `text=Label` (smallest visible element with that text). |
| `type(selector, text, {clear=true, keys=false})` | Click to focus, clear, then `Input.insertText` (or per-char key events with `keys:true`). |
| `press(key)` | `'Enter'`, `'Escape'`, `'Tab'`, `'ArrowDown'`, `'Backspace'`, `'a'`, `'Control+a'` ... |
| `waitFor(what, timeout=10000)` | `what` = CSS selector (exists), `text=...`, `'js:<expression>'`, or a function (runs in the page, may be async). Resolves with the truthy value, otherwise throws (message includes the first console error). |
| `idle(quietMs=120)` | Waits until the mock has no held calls and no new `google.script.run` call for `quietMs`. Use after an action instead of `sleep`. |
| `screenshot(path, {fullPage})` | PNG (relative paths are relative to the current directory). |
| `consoleErrors({clear})` | `[{kind, text, url, line, stack}]` since `open()`. Kinds: `exception` (uncaught/unhandled rejection), `console.error`, `log.*` (browser error log, e.g. CSP), `network` (failed request; Google Fonts ignored). `clearErrors()`, `consoleLog()` (all console output). |
| `calls(fn?)`, `resetCalls()` | The mock's `window.__calls` (see below). |
| `toasts()` | `[{kind:'ok'|'err'|'info', text}]` currently on screen (`#toastHost .toast`). |
| `activePage()` | id of `.page.active`, e.g. `"page-kho"`. |
| `exists(sel)`, `text(sel)`, `count(sel)`, `sleep(ms)`, `setViewport('D'|'M')`, `reload()` | small helpers. |
| `dialogs`, `dialogMode` | Native `alert/confirm/prompt` are auto-accepted (set `page.dialogMode = 'dismiss'` to cancel); every one is recorded in `page.dialogs` (`Photo.html` uses `confirm()`). |
| `send(method, params)`, `on(event, fn)` | Raw CDP escape hatch. |
| `close()` | Always call it (use `try/finally`). |

## URL parameters understood by the mock (`mock.js`)

`role=admin|staff` (default admin: "Minh Admin", WH-SEC; staff: "An Dinh", OPS-COA, member) -
`lang=vi|en` (seeds `localStorage.gim_lang`) - `tour=1` (show the first-run guide; by default `gim_tour_v2` is pre-set so it does
not cover the UI) - `latency=20` or `5-80` ms - `history=none|fake` - `boot=fail|error|register|pending|slow` (make
`bootstrapAll` fail / answer `__NEED_REGISTER__` / `__PENDING__` / take 7 s; use with `waitLanding:false`) -
`now=2026-10-29T09:00` (shift the browser clock; fixtures follow it) - `page=kho` (embed mode like `doGet(?page=kho)`) -
`fixtures=0` (no fixtures: every call answers `{ok:true,message:'(mock)'}`).

## The mock (`mock.js`) - globals for tests

* `google.script.run` is a Proxy: `withSuccessHandler / withFailureHandler / withUserObject` chain in any order, any other
  property is a server function. Handlers get `(result, userObject)`; the failure handler gets an `Error` whose `.message` is the
  server message. Results and arguments are JSON-cloned like the real bridge. Answers arrive asynchronously (random 0-20 ms).
* `__calls`: `[{fn, args, t, id}]` every call, oldest first. `__resetCalls()`. `__unhandled`: names answered by the default reply.
* `__server`: the handlers `{ fn(...args) }`. If `__server[fn]` exists it is called (sync or promise; a thrown error -> failure handler),
  otherwise the reply is `{ok:true, message:'(mock)'}`.
* `__setServer(obj)`: `Object.assign(__server, obj)`.
* `__server.__fail = { fnName: 'message', '*': 'message' }` -> that function reaches `withFailureHandler(Error(message))`.
  Remove with `delete __server.__fail.fnName`.
* `__server.__latency = { fnName: ms }`, `__setLatency(min, max)`. `__server.__hold = { fnName: true }` keeps calls pending
  (`__pending`) until `__release('fnName')` (test spinners / double submit).
* `__server.__reportMax = 20` makes `reportNxt` return only 20 rows with `truncated:true`.
* `__fx`: the fixture bundle (`__fx.data.rows`, `.items`, `.requests`, `.boxes`, ... live objects; `__fx.helpers.stockOf(code)`;
  `__fx.reset()` restores the initial state).
* `__history` (when history is faked): `{pushes, replaces, fire(hash)}`; `fire('kho')` simulates browser Back/hash change.
  `google.script.history` and `google.script.url` do not exist at all with `history=none` / `open({noHistory:true})`.

Examples (all via `page.eval`):

```js
// one call returns something special
await page.eval(`__setServer({ getPendingRequests: () => ({ ok: true, rows: [] }) })`);
// the server is slow / down / rejects
await page.eval(`__setServer({ __fail: { getTransactions: 'Quota exceeded' } })`);
await page.eval(`__setServer({ __latency: { getTickets: 3000 } })`);
// logical error shape used by the app (res.ok === false)
await page.eval(`__setServer({ approvePendingRequest: () => ({ ok: false, message: 'Yêu cầu này đã được xử lý trước đó.' }) })`);
// wrap a default handler
await page.eval(`(() => { const orig = __server.getData; __setServer({ getData: () => { const r = orig(); r.stock = r.stock.slice(0, 3); return r; } }); })()`);
// tweak data that every handler reads
await page.eval(`__fx.data.items[0].stock; __fx.helpers.stockOf('UNI-0001-S')`);
```

Overrides installed with `__setServer` after `open()` apply to later calls only. To change what the **boot** sees (e.g. a different
`bootstrapAll`, an empty stock list, a failing `getNotifications`), pass `init` to `open()`: it is a function `(server, fx) => {...}` that
`mock.js` runs right after the default handlers are installed and before the app boots (every `open()` is a fresh page, so pass it each time):

```js
await page.open({ role: 'admin', init: (server, fx) => {
  const boot = server.bootstrapAll;
  server.bootstrapAll = () => { const r = boot(); r.data.stock = []; return r; };   // empty warehouse
  server.__fail = { getNotifications: 'Mock: noti sheet missing' };
} });
```

## Fixtures (`fixtures.mjs`)

`createFixtures({role, lang, now, seed})` is self-contained: `build.mjs` inlines `createFixtures.toString()` into the page, the
same function runs in Node (`import { createFixtures, fixtures } from './fixtures.mjs'`; `fixtures` = admin snapshot with a fixed
clock, `fixtures.data.lean`, `.rows`, ...). Data is generated from a seeded PRNG relative to "now", so it is the same on every run.
Field names/shapes are copied from `server/**/*.js`.

* **Users/teams**: 12 Team rows (2 admins, 8 members, 2 `pending` registrations) over 4 cost centres/teams
  (OPS-COA/OPSCOA, MKT-BRAND/MKTBRAND, HR-ADM/HRADM, WH-SEC/WHSEC). Staff session = An Dinh (OPS-COA); staff only see OPS-COA stock (17 items), history is admin-only.
* **Catalogue** (`config`): 5 categories / 13 sub-categories (only `Clothes` needs a variant), 4 locations, units Each/Box/Bag, `lowStock: 5`.
* **Stock**: 48 SKUs, units Each/Box/Bag; 3 negative (-12, -4, -1), 5 zero, 8 low (1-5), 1 very large (4,200), 1 with a 100-char name,
  items without a bin, boxed items (55 boxes with FIFO consumption and `boxLeft`). Stock is derived from the generated ledger, so
  `getData`, `getItemDetail`, `getBoxBreakdown`, `reportNxt`, `getTickets` and stocktake all agree.
* **Ledger**: 537 transactions, 369 of them in the last 7 days (history's default range) so the "Tải thêm" button and `total` > `limit` appear
  (limit honoured; `getTransactions` filters by username/type/cat/from/to/keyword like the server).
* **Requests**: 16 (10 PENDING: exports within stock, exports exceeding stock, export of a zero-stock item, export with an `assetCode` not in stock (`GEA-9999`),
  imports of new SKUs / existing SKUs / a `Clothes` import with variant; 4 APPROVED, 3 REJECTED with reasons). Notifications for admin (new requests) and staff (decisions).
* **Stocktake**: 4 sessions (COUNTING with 24 lines: counted match/over/short, 2 `moved`, many `counted:null`; CLOSED/PARTIAL; CLOSED/MATCHED; CANCELLED).
* **State changes are real**: `importEntry`, `exportEntry`, `submitRequest`, `approvePendingRequest`, `rejectPendingRequest`, `deleteTransaction`,
  `editTransaction`, `stocktakeCreate/SaveCounts/Confirm/Cancel/Delete`, `skuCreate/Update`, `addUser/updateUser/deleteUser`, notifications read flags, backups, photos ...
  mutate the in-page state and the next `getData`/`getTransactions` shows it. Validation messages are the server's (Vietnamese).
* **Roles**: admin-only functions answer `{ok:false, message:'Chức năng này chỉ dành cho quản trị viên.'}` for staff, `submitRequest` answers
  `Admin dùng chức năng nhập/xuất trực tiếp.` for admin - same as the server.

### Which server functions have a fixture

Every function found in `client/` is defined (59 handlers incl. `getBoxBreakdown`): `bootstrapAll getData getNotifications getUnreadCount markNotificationRead
markAllNotificationsRead getTransactions getItemDetail getBoxBreakdown deleteTransaction editTransaction previewAssetCode importEntry exportEntry submitRequest getMyRequests
getPendingRequests approvePendingRequest rejectPendingRequest reqEditGet reqEditSave reqDelete getUsers addUser updateUser deleteUser getRegisterInfo registerSelf getPendingUsers approveUser
rejectUser getTickets stocktakeMeta/List/Get/Create/SaveCounts/Confirm/Cancel/Delete reportNxt skuMeta skuList skuCreate skuUpdate listDeletedTransactions restoreTransaction
getProcessedRequests adminDeleteRequest backupStatus backupRunNow backupDelete backupSetAuto getMyMailPref setMyMailPref photoList photoSave photoDelete photoAttach`.

**Safe defaults only (thin fixtures)**: `getRegisterInfo` (always `status:'active'`), `registerSelf`, `photoAttach`, `backupSetAuto`, `backupRunNow`
(canned message), `setMyMailPref`. **No fixture at all (mock default `{ok:true,message:'(mock)'}`)**: `popsGetUsers` - it belongs to the separate
POPS page (`?page=pops`), which is not part of `Index.html`. `smoke.mjs` reports any call that fell through to the default as a failing check.

Add or replace a fixture for your test with `__setServer`; to extend the shared fixtures edit `createFixtures` (keep it self-contained: no imports, no outer variables).

## Result conventions

* Screenshots: `results/screens/<suite>-<page-or-step>-<D|M>[-<role>].png` (smoke: `smoke-<page>-D.png` = admin desktop, `-D-staff`, `-M`, `-M-staff`;
  failures add a `-FAIL.png`).
* Machine-readable: `results/<suite>.json` as `[{name, ok, detail}]` (smoke writes `{at, seconds, rows:[{scenario, check, ok, detail}]}` to `results/smoke.json`).
* Exit code `0` = all passed, `1` = something failed. Print a PASS/FAIL table. Never write into `../SEC WH/`.
* Always run `build()` first so the test uses the latest app source, and always `close()` the driver.

## Known limitations

* No real Google services: no Sheets/BigQuery/Drive/Mail/Auth. The server code is **not** executed; fixtures re-implement the documented shapes and the main
  validations, so server-only bugs (locks, caches, quota, permissions in Access.js, `rowVisible_` PIC rules) are invisible here. Staff scoping is simplified to "team of the cost centre".
* HtmlService differences: `include()` output is not template-evaluated (same here); the real page runs in a sandboxed iframe (no iframe here, so
  `google.script.url/history` talk to a fake and `top` navigation is not exercised; the app's `<base target="_top">` is harmless).
* Print dialogs (`window.print()` for stock slips), file downloads (CSV `Blob` + `a.download`) and native `alert/confirm` rendering are not testable;
  dialogs are auto-accepted, CSV downloads happen silently. Drive photos are mocked: thumbnails are inline SVG, nothing is uploaded, URLs are `example.invalid`.
* Web fonts (Be Vietnam Pro) are blocked, so text uses the system font; pixel diffs against production will differ.
* `google.script.history` is optional by design: `history=fake` (default) or `none`. Real Apps Script also rewrites the parent URL hash; the fake only records.
* Time: data and `Date` follow the real clock unless `now=` is given; screenshots containing relative dates change day to day without `now`.
* Latency is 0-20 ms by default, so races that only appear with slow servers need `latency=`/`__latency`.
* Chrome only (headless new mode), Windows path assumptions in `driver.mjs` (override with `CHROME_PATH`).

## Findings from smoke run

Last run: `node smoke.mjs` -> **92 PASS, 0 FAIL in ~16 s** (4 scenarios: admin/staff x desktop 1440x900 / mobile 390x844, Vietnamese; each boots, visits the 9 pages,
checks console errors per page, screenshots). Opening the app in English, with `noHistory`, loading history "Tải thêm", opening a stocktake session,
running the report, the SKU/ticket pages, the bell / account menu, language toggle, an admin export and a staff export request through the UI produced
**no console errors, uncaught exceptions or failed requests**.

**Real app bugs found: none** (so there is no file:line/stack to record). Things that looked like failures at first were harness problems, now fixed:

* Mobile layout rendered as a 980 px page: `Index.html` has no viewport meta (Apps Script's `doGet()` adds it with `addMetaTag`, `server/core/Web.js`). `build.mjs` now injects it.
* The first-run guide (`Guide.html`, `localStorage.gim_tour_v2`) would cover the UI: `mock.js` pre-sets it (use `tour=1` to test the guide).
* `boot=register|pending` shows `Register.html`'s overlay (`#regOv`), not the landing error box; `#landing` stays visible, so open with `waitLanding:false`.

Notes for whoever reads the screenshots: `results/screens/` may still hold stale `smoke-*-FAIL.png` and `adhoc-*.png` files from the first development runs of the harness
(they are not produced by a passing smoke run and can be deleted).
