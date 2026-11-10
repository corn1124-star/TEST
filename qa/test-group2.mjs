// test-group2.mjs - QA checklist "Nhom 2" (items 2.01-2.12): History, My requests, routing.
//   node test-group2.mjs        -> results/group2.json (+ screenshots results/screens/g2-*.png)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from './build.mjs';
import { createDriver } from './driver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SC = path.join(HERE, 'results', 'screens');
fs.mkdirSync(SC, { recursive: true });
const R = [];
const CONSOLE = [];
function chk(item, ctx, name, ok, detail = '') {
  R.push({ item, ctx, name, ok: !!ok, detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${item} [${ctx}] ${name}${detail ? '  - ' + String(detail).slice(0, 300) : ''}`);
}
function blocked(item, ctx, name, detail) { R.push({ item, ctx, name, ok: null, detail }); console.log(`BLOCKED ${item} [${ctx}] ${name} - ${detail}`); }

build({ quiet: true });
const page = await createDriver();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (n) => page.screenshot(path.join(SC, `g2-${n}.png`));
function harvest(tag) {
  const e = page.consoleErrors({ clear: true });
  if (e.length) CONSOLE.push({ tag, errors: e.map((x) => `[${x.kind}] ${x.text.split('\n')[0]}${x.url ? ' @' + path.basename(x.url) + ':' + x.line : ''}`) });
  return e;
}
const lastArgs = async (fn) => { const c = await page.calls(fn); return c.length ? c[c.length - 1].args : null; };
async function rows(sel) { return page.count(sel); }
async function openHistory(opts = {}) {
  await page.open({ role: 'admin', lang: 'vi', viewport: 'D', ...opts });
  await page.eval('goto("history")');
  await page.waitFor('js:document.querySelectorAll("#hTable tbody tr").length>1');
  await page.idle();
}
async function setSel(id, v) { await page.eval(`(()=>{const e=document.getElementById(${JSON.stringify(id)}); e.value=${JSON.stringify(v)}; e.dispatchEvent(new Event('change',{bubbles:true}));})()`); }

/* ---------------------------------------------------------------- 2.01 */
async function t201() {
  for (const lang of ['vi', 'en']) {
    await page.open({ role: 'admin', lang, viewport: 'D' });
    await page.resetCalls();
    await page.eval('goto("history")');
    await page.waitFor('js:document.querySelectorAll("#hTable tbody tr").length>1');
    await page.idle();
    const calls = await page.calls('getTransactions');
    chk('2.01', `admin-D-${lang}`, 'getTransactions called exactly once on entering', calls.length === 1, `${calls.length} call(s)`);
    const exp = await page.eval('({f: daysAgo(7), t: today(), ff: fmt(daysAgo(7)), ft: fmt(today())})');
    const a = (calls[0] || {}).args ? calls[0].args[0] : {};
    chk('2.01', `admin-D-${lang}`, 'call args = last 7 days, limit 300', a.from === exp.f && a.to === exp.t && a.limit === 300, JSON.stringify(a));
    const info = await page.text('#hInfo');
    const label = lang === 'vi' ? 'Khoảng ngày' : 'Date range';
    chk('2.01', `admin-D-${lang}`, 'info line states the date range', info.includes(label) && info.includes(exp.ff) && info.includes(exp.ft), info.replace(/\s+/g, ' ').slice(0, 200));
    // leave & re-enter: no reload
    await page.eval('goto("kho")'); await page.eval('goto("history")'); await page.idle();
    chk('2.01', `admin-D-${lang}`, 're-entering does not reload', (await page.calls('getTransactions')).length === 1);
    if (lang === 'vi') await shot('2.01-admin-D');
    harvest('2.01-' + lang);
  }
}

/* ---------------------------------------------------------------- 2.02 */
async function t202() {
  // A. real fixtures: 369 rows in the last 7 days, 300 shown
  await openHistory();
  const st = await page.eval('({rows: H_DATA.rows.length, total: H_DATA.total})');
  chk('2.02', 'admin-D-vi', 'fixture precondition: total > rows', st.total > st.rows, JSON.stringify(st));
  const btn = await page.eval(`(()=>{const b=document.querySelector('#hInfo button[onclick="loadMoreHistory()"]'); return b? b.textContent.trim(): null})()`);
  chk('2.02', 'admin-D-vi', 'more-button present, label = "Tải thêm <min(300,remaining)>"', btn === `Tải thêm ${Math.min(300, st.total - st.rows)}`, `label="${btn}" (total ${st.total}, shown ${st.rows})`);
  await shot('2.02-admin-D-more');
  await page.resetCalls();
  await page.click('#hInfo button[onclick="loadMoreHistory()"]');
  await page.idle();
  let a = await lastArgs('getTransactions');
  chk('2.02', 'admin-D-vi', 'click -> limit 600', a && a[0].limit === 600, JSON.stringify(a && a[0].limit));
  const after = await page.eval('({rows: H_DATA.rows.length, trs: document.querySelectorAll("#hTable tbody tr").length, more: !!document.querySelector(\'#hInfo button[onclick="loadMoreHistory()"]\')})');
  chk('2.02', 'admin-D-vi', 'all rows displayed, no more button when total reached', after.rows === st.total && after.trs === st.total && !after.more, JSON.stringify(after));
  // changing a filter resets limit
  await setSel('hType', 'Export'); await page.idle();
  a = await lastArgs('getTransactions');
  chk('2.02', 'admin-D-vi', 'changing filter resets limit to 300', a && a[0].limit === 300, JSON.stringify(a && a[0]));

  // B. synthetic big result set: 300 label, steps of 300, cap at 3000
  await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
  await page.eval(`(()=>{ const o=__server.getTransactions; const base=o({limit:1}).rows[0];
    __setServer({ getTransactions:(f)=>{ const total=5000, n=Math.min(Number(f.limit)||300,total), rows=[]; for(let i=0;i<n;i++) rows.push(Object.assign({},base,{no:total-i,rowIndex:i+2})); return {ok:true,rows,total,scope:'ALL',isAdmin:true,summary:{imp:1,exp:1,boxImp:0}}; } }); })()`);
  await page.eval('goto("history")');
  await page.waitFor('js:document.querySelectorAll("#hTable tbody tr").length>=300');
  await page.idle();
  const lab = await page.eval(`(document.querySelector('#hInfo button[onclick="loadMoreHistory()"]')||{}).textContent`);
  chk('2.02', 'admin-D-vi(synthetic 5000)', 'label is exactly "Tải thêm 300"', (lab || '').trim() === 'Tải thêm 300', lab);
  await page.resetCalls();
  const limits = [];
  for (let i = 0; i < 12; i++) {
    const has = await page.exists('#hInfo button[onclick="loadMoreHistory()"]');
    if (!has) break;
    await page.click('#hInfo button[onclick="loadMoreHistory()"]');
    await page.idle(60);
    await page.waitFor(`js:H_DATA && H_DATA.rows.length===Math.min(H_LIMIT,5000) && !H_LOADING`);
  }
  const calls = await page.calls('getTransactions');
  calls.forEach((c) => limits.push(c.args[0].limit));
  chk('2.02', 'admin-D-vi(synthetic 5000)', 'limit steps 600,900,...,3000', JSON.stringify(limits) === JSON.stringify([600, 900, 1200, 1500, 1800, 2100, 2400, 2700, 3000]), JSON.stringify(limits));
  const cap = await page.eval(`({more: !!document.querySelector('#hInfo button[onclick="loadMoreHistory()"]'), note: document.getElementById('hInfo').textContent, trs: document.querySelectorAll('#hTable tbody tr').length})`);
  chk('2.02', 'admin-D-vi(synthetic 5000)', 'at 3000: no more button + cap note (filter/export CSV)', !cap.more && /Đã đạt giới hạn 3\.000 dòng/.test(cap.note) && cap.trs === 3000, `trs=${cap.trs} note=${cap.note.replace(/\s+/g, ' ').slice(-150)}`);
  await shot('2.02-admin-D-cap');

  // C. stale response is ignored
  await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
  await page.eval('goto("history")'); await page.idle();
  await page.eval(`(()=>{ const o=__server.getTransactions; __setServer({ getTransactions:(f)=>new Promise((r)=>setTimeout(()=>r(o(f)), f.type==='Import'?1500:60)) }); })()`);
  await page.eval(`(()=>{ document.getElementById('hType').value='Import'; loadHistory(); document.getElementById('hType').value='Export'; loadHistory(); })()`);
  await page.sleep(2400);
  const stale = await page.eval(`({types:[...new Set(H_DATA.rows.map(r=>r.type))], exportOnlyDom: [...document.querySelectorAll('#hTable tbody tr .badge')].every(b=>b.classList.contains('out')), filterType: H_FILTER.type, loading:H_LOADING, info:document.getElementById('hInfo').className})`);
  chk('2.02', 'admin-D-vi', 'late response of the older request is ignored', stale.types.length === 1 && stale.types[0] === 'Export' && stale.exportOnlyDom && !stale.loading, JSON.stringify(stale));
  // reverse order: older request fails late
  harvest('2.02');
}

/* ---------------------------------------------------------------- 2.03 */
async function t203() {
  await openHistory();
  const user = await page.eval(`(()=>{const o=[...document.getElementById('hUser').options].filter(o=>o.value); return o.length? o[0].value : ''})()`);
  const cat = await page.eval(`(()=>{const o=[...document.getElementById('hCat').options].filter(o=>o.value); return o.length? o[0].value : ''})()`);
  await setSel('hType', 'Export'); await setSel('hUser', user); await setSel('hCat', cat);
  await page.eval(`(()=>{document.getElementById('hFrom').value='2026-01-01'; document.getElementById('hTo').value='2026-02-01'; })()`);
  await page.type('#hSearch', 'ao'); await page.sleep(700); await page.idle();
  await page.click('#hInfo button[onclick="loadMoreHistory()"]').catch(() => {});
  await page.idle();
  await page.resetCalls();
  await page.click('button[onclick="clearHistFilter()"]');
  await page.idle();
  const calls = await page.calls('getTransactions');
  const exp = await page.eval('({f:daysAgo(7), t:today()})');
  const a = calls.length ? calls[calls.length - 1].args[0] : {};
  chk('2.03', 'admin-D-vi', 'Xóa lọc -> exactly 1 call, 7 days, other filters cleared, limit 300',
    calls.length === 1 && a.from === exp.f && a.to === exp.t && !a.type && !a.username && !a.cat && !a.keyword && a.limit === 300, `${calls.length} call(s) ${JSON.stringify(a)} (user=${user} cat=${cat})`);
  const ui = await page.eval(`({type:hType.value,user:hUser.value,cat:hCat.value,from:hFrom.value,to:hTo.value,q:hSearch.value,clearBtnHidden:document.getElementById('hSearchClear').hidden})`);
  chk('2.03', 'admin-D-vi', 'controls reset (incl. search box + its clear button)', !ui.type && !ui.user && !ui.cat && ui.from === exp.f && ui.to === exp.t && !ui.q && ui.clearBtnHidden, JSON.stringify(ui));
  // all time
  await page.resetCalls();
  await page.click('button[onclick="histAllTime()"]');
  await page.idle();
  const calls2 = await page.calls('getTransactions');
  const b = calls2.length ? calls2[calls2.length - 1].args[0] : {};
  const info = await page.text('#hInfo');
  chk('2.03', 'admin-D-vi', 'Xem tất cả thời gian -> from/to empty, 1 call', calls2.length === 1 && b.from === '' && b.to === '', JSON.stringify(b));
  chk('2.03', 'admin-D-vi', 'info line says "Tất cả thời gian"', /Tất cả thời gian/.test(info) && !(await page.exists('button[onclick="histAllTime()"]')), info.replace(/\s+/g, ' ').slice(0, 160));
  await shot('2.03-admin-D-alltime');
  // EN
  await page.open({ role: 'admin', lang: 'en', viewport: 'D' });
  await page.eval('goto("history")'); await page.idle();
  await page.click('button[onclick="histAllTime()"]'); await page.idle();
  chk('2.03', 'admin-D-en', 'info line says "All time"', /All time/.test(await page.text('#hInfo')), (await page.text('#hInfo')).replace(/\s+/g, ' ').slice(0, 120));
  harvest('2.03');
}

/* ---------------------------------------------------------------- 2.04 */
async function t204() {
  for (const prior of [false, true]) {
    const ctx = prior ? 'admin-D-vi(history visited with filters first)' : 'admin-D-vi(history never visited)';
    await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
    if (prior) {
      await page.eval('goto("history")'); await page.idle();
      await setSel('hType', 'Export'); await page.type('#hSearch', 'ao'); await page.sleep(600); await page.idle();
      await page.eval(`(()=>{document.getElementById('hFrom').value='2026-01-01'; document.getElementById('hTo').value='2026-02-01'; })()`);
      await page.eval('goto("home")');
    }
    await page.eval('goto("admin")');
    await page.waitFor('#userTable tbody tr td:nth-child(2) .link');
    await page.idle();
    const name = await page.eval(`(()=>{const l=[...document.querySelectorAll('#userTable tbody tr td:nth-child(2) .link')]; return l[Math.min(1,l.length-1)].textContent})()`);
    await page.resetCalls();
    await page.eval(`(()=>{const l=[...document.querySelectorAll('#userTable tbody tr td:nth-child(2) .link')].find(x=>x.textContent===${JSON.stringify(name)}); l.click();})()`);
    await page.waitFor('#page-history.active');
    await page.waitFor('js:H_DATA && !H_LOADING && document.querySelectorAll("#hTable tbody tr").length>0', 5000).catch(() => {});
    await page.idle();
    const calls = await page.calls('getTransactions');
    const a = calls.length ? calls[calls.length - 1].args[0] : {};
    const ui = await page.eval(`({user:hUser.value,type:hType.value,cat:hCat.value,from:hFrom.value,to:hTo.value,q:hSearch.value,pics:[...new Set(H_DATA.rows.map(r=>r.pic))], n:H_DATA.rows.length, info:document.getElementById('hInfo').textContent})`);
    chk('2.04', ctx, `click user name "${name}" -> exactly 1 getTransactions`, calls.length === 1, `${calls.length}`);
    chk('2.04', ctx, 'filter = that user only, all other filters/dates cleared', a.username === name && !a.type && !a.cat && !a.keyword && a.from === '' && a.to === '' && ui.user === name && !ui.from && !ui.to && !ui.type && !ui.q, JSON.stringify(a));
    chk('2.04', ctx, 'rows shown belong to that user + info says all time', ui.n > 0 && ui.pics.every((p) => p === name) && /Tất cả thời gian/.test(ui.info), `n=${ui.n} pics=${ui.pics.join(',')}`);
    if (prior) await shot('2.04-admin-D');
  }
  // option not present in hUser (username not in FILTERS.pics)
  await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
  await page.resetCalls();
  await page.eval('historyShowUser("not.in.list")'); await page.idle();
  chk('2.04', 'admin-D-vi', 'unknown username appended to select, 1 call', (await page.eval('hUser.value')) === 'not.in.list' && (await page.calls('getTransactions')).length === 1);
  harvest('2.04');
}

/* ---------------------------------------------------------------- 2.05 */
async function t205() {
  await openHistory();
  await page.eval(`window.__csv=[]; window.downloadCsv=function(n,l){window.__csv.push({n:n,l:l});};`);
  // empty table
  await page.type('#hSearch', 'zzzz-nothing'); await page.sleep(700); await page.idle();
  chk('2.05', 'admin-D-vi', 'precondition: table empty', (await page.eval('H_DATA.rows.length')) === 0);
  await page.eval(`document.getElementById('toastHost') && (document.getElementById('toastHost').innerHTML='')`);
  page.dialogs.length = 0;
  await page.click('button[onclick="exportHistCsv()"]');
  await page.sleep(150);
  const toasts = await page.toasts();
  chk('2.05', 'admin-D-vi', 'empty table: error toast, no CSV, no alert', toasts.some((x) => x.kind === 'err') && (await page.eval('window.__csv.length')) === 0 && page.dialogs.length === 0, JSON.stringify(toasts) + ' dialogs=' + JSON.stringify(page.dialogs));
  await shot('2.05-admin-D-emptytoast');
  // total > shown: fetches all first, uses H_FILTER (not edited inputs)
  await page.eval(`document.getElementById('hSearch').value=''; document.getElementById('hSearchClear').hidden=true; loadHistory();`);
  await page.idle();
  const st = await page.eval('({rows:H_DATA.rows.length,total:H_DATA.total})');
  await page.eval(`document.getElementById('hType').value='Import'`);   // changed input without reload: export must still use the loaded filter
  await page.resetCalls();
  await page.click('button[onclick="exportHistCsv()"]');
  await page.waitFor('js:window.__csv.length===1', 4000).catch(() => {});
  await page.idle();
  const calls = await page.calls('getTransactions');
  const csv = await page.eval('window.__csv[0]');
  chk('2.05', 'admin-D-vi', 'total>shown: one extra fetch with limit 100000 and the LOADED filter', calls.length === 1 && calls[0].args[0].limit === 100000 && calls[0].args[0].type === '', JSON.stringify(calls.map((c) => c.args[0])));
  chk('2.05', 'admin-D-vi', 'CSV contains all rows (header + total)', csv && csv.l.length === st.total + 1, `lines=${csv && csv.l.length} total=${st.total} shown=${st.rows} file=${csv && csv.n}`);
  // total <= shown: no extra fetch
  await page.eval(`document.getElementById('hType').value='Export'; document.getElementById('hFrom').value=daysAgo(1); loadHistory();`); await page.idle();
  const st2 = await page.eval('({rows:H_DATA.rows.length,total:H_DATA.total})');
  await page.resetCalls();
  await page.click('button[onclick="exportHistCsv()"]'); await page.sleep(200);
  chk('2.05', 'admin-D-vi', 'total<=shown: exports directly, no extra fetch', st2.total === st2.rows && (await page.calls('getTransactions')).length === 0 && (await page.eval('window.__csv.length')) === 2, JSON.stringify(st2));
  // failing server during full export
  await page.eval(`document.getElementById('hFrom').value=''; loadHistory();`); await page.idle();
  await page.eval(`__setServer({ __fail: { getTransactions: 'Mock: quota' } })`);
  await page.eval(`document.getElementById('toastHost').innerHTML=''`);
  const needsFull = await page.eval('H_DATA.total>H_DATA.rows.length');
  if (needsFull) {
    await page.click('button[onclick="exportHistCsv()"]'); await page.sleep(300);
    chk('2.05', 'admin-D-vi', 'server failure during full export -> error toast', (await page.toasts()).some((x) => x.kind === 'err'), JSON.stringify(await page.toasts()));
  }
  // EN toast
  harvest('2.05');
}

/* ---------------------------------------------------------------- 2.06 */
async function t206() {
  for (const lang of ['vi', 'en']) {
    await openHistory({ lang });
    const ctx = `admin-D-${lang}`;
    // pick Import row (in STOCK, no box detail) and Export row (qty>=2, in STOCK)
    const pick = await page.eval(`(()=>{ const ok=(r)=>STOCK.some(s=>s.code===r.code);
      const imp=H_DATA.rows.findIndex(r=>r.type==='Import'&&ok(r)&&!r.boxCount); const exp=H_DATA.rows.findIndex(r=>r.type==='Export'&&ok(r)&&r.qty>=2); return {imp,exp}; })()`);
    chk('2.06', ctx, 'precondition rows found', pick.imp >= 0 && pick.exp >= 0, JSON.stringify(pick));
    const openRow = async (i) => { await page.click(`#hTable tbody tr:nth-child(${i + 1}) button`); await page.waitFor('js:!document.getElementById("editCard").hidden'); await page.sleep(900); };
    await openRow(pick.imp);
    const card = await page.eval(`document.getElementById('editCard').innerText`);
    chk('2.06', ctx, 'no "Dòng Sheet / Sheet row" in the edit form', !/dòng sheet|sheet row|sheet line/i.test(card), card.replace(/\s+/g, ' ').slice(0, 200));
    const o = await page.eval(`({o:EDIT_ORIG, cur:Number(STOCK.find(s=>s.code===EDIT_ORIG.code).stock), qtyInput:document.getElementById('edQty').value})`);
    const stockTxt = async () => page.eval(`({hidden:document.getElementById('edStock').hidden, text:document.getElementById('edStock').textContent.replace(/\\s+/g,' ').trim(), cls:document.getElementById('edStock').className, color:getComputedStyle(document.getElementById('edStock')).color})`);
    let s = await stockTxt();
    const fmtn = (n) => page.eval(`num(${n})`);
    let curS = await fmtn(o.cur);
    chk('2.06', ctx, 'shows "Tồn hiện tại X → sau khi sửa X" on open (unchanged qty)', !s.hidden && s.text.includes(curS) && s.text.includes('→'), s.text);
    await page.type('#edQty', String(o.o.qty + 5));
    s = await stockTxt();
    let nextS = await fmtn(o.cur + 5);
    chk('2.06', ctx, `Import qty +5 -> after = cur+5 (${o.cur}->${o.cur + 5})`, !s.hidden && s.text.includes(curS) && s.text.includes(nextS) && s.cls.includes('info'), s.text + ' ' + s.cls);
    await shot(`2.06-admin-D-${lang}-preview`);
    // Export row
    await page.eval('closeEdit()');
    await openRow(pick.exp);
    const o2 = await page.eval(`({o:EDIT_ORIG, cur:Number(STOCK.find(s=>s.code===EDIT_ORIG.code).stock), row:EDIT_ROW, ex:EDIT_EXPECT})`);
    await page.type('#edQty', String(o2.o.qty - 1));
    s = await stockTxt();
    chk('2.06', ctx, `Export qty -1 -> stock goes UP by 1 (${o2.cur}->${o2.cur + 1})`, s.text.includes(await fmtn(o2.cur + 1)), s.text);
    // Y<0
    const big = o2.o.qty + Math.max(o2.cur, 0) + 3;
    await page.type('#edQty', String(big));
    s = await stockTxt();
    const neg = o2.cur - (big - o2.o.qty);
    chk('2.06', ctx, `Y<0 -> error style + NEGATIVE marker (->${neg})`, s.cls.includes('err') && /ÂM|NEGATIVE/.test(s.text) && s.text.includes((await fmtn(neg))), s.text + ' | ' + s.cls + ' | color ' + s.color);
    await shot(`2.06-admin-D-${lang}-negative`);
    // invalid qty hides
    await page.type('#edQty', '0');
    chk('2.06', ctx, 'qty 0 / empty -> line hidden', (await stockTxt()).hidden);
    // Save -> dialog
    const saveQty = o2.o.qty - 1;
    await page.type('#edQty', String(saveQty));
    await page.resetCalls();
    await page.click('#btnEdSave');
    await page.waitFor('#uiDlg');
    const dlg = await page.eval(`document.getElementById('uiDlgBody').textContent`);
    chk('2.06', ctx, 'Save opens uiDialog including the stock effect', /Tồn hiện tại|Stock now/.test(dlg) && dlg.includes('→') && (await page.calls('editTransaction')).length === 0, dlg.replace(/\s+/g, ' '));
    await shot(`2.06-admin-D-${lang}-confirm`);
    await page.click('#uiDlgNo'); await page.sleep(100);
    chk('2.06', ctx, 'Cancel in dialog -> no editTransaction', (await page.calls('editTransaction')).length === 0 && (await page.eval('EDIT_ROW')) === o2.row);
    await page.click('#btnEdSave'); await page.waitFor('#uiDlg'); await page.click('#uiDlgOk'); await page.idle();
    const ec = await page.calls('editTransaction');
    const args = ec.length ? ec[0].args : [];
    chk('2.06', ctx, 'OK -> editTransaction(rowIndex, data, expect) with right params', ec.length === 1 && args[0] === o2.row && String(args[1].qty) === String(saveQty) && args[2] && args[2].code === o2.ex.code && args[2].no === o2.ex.no, JSON.stringify(args));
    await page.waitFor('js:!document.getElementById("edMsg").hidden', 3000).catch(() => {});
    chk('2.06', ctx, 'success message shown', /ok/.test(await page.eval('document.getElementById("edMsg").className')), await page.text('#edMsg'));
    await page.sleep(1100);
    chk('2.06', ctx, 'edit card closes after success', await page.eval('document.getElementById("editCard").hidden'));
    // code not in STOCK -> hidden
    await page.idle();
    const idx = await page.eval(`H_DATA.rows.findIndex(r=>STOCK.some(s=>s.code===r.code))`);
    await openRow(idx);
    await page.eval(`STOCK = STOCK.filter(s=>s.code!==EDIT_ORIG.code)`);
    await page.type('#edQty', '3');
    chk('2.06', ctx, 'code not in STOCK -> line hidden', (await stockTxt()).hidden);
    harvest('2.06-' + lang);
  }
}

/* ---------------------------------------------------------------- 2.07 */
async function t207() {
  for (const lang of ['vi', 'en']) {
    const ctx = `staff-D-${lang}`;
    await page.open({ role: 'staff', lang, viewport: 'D' });
    page.dialogs.length = 0;
    await page.resetCalls();
    await page.eval('goto("history")');
    await page.sleep(150);
    const toasts = await page.toasts();
    const want = lang === 'vi' ? /chỉ dành cho quản trị viên/ : /administrators only/;
    chk('2.07', ctx, 'goto("history") -> admin-only error toast', toasts.some((x) => x.kind === 'err' && want.test(x.text)), JSON.stringify(toasts));
    chk('2.07', ctx, 'page unchanged (home), no alert, no getTransactions', (await page.activePage()) === 'page-home' && page.dialogs.length === 0 && (await page.calls('getTransactions')).length === 0, `${await page.activePage()} dialogs=${page.dialogs.length}`);
    await page.eval('historyShowUser("x")'); await page.sleep(100);
    chk('2.07', ctx, 'historyShowUser also refused', (await page.activePage()) === 'page-home' && (await page.calls('getTransactions')).length === 0);
    await page.eval('goto("kho")'); await page.sleep(100);
    const nav = await page.eval(`({subHidden:document.getElementById('subnav').hidden, subs:[...document.querySelectorAll('#subnav .sub-item')].map(x=>x.textContent.trim()),
      histLinks:[...document.querySelectorAll('[data-page="history"], .sub-item')].filter(e=>e.offsetParent && /Lịch sử|History/.test(e.textContent)).length,
      topnav:[...document.querySelectorAll('.topnav .nav-item')].filter(e=>e.offsetParent).map(e=>e.getAttribute('data-page'))})`);
    chk('2.07', ctx, 'staff menu has no History entry', nav.histLinks === 0 && !nav.subs.some((x) => /Lịch sử|History|Kiểm kê|Stocktake/.test(x)), JSON.stringify(nav));
    if (lang === 'vi') await shot('2.07-staff-D-kho');
    harvest('2.07-' + lang);
  }
}

/* ---------------------------------------------------------------- 2.08 */
async function t208() {
  for (const lang of ['vi', 'en']) {
    const ctx = `staff-D-${lang}`;
    await page.open({ role: 'staff', lang, viewport: 'D' });
    // reach through the account menu like a user
    await page.click('.user-menu');
    await page.click(`.ub-links a[onclick="goto('me')"]`);
    await page.waitFor('js:document.querySelectorAll("#meKpis .kpi").length===3 && document.querySelectorAll("#myReqTable tbody tr").length>0');
    await page.idle();
    const lay = await page.eval(`(()=>{ const r=(e)=>e.getBoundingClientRect().top;
      const k=document.getElementById('meKpis'), t=document.getElementById('myReqTable'), p=document.querySelector('[data-i18n="me.profile"]').closest('.card');
      return {k:r(k), t:r(t), p:r(p), foots:[...document.querySelectorAll('#meKpis .kpi-foot')].map(x=>x.textContent.trim()),
        labels:[...document.querySelectorAll('#meKpis .kpi-label')].map(x=>x.textContent.trim()),
        values:[...document.querySelectorAll('#meKpis .kpi-value')].map(x=>x.textContent.trim()), classes:[...document.querySelectorAll('#meKpis .kpi')].map(x=>x.className)}; })()`);
    chk('2.08', ctx, 'order: KPIs -> table -> profile card', lay.k < lay.t && lay.t < lay.p, JSON.stringify({ k: lay.k, t: lay.t, p: lay.p }));
    const expF = lang === 'vi' ? ['chờ quản trị viên xử lý', 'đã ghi vào sổ kho', 'xem lý do ở bảng bên dưới'] : ['waiting for an admin', 'posted to the ledger', 'see the reason in the table below'];
    chk('2.08', ctx, '3 KPI have 3 different foot lines (expected texts)', new Set(lay.foots).size === 3 && JSON.stringify(lay.foots) === JSON.stringify(expF), JSON.stringify(lay.foots));
    // colours
    const col = await page.eval(`(()=>{ const rgb=(s)=>s.match(/\\d+(\\.\\d+)?/g).slice(0,3).map(Number);
      const hue=(c)=>{ let [r,g,b]=c.map(x=>x/255); const mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn; if(!d) return -1; let h = mx===r? ((g-b)/d)%6 : mx===g? (b-r)/d+2 : (r-g)/d+4; h*=60; return Math.round(h<0?h+360:h); };
      const k=document.querySelector('#meKpis .kpi'); const v=k.querySelector('.kpi-value'), hd=k.querySelector('.kpi-head');
      const amber=getComputedStyle(document.documentElement).getPropertyValue('--amber').trim();
      const tmp=document.createElement('i'); tmp.style.color=amber; document.body.appendChild(tmp); const amberRgb=getComputedStyle(tmp).color; tmp.remove();
      const vc=getComputedStyle(v).color, hc=getComputedStyle(hd).color;
      return {cls:k.className, valueColor:vc, headColor:hc, amber, amberRgb, hueValue:hue(rgb(vc)), hueHead:hue(rgb(hc)), icoColor:getComputedStyle(hd.querySelector('svg')).color,
        borderTop:getComputedStyle(k).borderTopColor, bg:getComputedStyle(k).backgroundColor, boxShadow:getComputedStyle(k).boxShadow.slice(0,80), pending:Number(v.textContent)}; })()`);
    chk('2.08', ctx, 'pending KPI is amber (class amber, value colour == --amber, hue 25-50, not purple)', col.cls.includes('amber') && col.valueColor === col.amberRgb && col.hueValue >= 25 && col.hueValue <= 50, JSON.stringify(col));
    // clicking KPI filters tabs
    const tabs = [['PENDING', 'mrTabPen', 1], ['APPROVED', 'mrTabApp', 2], ['REJECTED', 'mrTabRej', 3]];
    for (const [status, tabId, nth] of tabs) {
      await page.click(`#meKpis .kpi:nth-child(${nth})`);
      await page.sleep(80);
      const r = await page.eval(`({on:document.getElementById('${tabId}').classList.contains('on'), onCount:document.querySelectorAll('#page-me .tabs .tab.on').length, tab:MY_REQ_TAB, shown:MY_REQ.rows.filter(r=>r.status===MY_REQ_TAB).length, trs:[...document.querySelectorAll('#myReqTable tbody tr:not(:has(td.empty))')].length, badges:[...document.querySelectorAll('#myReqTable tbody tr td:first-child .badge')].map(b=>b.className)})`);
      const clsOk = status === 'PENDING' ? 'pending' : status === 'APPROVED' ? 'ok' : 'danger';
      chk('2.08', ctx, `click KPI ${nth} -> tab ${status} on, table filtered`, r.on && r.onCount === 1 && r.tab === status && r.trs === r.shown && r.badges.every((b) => b.includes(clsOk)), JSON.stringify(r));
    }
    await page.click('#mrTabAll');
    if (lang === 'vi') { await shot('2.08-staff-D'); }
    harvest('2.08-' + lang);
  }
}

/* ---------------------------------------------------------------- 2.09 */
const activeId = () => page.activePage();
async function waitActive(id, ms = 3000) { await page.waitFor(`js:document.querySelector('.page.active') && document.querySelector('.page.active').id==='page-${id}'`, ms); }
async function t209() {
  /* ---- fake google.script.history ---- */
  for (const role of ['admin', 'staff']) {
    const ctx = `${role}-D-vi history=fake`;
    await page.open({ role, lang: 'vi', viewport: 'D' });
    const n0 = await page.eval('__history.pushes.length');
    chk('2.09', ctx, 'boot on Home pushes nothing (clean URL)', n0 === 0 && (await page.eval('__history.replaces.length')) === 0, `pushes=${n0}`);
    await page.eval('goto("kho")');
    let h = await page.eval('({p:__history.pushes.slice(), n:__history.pushes.length})');
    chk('2.09', ctx, 'goto("kho") -> history.push({page:"kho"}, {}, "kho")', h.n === 1 && h.p[0].hash === 'kho' && h.p[0].state.page === 'kho', JSON.stringify(h.p));
    await page.eval('goto("kho")');
    chk('2.09', ctx, 'same page again -> no duplicate push', (await page.eval('__history.pushes.length')) === 1);
    const seq = role === 'admin' ? ['report', 'history', 'me'] : ['report', 'me'];
    for (const p of seq) await page.eval(`goto("${p}")`);
    h = await page.eval('__history.pushes.map(x=>x.hash)');
    chk('2.09', ctx, 'each goto pushes its hash', JSON.stringify(h) === JSON.stringify(['kho', ...seq]), JSON.stringify(h));
    await page.eval('goto("home")');
    chk('2.09', ctx, 'goto("home") pushes empty hash', (await page.eval('__history.pushes.at(-1).hash')) === '');
    // Back simulation
    const n1 = await page.eval('__history.pushes.length');
    await page.eval('__history.fire("me")'); await waitActive('me');
    await page.eval('__history.fire("/report")'); await waitActive('report');
    await page.eval('__history.fire("#/kho")'); await waitActive('kho');
    await page.eval('__history.fire("")'); await waitActive('home');
    chk('2.09', ctx, 'Back (change handler) navigates me/report/kho/home without pushing', (await page.eval('__history.pushes.length')) === n1, `pushes ${n1} -> ${await page.eval('__history.pushes.length')}`);
    chk('2.09', ctx, 'tab highlight follows Back', await page.eval(`document.querySelector('.topnav .nav-item.active').getAttribute('data-page')`) === 'home');
    // forbidden pages from hash
    await page.eval('goto("kho")'); await waitActive('kho');
    page.dialogs.length = 0;
    const tBefore = (await page.toasts()).length;
    for (const f of ['history', 'admin', 'stocktake', 'sku', 'ticket']) {
      await page.eval(`__history.fire("${f}")`); await page.sleep(60);
      const act = await activeId();
      const exp = role === 'admin' ? `page-${f}` : 'page-kho';
      chk('2.09', ctx, `hash "${f}" -> ${role === 'admin' ? 'opens' : 'NOT restored for staff (stays on current)'}`, act === exp, `active=${act}`);
      if (role === 'admin') { await page.eval('__history.fire("kho")'); await waitActive('kho'); }
    }
    if (role === 'staff') chk('2.09', ctx, 'forbidden hash is silent (no alert; toasts)', page.dialogs.length === 0, `new toasts: ${(await page.toasts()).length - tBefore}`);
    // unknown hash
    await page.eval('__history.fire("bogus")'); await page.sleep(80);
    const afterBogus = await activeId();
    chk('2.09', ctx, 'unknown hash mid-session -> Home (checklist) [observed: ' + afterBogus + ']', afterBogus === 'page-home', `active=${afterBogus}`);
    harvest('2.09-fake-' + role);
  }
  /* boot with a hash (fake history): forbidden / unknown / allowed */
  const bootHash = (hash) => `(function(server,fx){ var _h; Object.defineProperty(window,'__history',{configurable:true,get:function(){return _h;},set:function(v){ _h=v; v.hash=${JSON.stringify(hash)}; }}); })`;
  const cases = [['admin', 'history', 'page-history'], ['staff', 'history', 'page-home'], ['staff', 'kho', 'page-kho'], ['admin', 'bogus', 'page-home'], ['staff', 'admin', 'page-home'], ['admin', '/stocktake', 'page-stocktake']];
  for (const [role, hash, exp] of cases) {
    await page.open({ role, lang: 'vi', viewport: 'D', init: eval(bootHash(hash)) });
    await page.sleep(100);
    const act = await activeId();
    chk('2.09', `${role}-D-vi fake boot hash="${hash}"`, `restored page = ${exp}`, act === exp, `active=${act}`);
  }
  harvest('2.09-bootfake');

  /* ---- google.script.history present but throwing everywhere ---- */
  const broken = `(function(server,fx){ var _g; Object.defineProperty(window,'google',{configurable:true,get:function(){return _g;},set:function(v){
      var boom=function(){throw new Error('boom');}; v.script.history={push:boom,replace:boom,setChangeHandler:boom}; v.script.url={getLocation:boom}; _g=v; }}); })`;
  await page.open({ role: 'admin', lang: 'vi', viewport: 'D', init: eval(broken) });
  await page.eval('goto("kho")'); await page.eval('goto("history")'); await page.sleep(100);
  chk('2.09', 'admin-D-vi history API throws', 'goto still works, no uncaught exceptions', (await activeId()) === 'page-history' && harvest('2.09-broken').length === 0, `active=${await activeId()}`);
  /* ---- google.script.history exists but url.getLocation missing / history lacks push ---- */
  const partial = `(function(server,fx){ var _g; Object.defineProperty(window,'google',{configurable:true,get:function(){return _g;},set:function(v){ v.script.history={}; delete v.script.url; _g=v; }}); })`;
  await page.open({ role: 'admin', lang: 'vi', viewport: 'D', init: eval(partial) });
  await page.eval('goto("kho")'); await page.sleep(80);
  const pl = await page.eval('({p:location.hash, len:history.length})');
  chk('2.09', 'admin-D-vi history={} (no push)', 'no exception; page switches', (await activeId()) === 'page-kho' && harvest('2.09-partial').length === 0, JSON.stringify(pl));

  /* ---- history=none: pushState fallback in the page ---- */
  for (const role of ['admin', 'staff']) {
    const ctx = `${role}-D-vi history=none`;
    await page.open({ role, lang: 'vi', viewport: 'D', noHistory: true });
    chk('2.09', ctx, 'google.script.history / url really absent', await page.eval('!(google.script.history||google.script.url)'));
    const len0 = await page.eval('history.length');
    await page.eval('goto("kho")');
    chk('2.09', ctx, 'goto("kho") -> location.hash "#/kho" + history entry added', (await page.eval('location.hash')) === '#/kho' && (await page.eval('history.length')) === len0 + 1, `hash=${await page.eval('location.hash')} len ${len0}->${await page.eval('history.length')}`);
    const seq = role === 'admin' ? ['report', 'history', 'stocktake'] : ['report', 'me'];
    for (const p of seq) await page.eval(`goto("${p}")`);
    chk('2.09', ctx, 'hash follows last page', (await page.eval('location.hash')) === '#/' + seq.at(-1));
    const len1 = await page.eval('history.length');
    const back = [...seq.slice(0, -1).reverse(), 'kho'];
    for (const p of back) { await page.eval('history.back()'); await waitActive(p, 4000); }
    await page.eval('history.back()'); await waitActive('home', 4000);
    chk('2.09', ctx, `Back x${back.length + 1} walks the chain ${back.join('>')}>home inside the app`, (await page.eval('history.length')) === len1 && (await page.eval('location.hash')) === '', `len ${len1}->${await page.eval('history.length')} hash="${await page.eval('location.hash')}"`);
    await page.eval('history.forward()'); await waitActive('kho', 3000);
    chk('2.09', ctx, 'Forward works and does not push', (await page.eval('history.length')) === len1);
    // manual hash change
    const target = role === 'admin' ? 'history' : 'report';
    await page.eval(`location.hash='#/${target}'`); await waitActive(target, 3000);
    chk('2.09', ctx, 'manual hash edit opens the page', true);
    // forbidden hash
    await page.eval(`location.hash='#/${role === 'admin' ? 'sku' : 'history'}'`); await page.sleep(100);
    const act = await activeId();
    chk('2.09', ctx, role === 'admin' ? 'admin: #/sku opens' : 'staff: #/history is NOT opened', role === 'admin' ? act === 'page-sku' : act !== 'page-history', `active=${act}`);
    await page.eval(`location.hash='#/bogus'`); await page.sleep(100);
    chk('2.09', ctx, 'unknown hash #/bogus -> Home (checklist) [observed ' + (await activeId()) + ']', (await activeId()) === 'page-home', `active=${await activeId()}`);
    // reload with hash (F5 equivalent): forbidden restoration
    await page.eval(`history.replaceState(null,'','#/history')`);
    await page.send('Page.reload', {});
    await page.sleep(900);
    await page.waitFor(() => { const l = document.getElementById('landing'); return !l || l.hidden || l.classList.contains('gone'); }, 15000);
    await page.sleep(150);
    chk('2.09', ctx, 'F5 on #/history: ' + (role === 'admin' ? 'restores History' : 'staff lands on Home'), (await activeId()) === (role === 'admin' ? 'page-history' : 'page-home'), `active=${await activeId()}`);
    harvest('2.09-none-' + role);
  }
  /* pushState throws (e.g. sandbox) */
  await page.open({ role: 'admin', lang: 'vi', viewport: 'D', noHistory: true });
  await page.eval(`History.prototype.pushState=function(){throw new DOMException('denied','SecurityError');}`);
  await page.eval('goto("kho")'); await page.eval('goto("report")'); await page.sleep(80);
  chk('2.09', 'admin-D-vi history=none, pushState throws', 'navigation still works, no exception', (await activeId()) === 'page-report' && harvest('2.09-pushthrow').length === 0);

  /* ---- real iframe (sandboxed, like Apps Script) ---- */
  try { await iframeRouting(); } catch (e) { blocked('2.09', 'iframe', 'sandboxed-iframe routing', 'harness could not drive the iframe: ' + e.message); }
}

async function iframeRouting() {
  const dist = pathToFileURL(path.join(HERE, 'dist', 'index.html')).href + '?role=admin&lang=vi&history=none';
  const wrap = path.join(HERE, 'results', 'g2-iframe-wrap.html');
  fs.writeFileSync(wrap, `<!doctype html><meta charset=utf-8><body style="margin:0"><iframe id=app style="width:100vw;height:100vh;border:0" sandbox="allow-downloads allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation" src="${dist}"></iframe>`);
  await page.send('Page.navigate', { url: pathToFileURL(wrap).href });
  await sleep(2500);
  const tree = await page.send('Page.getFrameTree', {});
  const child = (tree.frameTree.childFrames || [])[0];
  if (!child) throw new Error('no child frame');
  const w = await page.send('Page.createIsolatedWorld', { frameId: child.frame.id, worldName: 'g2', grantUniveralAccess: true });
  const ev = async (expr) => {
    const r = await page.send('Runtime.evaluate', { contextId: w.executionContextId, expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description));
    return r.result.value;
  };
  const act = () => ev(`(document.querySelector('.page.active')||{}).id`);
  for (let i = 0; i < 30 && (await ev(`!!document.getElementById('landing') && !document.getElementById('landing').hidden`)); i++) await sleep(300);
  const topLen0 = await page.eval('history.length');
  const nav = (p) => ev(`document.querySelector('.topnav .nav-item[data-page="${p}"]').click()`);
  chk('2.09', 'iframe(sandboxed, history=none)', 'app booted inside iframe', (await act()) === 'page-home', await act());
  await nav('kho'); await sleep(150);
  await nav('report'); await sleep(150);
  const len1 = await page.eval('history.length');
  chk('2.09', 'iframe(sandboxed, history=none)', 'pushState inside iframe adds joint-history entries', len1 === topLen0 + 2, `top history.length ${topLen0}->${len1}; active=${await act()}`);
  await page.eval('history.back()'); await sleep(300);
  const a1 = await act();
  await page.eval('history.back()'); await sleep(300);
  const a2 = await act();
  chk('2.09', 'iframe(sandboxed, history=none)', 'browser Back inside iframe: report > kho > home, app not exited', a1 === 'page-kho' && a2 === 'page-home', `${a1}, ${a2}; top url=${(await page.eval('location.href')).slice(-30)}`);
  harvest('2.09-iframe');
}

/* ---------------------------------------------------------------- 2.10 */
async function t210() {
  // static
  const root = path.resolve(HERE, '..', 'client');
  const hits = [];
  (function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else { const s = fs.readFileSync(p, 'utf8'); s.split('\n').forEach((l, i) => { if (/updateCrumb|sbChip/.test(l)) hits.push(`${path.relative(root, p)}:${i + 1}`); }); } } })(root);
  chk('2.10', 'static', 'no updateCrumb/sbChip anywhere in client/', hits.length === 0, hits.join(', '));
  for (const [role, lang] of [['admin', 'vi'], ['admin', 'en'], ['staff', 'vi']]) {
    const ctx = `${role}-D-${lang}`;
    await page.open({ role, lang, viewport: 'D' });
    await page.idle();
    const e0 = harvest('2.10-boot-' + ctx);
    chk('2.10', ctx, 'console clean after boot', e0.length === 0, e0.map((x) => x.text.split('\n')[0]).join(' | '));
    const pages = ['home', 'kho', 'history', 'stocktake', 'admin', 'sku', 'ticket', 'report', 'me'];
    const bad = [];
    for (const p of pages) {
      await page.eval(`goto("${p}")`);
      await page.sleep(200); await page.idle();
      const e = harvest(`2.10-${ctx}-${p}`);
      if (role === 'admin' || ['home', 'kho', 'report', 'me'].includes(p)) {
        if ((await activeId()) !== `page-${p}`) bad.push(`${p}: active=${await activeId()}`);
      }
      if (e.length) bad.push(`${p}: ${e.map((x) => x.text.split('\n')[0]).join(' | ')}`);
    }
    chk('2.10', ctx, 'all 9 pages open (staff: allowed ones) with no console errors/exceptions', bad.length === 0, bad.join(' ; '));
    const fns = await page.eval(`({crumb: typeof updateCrumb, chip: typeof sbChip})`);
    chk('2.10', ctx, 'updateCrumb / sbChip not defined', fns.crumb === 'undefined' && fns.chip === 'undefined', JSON.stringify(fns));
    // language toggle + back to home re-renders
    await page.eval('toggleLang()'); await page.sleep(100);
    const e2 = harvest('2.10-toggle-' + ctx);
    chk('2.10', ctx, 'toggleLang clean', e2.length === 0, e2.map((x) => x.text.split('\n')[0]).join(' | '));
  }
}

