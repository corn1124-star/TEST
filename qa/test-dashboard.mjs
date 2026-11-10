// test-dashboard.mjs - kiểm tra trang Tổng quan sau redesign (Coral). Chạy: node test-dashboard.mjs
// Thay cho các kiểm tra Home cũ trong test-group1 (1.01-1.06, 1.16 "alert row") vốn tìm .alert-row / .qa-green / KPI cũ.
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
  for (const role of ['admin', 'staff']) {
    await page.open({ role, lang: 'vi', viewport: 'D' });
    await page.waitFor('js:document.querySelectorAll("#homeKpis .stat").length === 5', 8000);
    const tag = `[${role}-D]`;

    const stats = await page.eval(`Array.from(document.querySelectorAll('#homeKpis .stat')).map(s => ({ label: s.querySelector('.stat-label').textContent.trim(), value: s.querySelector('.stat-value').textContent.trim(), tap: s.tagName === 'BUTTON' }))`);
    check(`${tag} 5 stats, none empty`, stats.length === 5 && stats.every((s) => s.label && s.value), JSON.stringify(stats.map((s) => s.label + '=' + s.value)));
    check(`${tag} action stats are buttons (pending, attention)`, stats.filter((s) => s.tap).length === 2, stats.map((s) => s.tap).join(','));
    check(`${tag} first stat is ${role === 'admin' ? 'pending approvals' : 'attention'}`, role === 'admin' ? /Chờ duyệt/.test(stats[0].label) : /Cần chú ý/.test(stats[0].label), stats[0].label);

    // quick actions: one filled primary + three ghost
    const act = await page.eval(`({ n: document.querySelectorAll('#homeQuick .btn').length, ghost: document.querySelectorAll('#homeQuick .btn.ghost').length })`);
    check(`${tag} quick actions = 1 primary + 3 ghost`, act.n === 4 && act.ghost === 3, JSON.stringify(act));

    // flow chart: two lines, legend with totals, table view rows
    const flow = await page.eval(`({ lines: document.querySelectorAll('#flowChart path.fl-line').length, legend: document.getElementById('flowLegend').textContent.replace(/\\s+/g,' ').trim(), rows: document.querySelectorAll('#flowTable tbody tr').length })`);
    check(`${tag} flow chart has 2 lines, legend, 30-row table`, flow.lines === 2 && /Nhập/.test(flow.legend) && /Xuất/.test(flow.legend) && flow.rows === 30, JSON.stringify(flow));

    // hover shows tooltip with a date and both series
    await page.eval(`(() => { const s = document.querySelector('#flowChart svg'); const r = s.getBoundingClientRect(); s.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + r.width * 0.8, clientY: r.top + 60, bubbles: true })); })()`);
    const tip = await page.eval(`(() => { const t = document.getElementById('flowTip'); return { shown: !t.hidden, text: t.textContent.replace(/\\s+/g,' ').trim() }; })()`);
    check(`${tag} hover tooltip shows date, receipts and issues`, tip.shown && /\d\d\/\d\d/.test(tip.text) && /Nhập/.test(tip.text) && /Xuất/.test(tip.text), tip.text);

    // health bar adds up to the SKU count
    const health = await page.eval(`(() => { const rows = Array.from(document.querySelectorAll('#homeHealth .hrow')).map(r => Number(r.querySelector('b.figure').textContent.replace(/\\D/g, ''))); return { rows, sum: rows.reduce((a, b) => a + b, 0), total: STOCK.length, segs: document.querySelectorAll('#homeHealth .hb').length }; })()`);
    check(`${tag} health rows sum to the tracked item count`, health.sum === health.total && health.segs >= 1, JSON.stringify(health));

    // slow stock is a stat now (no separate panel); the old negative-stock warning box is gone
    const slim = await page.eval(`({ ageGone: !document.getElementById('homeAge'), warnGone: !document.getElementById('homeWarn'), panels: document.querySelectorAll('#page-home .panel').length })`);
    check(`${tag} slim layout: 4 panels, no age panel, no warning box`, slim.ageGone && slim.warnGone && slim.panels === 4, JSON.stringify(slim));

    // category bars
    const cat = await page.count('#catBars .bar-row');
    check(`${tag} category bars render (1-6 rows)`, cat >= 1 && cat <= 6, String(cat));

    // attention list: at most 5 rows, click opens that code in Kho
    const rows = await page.count('#homeAlerts .arow');
    check(`${tag} attention list shows up to 5 rows`, rows >= 1 && rows <= 5, String(rows));
    const code = await page.eval(`document.querySelector('#homeAlerts .arow .cell-sub').textContent.trim()`);
    await page.click('#homeAlerts .arow');
    await page.waitFor('#page-kho.active', 4000);
    const sv = await page.eval(`document.getElementById('kSearch').value`);
    check(`${tag} clicking an attention row opens Kho filtered to that code`, sv === code, `${sv} vs ${code}`);

    // no stray horizontal scroll, no console errors
    await page.eval('goto("home")');
    const ov = await page.eval(`document.documentElement.scrollWidth <= window.innerWidth + 1 && document.getElementById('content').scrollWidth <= document.getElementById('content').clientWidth + 1`);
    check(`${tag} no horizontal overflow on Home`, ov);
    const errs = page.consoleErrors({ clear: true });
    check(`${tag} no console errors`, errs.length === 0, errs.map((e) => e.text.split('\n')[0]).join(' | '));
    await page.screenshot(path.join(HERE, 'results', 'screens', `dash-${role}-D.png`));
  }

  // English labels
  await page.open({ role: 'admin', lang: 'en', viewport: 'D' });
  await page.waitFor('js:document.querySelectorAll("#homeKpis .stat").length === 5', 8000);
  const en = await page.eval(`document.querySelector('#page-home').textContent.replace(/\\s+/g,' ')`);
  check('[en] dashboard strings are translated', /Stock health/.test(en) && /Receipts vs issues/.test(en) && !/Sức khỏe/.test(en), en.slice(0, 120));

  // mobile: stacked, no overflow
  for (const role of ['admin', 'staff']) {
    await page.open({ role, lang: 'vi', viewport: 'M' });
    await page.waitFor('js:document.querySelectorAll("#homeKpis .stat").length === 5', 8000);
    const m = await page.eval(`({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, cw: document.getElementById('content').scrollWidth, cc: document.getElementById('content').clientWidth, chart: document.querySelector('#flowChart svg').getBoundingClientRect().width })`);
    check(`[${role}-M] no horizontal overflow, chart fits`, m.sw <= m.iw + 1 && m.cw <= m.cc + 1 && m.chart <= m.cc, JSON.stringify(m));
    await page.screenshot(path.join(HERE, 'results', 'screens', `dash-${role}-M.png`));
  }
  const errs = page.consoleErrors();
  check('no console errors in the whole run', errs.length === 0, errs.map((e) => e.text.split('\n')[0]).join(' | '));
} finally {
  await page.close();
  fs.mkdirSync(path.join(HERE, 'results'), { recursive: true });
  fs.writeFileSync(path.join(HERE, 'results', 'dashboard.json'), JSON.stringify(results, null, 2));
}
const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad} PASS, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
