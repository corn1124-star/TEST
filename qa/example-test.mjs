// example-test.mjs - a copy-and-edit template for UI tests. Run: node example-test.mjs
// Shows: open as a role, drive the UI with click/type/waitFor, override server behaviour, assert on recorded calls,
// check console errors, take a screenshot, write a result file under results/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';
import { createDriver } from './driver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const results = [];
function check(name, ok, detail = '') { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  - ' + detail : '')); }

build({ quiet: true });
const page = await createDriver();
try {
  /* ---- 1. admin approves the newest pending request through the UI ---- */
  await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
  await page.eval('goto("admin")');
  await page.waitFor('#apTable tbody tr .cell-actions');
  const before = await page.count('#apTable tbody tr');
  check('admin sees the pending requests from fixtures', before === 10, `${before} rows`);

  await page.resetCalls();
  await page.click('#apTable tbody tr:first-child .cell-actions .btn.sm');      // "Duyệt"
  await page.click('#uiDlgOk');                                                  // confirm dialog
  await page.idle();
  const approve = await page.calls('approvePendingRequest');
  check('approvePendingRequest called once with the request id', approve.length === 1 && /^REQ-/.test(approve[0].args[0]), JSON.stringify(approve[0]?.args));
  await page.waitFor(`js:document.querySelectorAll('#apTable tbody tr .cell-actions').length === ${before - 1}`);
  check('row disappears after approval', true);

  /* ---- 2. the server fails: the UI must show an error, not break ---- */
  await page.eval(`__setServer({ __fail: { getTickets: 'Mock: sheet unavailable' } })`);   // withFailureHandler path
  await page.eval('goto("ticket")');
  await page.idle();
  check('ticket page survives a failing server call', (await page.activePage()) === 'page-ticket');

  /* ---- 3. staff cannot open admin pages ---- */
  await page.open({ role: 'staff', lang: 'en', viewport: 'M' });
  await page.eval('goto("sku")');
  const toasts = await page.toasts();
  check('staff is refused with an error toast', toasts.some((t) => t.kind === 'err'), JSON.stringify(toasts));
  check('staff stays on the home page', (await page.activePage()) === 'page-home');

  const errs = page.consoleErrors();
  check('no console errors in the whole run', errs.length === 0, errs.map((e) => e.text.split('\n')[0]).join(' | '));
  await page.screenshot(path.join(HERE, 'results', 'screens', 'example-staff-M.png'));
} finally {
  await page.close();
  fs.mkdirSync(path.join(HERE, 'results'), { recursive: true });
  fs.writeFileSync(path.join(HERE, 'results', 'example-test.json'), JSON.stringify(results, null, 2));
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