/* ---------------------------------------------------------------- 2.11 */
async function openCounting(opts = {}) {
  await page.open({ role: 'admin', lang: 'vi', viewport: 'D', ...opts });
  await page.eval('goto("stocktake")');
  await page.waitFor('#stkListTable tbody tr[data-n]');
  await page.idle();
  const n = await page.eval(`STK_LIST.findIndex(s=>s.status==='COUNTING')`);
  if (n < 0) throw new Error('no COUNTING session in fixtures');
  await page.click(`#stkListTable tr[data-n="${n}"]`);
  await page.waitFor('#stkTable input[data-act="qty"]');
  await page.idle();
}
async function t211() {
  const dlgState = () => page.eval(`({open:!!document.getElementById('uiDlg'), title:(document.querySelector('#uiDlgTitle')||{}).textContent, ok:(document.getElementById('uiDlgOk')||{}).textContent, no:(document.getElementById('uiDlgNo')||{}).textContent})`);
  /* A. tab click */
  await openCounting();
  await page.type('#stkTable tbody tr:nth-child(2) input[data-act="qty"]', '7');
  const dirtyBefore = await page.eval('Object.keys(STK_DIRTY).length');
  chk('2.11', 'admin-D-vi', 'precondition: unsaved count entered', dirtyBefore === 1, `dirty=${dirtyBefore}`);
  await page.click('.topnav .nav-item[data-page="kho"]');
  await page.waitFor('#uiDlg');
  let d = await dlgState();
  chk('2.11', 'admin-D-vi', 'clicking another tab -> uiDialog, page stays on Kiểm kê', d.open && (await activeId()) === 'page-stocktake', JSON.stringify(d));
  await shot('2.11-admin-D-dialog');
  await page.click('#uiDlgNo'); await page.sleep(100);
  const stay = await page.eval(`({page:PAGE, dirty:Object.keys(STK_DIRTY).length, val:document.querySelector('#stkTable tbody tr:nth-child(2) input[data-act="qty"]').value, dlg:!!document.getElementById('uiDlg')})`);
  chk('2.11', 'admin-D-vi', 'Huỷ -> stay, count still in the input', stay.page === 'stocktake' && stay.dirty === 1 && stay.val === '7' && !stay.dlg, JSON.stringify(stay));
  await page.click('.topnav .nav-item[data-page="kho"]'); await page.waitFor('#uiDlg'); await page.press('Escape'); await page.sleep(100);
  chk('2.11', 'admin-D-vi', 'Escape closes dialog and stays', !(await page.exists('#uiDlg')) && (await activeId()) === 'page-stocktake');
  await page.click('.topnav .nav-item[data-page="kho"]'); await page.waitFor('#uiDlg'); await page.click('#uiDlgOk'); await page.sleep(150);
  const gone = await page.eval(`({page:PAGE, dirty:Object.keys(STK_DIRTY).length, cur:STK_CUR})`);
  chk('2.11', 'admin-D-vi', '"Bỏ thay đổi" -> navigates to Kho, unsaved count dropped', (await activeId()) === 'page-kho' && gone.dirty === 0 && gone.cur === null, JSON.stringify(gone));
  await page.eval('goto("stocktake")'); await page.waitFor('#stkListTable tbody tr[data-n]');
  const n = await page.eval(`STK_LIST.findIndex(s=>s.status==='COUNTING')`);
  await page.click(`#stkListTable tr[data-n="${n}"]`); await page.waitFor('#stkTable input[data-act="qty"]'); await page.idle();
  const v = await page.eval(`document.querySelector('#stkTable tbody tr:nth-child(2) input[data-act="qty"]').value`);
  const saved = (await page.calls('stocktakeSaveCounts')).length;
  chk('2.11', 'admin-D-vi', 'reopening: discarded value is gone and was never saved', v !== '7' && saved === 0, `input="${v}" saveCalls=${saved}`);
  // no dialog when nothing unsaved
  await page.click('.topnav .nav-item[data-page="kho"]'); await page.sleep(150);
  chk('2.11', 'admin-D-vi', 'no unsaved counts -> leaves without a dialog', (await activeId()) === 'page-kho' && !(await page.exists('#uiDlg')));
  harvest('2.11-tab');

  /* B. Back: fake history */
  await openCounting();
  await page.type('#stkTable tbody tr:nth-child(2) input[data-act="qty"]', '5');
  await page.eval('goto("stocktake")');   // noop: same page
  const pushes0 = await page.eval('__history.pushes.map(x=>x.hash)');
  await page.eval('__history.fire("")');   // Back to Home
  await page.waitFor('#uiDlg', 2000).catch(() => {});
  d = await dlgState();
  const pushes1 = await page.eval('__history.pushes.map(x=>x.hash)');
  chk('2.11', 'admin-D-vi history=fake', 'Back (-> Home) is blocked: dialog + still on Kiểm kê', d.open && (await activeId()) === 'page-stocktake', JSON.stringify(d));
  chk('2.11', 'admin-D-vi history=fake', 'blocked Back re-pushes the stocktake hash (URL restored)', pushes1.length === pushes0.length + 1 && pushes1.at(-1) === 'stocktake', `${JSON.stringify(pushes0)} -> ${JSON.stringify(pushes1)}`);
  await page.click('#uiDlgNo'); await page.sleep(100);
  chk('2.11', 'admin-D-vi history=fake', 'Huỷ -> stay with count kept', (await activeId()) === 'page-stocktake' && (await page.eval('Object.keys(STK_DIRTY).length')) === 1);
  await page.eval('__history.fire("")'); await page.waitFor('#uiDlg'); await page.click('#uiDlgOk'); await page.sleep(200);
  const bk = await page.eval(`({page:PAGE, dirty:Object.keys(STK_DIRTY).length})`);
  chk('2.11', 'admin-D-vi history=fake', 'discard -> Home, count dropped', (await activeId()) === 'page-home' && bk.dirty === 0, JSON.stringify(bk) + ' pushes=' + JSON.stringify(await page.eval('__history.pushes.map(x=>x.hash)')));
  harvest('2.11-fakeback');

  /* C. Back: history=none (real popstate) */
  await openCounting({ noHistory: true });
  await page.type('#stkTable tbody tr:nth-child(2) input[data-act="qty"]', '5');
  await page.eval('history.back()');
  await page.waitFor('#uiDlg', 3000).catch(() => {});
  d = await dlgState();
  chk('2.11', 'admin-D-vi history=none', 'real Back is blocked: dialog + still on Kiểm kê', d.open && (await activeId()) === 'page-stocktake', JSON.stringify(d) + ' hash=' + (await page.eval('location.hash')));
  chk('2.11', 'admin-D-vi history=none', 'URL hash restored to #/stocktake after blocked Back', (await page.eval('location.hash')) === '#/stocktake', await page.eval('location.hash'));
  await page.click('#uiDlgNo'); await page.sleep(100);
  chk('2.11', 'admin-D-vi history=none', 'Huỷ -> stay, count kept', (await activeId()) === 'page-stocktake' && (await page.eval('Object.keys(STK_DIRTY).length')) === 1);
  await page.eval('history.back()'); await page.waitFor('#uiDlg', 3000); await page.click('#uiDlgOk'); await page.sleep(200);
  chk('2.11', 'admin-D-vi history=none', 'discard -> leaves stocktake, count dropped', (await activeId()) !== 'page-stocktake' && (await page.eval('Object.keys(STK_DIRTY).length')) === 0, `active=${await activeId()} hash=${await page.eval('location.hash')}`);
  harvest('2.11-nonback');

  /* D. English wording + sub-nav link inside Kho tab group (History sub tab) */
  await openCounting({ lang: 'en' });
  await page.type('#stkTable tbody tr:nth-child(2) input[data-act="qty"]', '9');
  await page.click('#subnav .sub-item:nth-child(3)');   // Lịch sử / History
  await page.waitFor('#uiDlg');
  d = await dlgState();
  chk('2.11', 'admin-D-en', 'sub-tab (History) click also guarded; dialog EN', d.open && /Unsaved counts/.test(d.title) && (await activeId()) === 'page-stocktake', JSON.stringify(d));
  await page.click('#uiDlgOk'); await page.sleep(150);
  chk('2.11', 'admin-D-en', 'discard -> History opens', (await activeId()) === 'page-history');
  harvest('2.11-en');
}

