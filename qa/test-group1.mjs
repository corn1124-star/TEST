// test-group1.mjs - QA Nhom 1 (Trang chu & Kho), items 1.01 - 1.18.   Run: node test-group1.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDriver } from './driver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCREENS = path.join(HERE, 'results', 'screens');
fs.mkdirSync(SCREENS, { recursive: true });
const shot = (page, name) => page.screenshot(path.join(SCREENS, `g1-${name}.png`));

const R = {};                       // item -> [{name, ok, detail}]
const ERRS = [];                    // console errors seen
function ck(item, name, ok, detail = '') {
  (R[item] ||= []).push({ name, ok: !!ok, detail: String(detail) });
  console.log((ok ? 'PASS ' : 'FAIL ') + item + ' ' + name + (detail ? '  - ' + detail : ''));
}
async function errs(page, where) {
  const e = page.consoleErrors({ clear: true });
  if (e.length) for (const x of e) { ERRS.push({ where, kind: x.kind, text: x.text.split('\n')[0], url: path.basename(x.url || ''), line: x.line }); console.log('  !! console', where, x.kind, x.text.split('\n')[0]); }
  return e;
}
const RETIRED = new Set(['1.01', '1.02', '1.03', '1.05', '1.06']);   // old dashboard: replaced by the new one, covered by test-dashboard.mjs
async function section(item, fn, page) {
  if (process.env.ONLY && !process.env.ONLY.split(',').includes(item)) return;
  if (RETIRED.has(item)) { console.log(`   ${item} RETIRED (old dashboard; see test-dashboard.mjs)`); return; }
  try { await fn(); } catch (e) { ck(item, 'script error', false, e.message.split('\n')[0]); }
  await errs(page, item);
}

const page = await createDriver();
const num = (s) => parseInt(String(s).replace(/[^\d-]/g, ''), 10);

/** select a pick row and fill the export form */
async function openExport(p, opts = {}) {
  await p.eval('goto("kho")');
  await p.waitFor('#page-kho.active');
  await p.click('#segOut');
  await p.waitFor('#pickTable tbody tr.pick');
}
async function clickRow(p, idx = 0) {
  const code = await p.eval(`document.querySelectorAll('#pickTable tbody tr.pick')[${idx}].dataset.code`);
  await p.click(`#pickTable tbody tr.pick[data-code="${code}"]`);
  await p.waitFor('#expForm');
  return code;
}
const dlgOpen = (p) => p.eval(`!!document.getElementById('uiDlg')`);

