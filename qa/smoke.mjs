// smoke.mjs - build the app, open it in headless Chrome and visit every page as admin/staff on desktop/mobile.
//   node smoke.mjs            (exit code 1 if any check fails)
//   node smoke.mjs --keep     (also keep going and print console errors in full)
// Outputs: results/screens/smoke-<page>-<D|M>[-staff].png, results/smoke.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';
import { createDriver } from './driver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCREENS = path.join(HERE, 'results', 'screens');
const PAGES = ['home', 'kho', 'history', 'stocktake', 'admin', 'sku', 'ticket', 'report', 'me'];
const ADMIN_ONLY = new Set(['history', 'stocktake', 'admin', 'sku', 'ticket']);

const T0 = Date.now();
const rows = [];                                   // { scenario, check, ok, detail }
const record = (scenario, check, ok, detail = '') => { rows.push({ scenario, check, ok: !!ok, detail }); };

function errText(list) { return list.map((e) => `[${e.kind}] ${e.text.split('\n')[0]}${e.url ? ' @ ' + path.basename(e.url) + (e.line ? ':' + e.line : '') : ''}`).join(' | '); }

async function scenario(page, { role, viewport, lang = 'vi' }) {
  const name = `${role}-${viewport}-${lang}`;
  const suffix = role === 'staff' ? '-staff' : '';
  const t0 = Date.now();

  // ---- boot ----
  try {
    await page.open({ role, lang, viewport });
    record(name, 'landing disappears', true, `${Date.now() - t0} ms`);
  } catch (e) {
    record(name, 'landing disappears', false, e.message);
    return;
  }
  const boot = await page.calls('bootstrapAll');
  record(name, 'bootstrapAll called once', boot.length === 1, `${boot.length} call(s)`);
  const whoami = await page.eval(`document.getElementById('userName').textContent`);
  record(name, 'session shown', role === 'admin' ? /Minh Admin/.test(whoami) : /An Dinh/.test(whoami), whoami);
  const bootErrs = page.consoleErrors({ clear: true });
  record(name, 'no console errors after boot', bootErrs.length === 0, errText(bootErrs));
  await page.screenshot(path.join(SCREENS, `smoke-boot-${viewport}${suffix}.png`));

  // ---- pages ----
  for (const p of PAGES) {
    const label = `goto('${p}')`;
    const forbidden = role === 'staff' && ADMIN_ONLY.has(p);
    try {
      const before = await page.activePage();
      await page.eval(`goto(${JSON.stringify(p)})`);
      if (forbidden) {
        const toasts = await page.toasts();
        const after = await page.activePage();
        const refused = toasts.some((t) => t.kind === 'err') && after === before && after !== `page-${p}`;
        record(name, `${label} refused`, refused, refused ? `toast: ${toasts.find((t) => t.kind === 'err').text}` : `active=${after}, toasts=${JSON.stringify(toasts)}`);
        await page.eval(`document.querySelectorAll('#toastHost .toast button').forEach((b) => b.click())`);
      } else {
        await page.waitFor(`#page-${p}.active`, 5000);
        await page.idle();
        // pages build their content from the server response: give the render a moment, then require visible content
        await page.waitFor(`js:(() => { const s = document.getElementById('page-${p}'); return !!s && s.classList.contains('active') && s.getBoundingClientRect().height > 100; })()`, 5000);
        record(name, `${label} active`, true);
      }
      const errs = page.consoleErrors({ clear: true });
      record(name, `${label} no console errors`, errs.length === 0, errText(errs));
      await page.screenshot(path.join(SCREENS, `smoke-${p}-${viewport}${suffix}.png`));
    } catch (e) {
      record(name, label, false, e.message.split('\n')[0]);
      const errs = page.consoleErrors({ clear: true });
      if (errs.length) record(name, `${label} no console errors`, false, errText(errs));
      try { await page.screenshot(path.join(SCREENS, `smoke-${p}-${viewport}${suffix}-FAIL.png`)); } catch { /* ignore */ }
    }
  }

  // ---- unhandled mock calls tell us which server functions have no fixture (informational) ----
  const unhandled = await page.eval('Array.from(new Set(window.__unhandled || []))');
  record(name, 'every called server fn has a fixture', unhandled.length === 0, unhandled.join(', '));
}

function printTable() {
  const w = Math.max(...rows.map((r) => r.scenario.length), 8);
  const wc = Math.max(...rows.map((r) => r.check.length), 10);
  console.log('\n' + 'scenario'.padEnd(w) + '  ' + 'check'.padEnd(wc) + '  result  detail');
  console.log('-'.repeat(w + wc + 20));
  for (const r of rows) console.log(r.scenario.padEnd(w) + '  ' + r.check.padEnd(wc) + '  ' + (r.ok ? 'PASS  ' : 'FAIL  ') + '  ' + r.detail);
  const failed = rows.filter((r) => !r.ok).length;
  console.log('-'.repeat(w + wc + 20));
  console.log(`${rows.length - failed} PASS, ${failed} FAIL in ${((Date.now() - T0) / 1000).toFixed(1)} s`);
  return failed;
}

const b = build({ out: path.join(HERE, 'dist', 'index.html'), quiet: true });
console.log(`built ${path.relative(HERE, b.out)} (${(b.bytes / 1024).toFixed(0)} KB, app v${b.version})`);

const page = await createDriver();
let failed = 1;
try {
  for (const sc of [
    { role: 'admin', viewport: 'D' }, { role: 'staff', viewport: 'D' },
    { role: 'admin', viewport: 'M' }, { role: 'staff', viewport: 'M' },
  ]) {
    await scenario(page, sc);
  }
} finally {
  await page.close();
  failed = printTable();
  fs.mkdirSync(path.join(HERE, 'results'), { recursive: true });
  fs.writeFileSync(path.join(HERE, 'results', 'smoke.json'), JSON.stringify({ at: new Date().toISOString(), seconds: (Date.now() - T0) / 1000, rows }, null, 2));
}
process.exit(failed ? 1 : 0);