/* ---------------------------------------------------------------- 2.12 */
const CARD_PROBE_SRC = `(tableSel) => {
  const tb = document.querySelector(tableSel);
  const ths = [...tb.tHead.rows[0].cells].map((c) => c.textContent.replace(/\\s+/g,' ').trim());
  const trs = [...tb.tBodies[0].rows].filter((r) => !r.querySelector("td.empty")).slice(0, 20);
  const out = { thead: getComputedStyle(tb.tHead).display, tableDisplay: getComputedStyle(tb).display, rows: trs.length, ths,
    trDisplay: [...new Set(trs.map((r) => getComputedStyle(r).display))], unlabeled: [], mismatched: [], btns: [], docOverflow: document.documentElement.scrollWidth - window.innerWidth };
  trs.forEach((r, ri) => [...r.cells].forEach((c, ci) => {
    if (getComputedStyle(c).display === 'none') return;
    const txt = c.textContent.trim();
    const label = ths[ci];
    const before = getComputedStyle(c, '::before').content;
    const hasBtnOnly = !!c.querySelector(':scope > .btn, :scope > .cell-actions') && !c.classList.contains('has-text');   /* td.has-text = text + buttons: keeps its label, buttons wrap below the text (Theme.html) */
    if (label && txt && !hasBtnOnly) {
      if (before === 'none' || before === 'normal' || before === '""') out.unlabeled.push('r' + ri + 'c' + ci + ' (' + label + ')');
      else if (before.replace(/^"|"$/g, '') !== label) out.mismatched.push('r' + ri + 'c' + ci + ' want "' + label + '" got ' + before);
    }
    if (label && txt && hasBtnOnly && c.querySelector(':scope > :not(.btn):not(.cell-actions)')) out.unlabeled.push('r' + ri + 'c' + ci + ' (' + label + ') has buttons: label hidden (before=' + before + ')');
  }));
  trs.forEach((r, ri) => r.querySelectorAll('button.btn').forEach((b) => {
    b.scrollIntoView({block:'center'}); const rc = b.getBoundingClientRect(); const x = rc.left + rc.width / 2, y = rc.top + rc.height / 2; const top = document.elementFromPoint(x, y);
    out.btns.push({ row: ri, text: b.textContent.trim(), w: Math.round(rc.width), h: Math.round(rc.height * 10) / 10, hit: !!top && (top === b || b.contains(top)), offscreen: rc.right > window.innerWidth + 1 });
  }));
  return out; }`;