try {
  /* ====================== 1.01 / 1.02 ====================== */
  await section('1.01', async () => {
    for (const lang of ['vi', 'en']) {
      await page.open({ role: 'admin', lang, viewport: 'D' });
      const info = await page.eval(`({attn: STOCK.filter(s=>s.stock<=LOW).length, neg: STOCK.filter(s=>s.stock<0).length, zero: STOCK.filter(s=>s.stock===0).length, low: STOCK.filter(s=>s.stock>0&&s.stock<=LOW).length,
        kpi: document.querySelector('#homeKpis .kpi:nth-child(2) .kpi-value').textContent, label: document.querySelector('#homeKpis .kpi:nth-child(2) .kpi-label').textContent,
        foot: document.querySelector('#homeKpis .kpi:nth-child(2) .kpi-foot').textContent})`);
      ck('1.01', `[admin D ${lang}] KPI value = #codes stock<=LOW (incl. negative & 0)`, num(info.kpi) === info.attn && info.attn === info.neg + info.zero + info.low, JSON.stringify(info));
      if (lang === 'vi') await shot(page, '1.01-home-admin-D');
      await page.click('#homeKpis .kpi:nth-child(2)');
      await page.waitFor('#page-kho.active');
      const r = await page.eval(`({on: document.getElementById('stTabAttn').classList.contains('on'), onCount: document.querySelectorAll('#stTabAll.on, #stTabIn.on, #stTabAttn.on, #stTabLow.on, #stTabOut.on').length,
        rows: document.querySelectorAll('#stockTable tbody tr').length, empty: !!document.querySelector('#stockTable td.empty'),
        codes: [...document.querySelectorAll('#stockTable tbody tr td:nth-child(2)')].map(x=>x.textContent).sort().join(','), exp: STOCK.filter(s=>s.stock<=LOW).map(s=>s.code).sort().join(','),
        info: document.getElementById('stockInfo').textContent})`);
      ck('1.01', `[${lang}] click KPI -> Kho tab "Cần chú ý" active and rows == ${info.attn}`, r.on && r.onCount === 1 && r.rows === info.attn && r.codes === r.exp, `tabOn=${r.on} rows=${r.rows} info="${r.info}"`);
      if (lang === 'vi') await shot(page, '1.01-kho-attn-admin-D');
    }
    // stale filters: search typed in Kho, go Home, click KPI -> must still show ALL attn rows
    await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
    await page.eval('goto("kho")'); await page.waitFor('#page-kho.active');
    await page.type('#kSearch', 'UNI');
    const cat = await page.eval(`(() => { const s = document.getElementById('kFilterCat'); return s.options.length > 1 ? s.options[1].value : ''; })()`);
    await page.eval('goto("home")'); await page.waitFor('#page-home.active');
    await page.click('#homeKpis .kpi:nth-child(2)'); await page.waitFor('#page-kho.active');
    const attn = await page.eval(`STOCK.filter(s=>s.stock<=LOW).length`);
    const rows = await page.count('#stockTable tbody tr');
    const srch = await page.eval(`document.getElementById('kSearch').value`);
    ck('1.01', 'KPI click after a leftover Kho search ("UNI") still shows exactly N rows', rows === attn, `rows=${rows} expected=${attn} leftover kSearch="${srch}"`);
    await shot(page, '1.01-kho-attn-leftover-search-admin-D');
    // leftover category filter
    await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
    await page.eval('goto("kho")'); await page.waitFor('#page-kho.active');
    await page.eval(`(() => { const s = document.getElementById('kFilterCat'); s.value = s.options[1].value; s.onchange && s.onchange(); renderStock(); })()`);
    await page.eval('goto("home")'); await page.waitFor('#page-home.active');
    await page.click('#homeKpis .kpi:nth-child(2)'); await page.waitFor('#page-kho.active');
    const rows2 = await page.count('#stockTable tbody tr');
    ck('1.01', 'KPI click after a leftover Kho category filter shows exactly N rows', rows2 === attn, `rows=${rows2} expected=${attn}`);
  }, page);

  await section('1.02', async () => {
    for (const lang of ['vi', 'en']) {
      await page.open({ role: 'admin', lang, viewport: 'D' });
      const more = await page.eval(`(() => { const a = document.querySelector('#homeAlerts .alert-more'); return a ? a.textContent : null; })()`);
      const attn = await page.eval(`STOCK.filter(s=>s.stock<=LOW).length`);
      ck('1.02', `[${lang}] "Xem tất cả" link exists with count`, !!more && num(more.replace(/[^()\d]/g, '').replace(/[()]/g, '')) === attn, `text="${more}" attn=${attn}`);
      await page.click('#homeAlerts .alert-more');
      await page.waitFor('#page-kho.active');
      const r = await page.eval(`({on: document.getElementById('stTabAttn').classList.contains('on'), rows: document.querySelectorAll('#stockTable tbody tr').length})`);
      ck('1.02', `[${lang}] link opens Kho tab attn with same rows`, r.on && r.rows === attn, JSON.stringify(r));
    }
    // visible alert rows are <= 5 and sorted ascending
    await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
    const vals = await page.eval(`[...document.querySelectorAll('#homeAlerts .alert-row .badge')].map(b=>b.textContent)`);
    ck('1.02', 'home alert block shows 5 rows (most urgent first)', vals.length === 5, JSON.stringify(vals));
    // when alerts <= 5 there is no link
    await page.eval(`STOCK = STOCK.filter(s => s.stock > LOW || s.code === STOCK.filter(x=>x.stock<=LOW)[0].code); renderHome();`);
    const has = await page.eval(`!!document.querySelector('#homeAlerts .alert-more')`);
    ck('1.02', 'no "Xem tất cả" when <= 5 alert rows', !has);
    // leftover tab / search from an earlier Kho visit
    await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
    await page.eval('goto("kho")'); await page.waitFor('#page-kho.active');
    await page.type('#kSearch', 'GEA');
    await page.eval('goto("home")'); await page.waitFor('#page-home.active');
    await page.click('#homeAlerts .alert-more'); await page.waitFor('#page-kho.active');
    const attn2 = await page.eval('STOCK.filter(s=>s.stock<=LOW).length');
    const rr = await page.count('#stockTable tbody tr');
    ck('1.02', 'link after a leftover Kho search ("GEA") still shows the same N rows as the link says', rr === attn2, 'rows=' + rr + ' expected=' + attn2 + ' info="' + (await page.eval("document.getElementById('stockInfo').textContent")) + '"');
    await shot(page, '1.02-link-leftover-search-admin-D');
    // alert row click while Kho tab is "Còn hàng" (hides negative/zero) or category filter set
    await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
    await page.eval('goto("kho")'); await page.waitFor('#page-kho.active');
    await page.eval("setStockTab('in')");
    await page.eval('goto("home")'); await page.waitFor('#page-home.active');
    await page.click('#homeAlerts .alert-row'); await page.waitFor('#page-kho.active');
    const ar = await page.eval("({rows: document.querySelectorAll('#stockTable tbody tr:not(:has(td.empty))').length, q: kSearch.value, tab: STOCK_TAB})");
    console.log('   OBS alert-row click while Kho tab="in" (Còn hàng):', JSON.stringify(ar));
    await shot(page, '1.02-alertrow-with-tab-in-admin-D');
    ck('1.02', '(obs) clicking a negative-stock alert row while Kho tab is "Còn hàng" still shows that item', ar.rows >= 1, JSON.stringify(ar));
  }, page);

  /* ====================== 1.03 ====================== */
  await section('1.03', async () => {
    function hueCheck() {
      return `(() => {
        const bad = [];
        const hue = (rgb) => { const m = rgb.match(/rgba?\\(([\\d.]+), ([\\d.]+), ([\\d.]+)(?:, ([\\d.]+))?\\)/); if (!m) return null; const a = m[4] === undefined ? 1 : +m[4]; if (a < 0.05) return null;
          let r = m[1]/255, g = m[2]/255, b = m[3]/255; const mx = Math.max(r,g,b), mn = Math.min(r,g,b), d = mx-mn; if (d < 0.08) return null; let h;
          if (mx === r) h = ((g-b)/d)%6; else if (mx === g) h = (b-r)/d+2; else h = (r-g)/d+4; h*=60; if (h<0) h+=360; const l=(mx+mn)/2, s=d/(1-Math.abs(2*l-1)); return s > 0.15 ? h : null; };
        document.querySelectorAll('#page-home *').forEach(e => { const cs = getComputedStyle(e);
          ['color','backgroundColor','borderLeftColor','borderTopColor','fill','stroke'].forEach(p => { const v = cs[p]; if (!v) return; const h = hue(v); if (h !== null && h >= 255 && h <= 325) bad.push((e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className) + '|' + p + '|' + v + '|h' + Math.round(h)); }); });
        return bad.slice(0, 8);
      })()`;
    }
    for (const role of ['admin', 'staff']) {
      await page.open({ role, lang: 'vi', viewport: 'D' });
      const k = await page.eval(`[...document.querySelectorAll('#homeKpis .kpi')].map(k => ({label: k.querySelector('.kpi-label').textContent, val: k.querySelector('.kpi-value').textContent, cls: k.className, bl: getComputedStyle(k).borderLeftWidth, blc: getComputedStyle(k).borderLeftColor, tone: getComputedStyle(k).getPropertyValue('--tone')}))`);
      const labels = k.map((x) => x.label);
      console.log('   ', role, JSON.stringify(k));
      if (role === 'admin') ck('1.03', '[admin] KPI order = Chờ duyệt, Cần chú ý, Mã đang có, Tổng tồn', labels[0] === 'Chờ duyệt' && labels[1] === 'Cần chú ý' && labels[2].startsWith('Mã đang có') && labels[3].startsWith('Tổng tồn'), labels.join(' | '));
      else ck('1.03', '[staff] KPI order = Cần chú ý, Yêu cầu của tôi, …', labels[0] === 'Cần chú ý' && labels[1] === 'Yêu cầu của tôi', labels.join(' | '));
      const acts = k.filter((x) => /\bact\b/.test(x.cls));
      const actOK = k.every((x) => (/\bact\b/.test(x.cls)) === (num(x.val) > 0 && (x.label === 'Cần chú ý' || x.label === 'Chờ duyệt' || x.label === 'Yêu cầu của tôi')));
      ck('1.03', `[${role}] action KPIs with value > 0 carry .act, others do not`, actOK, k.map((x) => `${x.label}=${x.val}:${/\bact\b/.test(x.cls) ? 'act' : '-'}`).join(' '));
      ck('1.03', `[${role}] .act KPI has a 4px left stripe, info KPIs 1px`, acts.length > 0 && acts.every((x) => x.bl === '4px') && k.filter((x) => !/\bact\b/.test(x.cls)).every((x) => x.bl !== '4px'), k.map((x) => x.bl).join(','));
      const purple = await page.eval(hueCheck());
      ck('1.03', `[${role}] no purple/violet colours on Home (computed colour/background/border/fill)`, purple.length === 0, JSON.stringify(purple));
      await shot(page, `1.03-home-${role}-D`);
      // zero-state: no pending, no attention -> no stripes
      await page.eval(`PENDING_N = 0; STOCK = STOCK.filter(s => s.stock > LOW); renderHome();`);
      const z = await page.eval(`document.querySelectorAll('#homeKpis .kpi.act').length`);
      ck('1.03', `[${role}] nothing to do -> no .act stripe`, z === 0, `act=${z}`);
      // tones: only pending>0 with attention low only -> amber
      await page.eval(`PENDING_N = 3; renderHome();`);
      const tone = await page.eval(`[...document.querySelectorAll('#homeKpis .kpi.act')].map(k => k.className)`);
      ck('1.03', `[${role}] pending>0 -> pending KPI gets act (${role === 'admin' ? 'amber' : 'blue'})`, tone.length === 1 && tone[0].includes(role === 'admin' ? 'amber' : 'blue'), JSON.stringify(tone));
    }
  }, page);

  /* ====================== 1.04 ====================== */
  await section('1.04', async () => {
    for (const lang of ['vi', 'en']) {
      await page.open({ role: 'admin', lang, viewport: 'D' });
      const h = () => page.eval(`document.getElementById('homeHello').textContent`);
      const n = await page.eval(`({p: PENDING_N, a: STOCK.filter(s=>s.stock<=LOW).length})`);
      const both = await h();
      const expBoth = lang === 'vi' ? `${n.p} yêu cầu chờ duyệt, ${n.a} mã cần chú ý` : `${n.p} request(s) waiting for approval, ${n.a} item(s) need attention`;
      ck('1.04', `[${lang}] both -> "${expBoth}"`, both === expBoth, `got "${both}"`);
      await page.eval(`PENDING_N = 0; renderHome();`);
      const onlyA = await h();
      ck('1.04', `[${lang}] only attention`, onlyA === (lang === 'vi' ? `${n.a} mã cần chú ý` : `${n.a} item(s) need attention`), onlyA);
      await page.eval(`PENDING_N = 4; STOCK = STOCK.filter(s => s.stock > LOW); renderHome();`);
      const onlyP = await h();
      ck('1.04', `[${lang}] only pending`, onlyP === (lang === 'vi' ? `4 yêu cầu chờ duyệt` : `4 request(s) waiting for approval`), onlyP);
      await page.eval(`PENDING_N = 0; renderHome();`);
      const none = await h();
      ck('1.04', `[${lang}] nothing -> old greeting`, /^(Xin chào|Hello) Minh Admin/.test(none) || /Minh/.test(none), none);
    }
    // toggle VI<->EN updates the summary
    await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
    const a = await page.eval(`document.getElementById('homeHello').textContent`);
    await page.click('#langBtn');
    await page.idle();
    const b = await page.eval(`document.getElementById('homeHello').textContent`);
    ck('1.04', 'toggle VI -> EN rewrites the summary line', /waiting for approval/.test(b) && /need attention/.test(b) && a !== b, `${a}  ->  ${b}`);
    await page.click('#langBtn');
    const c = await page.eval(`document.getElementById('homeHello').textContent`);
    ck('1.04', 'toggle back EN -> VI', c === a, c);
    // live update of PENDING_N from Core (what does Core call?)
    const core = await page.eval(`typeof renderHomeHello`);
    ck('1.04', 'renderHomeHello exists (Core refreshes it when PENDING_N changes)', core === 'function', core);
    // live: after a request is approved, summary changes without a full reload?
    await page.eval('goto("admin")'); await page.waitFor('#apTable tbody tr .cell-actions');
    const before = await page.eval(`PENDING_N`);
    await page.click('#apTable tbody tr:first-child .cell-actions .btn.sm'); await page.click('#uiDlgOk'); await page.idle(300);
    await page.eval('goto("home")'); await page.sleep(300);
    const after = await page.eval(`({p: PENDING_N, h: document.getElementById('homeHello').textContent})`);
    ck('1.04', 'after approving one request the summary shows N-1', after.p === before - 1 && after.h.startsWith(`${before - 1} `), `before=${before} after=${JSON.stringify(after)}`);
    await shot(page, '1.04-home-admin-D');
  }, page);

  /* ====================== 1.05 ====================== */
  await section('1.05', async () => {
    for (const lang of ['vi', 'en']) {
      await page.open({ role: 'admin', lang, viewport: 'D' });
      const d = await page.eval(`(() => {
        const by = {}; STOCK.forEach(s => { if (s.stock > 0) by[s.unit || '—'] = (by[s.unit || '—'] || 0) + s.stock; });
        const k = document.querySelector('#homeKpis .kpi:nth-child(4)');
        const rows = [...document.querySelectorAll('#catBars .bar-row')].map(r => ({name: r.querySelector('.bar-name').textContent, val: r.querySelector('.bar-val').textContent.replace(/\\s+/g, ' ').trim(), w: r.querySelector('.bar-fill').style.width}));
        const exp = {}; STOCK.forEach(s => { const q = Math.max(s.stock, 0); const k2 = s.cat + '|' + s.unit; exp[k2] = (exp[k2] || 0) + q; });
        return {by, label: k.querySelector('.kpi-label').textContent, val: k.querySelector('.kpi-value').textContent, foot: k.querySelector('.kpi-foot').textContent, rows, exp};
      })()`);
      const sorted = Object.entries(d.by).sort((a, b) => b[1] - a[1]);
      const main = sorted[0];
      ck('1.05', `[${lang}] KPI label shows majority unit and value = that unit's sum only`, d.label.includes(main[0]) && num(d.val) === main[1], `${d.label} = ${d.val}; by unit ${JSON.stringify(d.by)}`);
      ck('1.05', `[${lang}] foot lists the other units with their sums`, sorted.slice(1).every(([u, q]) => d.foot.includes(u) && d.foot.replace(/[.,]/g, '').includes(String(q))), d.foot);
      const mixed = d.rows.filter((r) => { const m = r.val.match(/^([\d.,-]+)\s+(\S+)$/); return !m; });
      ck('1.05', `[${lang}] each category bar shows a number + unit`, mixed.length === 0 && d.rows.length > 0, JSON.stringify(d.rows.slice(0, 3)));
      // each bar's number equals the sum for that (cat, unit)
      const bad = d.rows.filter((r) => { const m = r.val.match(/^([\d.,-]+)\s+(\S+)$/); const cat = r.name.replace(/ \(.+\)$/, ''); const unit = m && m[2]; return !(m && d.exp[cat + '|' + unit] === num(m[1])); });
      ck('1.05', `[${lang}] bar value = sum of (category, unit) (no unit mixing)`, bad.length === 0, JSON.stringify(bad.slice(0, 3)));
      if (lang === 'vi') { await shot(page, '1.05-home-admin-D'); }
    }
    // single-unit data -> foot shows boxes, no "Đơn vị khác"
    await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
    await page.eval(`STOCK = STOCK.filter(s => s.unit === 'Each'); renderHome();`);
    const f = await page.eval(`document.querySelector('#homeKpis .kpi:nth-child(4) .kpi-foot').textContent`);
    ck('1.05', 'single unit -> foot is "N thùng còn hàng"', /thùng còn hàng/.test(f) && !/Đơn vị khác/.test(f), f);
    // > 4 units -> ellipsis
    await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
    await page.eval(`['U1','U2','U3','U4','U5'].forEach((u,i) => { STOCK[i].unit = u; STOCK[i].stock = 3 + i; }); renderHome();`);
    const f2 = await page.eval(`document.querySelector('#homeKpis .kpi:nth-child(4) .kpi-foot').textContent`);
    ck('1.05', 'many units -> foot truncated with ellipsis, no overflow', /…$/.test(f2.trim()), f2);
    // empty unit '' -> '—'
    await page.eval(`STOCK[10].unit = ''; STOCK[10].stock = 99999; renderHome();`);
    const ff = await page.eval(`document.querySelector('#homeKpis .kpi:nth-child(4)').textContent`);
    ck('1.05', 'missing unit renders as "—" not "undefined"', !/undefined|null/.test(ff), ff);
  }, page);

  /* ====================== 1.06 ====================== */
  await section('1.06', async () => {
    const chartInfo = `(() => { const box = document.getElementById('flowChart'), svg = box.querySelector('svg'); if (!svg) return null; const r = svg.getBoundingClientRect(), b = box.getBoundingClientRect(), vb = svg.viewBox.baseVal;
      return {vbW: vb.width, vbH: vb.height, w: Math.round(r.width*100)/100, h: Math.round(r.height*100)/100, boxW: box.clientWidth, right: r.right, boxRight: b.right, docW: document.documentElement.scrollWidth, iw: innerWidth,
        ticks: [...svg.querySelectorAll('text.lc-label[text-anchor=end]')].map(t => t.textContent), fs: getComputedStyle(svg.querySelector('text.lc-label')).fontSize}; })()`;
    for (const vp of ['D', 'M']) {
      await page.open({ role: 'admin', lang: 'vi', viewport: vp });
      const c = await page.eval(chartInfo);
      ck('1.06', `[${vp}] svg rendered 1:1 (viewBox == pixel size, no text stretch)`, c && Math.abs(c.vbW - c.w) < 1 && Math.abs(c.vbH - c.h) < 1, JSON.stringify({ vbW: c.vbW, w: c.w, vbH: c.vbH, h: c.h, boxW: c.boxW }));
      ck('1.06', `[${vp}] svg fits its card and the page does not scroll sideways`, c.right <= c.boxRight + 1 && c.docW <= c.iw, `svgRight=${c.right} boxRight=${c.boxRight} doc=${c.docW} iw=${c.iw}`);
      const col = await page.eval(`(() => { const i = document.querySelector('#flowChart .fc-in'), o = document.querySelector('#flowChart .fc-out'); const sw = [...document.querySelectorAll('.legend .swatch')].map(s => getComputedStyle(s).backgroundColor);
        return {inFill: getComputedStyle(i).fill, outFill: getComputedStyle(o).fill, sw}; })()`);
      ck('1.06', `[${vp}] bar colours match legend (Nhập=blue, Xuất=amber)`, col.inFill === col.sw[0] && col.outFill === col.sw[1] && col.inFill !== col.outFill, JSON.stringify(col));
      await shot(page, `1.06-chart-admin-${vp}`);
    }
    // ticks for specific peaks
    await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
    for (const peak of [1, 2, 3, 7, 13, 99, 101, 1234, 25000]) {
      await page.eval(`HOME.days = HOME.days.map((d, i) => ({d: d.d, imp: i === 3 ? ${peak} : (i % 5 === 0 ? 1 : 0), exp: i === 7 ? ${Math.max(1, Math.round(peak / 2))} : 0})); drawFlowChart();`);
      const c = await page.eval(chartInfo);
      const t = c.ticks.map(num);
      const steps = t.slice(1).map((v, i) => t[i] - v);          // labels are drawn top->bottom? compute abs diffs
      const asc = [...t].sort((a, b) => a - b);
      const diffs = asc.slice(1).map((v, i) => v - asc[i]);
      const uniq = new Set(t).size === t.length;
      const ints = c.ticks.every((x) => /^[\d.]+$/.test(x));
      const tallest = await page.eval(`Math.min(...[...document.querySelectorAll('#flowChart rect')].map(r => +r.getAttribute('y')))`);
      ck('1.06', `peak=${peak}: ticks ${c.ticks.join(' ')} integer, unique, equally spaced, top>=peak`, uniq && ints && diffs.every((d) => d === diffs[0]) && asc[asc.length - 1] >= peak && asc[0] === 0 && tallest >= 9.9, `diffs=${diffs} tallestY=${tallest}`);
    }
    // EN number format ticks
    await page.eval(`HOME.days[3].imp = 1234; drawFlowChart();`);
    // empty data
    await page.eval(`HOME.days = []; drawFlowChart();`);
    let e = await page.eval(`({svg: !!document.querySelector('#flowChart svg'), txt: document.getElementById('flowChart').textContent.trim()})`);
    ck('1.06', 'empty days array -> message, no svg', !e.svg && /Chưa có phát sinh/.test(e.txt), JSON.stringify(e));
    await page.eval(`HOME.days = Array.from({length: 30}, (_, i) => ({d: '2026-10-' + String(i % 28 + 1).padStart(2, '0'), imp: 0, exp: 0})); drawFlowChart();`);
    e = await page.eval(`({svg: !!document.querySelector('#flowChart svg'), txt: document.getElementById('flowChart').textContent.trim(), tot: document.getElementById('flowTotals').textContent})`);
    ck('1.06', 'all-zero data -> message, totals 0', !e.svg && /Chưa có phát sinh/.test(e.txt), JSON.stringify(e));
    await page.eval(`HOME = {}; drawFlowChart();`);
    ck('1.06', 'HOME without days -> still message', await page.eval(`!document.querySelector('#flowChart svg') && /Chưa có/.test(document.getElementById('flowChart').textContent)`));
    await shot(page, '1.06-chart-empty-admin-D');
    await errs(page, '1.06-empty');
    // boot with empty chart through bootstrap data
    await page.open({ role: 'admin', lang: 'en', viewport: 'D', init: (server) => { const b = server.bootstrapAll; server.bootstrapAll = () => { const r = b(); r.data.home.days = []; return r; }; } });
    ck('1.06', 'boot with home.days=[] -> EN empty message, no errors', await page.eval(`/No movement/.test(document.getElementById('flowChart').textContent)`));

    // resize D -> M -> D
    await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
    const d0 = await page.eval(chartInfo);
    await page.setViewport('M'); await page.sleep(600);
    const m1 = await page.eval(chartInfo);
    ck('1.06', 'resize D->M redraws (svg width follows the card, no sideways scroll)', m1 && Math.abs(m1.w - m1.boxW) < 2 && m1.w < d0.w - 300 && m1.docW <= m1.iw, `D=${d0.w} M=${m1.w} boxW=${m1.boxW} docW=${m1.docW} iw=${m1.iw}`);
    await shot(page, '1.06-chart-after-resize-D2M');
    await page.setViewport('D'); await page.sleep(600);
    const d2 = await page.eval(chartInfo);
    ck('1.06', 'resize M->D redraws back to wide', d2 && d2.w > m1.w + 300 && Math.abs(d2.w - d2.boxW) < 2, `M=${m1.w} D=${d2.w} boxW=${d2.boxW}`);
    // drawn while hidden, shown after resize
    await page.eval('goto("kho")'); await page.waitFor('#page-kho.active');
    await page.setViewport('M'); await page.sleep(300);
    await page.eval('reloadData()'); await page.idle(300);
    const hid = await page.eval(chartInfo);
    await page.eval('goto("home")'); await page.sleep(700);
    const shown = await page.eval(chartInfo);
    ck('1.06', 'drawn while Home hidden (700px fallback) then shown at 390 -> redrawn to card width', shown && Math.abs(shown.w - shown.boxW) < 2 && shown.docW <= shown.iw, `hiddenDraw=${hid && hid.w} shown=${shown && shown.w} boxW=${shown && shown.boxW} docW=${shown && shown.docW}`);
    await shot(page, '1.06-chart-hidden-then-shown-M');
  }, page);

  /* ====================== 1.07 ====================== */
  await section('1.07', async () => {
    await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
    await openExport(page);
    const code = await clickRow(page, 2);
    const loc = await page.eval(`CONFIG.locations[1]`);
    await page.eval(`(() => { document.getElementById('eDate').value = '2026-10-15'; const q = document.getElementById('eQty'); q.value = 3; q.oninput && q.oninput(); const l = document.getElementById('eLoc'); l.value = ${JSON.stringify(loc)}; })()`);
    const snap = () => page.eval(`(() => { const f = document.getElementById('expForm'); if (!f) return null; const prev = f.previousElementSibling; return {date: eDate.value, qty: eQty.value, loc: eLoc.value, under: prev && prev.dataset.code, hint: eHint.textContent}; })()`);
    const s0 = await snap();
    ck('1.07', 'form opens under the clicked row', s0 && s0.under === code, JSON.stringify(s0));
    // typing a term that still matches the row keeps form+values
    await page.type('#ePickText', code.slice(0, 7));
    const s1 = await snap();
    ck('1.07', 'type in search (row still matches) -> form kept with date/qty/loc, directly under same row', s1 && s1.date === '2026-10-15' && s1.qty === '3' && s1.loc === loc && s1.under === code, JSON.stringify(s1));
    // change category to one matching
    const cat = await page.eval(`STOCK.filter(s => s.code === ${JSON.stringify(code)})[0].cat`);
    await page.eval(`(() => { const s = document.getElementById('ePickCat'); s.value = ${JSON.stringify(cat)}; s.dispatchEvent(new Event('change')); })()`);
    const s2 = await snap();
    ck('1.07', 'change category (row still matches) -> form kept with values', s2 && s2.date === '2026-10-15' && s2.qty === '3' && s2.loc === loc && s2.under === code, JSON.stringify(s2));
    await shot(page, '1.07-export-form-kept-admin-D');
    // filter the row away
    await page.type('#ePickText', 'zzzz-no-such-item');
    const s3 = await snap();
    const st3 = await page.eval(`({rows: document.querySelectorAll('#pickTable tbody tr').length, empty: !!document.querySelector('#pickTable td.empty'), ef: typeof EXP_FORM + ':' + (EXP_FORM ? 'set' : 'null'), pr: PICK_ROW, dup: document.querySelectorAll('#expForm').length})`);
    ck('1.07', 'row filtered away -> form disappears cleanly (empty-state shown)', s3 === null && st3.empty && st3.dup === 0, JSON.stringify(st3));
    await shot(page, '1.07-export-filtered-away-admin-D');
    // clear the filter: what comes back?
    await page.type('#ePickText', '');
    const s4 = await snap();
    console.log('   after clearing filter, form:', JSON.stringify(s4), 'PICK_ROW=', await page.eval('PICK_ROW'));
    // cat filter away
    await page.eval(`(() => { const s = document.getElementById('ePickCat'); const other = [...s.options].map(o => o.value).filter(v => v && v !== ${JSON.stringify(cat)})[0]; s.value = other; s.dispatchEvent(new Event('change')); })()`);
    const st5 = await page.eval(`({f: !!document.getElementById('expForm'), rows: document.querySelectorAll('#pickTable tbody tr.pick').length})`);
    ck('1.07', 'category changed to another -> form gone, no leftover', !st5.f, JSON.stringify(st5));
    // after that, opening another row works and the table is sane
    await page.eval(`(() => { document.getElementById('ePickText').value=''; document.getElementById('ePickCat').value=''; renderPickTable(); })()`);
    const code2 = await clickRow(page, 0);
    const s6 = await snap();
    ck('1.07', 'opening a fresh row afterwards: new form, default qty 1', s6 && s6.under === code2 && s6.qty === '1', JSON.stringify(s6));
    const dups = await page.eval(`document.querySelectorAll('#expForm').length`);
    ck('1.07', 'exactly one #expForm in DOM', dups === 1, `${dups}`);
    // changing the row: previous values must not leak
    await errs(page, '1.07');
  }, page);

  /* ====================== 1.08 ====================== */
  await section('1.08', async () => {
    await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
    await openExport(page);
    const code = await clickRow(page, 1);
    const stock0 = await page.eval(`expStockOf(${JSON.stringify(code)})`);
    await page.type('#eQty', String(stock0 + 5));
    let r = await page.eval(`({dis: btnExport.disabled, msg: eMsg.hidden ? '' : eMsg.textContent, cls: eMsg.className})`);
    ck('1.08', 'qty > stock -> export button disabled + error message', r.dis && /err/.test(r.cls) && /Vượt|vượt|còn/.test(r.msg), JSON.stringify(r));
    await shot(page, '1.08-over-stock-admin-D');
    await page.type('#eQty', String(stock0));
    r = await page.eval(`({dis: btnExport.disabled, hidden: eMsg.hidden})`);
    ck('1.08', 'qty == stock -> enabled again, message hidden', !r.dis && r.hidden, JSON.stringify(r));
    // reloadData with a different stock
    await page.type('#eQty', '4');
    await page.eval(`(() => { const orig = __server.getData; __setServer({ getData: () => { const r = orig(); r.stock.forEach(s => { if (s.code === ${JSON.stringify(code)}) s.stock = 3; }); return r; } }); })()`);
    await page.click('.header .icon-btn[onclick="reloadData()"]');
    await page.idle(300); await page.sleep(200);
    r = await page.eval(`({form: !!document.getElementById('expForm'), hint: document.getElementById('eHint') && eHint.textContent, max: eQty && eQty.max, qty: eQty && eQty.value, dis: btnExport && btnExport.disabled, msg: eMsg && !eMsg.hidden && eMsg.textContent, under: document.getElementById('expForm') && expForm.previousElementSibling.dataset.code, stk: expStockOf(${JSON.stringify(code)})})`);
    ck('1.08', 'after ⟳ reloadData: form still open, "Tồn khả dụng" updated to 3, max=3', r.form && /3/.test(r.hint) && r.max === '3' && r.under === code, JSON.stringify(r));
    ck('1.08', 'after ⟳: typed qty (4) > new stock (3) -> button disabled + warning', r.qty === '4' && r.dis && !!r.msg, JSON.stringify(r));
    // stock drops to 0 -> form dropped gracefully
    await page.eval(`__setServer({ getData: (() => { const orig = __server.getData; return () => { const r = orig(); r.stock.forEach(s => { if (s.code === ${JSON.stringify(code)}) s.stock = 0; }); return r; }; })() })`);
    await page.click('.header .icon-btn[onclick="reloadData()"]'); await page.idle(300); await page.sleep(200);
    r = await page.eval(`({form: !!document.getElementById('expForm'), pr: PICK_ROW})`);
    ck('1.08', 'stock of that code becomes 0 after reload -> form dropped, no error', !r.form && r.pr === null, JSON.stringify(r));
    await errs(page, '1.08a');
    // Esc closes
    await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
    await openExport(page);
    const code2 = await clickRow(page, 0);
    const focus = await page.eval(`document.activeElement.id`);
    ck('1.08', 'opening a row focuses the qty field', focus === 'eQty', focus);
    await page.press('Escape');
    r = await page.eval(`({form: !!document.getElementById('expForm'), pr: PICK_ROW, ef: !!EXP_FORM})`);
    ck('1.08', 'Esc (focus in form) closes the form', !r.form && r.pr === null && !r.ef, JSON.stringify(r));
    // click row again -> focus qty, values preserved
    await clickRow(page, 0);
    await page.idle(150);                                                           // let the form settle: the next steps land within milliseconds of each other
    await page.type('#eQty', '2');
    await page.idle(150);
    await page.click('#eDate');                                                     // move focus away
    await page.idle(150);
    await page.click(`#pickTable tbody tr.pick[data-code="${code2}"]`);
    r = await page.eval(`({focus: document.activeElement.id, qty: eQty.value, forms: document.querySelectorAll('#expForm').length})`);
    ck('1.08', 'click the same row again -> focus returns to qty, typed value (2) kept, one form', r.focus === 'eQty' && r.qty === '2' && r.forms === 1, JSON.stringify(r));
    // clicking different row switches the form
    const code3 = await page.eval(`document.querySelectorAll('#pickTable tbody tr.pick')[1].dataset.code`);
    await page.click(`#pickTable tbody tr.pick[data-code="${code3}"]`);
    r = await page.eval(`({under: expForm.previousElementSibling.dataset.code, qty: eQty.value, forms: document.querySelectorAll('#expForm').length, sel: document.querySelectorAll('tr.pick.sel').length})`);
    ck('1.08', 'click a different row -> form moves, qty reset to 1, one selected row', r.under === code3 && r.qty === '1' && r.forms === 1 && r.sel === 1, JSON.stringify(r));
    // Esc when focus is on a row (outside form) does nothing
  }, page);

  /* ====================== 1.09 ====================== */
  await section('1.09', async () => {
    await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
    await openExport(page);
    const code = await clickRow(page, 0);
    const loc = await page.eval(`CONFIG.locations[0]`);
    await page.type('#eQty', '2');
    await page.eval(`(() => { const l = document.getElementById('eLoc'); l.value = ${JSON.stringify(loc)}; })()`);
    const dt = await page.eval(`eDate.value`);
    await page.resetCalls();
    await page.click('#btnExport');
    const d = await page.eval(`(() => { const m = document.getElementById('uiDlg'); return m && {role: m.getAttribute('role'), modal: m.getAttribute('aria-modal'), title: m.querySelector('h2').textContent, body: m.querySelector('p').textContent, ok: m.querySelector('#uiDlgOk').textContent, no: m.querySelector('#uiDlgNo').textContent}; })()`);
    ck('1.09', 'Xuất -> uiDialog (not native confirm)', !!d && d.role === 'dialog' && page.dialogs.length === 0, JSON.stringify(d) + ' native=' + page.dialogs.length);
    ck('1.09', 'dialog body names qty, item and stock-after', d && /2/.test(d.body) && /Tồn kho sẽ giảm còn/.test(d.body), d && d.body);
    await shot(page, '1.09-export-dialog-admin-D');
    await page.click('#uiDlgNo');
    ck('1.09', 'Hủy -> no exportEntry call, dialog closed, form still open', (await page.calls('exportEntry')).length === 0 && !(await dlgOpen(page)) && (await page.exists('#expForm')));
    // Esc also cancels
    await page.click('#btnExport'); await page.press('Escape');
    ck('1.09', 'Esc on dialog -> no call', (await page.calls('exportEntry')).length === 0 && !(await dlgOpen(page)));
    // failure path (server throws) -> button restored
    await page.eval(`__setServer({ __fail: { exportEntry: 'Mock: server down' } })`);
    await page.click('#btnExport'); await page.click('#uiDlgOk'); await page.idle(200); await page.sleep(100);
    let r = await page.eval(`({dis: btnExport.disabled, busy: btnExport.dataset.busy || null, txt: btnExport.textContent.trim(), msg: eMsg.hidden ? '' : eMsg.textContent, cls: eMsg.className})`);
    ck('1.09', 'server failure -> button back to "Xuất kho", enabled, error shown', !r.dis && !r.busy && r.txt === 'Xuất kho' && /Mock: server down/.test(r.msg) && /err/.test(r.cls), JSON.stringify(r));
    await shot(page, '1.09-export-fail-admin-D');
    await page.eval(`delete __server.__fail.exportEntry; __setServer({ exportEntry: () => ({ ok: false, message: 'Mock: logic error' }) })`);
    await page.click('#btnExport'); await page.click('#uiDlgOk'); await page.idle(200); await page.sleep(100);
    r = await page.eval(`({dis: btnExport.disabled, txt: btnExport.textContent.trim(), msg: eMsg.textContent, icon: !!btnExport.querySelector('svg')})`);
    ck('1.09', 'res.ok=false -> button restored (with icon) and message shown', !r.dis && r.txt === 'Xuất kho' && /logic error/.test(r.msg) && r.icon, JSON.stringify(r));
    // while pending the button is locked
    await page.eval(`__setServer({ exportEntry: undefined, __hold: { exportEntry: true } }); delete __server.exportEntry;`);
    await page.click('#btnExport'); await page.click('#uiDlgOk'); await page.sleep(150);
    r = await page.eval(`({dis: btnExport.disabled, txt: btnExport.textContent.trim()})`);
    ck('1.09', 'while pending button is disabled and says "Đang xử lý"', r.dis && /Đang xử lý/.test(r.txt), JSON.stringify(r));
    await page.eval(`__release('exportEntry'); delete __server.__hold.exportEntry;`);
    await page.idle(300);
    // success path - fresh page, default fixtures
    await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
    await openExport(page);
    const code3 = await clickRow(page, 0);
    const before = await page.eval(`expStockOf(${JSON.stringify(code3)})`);
    await page.eval(`(() => { eLoc.value = CONFIG.locations[0]; })()`);
    await page.type('#eQty', '2');
    const dt3 = await page.eval(`eDate.value`);
    const loc3 = await page.eval(`eLoc.value`);
    await page.resetCalls();
    await page.click('#btnExport'); await page.click('#uiDlgOk'); await page.idle(300); await page.sleep(300);
    const calls = await page.calls('exportEntry');
    ck('1.09', 'OK -> exportEntry called once with exact payload {code, qty, loc, date}', calls.length === 1 && JSON.stringify(calls[0].args[0]) === JSON.stringify({ code: code3, qty: 2, loc: loc3, date: dt3 }), JSON.stringify(calls.map((c) => c.args)));
    r = await page.eval(`({form: !!document.getElementById('expForm'), msg: expMsg.hidden ? '' : expMsg.textContent, cls: expMsg.className, after: expStockOf(${JSON.stringify(code3)}), native: 0})`);
    ck('1.09', 'success -> form closed, green message, stock reloaded (-2)', !r.form && /ok/.test(r.cls) && r.msg.length > 3 && r.after === before - 2, JSON.stringify(r));
    await page.sleep(1500);
    ck('1.09', 'success message still visible 1.5s later', await page.eval(`!expMsg.hidden && expMsg.className.includes('ok')`));
    await shot(page, '1.09-export-success-admin-D');
    ck('1.09', 'no native dialogs used', page.dialogs.length === 0, JSON.stringify(page.dialogs));
  }, page);

  /* ====================== 1.10 / 1.11 ====================== */
  const fillImport = async (p, o = {}) => {
    // pick an existing SKU so the identity is complete, then fill the rest
    const code = o.code || await p.eval(`STOCK[2].code`);
    await p.eval(`(() => { const s = document.getElementById('iPickSku'); s.value = ${JSON.stringify(code)}; onPickSku(); })()`);
    await p.eval(`(() => { iDate.value = ${JSON.stringify(o.date || '2026-10-20')}; iLocation.value = CONFIG.locations[${o.loc ?? 1}]; })()`);
    await p.type('#iQty', String(o.qty ?? 7));
    if (o.po !== undefined) await p.type('#iPo', o.po);
    if (o.inv !== undefined) await p.type('#iInvoice', o.inv);
    if (o.sup !== undefined) await p.type('#iSupplier', o.sup);
    if (o.price !== undefined) await p.type('#iPrice', String(o.price));
    return code;
  };
  await section('1.10', async () => {
    await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
    await page.eval('goto("kho")'); await page.waitFor('#page-kho.active');
    await page.click('#segIn'); await page.waitFor('#importCard:not([hidden])');
    const code = await fillImport(page, { po: 'PO-77', inv: 'INV-9', sup: 'ACME', price: 1500 });
    await page.resetCalls();
    await page.click('#btnImport');
    const d = await page.eval(`(() => { const m = document.getElementById('uiDlg'); return m && {title: m.querySelector('h2').textContent, body: m.querySelector('p').textContent}; })()`);
    ck('1.10', 'Nhập -> uiDialog (not native confirm), nothing sent yet', !!d && page.dialogs.length === 0 && (await page.calls('importEntry')).length === 0, JSON.stringify(d));
    await shot(page, '1.10-import-dialog-admin-D');
    await page.click('#uiDlgNo');
    ck('1.10', 'Hủy -> no importEntry', (await page.calls('importEntry')).length === 0 && !(await dlgOpen(page)));
    // failure first
    await page.eval(`__setServer({ __fail: { importEntry: 'Mock: import boom' } })`);
    await page.click('#btnImport'); await page.click('#uiDlgOk'); await page.idle(200); await page.sleep(100);
    let r = await page.eval(`({dis: btnImport.disabled, dis2: btnImportMore.disabled, txt: btnImport.textContent.trim(), msg: impMsg.hidden ? '' : impMsg.textContent, cls: impMsg.className, qty: iQty.value, po: iPo.value})`);
    ck('1.10', 'failure -> buttons restored ("Ghi nhập kho"), error shown, form NOT reset', !r.dis && !r.dis2 && r.txt === 'Nhập kho' && /Mock: import boom/.test(r.msg) && r.qty === '7' && r.po === 'PO-77', JSON.stringify(r));
    await page.eval(`delete __server.__fail.importEntry`);
    await page.resetCalls();
    await page.click('#btnImport'); await page.click('#uiDlgOk'); await page.idle(300);
    const calls = await page.calls('importEntry');
    const p = calls[0] && calls[0].args[0];
    ck('1.10', 'OK -> importEntry once with right payload (code, qty, loc, date, doc fields)', calls.length === 1 && p.code === code && String(p.qty) === '7' && p.date === '2026-10-20' && p.poNo === 'PO-77' && p.invoiceNo === 'INV-9' && p.supplier === 'ACME' && String(p.purchasePrice) === '1500' && p.type === 'Import', JSON.stringify(p));
    await page.sleep(300);
    r = await page.eval(`({vis: !impMsg.hidden, cls: impMsg.className, txt: impMsg.textContent, qty: iQty.value, name: iName.value, po: iPo.value, pick: iPickSku.value, picked: PICKED_SKU, price: iPrice.value, dis: iName.disabled, role: impMsg.getAttribute('role')})`);
    ck('1.10', 'success -> green message visible and form reset (name/PO/price cleared, qty=1)', r.vis && /ok/.test(r.cls) && r.txt.length > 3 && r.qty === '1' && r.name === '' && r.po === '' && r.picked === '' && r.pick === '' && !r.dis, JSON.stringify(r));
    await page.sleep(2000);
    ck('1.10', 'green message is still visible after 2s (not wiped by reload)', await page.eval(`!impMsg.hidden && impMsg.className.includes('ok') && impMsg.textContent.length > 3`));
    await shot(page, '1.10-import-success-admin-D');
    ck('1.10', 'no native dialogs', page.dialogs.length === 0, JSON.stringify(page.dialogs));
    // new SKU path (no pick) validation
    await page.eval(`resetImport()`);
    await page.click('#btnImport');
    r = await page.eval(`({dlg: !!document.getElementById('uiDlg'), msg: impMsg.hidden ? '' : impMsg.textContent})`);
    ck('1.10', 'empty identity -> blocked at client with message, no dialog', !r.dlg && r.msg.length > 3, JSON.stringify(r));
  }, page);

  await section('1.11', async () => {
    await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
    await page.eval('goto("kho")'); await page.waitFor('#page-kho.active');
    await page.click('#segIn'); await page.waitFor('#importCard:not([hidden])');
    await fillImport(page, { po: 'PO-11', inv: 'INV-22', sup: 'Nhà A', price: 99, qty: 6, date: '2026-10-18', loc: 2 });
    await page.type('#iBox', '2');
    await page.eval(`(() => { bq1.value = 4; bq2.value = 2; onBoxQtyInput(); })()`);
    const loc = await page.eval(`iLocation.value`);
    await page.resetCalls();
    await page.click('#btnImportMore');
    ck('1.11', '"Lưu & thêm mã khác" -> uiDialog first', await dlgOpen(page));
    await page.click('#uiDlgOk'); await page.idle(300); await page.sleep(300);
    const calls = await page.calls('importEntry');
    ck('1.11', 'importEntry sent with boxList [4,2]', calls.length === 1 && JSON.stringify(calls[0].args[0].boxList) === '[4,2]' && calls[0].args[0].boxCount === 2, JSON.stringify(calls[0] && calls[0].args[0].boxList));
    let r = await page.eval(`({po: iPo.value, inv: iInvoice.value, sup: iSupplier.value, date: iDate.value, loc: iLocation.value, name: iName.value, event: iEvent.value, qty: iQty.value, box: iBox.value, boxWrap: boxWrap.hidden, boxInputs: document.querySelectorAll('#boxGrid input').length, price: iPrice.value, pick: iPickSku.value, picked: PICKED_SKU, filter: iPickFilter.value, cat: iCategory.value, ok: !impMsg.hidden && impMsg.className, keep: KEEP_DOC})`);
    ck('1.11', 'keeps PO / invoice / supplier / date / location', r.po === 'PO-11' && r.inv === 'INV-22' && r.sup === 'Nhà A' && r.date === '2026-10-18' && r.loc === loc, JSON.stringify(r));
    ck('1.11', 'clears name / event / qty(=1) / boxes / picked SKU; KEEP_DOC flag reset', r.name === '' && r.event === '' && r.qty === '1' && r.box === '0' && r.boxWrap && r.picked === '' && r.pick === '' && r.keep === false, JSON.stringify(r));
    await page.type('#iBox', '3');
    const stale = await page.eval(`[...document.querySelectorAll('#boxGrid input')].map(i => i.value)`);
    ck('1.11', 'after reset, entering Số thùng=3 for the NEXT item gives empty carton boxes (no stale 4,2 from the previous item)', stale.length === 3 && stale.every((v) => v === ''), `box values: ${JSON.stringify(stale)}`);
    await shot(page, '1.11-stale-carton-values-admin-D');
    await page.type('#iBox', '0');
    console.log('   price after save-and-add-another:', JSON.stringify(r.price));
    ck('1.11', 'success banner shown', /ok/.test(r.ok), String(r.ok));
    await shot(page, '1.11-save-more-admin-D');
    // second item reusing the kept doc, then main button wipes everything
    await fillImport(page, { code: await page.eval(`STOCK[5].code`), qty: 3, price: 10, date: '2026-10-19', loc: 1 });
    await page.click('#btnImport'); await page.click('#uiDlgOk'); await page.idle(300); await page.sleep(300);
    const calls2 = await page.calls('importEntry');
    const p2 = calls2[1] && calls2[1].args[0];
    ck('1.11', 'second item payload carries the kept PO/invoice/supplier', p2 && p2.poNo === 'PO-11' && p2.invoiceNo === 'INV-22' && p2.supplier === 'Nhà A', JSON.stringify(p2 && [p2.poNo, p2.invoiceNo, p2.supplier]));
    r = await page.eval(`({po: iPo.value, inv: iInvoice.value, sup: iSupplier.value, date: iDate.value, loc: iLocation.value, name: iName.value, qty: iQty.value})`);
    ck('1.11', 'main "Ghi nhập kho" -> PO / invoice / supplier wiped', r.po === '' && r.inv === '' && r.sup === '' && r.name === '' && r.qty === '1', JSON.stringify(r));
    console.log('   after main button date/location (not wiped by resetImport):', r.date, r.loc);
    // "Xóa" button also wipes doc
    await page.type('#iPo', 'PO-X'); await page.click('#importCard button[onclick="resetImport()"]');
    ck('1.11', '"Xóa form" wipes PO too', await page.eval(`iPo.value === ''`));
    // failure with keepDoc: fields remain, buttons restored
    await fillImport(page, { po: 'PO-Z', inv: 'I', sup: 'S', price: 5 });
    await page.eval(`__setServer({ __fail: { importEntry: 'Mock: nope' } })`);
    await page.click('#btnImportMore'); await page.click('#uiDlgOk'); await page.idle(200); await page.sleep(100);
    r = await page.eval(`({po: iPo.value, d1: btnImport.disabled, d2: btnImportMore.disabled, keep: KEEP_DOC, qty: iQty.value})`);
    ck('1.11', 'failure on "Lưu & thêm" -> nothing cleared, both buttons re-enabled', r.po === 'PO-Z' && !r.d1 && !r.d2 && r.qty === '7', JSON.stringify(r));
  }, page);

  /* ====================== 1.12 ====================== */
  await section('1.12', async () => {
    for (const lang of ['vi', 'en']) {
      await page.open({ role: 'staff', lang, viewport: 'D' });
      await page.eval('goto("kho")'); await page.waitFor('#page-kho.active');
      await page.click('#segIn'); await page.waitFor('#importCard:not([hidden])');
      const stars = await page.eval(`['iPo','iInvoice','iSupplier','iPrice'].map(id => { const f = document.getElementById(id).parentNode, l = f.querySelector('label'); const a = getComputedStyle(l, '::after'); return {id, req: f.classList.contains('req'), content: a.content, color: a.color, aria: document.getElementById(id).getAttribute('aria-required')}; })
        .concat(['iQty','iLocation','iDate'].map(id => { const l = document.getElementById(id).parentNode.querySelector('label'); return {id, content: getComputedStyle(l, '::after').content}; }))`);
      console.log('   stars', lang, JSON.stringify(stars));
      ck('1.12', `[staff ${lang}] 4 labels carry red *`, stars.slice(0, 4).every((s) => s.req && /\*/.test(s.content) && s.aria === 'true' && /rgb\((2[0-9]{2}|1[5-9]\d), ?\d{1,2}, ?\d{1,2}\)|rgb\(\d+, \d+, \d+\)/.test(s.color)) && stars.slice(0, 4).every((s) => { const m = s.color.match(/\d+/g).map(Number); return m[0] > 150 && m[1] < 90 && m[2] < 90; }), JSON.stringify(stars.slice(0, 4).map((s) => [s.id, s.content, s.color])));
      ck('1.12', `[staff ${lang}] other labels have no *`, stars.slice(4).every((s) => !/\*/.test(s.content)), JSON.stringify(stars.slice(4)));
      if (lang === 'vi') await shot(page, '1.12-import-form-staff-D');
      const code = await page.eval(`STOCK[1].code`);
      await page.eval(`(() => { iPickSku.value = ${JSON.stringify(code)}; onPickSku(); iDate.value = '2026-10-20'; iLocation.value = CONFIG.locations[1]; })()`);
      await page.type('#iQty', '3');
      const tryClick = async (expectFocus, label) => {
        await page.resetCalls();
        await page.click('#btnImport');
        const r = await page.eval(`({dlg: !!document.getElementById('uiDlg'), msg: impMsg.hidden ? '' : impMsg.textContent, cls: impMsg.className, f: document.activeElement.id})`);
        const calls = (await page.calls('submitRequest')).length;
        ck('1.12', `[staff ${lang}] ${label} -> blocked client side, focus on #${expectFocus}`, !r.dlg && calls === 0 && r.f === expectFocus && /err/.test(r.cls) && r.msg.length > 10, JSON.stringify(r));
        return r;
      };
      const r0 = await tryClick('iPo', 'missing PO');
      if (lang === 'vi') await shot(page, '1.12-blocked-staff-D');
      await page.type('#iPo', 'PO-1');
      await tryClick('iInvoice', 'missing invoice');
      await page.type('#iInvoice', 'INV-1');
      await tryClick('iSupplier', 'missing supplier');
      await page.type('#iSupplier', 'ACME');
      await tryClick('iPrice', 'missing price');
      await page.type('#iPrice', '0');
      await tryClick('iPrice', 'price 0');
      await page.type('#iPrice', '-5');
      await tryClick('iPrice', 'price negative');
      await page.type('#iPrice', '250');
      await page.resetCalls();
      await page.click('#btnImport');
      ck('1.12', `[staff ${lang}] everything filled -> confirm dialog`, await dlgOpen(page));
      await page.click('#uiDlgOk'); await page.idle(300);
      const c = await page.calls('submitRequest');
      ck('1.12', `[staff ${lang}] submitRequest sent with poNo/invoiceNo/supplier/purchasePrice`, c.length === 1 && c[0].args[0].poNo === 'PO-1' && c[0].args[0].invoiceNo === 'INV-1' && c[0].args[0].supplier === 'ACME' && String(c[0].args[0].purchasePrice) === '250', JSON.stringify(c[0] && c[0].args[0]));
    }
    // admin not required
    await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
    await page.eval('goto("kho")'); await page.waitFor('#page-kho.active');
    await page.click('#segIn'); await page.waitFor('#importCard:not([hidden])');
    const a = await page.eval(`['iPo','iInvoice','iSupplier','iPrice'].map(id => { const f = document.getElementById(id).parentNode; return {req: f.classList.contains('req'), content: getComputedStyle(f.querySelector('label'), '::after').content, aria: document.getElementById(id).getAttribute('aria-required')}; })`);
    /* PO / invoice / supplier / price are required for EVERY role (markDocRequired; server DirectEntry blocks admins too) */
    ck('1.12', '[admin] * shown and aria-required=true on the 4 document fields', a.every((x) => x.req && /\*/.test(x.content) && x.aria === 'true'), JSON.stringify(a));
    await shot(page, '1.12-import-form-admin-D');
    await fillImport(page, { qty: 2 });
    await page.resetCalls();
    await page.click('#btnImport');
    const adminBlock = await page.eval(`({dlg: !!document.getElementById('uiDlg'), msg: impMsg.hidden ? '' : impMsg.textContent, cls: impMsg.className, f: document.activeElement.id})`);
    ck('1.12', '[admin] blank PO/invoice/supplier/price blocked client side (no confirm dialog, error shown, focus on #iPo)', !adminBlock.dlg && /err/.test(adminBlock.cls) && adminBlock.msg.length > 10 && adminBlock.f === 'iPo', JSON.stringify(adminBlock));
    ck('1.12', '[admin] importEntry not sent without documents', (await page.calls('importEntry')).length === 0);
    await shot(page, '1.12-admin-docless-blocked-D');
  }, page);

  /* ====================== 1.13 ====================== */
  await section('1.13', async () => {
    await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
    await page.eval('goto("kho")'); await page.waitFor('#page-kho.active');
    await page.click('#segIn'); await page.waitFor('#importCard:not([hidden])');
    const info = await page.eval(`({n: STOCK.length, opts: document.getElementById('iPickSku').options.length, withVar: STOCK.filter(s => s.variant)[0], first: STOCK[3]})`);
    ck('1.13', 'initial list = all SKUs + "new item"', info.opts === info.n + 1, `${info.opts} vs ${info.n}+1`);
    const exp = (term) => `STOCK.filter(s => (s.code + ' · ' + s.name + (s.variant ? ' · ' + s.variant : '')).toLowerCase().indexOf(${JSON.stringify(term.toLowerCase())}) !== -1).length`;
    const optCount = () => page.eval(`document.getElementById('iPickSku').options.length - 1`);
    const terms = [['code', info.first.code.slice(0, 8)], ['code-lower', info.first.code.toLowerCase().slice(0, 8)], ['name', info.first.name.split(' ')[0]], ['variant', info.withVar.variant], ['no match', 'zzzzqq']];
    for (const [k, term] of terms) {
      await page.type('#iPickFilter', term);
      const got = await optCount(); const want = await page.eval(exp(term));
      const bad = await page.eval(`[...document.getElementById('iPickSku').options].slice(1).filter(o => o.text.toLowerCase().indexOf(${JSON.stringify(term.toLowerCase())}) === -1).length`);
      ck('1.13', `filter by ${k} "${term}" -> ${want} options, all contain the term`, got === want && bad === 0 && (k === 'no match' ? got === 0 : got > 0), `${got}/${want}`);
    }
    // selected stays
    await page.type('#iPickFilter', '');
    const sel = await page.eval(`STOCK[7].code`);
    await page.eval(`(() => { const s = document.getElementById('iPickSku'); s.value = ${JSON.stringify(sel)}; onPickSku(); })()`);
    await page.type('#iPickFilter', 'zzzzqq');
    let r = await page.eval(`({val: iPickSku.value, opts: [...iPickSku.options].map(o => o.value), picked: PICKED_SKU, name: iName.value})`);
    ck('1.13', 'selected SKU stays in list (and selected) although filter excludes it', r.val === sel && r.opts.includes(sel) && r.picked === sel, JSON.stringify(r.opts));
    await page.type('#iPickFilter', STOCK_CODE_PREFIX(sel));
    r = await page.eval(`({val: iPickSku.value, n: iPickSku.options.length})`);
    ck('1.13', 'filter changed again -> selection still kept', r.val === sel, JSON.stringify(r));
    // Xóa form
    await page.click('#importCard button[onclick="resetImport()"]');
    r = await page.eval(`({f: iPickFilter.value, opts: iPickSku.options.length, n: STOCK.length, val: iPickSku.value, picked: PICKED_SKU})`);
    ck('1.13', '"Xóa form" -> filter empty, full list, no selection', r.f === '' && r.opts === r.n + 1 && r.val === '' && r.picked === '', JSON.stringify(r));
    await page.type('#iPickFilter', info.first.code.slice(0, 6));
    await shot(page, '1.13-pick-filter-admin-D');
    // after successful import the filter is reset too
    await page.type('#iPickFilter', info.first.code);
    await page.eval(`(() => { iPickSku.value = ${JSON.stringify(info.first.code)}; onPickSku(); iLocation.value = CONFIG.locations[0]; })()`);
    await page.type('#iPo', 'P'); await page.type('#iInvoice', 'I'); await page.type('#iSupplier', 'S'); await page.type('#iPrice', '5');
    await page.click('#btnImport'); await page.click('#uiDlgOk'); await page.idle(300); await page.sleep(300);
    r = await page.eval(`({f: iPickFilter.value, opts: iPickSku.options.length, n: STOCK.length})`);
    ck('1.13', 'after successful import -> filter cleared & list full', r.f === '' && r.opts === r.n + 1, JSON.stringify(r));
    // language switch keeps filter + placeholder translated
    await page.type('#iPickFilter', 'abc');
    await page.click('#langBtn');
    r = await page.eval(`({f: iPickFilter.value, ph: iPickFilter.placeholder, first: iPickSku.options[0].text})`);
    ck('1.13', 'toggle EN: placeholder translated, text kept', r.f === 'abc' && /Filter the list/.test(r.ph), JSON.stringify(r));
  }, page);

  /* ====================== 1.14 ====================== */
  await section('1.14', async () => {
    for (const lang of ['vi', 'en']) {
      await page.open({ role: 'admin', lang, viewport: 'D' });
      await page.eval('goto("kho")'); await page.waitFor('#page-kho.active');
      const sep = lang === 'vi' ? '.' : ',';
      const d = await page.eval(`(() => { const rows = [...document.querySelectorAll('#stockTable tbody tr')]; const idx = [...document.querySelectorAll('#stockTable thead th')].findIndex(th => th.textContent === ${JSON.stringify(lang === 'vi' ? 'Tồn' : 'On hand')} || th.textContent === 'Tồn' || th.textContent.indexOf('hand') !== -1);
        const heads = [...document.querySelectorAll('#stockTable thead th')].map(t => t.textContent);
        const big = STOCK.filter(s => s.stock >= 1000); const cell = (code) => { const tr = rows.find(r => r.children[1].textContent === code); return tr && [...tr.children].map(c => c.textContent); };
        return {heads, idx, big: big.map(b => ({code: b.code, stock: b.stock, row: cell(b.code)})), info: document.getElementById('stockInfo').innerHTML, by: (() => { const m = {}; STOCK.forEach(s => m[s.unit] = (m[s.unit] || 0) + Math.max(s.stock, 0)); return m; })()}; })()`);
      const stockHeadIdx = d.heads.findIndex((h) => /^(Tồn|On hand|Stock)/i.test(h) && !/thùng|Carton|Box/i.test(h) && !/Nhập|Xuất|Import|Export|Received|Issued/i.test(h));
      console.log('   heads', JSON.stringify(d.heads));
      const b = d.big[0];
      const wantTxt = b.stock.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US');
      const cellTxt = b.row[9];
      ck('1.14', `[${lang}] "Tồn" cell shows thousand separator (${b.stock} -> ${wantTxt})`, cellTxt === wantTxt && cellTxt.includes(sep) && d.heads[9] !== undefined, `col9="${d.heads[9]}" cell="${cellTxt}"`);
      const exp = Object.entries(d.by).sort((a, b2) => b2[1] - a[1]).map(([u, q]) => `${q.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US')} ${u}`);
      const infoTxt = d.info.replace(/<[^>]+>/g, '');
      ck('1.14', `[${lang}] summary line lists total per unit (${exp.join(' · ')})`, exp.every((x) => infoTxt.includes(x)), infoTxt);
      if (lang === 'vi') await shot(page, '1.14-kho-table-admin-D');
      // filtered
      await page.eval(`document.getElementById('kFilterCat').value = STOCK[0].cat; renderStock();`);
      const f = await page.eval(`(() => { const rows = STOCK.filter(s => s.cat === STOCK[0].cat); const m = {}; rows.forEach(s => m[s.unit] = (m[s.unit] || 0) + Math.max(s.stock, 0)); return {m, info: document.getElementById('stockInfo').textContent}; })()`);
      ck('1.14', `[${lang}] summary follows the filter`, Object.entries(f.m).every(([u, q]) => f.info.includes(`${q.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US')} ${u}`)), f.info);
      // pick table also uses separators
      await page.click('#segOut'); await page.waitFor('#pickTable tbody tr.pick');
      const p = await page.eval(`[...document.querySelectorAll('#pickTable tbody tr.pick td:nth-child(5)')].map(x => x.textContent).filter(t => t.length > 3)`);
      ck('1.14', `[${lang}] pick table qty also grouped`, p.length > 0 && p.every((x) => x.includes(sep)), JSON.stringify(p.slice(0, 3)));
    }
    // negative numbers
    await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
    await page.eval('goto("kho")');
    const neg = await page.eval(`STOCK.filter(s => s.stock < 0).map(s => [...document.querySelectorAll('#stockTable tbody tr')].find(r => r.children[1].textContent === s.code).children[9].textContent)`);
    ck('1.14', 'negative stock shows minus sign (-12 etc.)', neg.length > 0 && neg.every((x) => /^-\d/.test(x)), JSON.stringify(neg));
  }, page);

  /* ====================== 1.15 ====================== */
  await section('1.15', async () => {
    for (const vp of ['D', 'M']) {
      await page.open({ role: 'admin', lang: 'vi', viewport: vp });
      await page.eval('goto("kho")'); await page.waitFor('#page-kho.active');
      await page.click('#segIn'); await page.waitFor('#importCard:not([hidden])');
      await page.sleep(200);
      const y0 = await page.eval(`document.getElementById("content").scrollTop`);
      await page.click('.kho-viewstock'); await page.sleep(1200);
      const r = await page.eval(`(() => { const s = document.getElementById('stockSec').getBoundingClientRect(); const hd = document.querySelector('.header'); const hb = hd ? hd.getBoundingClientRect() : {bottom: 0, position: 'none'}; const c = document.getElementById("content"); return {y: c.scrollTop, max: c.scrollHeight - c.clientHeight, top: Math.round(s.top), hdBottom: Math.round(hb.bottom), vh: innerHeight}; })()`);
      ck('1.15', `[${vp}] "Xem tồn kho ↓" scrolls to the stock table (scrollY ${y0} -> ${r.y}), section top visible below header`, r.y > y0 && r.top >= r.hdBottom - 2 && (r.top <= r.hdBottom + 6 || r.y >= r.max - 2), JSON.stringify(r));
      await shot(page, `1.15-after-viewstock-admin-${vp}`);
      // seg buttons
      await page.eval(`document.getElementById("content").scrollTop = 0`); await page.sleep(300);
      const seg = await page.eval(`(() => { const a = segIn.getBoundingClientRect(), b = segOut.getBoundingClientRect(); const l = document.querySelector('.kho-viewstock').getBoundingClientRect(); return {aTop: Math.round(a.top), bTop: Math.round(b.top), aW: Math.round(a.width), bW: Math.round(b.width), aL: Math.round(a.left), bL: Math.round(b.left), linkVisible: l.right <= innerWidth && l.left >= 0 && l.width > 0, dir: getComputedStyle(document.querySelector('#page-kho .seg')).flexDirection, h: Math.round(a.height)}; })()`);
      ck('1.15', `[${vp}] Nhập / Xuất buttons on one row`, Math.abs(seg.aTop - seg.bTop) <= 2 && seg.aL !== seg.bL, JSON.stringify(seg));
      if (vp === 'M') ck('1.15', '[M] link fully inside viewport', seg.linkVisible, JSON.stringify(seg));
      await shot(page, `1.15-seg-admin-${vp}`);
      // toggle closes
      const st = await page.eval(`({imp: !importCard.hidden, onIn: segIn.classList.contains('on')})`);
      await page.click('#segIn');
      const st2 = await page.eval(`({imp: importCard.hidden, onIn: segIn.classList.contains('on'), auto: autoRow.hidden, tx: TX_TYPE})`);
      ck('1.15', `[${vp}] click active "Nhập" again closes the form`, st.imp && st.onIn && st2.imp && !st2.onIn && st2.auto && st2.tx === '', JSON.stringify([st, st2]));
      await page.click('#segOut'); await page.waitFor('#exportCard:not([hidden])');
      const o1 = await page.eval(`({exp: !exportCard.hidden, on: segOut.classList.contains('on')})`);
      await page.click('#segOut');
      const o2 = await page.eval(`({exp: exportCard.hidden, on: segOut.classList.contains('on'), imp: importCard.hidden})`);
      ck('1.15', `[${vp}] click active "Xuất" again closes the form`, o1.exp && o1.on && o2.exp && !o2.on && o2.imp, JSON.stringify([o1, o2]));
      // reopen works after closing, switch Nhập<->Xuất
      await page.click('#segIn'); await page.click('#segOut');
      const sw = await page.eval(`({imp: importCard.hidden, exp: exportCard.hidden})`);
      ck('1.15', `[${vp}] switching Nhập -> Xuất swaps the form`, sw.imp && !sw.exp, JSON.stringify(sw));
      // with form closed the link still scrolls
      await page.click('#segOut');
      await page.eval(`document.getElementById("content").scrollTop = 0`); await page.sleep(200);
      await page.click('.kho-viewstock'); await page.sleep(1000);
      const t = await page.eval(`Math.round(document.getElementById('stockSec').getBoundingClientRect().top)`);
      const hb = await page.eval(`Math.round(document.querySelector('.header').getBoundingClientRect().bottom)`);
      ck('1.15', `[${vp}] link scrolls with the forms closed too (top=${t})`, t >= hb - 2 && t < 400, `top=${t} (header bottom ${hb} or page end)`);
      if (vp === 'M') {
        // keyboard activation of the link
        await page.eval(`document.getElementById("content").scrollTop = 0`); await page.sleep(200);
        await page.eval(`document.querySelector('.kho-viewstock').focus()`); await page.press('Enter'); await page.sleep(900);
        const t2 = await page.eval(`document.getElementById("content").scrollTop`);
        ck('1.15', '[M] Enter on the link also scrolls', t2 > 0, `scrollY=${t2}`);
      }
    }
  }, page);

  /* ====================== 1.16 ====================== */
  await section('1.16', async () => {
    await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
    await openExport(page);
    /* the sortable column headings (TableSort.html) are tab stops between the search box and the first pick row */
    const tabToRow = async () => { for (let i = 0; i < 10; i++) { await page.press('Tab'); if (await page.eval("document.activeElement.tagName === 'TR'")) return; } };
    await page.click('#ePickText');
    await tabToRow();
    let r = await page.eval(`(() => { const a = document.activeElement; const cs = getComputedStyle(a); return {tag: a.tagName, cls: a.className, fv: a.matches(':focus-visible'), ow: cs.outlineWidth, os: cs.outlineStyle, oc: cs.outlineColor, code: a.dataset && a.dataset.code, tab: a.tabIndex}; })()`);
    ck('1.16', 'Tab from the search box lands on the first pick row (tabindex=0)', r.tag === 'TR' && /pick/.test(r.cls) && r.fv, JSON.stringify(r));
    ck('1.16', 'focused pick row has a visible 2px outline', r.os !== 'none' && parseFloat(r.ow) >= 2, `${r.ow} ${r.os} ${r.oc}`);
    await shot(page, '1.16-pickrow-focus-admin-D');
    const code = r.code;
    await page.press('Enter');
    r = await page.eval(`({form: !!document.getElementById('expForm'), under: document.getElementById('expForm') && expForm.previousElementSibling.dataset.code, f: document.activeElement.id})`);
    ck('1.16', 'Enter on the row opens the form under it and focuses qty', r.form && r.under === code && r.f === 'eQty', JSON.stringify(r));
    await page.press('Escape');
    // Space
    await page.click('#ePickText'); await tabToRow(); await page.press('Tab');
    const code2 = await page.eval(`document.activeElement.dataset && document.activeElement.dataset.code`);
    await page.press('Space');
    r = await page.eval(`({form: !!document.getElementById('expForm'), under: document.getElementById('expForm') && expForm.previousElementSibling.dataset.code, f: document.activeElement.id, sy: window.scrollY})`);
    ck('1.16', 'Space on the 2nd row opens its form (page does not jump)', r.form && r.under === code2 && r.f === 'eQty', JSON.stringify(r));
    // typing Enter inside the form qty must not re-trigger the row
    await page.press('Enter');
    ck('1.16', 'Enter inside form fields does not duplicate the form', (await page.count('#expForm')) === 1);

    // (retired) Home alert-row keyboard checks: the alert rows were replaced by the new dashboard, which test-dashboard.mjs covers
  }, page);

  /* ====================== 1.17 ====================== */
  await section('1.17', async () => {
    // export form
    await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
    await openExport(page);
    const code = await clickRow(page, 1);
    const loc = await page.eval(`CONFIG.locations[2]`);
    await page.eval(`(() => { eDate.value = '2026-10-12'; eQty.value = 3; eQty.oninput(); eLoc.value = ${JSON.stringify(loc)}; })()`);
    const snap = () => page.eval(`(() => { const f = document.getElementById('expForm'); if (!f) return null; return {date: eDate.value, qty: eQty.value, loc: eLoc.value, lbl: f.querySelector('label[for=eQty]').textContent, btn: btnExport.textContent.trim(), cancel: f.querySelector('.btn.ghost').textContent.trim(), hint: eHint.textContent, first: eLoc.options[0].text, under: f.previousElementSibling.dataset.code, seg: segIn.textContent.trim() + '/' + segOut.textContent.trim(), ph: ePickText.placeholder, pickHead: pickTable.querySelector('th').textContent}; })()`);
    const a = await snap();
    await page.click('#langBtn'); await page.idle(200);
    const b = await snap();
    ck('1.17', 'export form VI->EN: labels change, values kept, same row', b && a.lbl !== b.lbl && b.btn === 'Record issue' || (b && a.lbl !== b.lbl && b.btn !== a.btn), JSON.stringify({ a, b }));
    ck('1.17', 'export form VI->EN: date/qty/location preserved', b && b.date === '2026-10-12' && b.qty === '3' && b.loc === loc && b.under === code, JSON.stringify(b));
    ck('1.17', 'EN: hint, placeholder, table header, segment all English', b && /Available/.test(b.hint) && /Search|search/.test(b.ph) && /Import|Receive/.test(b.seg), JSON.stringify(b));
    await shot(page, '1.17-export-form-EN-admin-D');
    const aT = await page.eval("({type: aType.textContent, expected: txLabel('Export'), lbl: document.querySelector('.auto-cell span').textContent})");
    ck('1.17', 'EN: auto-row "Transaction type" value is localized (Export / Issue stock), not stuck in Vietnamese', aT.type === aT.expected, JSON.stringify(aT));
    await page.click('#langBtn'); await page.idle(200);
    const c = await snap();
    ck('1.17', 'export form EN->VI: back to VI with same values', c && c.lbl === a.lbl && c.date === '2026-10-12' && c.qty === '3' && c.loc === loc, JSON.stringify(c));
    await errs(page, '1.17a');
    // over-stock state survives switching and the focus is not lost
    await page.eval(`(() => { eQty.value = 99999; eQty.oninput(); })()`);
    await page.click('#langBtn'); await page.idle(200);
    const o = await page.eval(`({dis: btnExport.disabled, msg: eMsg.hidden ? '' : eMsg.textContent})`);
    ck('1.17', 'over-stock warning survives language switch (button stays disabled, message localized)', o.dis && /Exceeds|exceed/i.test(o.msg), JSON.stringify(o));
    // import form
    await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
    await page.eval('goto("kho")'); await page.waitFor('#page-kho.active');
    await page.click('#segIn'); await page.waitFor('#importCard:not([hidden])');
    await page.eval(`(() => { iCategory.value = CONFIG.categories[0]; onCatChange(); iSub.value = CONFIG.tree[CONFIG.categories[0]][0]; onSubChange(); })()`);
    await page.type('#iName', 'Áo thun test'); await page.type('#iEvent', 'EVT1'); await page.type('#iPo', 'PO-EN'); await page.type('#iInvoice', 'INV-EN'); await page.type('#iSupplier', 'Công ty Ánh Dương'); await page.type('#iPrice', '1234');
    await page.type('#iQty', '12'); await page.type('#iBox', '2');
    await page.eval(`(() => { bq1.value = 5; bq2.value = 7; onBoxQtyInput(); iDate.value = '2026-10-10'; iLocation.value = CONFIG.locations[1]; iUnit.value = CONFIG.units[1]; iPickFilter.value = 'xyz'; })()`);
    const isnap = () => page.eval(`({name: iName.value, event: iEvent.value, po: iPo.value, inv: iInvoice.value, sup: iSupplier.value, price: iPrice.value, qty: iQty.value, box: iBox.value, bq: [bq1.value, bq2.value].join(','), date: iDate.value, loc: iLocation.value, unit: iUnit.value, cat: iCategory.value, sub: iSub.value, filt: iPickFilter.value, variantWrap: iVariantWrap.hidden,
      lblPo: iPo.parentNode.querySelector('label').textContent, title: document.querySelector('#importCard .sec-title').textContent, firstCat: iCategory.options[0].text, firstSub: iSub.options[0].text, firstLoc: iLocation.options[0].text, firstPick: iPickSku.options[0].text, btn: btnImport.textContent.trim(), more: btnImportMore.textContent.trim(), boxTotal: boxTotal.textContent, note: impNote.textContent})`);
    const i0 = await isnap();
    await page.click('#langBtn'); await page.idle(300); await page.sleep(300);
    const i1 = await isnap();
    const keys = ['name', 'event', 'po', 'inv', 'sup', 'price', 'qty', 'box', 'bq', 'date', 'loc', 'unit', 'cat', 'sub', 'filt'];
    const diffs = keys.filter((k) => i0[k] !== i1[k]);
    ck('1.17', 'import form VI->EN: all typed values kept (name, doc, qty, boxes, date, location, unit, category, filter)', diffs.length === 0, diffs.map((k) => `${k}: ${i0[k]} -> ${i1[k]}`).join('; '));
    ck('1.17', 'import form VI->EN: labels / dropdown placeholders change', i0.title !== i1.title && i0.firstCat !== i1.firstCat && i0.firstSub !== i1.firstSub && i0.firstLoc !== i1.firstLoc && i0.firstPick !== i1.firstPick && i0.more !== i1.more, JSON.stringify({ i0, i1 }));
    await shot(page, '1.17-import-form-EN-admin-D');
    await page.click('#langBtn'); await page.idle(300); await page.sleep(300);
    const i2 = await isnap();
    ck('1.17', 'import form EN->VI: values kept and labels restored', keys.every((k) => i0[k] === i2[k]) && i2.lblPo === i0.lblPo && i2.firstSub === i0.firstSub && i2.firstPick === i0.firstPick, JSON.stringify(keys.filter((k) => i0[k] !== i2[k])));
    await errs(page, '1.17b');
  }, page);

  /* ====================== 1.18 ====================== */
  await section('1.18', async () => {
    const overflow = () => page.eval(`(() => { const d = document.documentElement, b = document.body; const out = [];
      document.querySelectorAll('.page.active *, .header *, .nav *, nav *').forEach(e => { const r = e.getBoundingClientRect(); if (r.width > 0 && r.right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed') { let p = e.parentElement, clipped = false; while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') { clipped = true; break; } p = p.parentElement; } if (!clipped && out.length < 6) out.push((e.id ? '#' + e.id : e.tagName + '.' + String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className).split(' ')[0]) + ' right=' + Math.round(r.right)); } });
      return {dw: d.scrollWidth, bw: b.scrollWidth, iw: innerWidth, out}; })()`);
    for (const role of ['admin', 'staff']) {
      for (const lang of ['vi', 'en']) {
        await page.open({ role, lang, viewport: 'M' });
        let o = await overflow();
        ck('1.18', `[${role} ${lang} M] Home: scrollWidth ${o.dw} <= 390`, o.dw <= 390 && o.bw <= 390, JSON.stringify(o));
        if (lang === 'vi') await shot(page, `1.18-home-${role}-M`);
        await page.eval('goto("kho")'); await page.waitFor('#page-kho.active'); await page.sleep(150);
        o = await overflow();
        ck('1.18', `[${role} ${lang} M] Kho: scrollWidth ${o.dw} <= 390`, o.dw <= 390 && o.bw <= 390, JSON.stringify(o));
        if (lang === 'vi') await shot(page, `1.18-kho-${role}-M`);
        // with export form open
        await page.click('#segOut'); await page.waitFor('#pickTable tbody tr.pick');
        await clickRow(page, 0); await page.sleep(150);
        o = await overflow();
        ck('1.18', `[${role} ${lang} M] Kho + export form open: scrollWidth ${o.dw}`, o.dw <= 390 && o.bw <= 390, JSON.stringify(o));
        if (lang === 'vi') { await page.eval(`expForm.scrollIntoView({block: 'center'})`); await page.sleep(300); await shot(page, `1.18-kho-export-${role}-M`); }
        await page.click('#segIn'); await page.waitFor('#importCard:not([hidden])'); await page.sleep(150);
        o = await overflow();
        ck('1.18', `[${role} ${lang} M] Kho + import form open: scrollWidth ${o.dw}`, o.dw <= 390 && o.bw <= 390, JSON.stringify(o));
        if (lang === 'vi') { await page.eval(`document.getElementById('importCard').scrollIntoView()`); await page.sleep(300); await shot(page, `1.18-kho-import-${role}-M`); }
        await page.click('#segIn');
        await page.eval(`setStockTab('attn')`); o = await overflow();
        ck('1.18', `[${role} ${lang} M] Kho tab Cần chú ý: scrollWidth ${o.dw}`, o.dw <= 390, JSON.stringify(o));
      }
    }
    // worst case numbers: huge stock & long names on Home
    await page.open({ role: 'admin', lang: 'vi', viewport: 'M' });
    await page.eval(`STOCK[0].stock = 123456789; STOCK[0].name = 'Tên rất rất dài ' .repeat(8); STOCK[1].stock = -123456; renderHome(); renderStock();`);
    let o = await overflow();
    ck('1.18', '[admin vi M] Home with huge numbers / long names: no sideways scroll', o.dw <= 390 && o.bw <= 390, JSON.stringify(o));
    await page.eval('goto("kho")'); await page.sleep(200);
    o = await overflow();
    ck('1.18', '[admin vi M] Kho with huge numbers / long names: no sideways scroll', o.dw <= 390 && o.bw <= 390, JSON.stringify(o));
    // 360 px
    await page.eval(`window.__vw = 1`);
  }, page);

  // tall screenshots of key visuals (the app scrolls inside #content, so enlarge the viewport instead of fullPage)
  await section('shots', async () => {
    const tall = async (w, h, dpr, mobile, name) => { await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile }); await page.sleep(900); await shot(page, name); };
    for (const [role, vp] of [['admin', 'D'], ['staff', 'D'], ['admin', 'M'], ['staff', 'M']]) {
      await page.open({ role, lang: 'vi', viewport: vp });
      await page.sleep(1500);
      if (vp === 'D') await tall(1440, 1500, 1, false, `tall-home-${role}-D`); else await tall(390, 2100, 2, true, `tall-home-${role}-M`);
      await page.eval('goto("kho")'); await page.waitFor('#page-kho.active'); await page.sleep(700);
      if (vp === 'D') await tall(1440, 1500, 1, false, `tall-kho-${role}-D`); else await tall(390, 2400, 2, true, `tall-kho-${role}-M`);
      await errs(page, 'shots');
    }
  }, page);
} finally {
  await page.close();
  const out = Object.entries(R).map(([item, cs]) => ({ item, result: cs.every((c) => c.ok) ? 'PASS' : 'FAIL', checks: cs }));
  fs.writeFileSync(path.join(HERE, 'results', 'group1.json'), JSON.stringify({ items: out, consoleErrors: ERRS }, null, 2));
  console.log('\n==== SUMMARY ====');
  for (const o of out) console.log(o.item, o.result, `${o.checks.filter((c) => c.ok).length}/${o.checks.length}`, o.checks.filter((c) => !c.ok).map((c) => c.name).join(' || '));
  console.log('console errors:', ERRS.length, JSON.stringify(ERRS.slice(0, 10)));
}
function STOCK_CODE_PREFIX(code) { return code.slice(0, 5); }