const CARD_PROBE = eval(CARD_PROBE_SRC);
async function t212() {
  /* admin: history */
  await page.open({ role: 'admin', lang: 'vi', viewport: 'M' });
  await page.eval('goto("history")');
  await page.waitFor('js:document.querySelectorAll("#hTable tbody tr").length>1');
  await page.idle(); await page.sleep(300);
  let r = await page.eval(CARD_PROBE, '#hTable');
  const ctx1 = 'admin-M-vi history';
  chk('2.12', ctx1, 'card layout (thead hidden, rows display:block, no horizontal overflow)', r.thead === 'none' && r.trDisplay.length === 1 && r.trDisplay[0] === 'block' && r.docOverflow <= 0, JSON.stringify({ thead: r.thead, tr: r.trDisplay, overflow: r.docOverflow }));
  chk('2.12', ctx1, 'every non-empty cell has its column header as ::before label', r.unlabeled.length === 0 && r.mismatched.length === 0, JSON.stringify({ unl: r.unlabeled.slice(0, 5), mis: r.mismatched.slice(0, 5), ths: r.ths }));
  const hb = r.btns;
  chk('2.12', ctx1, 'Sửa buttons >=40px tall and clickable', hb.length > 0 && hb.every((b) => b.h >= 40 && b.w >= 40 && b.hit && !b.offscreen), JSON.stringify(hb.slice(0, 3)));
  await page.eval("document.getElementById('hTable').scrollIntoView()"); await page.sleep(200); await shot('2.12-admin-M-history');
  // real tap on the first Sửa
  await page.click('#hTable tbody tr:nth-child(1) button');
  await page.waitFor('js:!document.getElementById("editCard").hidden');
  chk('2.12', ctx1, 'tap on Sửa opens edit form', true);
  await shot('2.12-admin-M-edit');
  // load more button tap target
  const mb = await page.eval(`(()=>{const b=document.querySelector('#hInfo button[onclick="loadMoreHistory()"]'); if(!b) return null; const r=b.getBoundingClientRect(); return {h:r.height,w:r.width}})()`);
  chk('2.12', ctx1, '(extra) "Tải thêm" button tap target >=40px', mb && mb.h >= 40, JSON.stringify(mb));
  harvest('2.12-hist');

  /* My requests: staff + admin(synthetic pending rows) */
  for (const role of ['staff', 'admin']) {
    const ctx = `${role}-M-vi my-requests`;
    await page.open({ role, lang: 'vi', viewport: 'M' });
    if (role === 'admin') {
      await page.eval(`(()=>{ const reqs=__fx.data.requests.filter(r=>r.status);
        __setServer({ getMyRequests:()=>({ok:true,total:reqs.length,summary:{pending:reqs.filter(r=>r.status==='PENDING').length,approved:reqs.filter(r=>r.status==='APPROVED').length,rejected:reqs.filter(r=>r.status==='REJECTED').length},
          rows:reqs.map(r=>({requestId:r.requestId,submittedAt:r.submittedAt,transactionDate:r.date,type:r.type,name:r.name,variant:r.variant,quantity:String(r.quantity),unit:r.unit,boxCount:String(r.boxCount||0),location:r.location,assetCode:r.assetCode,status:r.status,decisionBy:r.decisionBy,decisionTime:r.decisionTime,decisionNote:r.decisionNote}))}) }); })()`);
    }
    await page.eval('goto("me")');
    await page.waitFor('js:document.querySelectorAll("#myReqTable tbody tr").length>1');
    await page.idle(); await page.sleep(400);
    r = await page.eval(CARD_PROBE, '#myReqTable');
    chk('2.12', ctx, 'card layout (thead hidden, rows display:block, no horizontal overflow)', r.thead === 'none' && r.trDisplay.length === 1 && r.trDisplay[0] === 'block' && r.docOverflow <= 0, JSON.stringify({ thead: r.thead, tr: r.trDisplay, overflow: r.docOverflow }));
    chk('2.12', ctx, 'every non-empty cell has its column header as ::before label', r.unlabeled.length === 0 && r.mismatched.length === 0, JSON.stringify({ unl: r.unlabeled.slice(0, 5), mis: r.mismatched.slice(0, 5) }));
    chk('2.12', ctx, 'Sửa / Xóa yêu cầu buttons exist for PENDING rows', r.btns.length >= 2 && r.btns.some((b) => /Sửa/.test(b.text)) && r.btns.some((b) => /X(o[áa]|óa)/.test(b.text)), JSON.stringify(r.btns.slice(0, 4)));
    chk('2.12', ctx, 'buttons >=40px tall, clickable', r.btns.length > 0 && r.btns.every((b) => b.h >= 40 && b.w >= 40 && b.hit && !b.offscreen), JSON.stringify(r.btns.slice(0, 4)));
    await page.eval("document.getElementById('myReqTable').scrollIntoView()"); await page.sleep(200); await shot(`2.12-${role}-M-me`); await page.eval("(document.querySelector('#myReqTable tr.flag')||document.getElementById('myReqTable')).scrollIntoView({block:'center'})"); await page.sleep(200); await shot(`2.12-${role}-M-me-pending`);
    if (role === 'staff') {
      await page.resetCalls();
      await page.click('#myReqTable tbody tr.flag .re-btns button:first-child');
      await page.waitFor('js:document.getElementById("reCard") && !document.getElementById("reCard").hidden');
      await page.idle();
      chk('2.12', ctx, 'tapping Sửa opens the request edit card', (await page.calls('reqEditGet')).length === 1);
      await shot('2.12-staff-M-reedit');
    }
    harvest('2.12-me-' + role);
  }
}

/* ---------------------------------------------------------------- run */
const items = [['2.01', t201], ['2.02', t202], ['2.03', t203], ['2.04', t204], ['2.05', t205], ['2.06', t206], ['2.07', t207], ['2.08', t208], ['2.09', t209], ['2.10', t210], ['2.11', t211], ['2.12', t212]];
const only = process.argv[2];
try {
  for (const [id, fn] of items) {
    if (only && !only.split(',').includes(id)) continue;
    const t0 = Date.now();
    try { await fn(); }
    catch (e) { chk(id, 'script', 'test aborted with exception', false, (e.stack || e.message).split('\n').slice(0, 3).join(' | ')); try { await shot(id + '-ABORT'); } catch {} }
    console.log(`-- ${id} done in ${Date.now() - t0} ms`);
  }
} finally {
  await page.close();
  fs.writeFileSync(path.join(HERE, 'results', 'group2.json'), JSON.stringify({ results: R, console: CONSOLE }, null, 2));
}
const fails = R.filter((r) => r.ok === false);
console.log(`\n${R.filter((r) => r.ok).length} pass, ${fails.length} fail, ${R.filter((r) => r.ok === null).length} blocked; console groups with errors: ${CONSOLE.length}`);
process.exit(fails.length ? 1 : 0);
