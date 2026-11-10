// test-group3.mjs - QA Nhom 3 (Quan ly: duyet/nguoi dung & Phieu kho). Run: node test-group3.mjs [--only=3.02,3.05]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDriver } from './driver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, 'results', 'screens');
fs.mkdirSync(SHOTS, { recursive: true });
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').replace('--only=', '').split(',').filter(Boolean);

const R = {};            // item -> { checks:[{name,ok,detail,kind}], blocked:string[] }
const OBS = [];          // other observations
const ERRS = [];         // console errors / exceptions per scenario
let CUR = '';
const item = (id) => (R[id] = R[id] || { checks: [], blocked: [] });
function check(name, ok, detail = '') {
  item(CUR).checks.push({ name, ok: !!ok, detail });
  console.log((ok ? '  ok   ' : '  FAIL ') + CUR + ' ' + name + (detail ? '  - ' + String(detail).slice(0, 300) : ''));
}
function blocked(reason) { item(CUR).blocked.push(reason); console.log('  BLOCKED ' + CUR + ' ' + reason); }
function obs(s) { OBS.push(s); console.log('  OBS  ' + s); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const page = await createDriver();
const shot = (name) => page.screenshot(path.join(SHOTS, name + '.png'));

async function openAdmin(lang = 'vi', vp = 'D', o = {}) {
  await page.open({ role: 'admin', lang, viewport: vp, ...o });
  await page.eval('goto("admin")');
  await page.waitFor('#apTable tbody tr .cell-actions');
  await page.idle(200);
}
const rowSel = (k) => `#apTable tbody tr:nth-child(${k})`;
const E = (fn, ...a) => page.eval(fn, ...a);
function flushErrors(tag) {
  const e = page.consoleErrors({ clear: true });
  if (e.length) { ERRS.push({ tag, errors: e.map((x) => x.kind + ': ' + x.text.split('\n')[0]) }); console.log('  CONSOLE ERRORS in ' + tag + ': ' + e.length); }
}
/** index (1-based) of the first PENDING row satisfying pred(r, stockEntry) evaluated in the page (pred given as source string). */
async function findRow(predSrc) {
  return E(`(() => { const f = ${predSrc}; for (let i = 0; i < PENDING.length; i++) if (f(PENDING[i], apStockOf(PENDING[i].assetCode))) return i + 1; return 0; })()`);
}
const dlgOpen = () => E(`!!document.querySelector('#uiDlg[role=dialog]')`);

/* =====================================================================================================*/
async function t301(lang) {
  CUR = '3.01';
  await openAdmin(lang);
  await page.idle(400);
  const ord = await E(() => {
    const pa = document.getElementById('page-admin');
    const kids = [...pa.children].map((c) => ({
      id: c.id || '', cls: c.className || '', tag: c.tagName,
      top: Math.round(c.getBoundingClientRect().top + document.getElementById('content').scrollTop),
      kind: c.querySelector && c.querySelector('#apTable') ? 'approval' : c.querySelector && c.querySelector('#userTable') ? 'users' : c.id || c.tagName,
      children: c.children.length, h: Math.round(c.getBoundingClientRect().height)
    }));
    return kids;
  });
  const kinds = ord.map((o) => o.kind).filter((k) => !['H1', 'P', 'BUTTON'].includes(k));
  if (kinds[0] === 'regAdmin' && lang === 'vi') obs('[3.01] A block #regAdmin ("Đăng ký chờ duyệt", features/Register.html adminCard) is injected right under the page subtitle, i.e. ABOVE the "Duyệt yêu cầu" block (only visible when there are pending registrations; fixture has 2). Not in the checklist order; confirm it is intended.');
  const k2 = kinds.filter((k) => k !== 'regAdmin');
  check(`[${lang}] order of blocks = approval, users, mailPref, backup, adminTools (ignoring the optional #regAdmin card)`, JSON.stringify(k2) === JSON.stringify(['approval', 'users', 'mailPrefMount', 'bkMount', 'adminToolsMount']), JSON.stringify(kinds));
  const tops = ord.filter((o) => o.tag !== 'BUTTON').map((o) => o.top);
  check(`[${lang}] visual (y) order is ascending`, tops.every((v, i) => i === 0 || v >= tops[i - 1]), JSON.stringify(tops));
  check(`[${lang}] all three secondary blocks rendered with content`, ord.filter((o) => ['mailPrefMount', 'bkMount', 'adminToolsMount'].includes(o.id)).every((o) => o.children > 0 && o.h > 20), JSON.stringify(ord.filter((o) => /Mount/.test(o.id)).map((o) => [o.id, o.children, o.h])));
  const calls = (await page.calls()).map((c) => c.fn);
  check(`[${lang}] secondary blocks loaded their data (mail pref, backup)`, calls.includes('getMyMailPref') && calls.includes('backupStatus'), [...new Set(calls)].join(','));
  // the mail-pref switch and backup card actually show data (not stuck on "loading")
  const mp = await E(() => (document.getElementById('mailPrefMount').innerText || '').replace(/\s+/g, ' ').slice(0, 160));
  const bk = await E(() => (document.getElementById('bkMount').innerText || '').replace(/\s+/g, ' ').slice(0, 200));
  check(`[${lang}] mail pref block has text`, mp.length > 10, mp);
  check(`[${lang}] backup block has text and no error`, bk.length > 10 && !/lỗi|error/i.test(bk), bk);
  // admin tools: expand both <details>, data loads
  await E(() => { document.getElementById('atDeleted').open = true; document.getElementById('atReq').open = true; });
  await page.idle(300);
  const at = await E(() => ({ del: document.querySelectorAll('#atDeletedTbl tbody tr').length, req: document.querySelectorAll('#atReqTbl tbody tr').length, delN: document.getElementById('atDeletedN').textContent, reqN: document.getElementById('atReqN').textContent }));
  check(`[${lang}] admin tools: deleted + processed lists load`, at.del > 0 && at.req > 0, JSON.stringify(at));
  const cs = (await page.calls()).map((c) => c.fn);
  check(`[${lang}] admin tools used listDeletedTransactions + getProcessedRequests`, cs.includes('listDeletedTransactions') && cs.includes('getProcessedRequests'));
  if (lang === 'vi') {
    await page.eval(`document.getElementById('content').scrollTop = 0`);
    await shot('g3-3.01-admin-D');
    await page.screenshot(path.join(SHOTS, 'g3-3.01-admin-D-full.png'), { fullPage: true });
  }
  flushErrors('3.01-' + lang);
}

/* =====================================================================================================*/
async function t302(lang) {
  CUR = '3.02';
  await openAdmin(lang);
  // mock limitation: fixture adminDeleteRequest demands a >=3-char reason, the real server (server/admin/Delete.js:275) defaults it. Mimic the server.
  await E(() => { const o = __server.adminDeleteRequest; __setServer({ adminDeleteRequest: (id, why) => o(id, String(why || '').trim() || 'Quản trị viên xóa yêu cầu') }); });
  const moreWord = lang === 'vi' ? 'Thêm' : 'More';
  const info = await E(() => {
    const trs = [...document.querySelectorAll('#apTable tbody tr')];
    return trs.map((tr) => {
      const w = tr.querySelector('.cell-actions');
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true, opacityProperty: true }); };
      const btns = [...w.children].map((c) => ({ tag: c.tagName, text: c.innerText.trim(), vis: vis(c) }));
      const del = w.querySelector('.more-pop .btn');
      return { btns, delText: del && del.textContent.trim(), delVisible: del ? vis(del) : null };
    });
  });
  check(`[${lang}] every pending row shows Duyệt + Từ chối + Thêm; delete hidden until menu opens`,
    info.length > 0 && info.every((r) => r.btns.length === 3 && r.btns[0].vis && r.btns[1].vis && r.btns[2].vis && r.btns[2].text.includes(moreWord) && r.delVisible === false),
    JSON.stringify(info[0]));
  const ovf = await E(() => { const w = document.getElementById('apTable').closest('.table-wrap'); const b = w.querySelector('.cell-actions .btn').getBoundingClientRect(); const wr = w.getBoundingClientRect(); return { clientW: w.clientWidth, scrollW: w.scrollWidth, btnRight: Math.round(b.right), wrapRight: Math.round(wr.right), vw: innerWidth }; });
  check(`[${lang}] approval table has NO horizontal scroll at 1440 and the Duyệt/Từ chối buttons are visible without scrolling right`, ovf.scrollW <= ovf.clientW + 1 && ovf.btnRight <= ovf.wrapRight, JSON.stringify(ovf));
  check(`[${lang}] delete button lives inside the menu and is labelled "${lang === 'vi' ? 'Xóa yêu cầu' : 'Delete request'}"`, info[0].delText === (lang === 'vi' ? 'Xóa yêu cầu' : 'Delete request'), info[0].delText);

  // open menu on first row
  await page.click(rowSel(1) + ' details.more > summary');
  await sleep(80);
  const geo = () => E((sel) => {
    const d = document.querySelector(sel + ' details.more');
    const pop = d.querySelector('.more-pop'), s = d.querySelector('summary');
    const r = pop.getBoundingClientRect(), sr = s.getBoundingClientRect();
    const mid = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const clipAnc = []; for (let a = pop.parentElement; a; a = a.parentElement) { const cs = getComputedStyle(a); if (/(hidden|auto|scroll)/.test(cs.overflowX + cs.overflowY)) clipAnc.push(a.tagName + '.' + a.className); }
    return { open: d.open, pos: getComputedStyle(pop).position, r: [r.left, r.top, r.right, r.bottom].map(Math.round), sr: [sr.left, sr.top, sr.right, sr.bottom].map(Math.round), vw: innerWidth, vh: innerHeight,
      hitInside: pop.contains(mid), display: getComputedStyle(pop).display, clipAnc, text: pop.innerText.trim() };
  }, rowSel(1));
  let g = await geo();
  check(`[${lang}] menu opens, popup is position:fixed and fully inside the viewport and on top (hit-test)`, g.open && g.pos === 'fixed' && g.r[0] >= 0 && g.r[2] <= g.vw && g.r[1] >= 0 && g.r[3] <= g.vh && g.hitInside, JSON.stringify(g));
  if (lang === 'vi') await shot('g3-3.02-menu-open-first-D');
  // click outside closes
  await page.click('#page-admin .page-title');
  await sleep(80);
  check(`[${lang}] click outside closes the menu`, !(await E((s) => document.querySelector(s + ' details.more').open, rowSel(1))));
  // last row (inside the scrolling table-wrap): scroll to it and open
  const n = await page.count('#apTable tbody tr');
  await E((s) => document.querySelector(s).scrollIntoView({ block: 'end' }), rowSel(n));
  await sleep(100);
  await page.click(rowSel(n) + ' details.more > summary');
  await sleep(120);
  const gl = await geo.call(null).catch(() => null);
  const g2 = await E((sel) => {
    const d = document.querySelector(sel + ' details.more'); const pop = d.querySelector('.more-pop'); const r = pop.getBoundingClientRect();
    const mid = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const tw = document.querySelector('#apTable').closest('.table-wrap').getBoundingClientRect();
    return { open: d.open, r: [r.left, r.top, r.right, r.bottom].map(Math.round), vh: innerHeight, hit: pop.contains(mid), tw: [tw.top, tw.bottom].map(Math.round), twOverflow: getComputedStyle(document.querySelector('#apTable').closest('.table-wrap')).overflowY };
  }, rowSel(n));
  check(`[${lang}] last row: menu not clipped by the scrolling table (flips/placed inside viewport, hit-test ok)`, g2.open && g2.r[3] <= g2.vh && g2.r[1] >= 0 && g2.hit, JSON.stringify(g2));
  if (lang === 'vi') await shot('g3-3.02-menu-open-last-D');
  // Esc should close? (not required) - just record
  await page.click('#page-admin .page-title'); await sleep(60);

  // delete flow: asks for confirmation
  await page.resetCalls();
  await page.click(rowSel(1) + ' details.more > summary'); await sleep(60);
  const reqId = await E((s) => document.querySelector(s + ' .cell-sub.mono').textContent, rowSel(1));
  await page.click(rowSel(1) + ' .more-pop .btn');
  await sleep(100);
  check(`[${lang}] clicking "Xóa yêu cầu" opens a uiDialog (not native confirm), menu closes, no server call yet`,
    (await dlgOpen()) && page.dialogs.length === 0 && (await page.calls('adminDeleteRequest')).length === 0 && !(await E((s) => document.querySelector(s + ' details.more').open, rowSel(1))),
    `dialogs=${page.dialogs.length}`);
  const dtxt = await E(() => document.getElementById('uiDlg').innerText.replace(/\s+/g, ' '));
  check(`[${lang}] dialog text mentions request id ${reqId}`, dtxt.includes(reqId), dtxt.slice(0, 200));
  await page.click('#uiDlgNo'); await page.idle();
  check(`[${lang}] Cancel => no adminDeleteRequest`, (await page.calls('adminDeleteRequest')).length === 0 && !(await dlgOpen()));
  await page.click(rowSel(1) + ' details.more > summary'); await sleep(60);
  await page.click(rowSel(1) + ' .more-pop .btn'); await sleep(80);
  await page.click('#uiDlgOk'); await page.idle(250);
  const dc = await page.calls('adminDeleteRequest');
  check(`[${lang}] OK => adminDeleteRequest(${reqId}, '') once, list reloaded without that row`, dc.length === 1 && dc[0].args[0] === reqId && dc[0].args[1] === '' && !(await E((id) => document.getElementById('apTable').innerText.includes(id), reqId)), JSON.stringify(dc.map((c) => c.args)));
  flushErrors('3.02-' + lang);
}

/* =====================================================================================================*/
async function t303(lang) {
  CUR = '3.03';
  await openAdmin(lang);
  const data = await E(() => {
    const rows = [...document.querySelectorAll('#apTable tbody tr')];
    return PENDING.map((r, i) => {
      const td = rows[i].cells[5];
      const s = apStockOf(r.assetCode);
      const subs = [...td.querySelectorAll('.cell-sub')].map((x) => x.textContent.trim());
      return { id: r.requestId, type: r.type, code: r.assetCode, qty: Number(r.quantity), unit: r.unit, stock: s ? Number(s.stock) : null, sUnit: s ? s.unit : null,
        subs, badge: td.querySelector('.badge.danger') ? td.querySelector('.badge.danger').textContent.trim() : null,
        badgeColor: td.querySelector('.badge.danger') ? getComputedStyle(td.querySelector('.badge.danger')).color : null, badgeBg: td.querySelector('.badge.danger') ? getComputedStyle(td.querySelector('.badge.danger')).backgroundColor : null };
    });
  });
  const stockWord = lang === 'vi' ? 'Tồn' : 'Stock', shortWord = lang === 'vi' ? 'không đủ' : 'insufficient';
  let bad = [];
  data.forEach((d) => {
    const expectShow = d.type === 'Export' && d.stock !== null;
    if (!expectShow) { if (d.subs.length || d.badge) bad.push(d.id + ' shows ' + JSON.stringify(d.subs)); return; }
    const num = (n) => n.toLocaleString('vi-VN');
    const want = `${stockWord}: ${d.stock.toLocaleString('vi-VN')} ${d.sUnit}`;
    const line = d.subs.join(' | ');
    if (!line.includes(want.replace(/\./g, '.')) && !line.replace(/[.,]/g, '').includes(want.replace(/[.,]/g, ''))) bad.push(d.id + ' missing ' + want + ' got ' + line);
    const short = d.qty > d.stock;
    if (short && !(d.badge && d.badge.includes(shortWord))) bad.push(d.id + ' should be short but badge=' + d.badge);
    if (!short && d.badge) bad.push(d.id + ' should not be short but badge=' + d.badge);
  });
  check(`[${lang}] stock line/badge correct for all ${data.length} pending requests (export only, code in STOCK)`, bad.length === 0, bad.join(' ; '));
  const kinds = {
    exportOk: data.filter((d) => d.type === 'Export' && d.stock !== null && d.qty <= d.stock).length,
    exportShort: data.filter((d) => d.type === 'Export' && d.stock !== null && d.qty > d.stock).length,
    exportNoStock: data.filter((d) => d.type === 'Export' && d.stock === null).length,
    imports: data.filter((d) => d.type === 'Import').length
  };
  check(`[${lang}] fixture covers all branches (ok/short/not in STOCK/import)`, kinds.exportOk > 0 && kinds.exportShort > 0 && kinds.exportNoStock > 0 && kinds.imports > 0, JSON.stringify(kinds));
  const gea = data.find((d) => d.code === 'GEA-9999');
  check(`[${lang}] GEA-9999 (not in STOCK) shows nothing`, gea && gea.subs.every((s) => !s.includes(stockWord)) && !gea.badge, JSON.stringify(gea && gea.subs));
  const imp = data.find((d) => d.type === 'Import' && d.code);
  check(`[${lang}] import request with existing code shows nothing`, imp && !imp.subs.some((s) => s.includes(stockWord + ':')) && !imp.badge, JSON.stringify(imp && imp.subs));
  const short = data.find((d) => d.stock !== null && d.type === 'Export' && d.qty > d.stock);
  const zero = data.find((d) => d.type === 'Export' && d.stock === 0);
  check(`[${lang}] zero-stock export is flagged "${shortWord}"`, zero && zero.badge && zero.badge.includes(shortWord), JSON.stringify(zero));
  if (short) check(`[${lang}] badge is red (danger colours)`, /^rgb\(/.test(short.badgeColor) && short.badgeColor !== short.badgeBg, `${short.badgeColor} on ${short.badgeBg}`);
  // approve dialog warning
  const ok = data.find((d) => d.type === 'Export' && d.stock !== null && d.qty <= d.stock);
  const ixShort = data.indexOf(short) + 1, ixOk = data.indexOf(ok) + 1, ixImp = data.indexOf(data.find((d) => d.type === 'Import')) + 1;
  await page.click(`${rowSel(ixShort)} .cell-actions .btn.sm:not(.ghost)`); await sleep(80);
  let body = await E(() => document.getElementById('uiDlgBody').innerText);
  check(`[${lang}] approve dialog of short export contains warning with qty/stock/unit`, body.includes('⚠') && body.includes(String(short.stock).replace(/\B(?=(\d{3})+(?!\d))/g, '.')) , body.replace(/\n/g, ' / '));
  await page.click('#uiDlgNo');
  await page.click(`${rowSel(ixOk)} .cell-actions .btn.sm:not(.ghost)`); await sleep(80);
  body = await E(() => document.getElementById('uiDlgBody').innerText);
  check(`[${lang}] approve dialog of in-stock export has no warning`, !body.includes('⚠'), body.replace(/\n/g, ' / '));
  await page.click('#uiDlgNo');
  await page.click(`${rowSel(ixImp)} .cell-actions .btn.sm:not(.ghost)`); await sleep(80);
  body = await E(() => document.getElementById('uiDlgBody').innerText);
  check(`[${lang}] approve dialog of import has no warning`, !body.includes('⚠'), body.replace(/\n/g, ' / '));
  await page.click('#uiDlgNo');
  if (lang === 'vi') {
    await E((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), rowSel(ixShort));
    await shot('g3-3.03-stock-badge-D');
  }
  flushErrors('3.03-' + lang);
}

/* =====================================================================================================*/
async function t304(lang) {
  CUR = '3.04';
  await openAdmin(lang);
  const ix = await findRow('(r, s) => r.type === "Export" && s && Number(r.quantity) <= Number(s.stock)');
  const id = await E((s) => document.querySelector(s + ' .cell-sub.mono').textContent, rowSel(ix));
  const nBefore = await page.count('#apTable tbody tr');
  await page.resetCalls();
  const okSel = `${rowSel(ix)} .cell-actions .btn.sm:not(.ghost)`;
  await page.click(okSel); await sleep(80);
  const dlg = await E(() => { const d = document.getElementById('uiDlg'); return d && { role: d.getAttribute('role'), title: d.querySelector('h2').textContent, ok: document.getElementById('uiDlgOk').textContent, txt: d.innerText.replace(/\s+/g, ' ').slice(0, 220) }; });
  check(`[${lang}] Duyệt opens uiDialog (not native), nothing sent yet`, dlg && dlg.role === 'dialog' && page.dialogs.length === 0 && (await page.calls('approvePendingRequest')).length === 0, JSON.stringify(dlg));
  check(`[${lang}] dialog title/OK label are approve strings`, dlg && dlg.title === (lang === 'vi' ? 'Duyệt yêu cầu' : 'Approve request') && dlg.ok === (lang === 'vi' ? 'Duyệt' : 'Approve') && dlg.txt.includes(id), dlg && dlg.txt);
  await page.click('#uiDlgNo'); await page.idle();
  check(`[${lang}] Cancel => no call, button unchanged & enabled`, (await page.calls('approvePendingRequest')).length === 0 && !(await E((s) => document.querySelector(s).disabled, okSel)));
  // approve with latency so we can see the "processing" state
  await E(() => __setServer({ __hold: { approvePendingRequest: true } }));
  await page.click(okSel); await sleep(60); await page.click('#uiDlgOk'); await sleep(120);
  const proc = await E((s) => ({ dis: document.querySelector(s).disabled, txt: document.querySelector(s).textContent.trim() }), okSel);
  check(`[${lang}] while pending the button is disabled and shows processing`, proc.dis && proc.txt.length > 0 && !/^Duyệt$|^Approve$/.test(proc.txt), JSON.stringify(proc));
  await E(() => { __server.__hold = {}; __release('approvePendingRequest'); });
  await page.idle(300);
  const ap = await page.calls('approvePendingRequest');
  check(`[${lang}] approvePendingRequest('${id}','') called exactly once`, ap.length === 1 && ap[0].args[0] === id && ap[0].args[1] === '', JSON.stringify(ap.map((c) => c.args)));
  const post = await E((id) => ({ rows: document.querySelectorAll('#apTable tbody tr').length, info: document.getElementById('apInfo').innerText.replace(/\s+/g, ' '), infoCls: document.getElementById('apInfo').className, toast: [...document.querySelectorAll('#toastHost .toast')].map((t) => t.className + ':' + t.textContent), has: document.getElementById('apTable').innerText.includes(id) }), id);
  check(`[${lang}] row removed after reload (${nBefore} -> ${nBefore - 1})`, post.rows === nBefore - 1 && !post.has, JSON.stringify({ rows: post.rows }));
  check(`[${lang}] success toast shown`, post.toast.length >= 1 && post.toast.some((t) => t.includes(id)), JSON.stringify(post.toast));
  check(`[${lang}] success note kept in #apInfo AFTER table reload (ok style) together with pending count`, post.info.includes(id) && /ok/.test(post.infoCls) && /\d/.test(post.info.replace(id, '')), post.info + ' | ' + post.infoCls);
  const names = new Set((await page.calls()).map((c) => c.fn));
  check(`[${lang}] reloads: getPendingRequests + getData/bootstrap + notifications`, names.has('getPendingRequests') && (names.has('getData') || names.has('bootstrapAll')) && (names.has('getNotifications') || names.has('getUnreadCount')), [...names].join(','));
  if (lang === 'vi') await shot('g3-3.04-after-approve-D');
  // failure paths
  for (const mode of ['reject-throw', 'ok-false']) {
    await openAdmin(lang);
    const ix2 = await findRow('(r, s) => r.type === "Export" && s && Number(r.quantity) <= Number(s.stock)');
    if (mode === 'reject-throw') await E(() => __setServer({ __fail: { approvePendingRequest: 'Mock: server down' } }));
    else await E(() => __setServer({ approvePendingRequest: () => ({ ok: false, message: 'Yêu cầu này đã được xử lý trước đó.' }) }));
    const sel2 = `${rowSel(ix2)} .cell-actions .btn.sm:not(.ghost)`;
    await page.click(sel2); await sleep(60); await page.click('#uiDlgOk'); await page.idle(250);
    const st = await E((s) => ({ dis: document.querySelector(s).disabled, txt: document.querySelector(s).textContent.trim(), info: document.getElementById('apInfo').innerText, cls: document.getElementById('apInfo').className }), sel2);
    check(`[${lang}] error (${mode}): button restored (enabled, "${lang === 'vi' ? 'Duyệt' : 'Approve'}") and error shown in #apInfo`, !st.dis && st.txt === (lang === 'vi' ? 'Duyệt' : 'Approve') && /err/.test(st.cls) && st.info.length > 5, JSON.stringify(st));
  }
  flushErrors('3.04-' + lang);
}

/* =====================================================================================================*/
async function t305(lang) {
  CUR = '3.05';
  await openAdmin(lang);
  const noSel = (k) => `${rowSel(k)} .cell-actions .btn.ghost.danger`;
  const id = await E((s) => document.querySelector(s + ' .cell-sub.mono').textContent, rowSel(1));
  await page.resetCalls();
  await page.click(noSel(1)); await sleep(80);
  const d = await E(() => { const x = document.getElementById('uiDlg'); const why = document.getElementById('uiDlgWhy'); return { role: x.getAttribute('role'), modal: x.getAttribute('aria-modal'), ok: document.getElementById('uiDlgOk').disabled, okLabel: document.getElementById('uiDlgOk').textContent, okCls: document.getElementById('uiDlgOk').className, hasWhy: !!why, focus: document.activeElement === why, label: x.querySelector('label') && x.querySelector('label').textContent, txt: x.innerText.replace(/\s+/g, ' ').slice(0, 250) }; });
  check(`[${lang}] reject opens uiDialog with a reason field, OK locked, danger style, reason field focused`, d.role === 'dialog' && d.hasWhy && d.ok && /danger-solid/.test(d.okCls) && d.focus && page.dialogs.length === 0, JSON.stringify(d));
  check(`[${lang}] dialog text contains request id`, d.txt.includes(id), d.txt);
  if (lang === 'vi') await shot('g3-3.05-reject-dialog-D');
  await page.type('#uiDlgWhy', 'ab');
  check(`[${lang}] 2 chars => OK still locked`, await E(() => document.getElementById('uiDlgOk').disabled));
  await page.type('#uiDlgWhy', '   a ');
  check(`[${lang}] whitespace-padded 1 char => still locked`, await E(() => document.getElementById('uiDlgOk').disabled));
  await page.type('#uiDlgWhy', 'abc');
  check(`[${lang}] 3 chars => OK enabled`, !(await E(() => document.getElementById('uiDlgOk').disabled)));
  await page.press('Escape'); await sleep(80);
  check(`[${lang}] Esc cancels: no call, dialog gone`, !(await dlgOpen()) && (await page.calls('rejectPendingRequest')).length === 0);
  // real reject with a reason with surrounding spaces
  await E(() => __setServer({ __hold: { rejectPendingRequest: true } }));
  await page.click(noSel(1)); await sleep(60);
  await page.type('#uiDlgWhy', '  Thiếu hóa đơn  ');
  await page.click('#uiDlgOk'); await sleep(120);
  const pr = await E((s) => ({ dis: document.querySelector(s).disabled, t: document.querySelector(s).textContent.trim() }), noSel(1));
  check(`[${lang}] pending reject disables button + shows processing`, pr.dis && pr.t.length > 0, JSON.stringify(pr));
  await E(() => { __server.__hold = {}; __release('rejectPendingRequest'); });
  await page.idle(300);
  const rc = await page.calls('rejectPendingRequest');
  check(`[${lang}] rejectPendingRequest('${id}','Thiếu hóa đơn') (trimmed) once`, rc.length === 1 && rc[0].args[0] === id && rc[0].args[1] === 'Thiếu hóa đơn', JSON.stringify(rc.map((c) => c.args)));
  const post = await E((id) => ({ has: document.getElementById('apTable').innerText.includes(id), info: document.getElementById('apInfo').innerText.replace(/\s+/g, ' '), toast: [...document.querySelectorAll('#toastHost .toast')].map((t) => t.textContent) }), id);
  check(`[${lang}] row removed + note kept + toast`, !post.has && post.info.includes(id) && post.toast.some((t) => t.includes(id)), JSON.stringify(post));
  check(`[${lang}] no native alert/prompt/confirm used`, page.dialogs.length === 0, JSON.stringify(page.dialogs));
  // static: no alert/prompt in the reject/approve code path
  const src = fs.readFileSync(path.join(HERE, '..', 'client', 'pages', 'AdminAndTickets.html'), 'utf8');
  check(`[${lang}] source of AdminAndTickets.html has no alert( / prompt( / confirm(`, !/(^|[^\w.])(alert|prompt|confirm)\s*\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), '');
  // failure path
  await openAdmin(lang);
  await E(() => __setServer({ __fail: { rejectPendingRequest: 'Mock: boom' } }));
  await page.click(noSel(1)); await sleep(60); await page.type('#uiDlgWhy', 'khong hop le'); await page.click('#uiDlgOk'); await page.idle(250);
  const st = await E((s) => ({ dis: document.querySelector(s).disabled, txt: document.querySelector(s).textContent.trim(), cls: document.getElementById('apInfo').className }), noSel(1));
  check(`[${lang}] reject failure: button restored + error box`, !st.dis && st.txt === (lang === 'vi' ? 'Từ chối' : 'Reject') && /err/.test(st.cls), JSON.stringify(st));
  flushErrors('3.05-' + lang);
}

/* =====================================================================================================*/
async function t306(lang) {
  CUR = '3.06';
  await openAdmin(lang);
  const btn = '#apBulkBtn';
  const lbl = (n) => (lang === 'vi' ? `Duyệt đã chọn (${n})` : `Approve selected (${n})`);
  const total = await page.count('#apTable tbody .ap-chk');
  let st = await E(() => ({ txt: document.getElementById('apBulkBtn').innerText.trim(), dis: document.getElementById('apBulkBtn').disabled, hidden: document.getElementById('apBulk').hidden }));
  check(`[${lang}] initially: bulk bar visible, button "${lbl(0)}" disabled`, !st.hidden && st.dis && st.txt === lbl(0), JSON.stringify(st));
  await page.click('#apSelAll');
  st = await E(() => ({ txt: document.getElementById('apBulkBtn').innerText.trim(), dis: document.getElementById('apBulkBtn').disabled, checked: [...document.querySelectorAll('#apTable .ap-chk')].filter((c) => c.checked).length, all: document.getElementById('apSelAll').checked, ind: document.getElementById('apSelAll').indeterminate }));
  check(`[${lang}] select-all checks ${total} rows, button "${lbl(total)}"`, st.checked === total && st.txt === lbl(total) && !st.dis && st.all && !st.ind, JSON.stringify(st));
  await page.click(rowSel(2) + ' .ap-chk');
  st = await E(() => ({ txt: document.getElementById('apBulkBtn').innerText.trim(), all: document.getElementById('apSelAll').checked, ind: document.getElementById('apSelAll').indeterminate }));
  check(`[${lang}] uncheck one row => n-1, select-all indeterminate`, st.txt === lbl(total - 1) && !st.all && st.ind, JSON.stringify(st));
  await page.click('#apSelAll'); // indeterminate click -> checks all
  await page.click('#apSelAll');
  st = await E(() => ({ txt: document.getElementById('apBulkBtn').innerText.trim(), checked: [...document.querySelectorAll('#apTable .ap-chk')].filter((c) => c.checked).length, dis: document.getElementById('apBulkBtn').disabled }));
  check(`[${lang}] select-all toggled off => 0 selected, button disabled`, st.checked === 0 && st.txt === lbl(0) && st.dis, JSON.stringify(st));
  if (lang === 'vi') { await page.click('#apSelAll'); await E(() => document.getElementById('content').scrollTop = 0); await shot('g3-3.06-select-all-D'); await page.click('#apSelAll'); }

  /* ---- scenario A: success run with sequencing check + lock while running ---- */
  await openAdmin(lang);
  const ids3 = await E(() => PENDING.filter((r) => r.type === 'Import').slice(0, 3).map((r) => r.requestId));
  for (const id of ids3) await E((id) => { const c = [...document.querySelectorAll('#apTable tbody tr')].find((tr) => tr.innerText.includes(id)).querySelector('.ap-chk'); c.click(); }, id);
  st = await E(() => document.getElementById('apBulkBtn').innerText.trim());
  check(`[${lang}] 3 selected => "${lbl(3)}"`, st === lbl(3), st);
  await page.resetCalls();
  await E(() => __setServer({ __hold: { approvePendingRequest: true } }));
  await page.click(btn); await sleep(80);
  const dl = await E(() => ({ n: document.querySelectorAll('#uiDlg').length, txt: document.getElementById('uiDlgBody').innerText.replace(/\n/g, ' / '), title: document.getElementById('uiDlgTitle').textContent }));
  check(`[${lang}] exactly ONE confirmation dialog for the batch, no warning (imports only)`, dl.n === 1 && !dl.txt.includes('⚠') && dl.txt.includes('3'), JSON.stringify(dl));
  await page.click('#uiDlgOk'); await sleep(200);
  let c1 = await page.calls('approvePendingRequest');
  const lock = await E(() => {
    const q = (s) => [...document.querySelectorAll(s)];
    return { bulkDis: document.getElementById('apBulkBtn').disabled, selAllDis: document.getElementById('apSelAll').disabled, chkDis: q('#apTable .ap-chk').every((c) => c.disabled),
      rowBtnsDisabled: q('#apTable .cell-actions > .btn').filter((b) => b.disabled).length, rowBtnsTotal: q('#apTable .cell-actions > .btn').length,
      moreDisabledOrHidden: q('#apTable details.more > summary').length, info: document.getElementById('apInfo').innerText.replace(/\s+/g, ' ') };
  });
  check(`[${lang}] sequential: only 1 call in flight while first is pending`, c1.length === 1 && c1[0].args[0] === ids3[0], JSON.stringify(c1.map((c) => c.args)));
  check(`[${lang}] progress text "Đang duyệt 1/3: id" shown`, lock.info.includes('1/3') && lock.info.includes(ids3[0]), lock.info);
  check(`[${lang}] while running: bulk button, select-all and row checkboxes are disabled`, lock.bulkDis && lock.selAllDis && lock.chkDis, JSON.stringify(lock));
  check(`[${lang}] while running: per-row Duyệt/Từ chối buttons are locked (disabled attr)`, lock.rowBtnsDisabled === lock.rowBtnsTotal, `${lock.rowBtnsDisabled}/${lock.rowBtnsTotal} row buttons have disabled attribute`);
  // clicking a row Duyệt during the batch must not open a dialog or send anything
  await page.click(`${rowSel(1)} .cell-actions .btn.sm:not(.ghost)`, { force: true }).catch(() => { });
  await sleep(100);
  check(`[${lang}] while running: clicking a row Duyệt does nothing (no dialog, no extra call)`, !(await dlgOpen()) && (await page.calls('approvePendingRequest')).length === 1, '');
  // delete-request via the "Thêm" menu during batch
  await page.click(`${rowSel(1)} details.more > summary`, { force: true }).catch(() => { }); await sleep(60);
  await page.click(`${rowSel(1)} .more-pop .btn`, { force: true }).catch(() => { }); await sleep(100);
  const delOpenDuring = await dlgOpen();
  if (delOpenDuring) { await page.click('#uiDlgNo'); }
  check(`[${lang}] while running: "Xóa yêu cầu" in the menu is also blocked`, !delOpenDuring, delOpenDuring ? 'delete dialog opened during the batch (no AP_BUSY guard in doDeleteReq / menu)' : '');
  await E(() => { __release('approvePendingRequest'); }); await sleep(250);
  c1 = await page.calls('approvePendingRequest');
  check(`[${lang}] after 1st returns the 2nd is sent (and not before): ${c1.length} calls`, c1.length === 2 && c1[1].args[0] === ids3[1], JSON.stringify(c1.map((c) => c.args[0])));
  await E(() => { __server.__hold = {}; __release('approvePendingRequest'); }); await page.idle(400);
  c1 = await page.calls('approvePendingRequest');
  check(`[${lang}] all 3 approved in selected order with note ''`, c1.length === 3 && c1.every((c, i) => c.args[0] === ids3[i] && c.args[1] === ''), JSON.stringify(c1.map((c) => c.args)));
  const fin = await E(() => ({ info: document.getElementById('apInfo').innerText.replace(/\s+/g, ' '), cls: document.getElementById('apInfo').className, toast: [...document.querySelectorAll('#toastHost .toast')].map((t) => t.textContent), bulk: document.getElementById('apBulkBtn').innerText.trim(), dis: document.getElementById('apBulkBtn').disabled, rows: document.querySelectorAll('#apTable tbody tr').length }));
  check(`[${lang}] finish: "${lang === 'vi' ? 'Đã duyệt 3 yêu cầu.' : 'Approved 3 request(s).'}" in apInfo (kept after reload) + toast, button reset`, fin.info.includes(lang === 'vi' ? 'Đã duyệt 3 yêu cầu' : 'Approved 3 request') && fin.toast.some((t) => /3/.test(t)) && fin.bulk === lbl(0) && fin.dis, JSON.stringify(fin));
  const names = new Set((await page.calls()).map((c) => c.fn));
  check(`[${lang}] final reload: getPendingRequests + getData + notifications`, names.has('getPendingRequests') && names.has('getData') && (names.has('getNotifications') || names.has('getUnreadCount')), [...names].join(','));
  check(`[${lang}] row count dropped by 3`, fin.rows === total - 3, `${fin.rows} vs ${total}-3`);
  if (lang === 'vi') await shot('g3-3.06-bulk-done-D');

  /* ---- scenario B: stop at first error ---- */
  await openAdmin(lang);
  // pick: [in-stock export, short export, import] - the short one fails on the (real) fixture
  const idA = await E(() => PENDING[(() => { for (let i = 0; i < PENDING.length; i++) { const r = PENDING[i], s = apStockOf(r.assetCode); if (r.type === 'Export' && s && Number(r.quantity) <= Number(s.stock)) return i; } return 0; })()].requestId);
  const idB = await E(() => PENDING.find((r) => { const s = apStockOf(r.assetCode); return r.type === 'Export' && s && Number(r.quantity) > Number(s.stock) && Number(s.stock) > 0; }).requestId);
  const idC = await E(() => PENDING.find((r) => r.type === 'Import').requestId);
  // order in the batch = PENDING order, so select and then compute expected order
  const ord = await E((ids) => PENDING.filter((r) => ids.includes(r.requestId)).map((r) => r.requestId), [idA, idB, idC]);
  for (const id of [idA, idB, idC]) await E((id) => [...document.querySelectorAll('#apTable tbody tr')].find((tr) => tr.innerText.includes(id)).querySelector('.ap-chk').click(), id);
  await page.resetCalls();
  await page.click(btn); await sleep(80);
  const wtxt = await E(() => document.getElementById('uiDlgBody').innerText.replace(/\n/g, ' / '));
  check(`[${lang}] confirm warns that 1 selected export is over stock`, wtxt.includes('⚠') && /1/.test(wtxt.split('⚠')[1] || ''), wtxt);
  await page.click('#uiDlgOk'); await page.idle(400);
  const cB = await page.calls('approvePendingRequest');
  const idxB = ord.indexOf(idB);
  check(`[${lang}] stops at first failure: calls = ${idxB + 1} (up to and including failing ${idB}), later ones not sent`, cB.length === idxB + 1 && cB[cB.length - 1].args[0] === idB, JSON.stringify(cB.map((c) => c.args[0])));
  const stp = await E(() => ({ info: document.getElementById('apInfo').innerText.replace(/\s+/g, ' '), cls: document.getElementById('apInfo').className, toast: [...document.querySelectorAll('#toastHost .toast')].map((t) => t.className + '|' + t.textContent), bulk: document.getElementById('apBulkBtn').innerText.trim(), dis: document.getElementById('apBulkBtn').disabled, chkDis: [...document.querySelectorAll('#apTable .ap-chk')].some((c) => c.disabled) }));
  check(`[${lang}] error summary shows done/total + failing id + server message (in apInfo after reload + error toast)`, stp.info.includes(idB) && stp.info.includes(`${idxB}/3`) && /err/.test(stp.cls) && stp.toast.some((t) => /err/.test(t) && t.includes(idB)), JSON.stringify(stp));
  check(`[${lang}] UI unlocked after stop (checkboxes enabled, failing+unprocessed rows still selected)`, !stp.chkDis && stp.bulk === lbl(3 - idxB), JSON.stringify({ bulk: stp.bulk, chkDis: stp.chkDis }));
  if (lang === 'vi') await shot('g3-3.06-bulk-stopped-D');

  /* ---- scenario C: running-total warning (trừ dần theo cùng mã) ---- */
  await page.open({ role: 'admin', lang, viewport: 'D', init: (server) => {
    const gp = server.getPendingRequests;
    server.getPendingRequests = () => {
      const res = gp(); const ex = res.rows.find((r) => r.type === 'Export' && r.assetCode);
      const mk = (id, q, over) => Object.assign({}, ex, { requestId: id, quantity: String(q) }, over || {});
      window.__BASE = ex;
      return { ok: true, rows: window.__ROWS || [mk('REQ-T-A', 1), mk('REQ-T-B', 1), mk('REQ-T-C', 1), mk('REQ-T-D', 1)] };
    };
  } });
  await page.eval('goto("admin")'); await page.waitFor('#apTable tbody tr .cell-actions'); await page.idle(150);
  const stk = await E(() => Number(apStockOf(__BASE.assetCode).stock));
  // rows: A,B each ~0.6*stock (each alone fits, together exceed), C = import (ignored), D = code not in stock (ignored)
  const q = Math.max(2, Math.ceil(stk * 0.6));
  await E((q) => { window.__ROWS = [
    Object.assign({}, __BASE, { requestId: 'REQ-T-A', quantity: String(q) }),
    Object.assign({}, __BASE, { requestId: 'REQ-T-B', quantity: String(q) }),
    Object.assign({}, __BASE, { requestId: 'REQ-T-C', quantity: String(q * 9), type: 'Import' }),
    Object.assign({}, __BASE, { requestId: 'REQ-T-D', quantity: String(q * 9), assetCode: 'NOPE-0' }),
    Object.assign({}, __BASE, { requestId: 'REQ-T-E', quantity: '1' })
  ]; loadApproval(); }, q);
  await page.idle(200);
  await page.click('#apSelAll');
  await page.click(btn); await sleep(80);
  let wt = await E(() => document.getElementById('uiDlgBody').innerText.replace(/\n/g, ' / '));
  // expected: A fits (stock-q left), B short (1), E: after A took q and B (short) took q => left = stock-2q negative => 1 > left => short (2)
  const exp = (() => { let left = stk, n = 0; for (const x of [q, q, 1]) { if (x > left) n++; left -= x; } return n; })();
  const naive = [q, q, 1].filter((x) => x > stk).length;
  const m = wt.match(new RegExp(lang === 'vi' ? '⚠ (\\d+) yêu cầu xuất' : '⚠ (\\d+) issue request'));
  check(`[${lang}] running-total warning counts ${exp} short (stock=${stk}, q=${q}; naive per-row count would be ${naive}); imports/unknown codes ignored`, m && Number(m[1]) === exp && exp !== naive, wt);
  await page.click('#uiDlgNo');
  // select only A and E (fit together when stock is big enough?) - single over-stock ensures no warning when fits
  await E((q) => { window.__ROWS = [Object.assign({}, __BASE, { requestId: 'REQ-T-A', quantity: '1' }), Object.assign({}, __BASE, { requestId: 'REQ-T-B', quantity: '1' })]; loadApproval(); }, q);
  await page.idle(200); await E(() => apToggleAll(true)); await page.click(btn); await sleep(80);
  wt = await E(() => document.getElementById('uiDlgBody').innerText);
  check(`[${lang}] no warning when the selected exports fit`, !wt.includes('⚠') || stk < 2, wt.replace(/\n/g, ' / '));
  await page.click('#uiDlgNo');
  flushErrors('3.06-' + lang);
}

/* =====================================================================================================*/
async function t307(lang) {
  CUR = '3.07';
  await openAdmin(lang);
  await page.waitFor('#userTable tbody tr .cell-actions');
  const lblAdd = lang === 'vi' ? 'Thêm người dùng' : 'Add user';
  const initial = await E(() => ({ txt: document.getElementById('btnUserSave').textContent.trim(), w: document.getElementById('btnUserSave').getBoundingClientRect().width, title: document.getElementById('userFormTitle').textContent.trim() }));
  check(`[${lang}] save button label on first load (add mode) = "${lblAdd}"`, initial.txt === lblAdd, JSON.stringify(initial));
  const users = await E(() => ({ rows: [...document.querySelectorAll('#userTable tbody tr')].map((tr) => ({ name: tr.cells[1].innerText.trim(), link: !!tr.cells[1].querySelector('.link'), edit: !!tr.cells[5].querySelector('.btn'), btns: tr.cells[5].querySelectorAll('.btn').length })), self: USERS.filter((u) => u.isSelf).map((u) => u.username) }));
  check(`[${lang}] every user name is a link; every row has Edit`, users.rows.every((r) => r.link && r.edit), JSON.stringify(users.rows.slice(0, 3)));
  const selfRow = users.rows.find((r) => r.name === users.self[0]);
  check(`[${lang}] own row (${users.self[0]}) has Edit only (no Delete); others have Edit+Delete`, selfRow && selfRow.btns === 1 && users.rows.filter((r) => r.name !== users.self[0]).every((r) => r.btns === 2), JSON.stringify({ selfRow, others: users.rows.filter((r) => r.name !== users.self[0]).map((r) => r.btns) }));
  if (lang === 'vi') { await E(() => document.getElementById('userForm').scrollIntoView({ block: 'center' })); await shot('g3-3.07-form-firstload-D'); await E(() => document.getElementById('userTable').scrollIntoView()); await shot('g3-3.07-users-D'); }
  // name click -> historyShowUser
  await page.resetCalls();
  const other = users.rows.find((r) => r.name !== users.self[0]).name;
  await E((n) => [...document.querySelectorAll('#userTable .link')].find((l) => l.textContent === n).click(), other);
  await page.idle(300);
  const hs = await E(() => ({ page: document.querySelector('.page.active').id, hUser: document.getElementById('hUser') && document.getElementById('hUser').value }));
  const gt = await page.calls('getTransactions');
  check(`[${lang}] clicking the name opens History filtered by "${other}"`, hs.page === 'page-history' && hs.hUser === other && gt.length >= 1 && (gt[gt.length - 1].args[0] || {}).username === other, JSON.stringify({ hs, args: gt.map((c) => c.args[0]) }));
  const kb = await E(() => { openUserEdit; goto('admin'); const l = document.querySelector('#userTable .link'); return { tab: l.tabIndex, role: l.getAttribute('role'), tag: l.tagName }; });
  obs(`[3.07] user-name link is a <${kb.tag.toLowerCase()} class="link"> with tabindex=${kb.tab}, role=${kb.role} => not keyboard focusable/operable (AdminAndTickets.html renderUsers, 'link' span)`);

  // Edit mode
  await page.waitFor('#page-admin.active'); await page.idle(200);
  await page.click('#userTable tbody tr:nth-child(2) .cell-actions .btn.ghost');
  await sleep(150);
  const ed = await E(() => ({ btn: document.getElementById('btnUserSave').textContent.trim(), title: document.getElementById('userFormTitle').textContent.trim(), email: document.getElementById('uEmail').value, dis: document.getElementById('uEmail').disabled, cancelVisible: !document.getElementById('btnUserCancel').hidden }));
  check(`[${lang}] Edit: form filled, email locked, label = save-changes, Cancel visible`, ed.dis && ed.email.includes('@') && ed.btn !== lblAdd && ed.cancelVisible, JSON.stringify(ed));
  await page.click('#btnUserCancel'); await sleep(100);
  const after = await E(() => ({ btn: document.getElementById('btnUserSave').textContent.trim(), email: document.getElementById('uEmail').value, dis: document.getElementById('uEmail').disabled }));
  check(`[${lang}] Cancel edit: label back to "${lblAdd}", form cleared`, after.btn === lblAdd && after.email === '' && !after.dis, JSON.stringify(after));

  // validations
  const fx = () => E(() => ({ msg: document.getElementById('userMsg').innerText.trim(), cls: document.getElementById('userMsg').className, focus: document.activeElement && document.activeElement.id }));
  await page.resetCalls();
  const setVals = (e, u, c) => E((e, u, c) => { document.getElementById('uEmail').value = e; document.getElementById('uUsername').value = u; document.getElementById('uCc').value = c; }, e, u, c);
  await setVals('not-an-email', 'tester', 'OPSCOA'); await page.click('#btnUserSave'); let v = await fx();
  check(`[${lang}] bad email => specific message + focus #uEmail, no server call`, /err/.test(v.cls) && v.msg === (lang === 'vi' ? 'Email không hợp lệ. Nhập đủ dạng ten@congty.com.' : 'Invalid email. Use the form name@company.com.') && v.focus === 'uEmail' && (await page.calls('addUser')).length === 0, JSON.stringify(v));
  await setVals('a@b', 'tester', 'OPSCOA'); await page.click('#btnUserSave'); v = await fx();
  check(`[${lang}] email "a@b" (no dot in domain) rejected`, v.focus === 'uEmail' && /err/.test(v.cls), JSON.stringify(v));
  await setVals('new.user@example.com', '   ', 'OPSCOA'); await page.click('#btnUserSave'); v = await fx();
  check(`[${lang}] missing username => specific message + focus #uUsername`, v.msg === (lang === 'vi' ? 'Vui lòng nhập tên đăng nhập.' : 'Please enter a username.') && v.focus === 'uUsername', JSON.stringify(v));
  await setVals('new.user@example.com', 'tester', ''); await page.click('#btnUserSave'); v = await fx();
  check(`[${lang}] missing Cost Centre => specific message + focus #uCc`, v.msg === (lang === 'vi' ? 'Vui lòng nhập Cost Centre.' : 'Please enter a Cost Centre.') && v.focus === 'uCc', JSON.stringify(v));
  check(`[${lang}] none of the invalid submits reached the server`, (await page.calls('addUser')).length === 0);
  if (lang === 'vi') { await E(() => document.getElementById('userForm').scrollIntoView({ block: 'center' })); await shot('g3-3.07-validation-D'); }
  // valid add
  await setVals('  New.User@Example.com ', 'newbie.user', 'OPS-COA'); await page.click('#btnUserSave'); await page.idle(250);
  const ad = await page.calls('addUser');
  v = await fx();
  const msgVis = await E(() => ({ hidden: document.getElementById('userMsg').hidden, txt: document.getElementById('userMsg').innerText, toasts: [...document.querySelectorAll('#toastHost .toast')].map((t) => t.textContent) }));
  check(`[${lang}] after a successful add the user gets visible feedback (message box or toast)`, (!msgVis.hidden && msgVis.txt.length > 3) || msgVis.toasts.length > 0, JSON.stringify(msgVis));
  check(`[${lang}] valid add => addUser(trimmed payload) once; ok message; form reset; list reloaded`, ad.length === 1 && ad[0].args[0].email === 'New.User@Example.com' && ad[0].args[0].username === 'newbie.user' && /ok/.test(v.cls), JSON.stringify(ad.map((c) => c.args)));
  check(`[${lang}] after add: label = "${lblAdd}", users list contains new user`, (await E(() => document.getElementById('btnUserSave').textContent.trim())) === lblAdd && (await E(() => document.getElementById('userTable').innerText.includes('newbie.user'))));

  // delete
  await page.resetCalls();
  const delSel = (k) => `#userTable tbody tr:nth-child(${k}) .cell-actions .btn.danger`;
  const rowIx = await E((self) => { const trs = [...document.querySelectorAll('#userTable tbody tr')]; return trs.findIndex((tr) => tr.cells[1].innerText.trim() !== self && tr.querySelector('.btn.danger')) + 1; }, users.self[0]);
  const delRow = await E((k) => { const tr = document.querySelectorAll('#userTable tbody tr')[k - 1]; return { email: tr.cells[0].innerText.trim(), name: tr.cells[1].innerText.trim() }; }, rowIx);
  await page.click(delSel(rowIx)); await sleep(100);
  const dd = await E(() => { const x = document.getElementById('uiDlg'); const why = document.getElementById('uiDlgWhy'); return { n: document.querySelectorAll('#uiDlg').length, hasWhy: !!why, okCls: document.getElementById('uiDlgOk').className, okDis: document.getElementById('uiDlgOk').disabled, lbl: x.querySelector('label').textContent, title: document.getElementById('uiDlgTitle').textContent, txt: x.innerText.replace(/\s+/g, ' ') }; });
  check(`[${lang}] Delete opens ONE uiDialog: optional reason, danger button, OK enabled w/o reason, no native dialogs`, dd.n === 1 && dd.hasWhy && /danger-solid/.test(dd.okCls) && !dd.okDis && /optional|không bắt buộc/i.test(dd.lbl) && page.dialogs.length === 0, JSON.stringify(dd));
  check(`[${lang}] dialog mentions the user's email`, dd.txt.includes(delRow.email), dd.txt);
  if (lang === 'vi') await shot('g3-3.07-delete-dialog-D');
  await page.click('#uiDlgNo'); await page.idle();
  check(`[${lang}] Cancel => no deleteUser call`, (await page.calls('deleteUser')).length === 0);
  await page.click(delSel(rowIx)); await sleep(80);
  await page.type('#uiDlgWhy', ' Nghỉ việc '); await page.press('Enter'); await page.idle(300);
  const du = await page.calls('deleteUser');
  check(`[${lang}] OK (Enter in reason) => deleteUser(rowIndex,'Nghỉ việc',email) once and NO second dialog`, du.length === 1 && du[0].args[1] === 'Nghỉ việc' && du[0].args[2] === delRow.email && !(await dlgOpen()) && page.dialogs.length === 0, JSON.stringify(du.map((c) => c.args)));
  const aft = await E((e) => ({ has: document.getElementById('userTable').innerText.includes(e), toast: [...document.querySelectorAll('#toastHost .toast')].map((t) => t.textContent) }), delRow.email);
  check(`[${lang}] user removed from list + toast`, !aft.has && aft.toast.length > 0, JSON.stringify(aft));
  // delete failure restores button
  await E(() => __setServer({ __fail: { deleteUser: 'Mock: fail' } }));
  const r2 = await E((self) => { const trs = [...document.querySelectorAll('#userTable tbody tr')]; return trs.findIndex((tr) => tr.cells[1].innerText.trim() !== self && tr.querySelector('.btn.danger')) + 1; }, users.self[0]);
  const lab0 = await E((s) => document.querySelector(s).textContent.trim(), delSel(r2));
  await page.click(delSel(r2)); await sleep(60); await page.click('#uiDlgOk'); await page.idle(250);
  const fs_ = await E((s) => ({ dis: document.querySelector(s).disabled, txt: document.querySelector(s).textContent.trim(), info: document.getElementById('userInfo').className }), delSel(r2));
  check(`[${lang}] delete failure restores the button and shows error`, !fs_.dis && fs_.txt === lab0 && /err/.test(fs_.info), JSON.stringify(fs_));
  flushErrors('3.07-' + lang);
}

/* =====================================================================================================*/
async function t308(lang) {
  CUR = '3.08';
  await page.open({ role: 'admin', lang, viewport: 'D' });
  await page.resetCalls();
  await page.eval('goto("ticket")');
  await page.waitFor('#tkList .ticket-card'); await page.idle(250);
  let gt = await page.calls('getTickets');
  check(`[${lang}] entering Phiếu kho auto-loads exactly once without pressing Tải`, gt.length === 1, JSON.stringify(gt.map((c) => c.args)));
  const dflt = await E(() => ({ from: tkFrom.value, to: tkTo.value, type: tkType.value, cc: tkCc.value, cards: document.querySelectorAll('#tkList .ticket-card').length, info: document.getElementById('tkInfo').innerText.replace(/\s+/g, ' '), printAll: !document.getElementById('tkPrintAll').hidden }));
  check(`[${lang}] request args = default 7-day range; cards + info line + print-all shown`, gt[0] && gt[0].args[0].from === dflt.from && gt[0].args[0].to === dflt.to && dflt.cards > 0 && dflt.printAll, JSON.stringify(dflt));
  // leave and come back: no reload
  await page.eval('goto("kho")'); await page.eval('goto("ticket")'); await page.idle(300);
  check(`[${lang}] re-entering page with data does NOT reload`, (await page.calls('getTickets')).length === 1);
  // debounce: 3 quick changes -> 1 call after ~300ms
  await page.resetCalls();
  const setChange = (id, v) => E((id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, id, v);
  const day = await E(() => daysAgo(3));
  const t0 = Date.now();
  await setChange('tkFrom', day); await sleep(80); await setChange('tkType', 'Export'); await sleep(80);
  check(`[${lang}] no call during the 300ms debounce window`, (await page.calls('getTickets')).length === 0);
  await sleep(450); await page.idle(200);
  gt = await page.calls('getTickets');
  check(`[${lang}] 2 quick changes => ONE getTickets with the final filters (type=Export, from=${day})`, gt.length === 1 && gt[0].args[0].type === 'Export' && gt[0].args[0].from === day, JSON.stringify(gt.map((c) => [c.args[0], c.t - t0])));
  const allOut = await E(() => [...document.querySelectorAll('#tkList .ticket-card .badge')].every((b) => b.classList.contains('out')));
  check(`[${lang}] list shows only Export tickets`, allOut);
  // CC change -> auto
  await page.resetCalls();
  const ccOpt = await E(() => [...document.getElementById('tkCc').options].map((o) => o.value).filter(Boolean)[0]);
  await setChange('tkCc', ccOpt); await sleep(500); await page.idle(200);
  gt = await page.calls('getTickets');
  check(`[${lang}] CC change auto-loads with cc=${ccOpt}`, gt.length === 1 && gt[0].args[0].cc === ccOpt, JSON.stringify(gt.map((c) => c.args[0])));
  // "Tải" button: immediate; pending timer cancelled
  await page.resetCalls();
  await setChange('tkTo', await E(() => today())); // starts timer
  await page.click('.card:has(#tkFrom) .btn:not(.ghost)'); await sleep(500); await page.idle(200);
  gt = await page.calls('getTickets');
  check(`[${lang}] "Tải" works and cancels the pending debounce (single call)`, gt.length === 1, JSON.stringify(gt.map((c) => c.t)));
  // stale response dropped
  await page.resetCalls();
  await E(() => {
    const orig = __server.getTickets;
    __setServer({ __latency: { getTickets: 0 }, getTickets: (f) => { const r = orig(f); if (f.type === 'Import') { r.rows = r.rows.slice(0, 1); r.marker = 'IMPORT-STALE'; } return r; } });
  });
  // call A (Import) slow, then call B (Export) fast
  await E(() => { __server.__latency = { getTickets: 900 }; });
  await setChange('tkType', 'Import'); await sleep(380);
  await E(() => { __server.__latency = { getTickets: 30 }; });
  await setChange('tkType', 'Export'); await sleep(1500); await page.idle(200);
  const stale = await E(() => ({ all: [...document.querySelectorAll('#tkList .ticket-card .badge')].map((b) => b.className), info: document.getElementById('tkInfo').innerText.replace(/\s+/g, ' '), calls: __calls.filter((c) => c.fn === 'getTickets').map((c) => c.args[0].type), tk: tkType.value, res: TICKETS && TICKETS.rows.length }));
  check(`[${lang}] late response of the older request is ignored (UI shows Export after Import arrives last)`, stale.calls.join() === 'Import,Export' && stale.all.length > 1 && stale.all.every((c) => /out/.test(c)), JSON.stringify(stale));
  // failure
  await E(() => __setServer({ __fail: { getTickets: 'Mock: sheet unavailable' } }));
  await page.click('.card:has(#tkFrom) .btn:not(.ghost)'); await page.idle(250);
  const fl = await E(() => ({ cls: document.getElementById('tkInfo').className, txt: document.getElementById('tkInfo').innerText, cards: document.querySelectorAll('#tkList .ticket-card').length, printAll: !document.getElementById('tkPrintAll').hidden }));
  check(`[${lang}] failing server => error box, list cleared, print-all hidden`, /err/.test(fl.cls) && fl.txt.includes('sheet unavailable') && fl.cards === 0 && !fl.printAll, JSON.stringify(fl));
  if (lang === 'vi') {
    await page.open({ role: 'admin', lang, viewport: 'D' }); await page.eval('goto("ticket")'); await page.waitFor('#tkList .ticket-card'); await page.idle(200);
    await shot('g3-3.08-ticket-D');
  }
  // quick sanity: staff cannot open page
  flushErrors('3.08-' + lang);
}

/* =====================================================================================================*/
async function t309(lang) {
  CUR = '3.09';
  await page.open({ role: 'admin', lang, viewport: 'D' });
  await page.eval('goto("ticket")'); await page.waitFor('#tkList .ticket-card'); await page.idle(250);
  const cmp = await E(() => {
    const cards = [...document.querySelectorAll('#tkList .ticket-card')];
    const res = cards.map((card, i) => {
      const g = TICKETS.rows[i];
      const det = card.querySelector('details.tk-items');
      if (!det) return { i, problem: 'no details' };
      const sum = det.querySelector('summary').textContent.trim();
      const trs = [...det.querySelectorAll('tbody tr')];
      const wrong = [];
      if (trs.length !== g.items.length) wrong.push(`rows ${trs.length} != items ${g.items.length}`);
      g.items.forEach((it, k) => {
        const tr = trs[k]; if (!tr) return;
        const c = [...tr.cells].map((x) => x.textContent.trim());
        const nm = it.name + (it.variant ? ' · ' + it.variant : '');
        if (c[0] !== it.code) wrong.push('code ' + c[0] + '/' + it.code);
        if (c[1].replace(/\s+/g, ' ') !== nm.replace(/\s+/g, ' ')) wrong.push('name [' + c[1] + ']/[' + nm + ']');
        if (c[2].replace(/\D/g, '') !== String(Math.abs(it.qty)).replace(/\D/g, '')) wrong.push('qty ' + c[2] + '/' + it.qty);
        if (c[3] !== it.unit) wrong.push('unit ' + c[3] + '/' + it.unit);
        if (c[4] !== (it.bin || '—')) wrong.push('bin ' + c[4] + '/' + it.bin);
      });
      const heads = [...det.querySelectorAll('thead th')].map((x) => x.textContent.trim());
      return { i, sum, n: g.items.length, itemCount: g.itemCount, open: det.open, wrong, heads, labels: trs[0] && [...trs[0].cells].map((c) => c.getAttribute('data-label')) };
    });
    return res;
  });
  check(`[${lang}] every card (${cmp.length}) has an items section whose rows match g.items (code, name+variant, qty, unit, bin)`, cmp.length > 0 && cmp.every((c) => !c.problem && c.wrong.length === 0), JSON.stringify(cmp.filter((c) => c.problem || c.wrong.length).slice(0, 3)));
  check(`[${lang}] summary says "${lang === 'vi' ? 'Xem N mặt hàng' : 'View N item(s)'}" with N = g.items.length = itemCount and is collapsed by default`, cmp.every((c) => c.sum === (lang === 'vi' ? `Xem ${c.n} mặt hàng` : `View ${c.n} item(s)`) && c.n === c.itemCount && !c.open), JSON.stringify(cmp.slice(0, 2).map((c) => [c.sum, c.n, c.itemCount, c.open])));
  check(`[${lang}] columns Code/Item/Qty/Unit/Bin (5 headers)`, cmp[0].heads.join('|') === (lang === 'vi' ? 'Mã|Tên hàng|SL|Đơn vị|Vị trí' : 'Code|Item|Qty|Unit|Bin'), cmp[0].heads.join('|'));
  const multi = await E(() => TICKETS.rows.findIndex((g) => g.items.length > 1));
  const variantIdx = await E(() => TICKETS.rows.findIndex((g) => g.items.some((i) => i.variant)));
  const noBin = await E(() => TICKETS.rows.findIndex((g) => g.items.some((i) => !i.bin)));
  check(`[${lang}] data coverage: card with >1 items / with variant / with an item lacking bin exist`, multi >= 0 && variantIdx >= 0 && noBin >= 0, JSON.stringify({ multi, variantIdx, noBin }));
  // open one and screenshot
  const pick = multi >= 0 ? multi : 0;
  await E((i) => { const d = document.querySelectorAll('#tkList .ticket-card')[i].querySelector('details'); d.open = true; d.scrollIntoView({ block: 'center' }); }, pick);
  await page.click(`#tkList .ticket-card:nth-child(${pick + 1}) details.tk-items summary`).catch(() => { }); // toggles back closed -> reopen
  await E((i) => { document.querySelectorAll('#tkList .ticket-card')[i].querySelector('details').open = true; }, pick);
  await sleep(100);
  const vis = await E((i) => { const d = document.querySelectorAll('#tkList .ticket-card')[i].querySelector('details'); const tw = d.querySelector('.table-wrap'); const r = tw.getBoundingClientRect(); const cr = d.closest('.card').getBoundingClientRect(); return { w: r.width, cw: cr.width, scrollW: tw.scrollWidth, clientW: tw.clientWidth, shadow: getComputedStyle(tw).boxShadow }; }, pick);
  check(`[${lang}] expanded table fits in the card (no horizontal scroll)`, vis.scrollW <= vis.clientW + 1 && vis.w <= vis.cw, JSON.stringify(vis));
  if (lang === 'vi') await shot('g3-3.09-items-open-D');
  // all items of the card with most items long
  const long = await E(() => { let best = 0, bi = 0; TICKETS.rows.forEach((g, i) => { if (g.items.length > best) { best = g.items.length; bi = i; } }); return { bi, best }; });
  if (lang === 'vi') {
    await E((i) => { const d = document.querySelectorAll('#tkList .ticket-card')[i].querySelector('details'); d.open = true; d.scrollIntoView({ block: 'center' }); }, long.bi);
    await sleep(100); await shot('g3-3.09-items-open-longest-D');
    obs(`[3.09] largest ticket in fixtures has ${long.best} items`);
  }
  flushErrors('3.09-' + lang);
}

/* =====================================================================================================*/
const PRINT_HOOK = () => {
  window.__pw = { opens: [], writes: [], docOpen: 0, docClose: 0, closedCalls: 0 };
  window.__prints = 0; window.__iframes = []; window.__iframePrints = 0;
  window.__printMode = 'fake';
  window.print = function () { window.__prints++; };
  window.open = function () {
    window.__pw.opens.push([].slice.call(arguments));
    if (window.__printMode === 'null') return null;
    if (window.__printMode === 'throw') throw new Error('popup blocked');
    return { closed: window.__printMode === 'closed', document: { open() { window.__pw.docOpen++; }, write(h) { window.__pw.writes.push(h); }, close() { window.__pw.docClose++; } } };
  };
  const origAppend = document.body.appendChild.bind(document.body);
  document.body.appendChild = function (n) {
    if (n.tagName === 'IFRAME' && window.__failIframe) throw new Error('iframe blocked');
    const r = origAppend(n);
    if (n.tagName === 'IFRAME') { window.__iframes.push(n); try { n.contentWindow.print = function () { window.__iframePrints++; }; } catch (e) { } }
    return r;
  };
};
async function t310(lang) {
  CUR = '3.10';
  await page.open({ role: 'admin', lang, viewport: 'D' });
  await page.eval('goto("ticket")'); await page.waitFor('#tkList .ticket-card'); await page.idle(250);
  await E(PRINT_HOOK);
  const nCards = await page.count('#tkList .ticket-card');
  const printBtn = (k) => `#tkList .ticket-card:nth-child(${k}) .ticket-head > .btn`;

  // ---- A) popup works (fake window) ----
  await page.click(printBtn(1)); await sleep(100);
  let pw = await E(() => ({ opens: __pw.opens.length, writes: __pw.writes.length, docOpen: __pw.docOpen, docClose: __pw.docClose, prints: __prints, iframes: __iframes.length, html: __pw.writes[0] || '' }));
  check(`[${lang}] popup path: window.open once, html written once (open/write/close), no iframe, parent never calls print()`, pw.opens === 1 && pw.writes === 1 && pw.docOpen === 1 && pw.docClose === 1 && pw.iframes === 0 && pw.prints === 0, JSON.stringify({ ...pw, html: pw.html.length }));
  const html = pw.html;
  const g0 = await E(() => ({ pic: TICKETS.rows[0].pic, id: TICKETS.rows[0].ticketId, n: TICKETS.rows[0].items.length, code: TICKETS.rows[0].items[0].code, dateVn: TICKETS.rows[0].dateVn }));
  const imgSrc = (html.match(/<img class="lgi"[^>]*src="([^"]*)"/) || [])[1] || '';
  check(`[${lang}] logo is an <img class="lgi"> with a data:image URI (${imgSrc.slice(0, 30)}…, ${imgSrc.length} chars)`, /^data:image\/(jpeg|png|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]{200,}$/.test(imgSrc), imgSrc.slice(0, 60));
  check(`[${lang}] no thicao.com anywhere in the print document`, !/thicao/i.test(html));
  const ext = html.replace(/data:[^"')]+/g, '').match(/(src|href)\s*=\s*["']https?:|url\(\s*["']?https?:|@import/gi) || [];
  check(`[${lang}] print document has no external resource (http/https src/href/url()/@import)`, ext.length === 0, ext.join(','));
  check(`[${lang}] legal entity + address from the server (the fixture sends the same text as the built-in constants) present; address split in nowrap segments`, html.includes('CÔNG TY TNHH GRAB') && html.includes('<span class="seg">Tầng 15</span>') && html.includes('<span class="seg">Thành phố Hồ Chí Minh</span>'), '');
  check(`[${lang}] ticket content: requester, date, first item code, one .ticket block`, html.includes(g0.pic) && html.includes(g0.dateVn) && html.includes(g0.code.split('-').join('-<wbr>')) && (html.match(/<div class="ticket">/g) || []).length === 1, JSON.stringify(g0));
  check(`[${lang}] one printScript (auto print inside the doc itself) + screen toolbar`, (html.match(/window\.print\(\)/g) || []).length === 2 && (html.match(/<script>/g) || []).length === 1 && html.includes('class="bar"'), `window.print() x${(html.match(/window\.print\(\)/g) || []).length}`);
  check(`[${lang}] bilingual labels present`, ['PHIẾU XUẤT KHO', 'PHIẾU NHẬP KHO', 'EXPORT TICKET', 'Received by', 'Địa chỉ', 'Cartons'].filter((s) => html.includes(s)).length >= 4);
  check(`[${lang}] tfoot total row present`, /<tfoot>[\s\S]*Tổng số lượng/.test(html));

  // print-all
  await E(() => { __pw.writes.length = 0; });
  await page.click('#tkPrintAll'); await sleep(100);
  const all = await E(() => ({ w: __pw.writes.length, html: __pw.writes[0] || '', n: TICKETS.rows.length }));
  check(`[${lang}] "In tất cả" => one document with ${all.n} .ticket blocks`, all.w === 1 && (all.html.match(/<div class="ticket">/g) || []).length === all.n, `blocks=${(all.html.match(/<div class="ticket">/g) || []).length}`);
  check(`[${lang}] every ticket carries the data-URI logo`, (all.html.match(/<img class="lgi"[^>]*src="data:image/g) || []).length === all.n);

  // render the generated document for a visual check
  if (lang === 'vi') {
    await E((h) => {
      const f = document.createElement('iframe'); f.id = '__preview'; f.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:99999;background:#fff;border:0';
      document.documentElement.appendChild(f);
      f.srcdoc = h.replace(/window\.print\(\)/g, 'void 0').replace(/setTimeout\(go,3000\)/, '0');
    }, html);
    await sleep(600);
    await shot('g3-3.10-printdoc-D');
    await E(() => document.getElementById('__preview').remove());
  }

  // ---- B) CONFIG override ----
  /* the server's orgName/orgAddress (TICKETS, from getTickets) win over CONFIG: clear them so the CONFIG fallback is what is under test */
  await E(() => { TICKETS.orgName = ''; TICKETS.orgAddress = ''; CONFIG.org = 'ACME <Test> & Co'; CONFIG.address = '12 Foo St, Bar Ward, Baz City'; __pw.writes.length = 0; });
  await page.click(printBtn(1)); await sleep(80);
  const ov = await E(() => __pw.writes[0] || '');
  check(`[${lang}] CONFIG.org/address override the constants (escaped) and the defaults disappear`, ov.includes('ACME &lt;Test&gt; &amp; Co') && ov.includes('<span class="seg">12 Foo St</span>') && ov.includes('<span class="seg">Baz City</span>') && !ov.includes('CÔNG TY TNHH GRAB') && !ov.includes('Nguyễn Văn Linh'), '');
  await E(() => { delete CONFIG.org; CONFIG.address = ''; __pw.writes.length = 0; });
  await page.click(printBtn(1)); await sleep(80);
  const back = await E(() => __pw.writes[0] || '');
  check(`[${lang}] empty/absent CONFIG.org/address fall back to constants`, back.includes('CÔNG TY TNHH GRAB') && back.includes('Nguyễn Văn Linh'), '');
  // server wins: TICKETS.orgName/orgAddress beat CONFIG.org/address and the built-in constants
  await E(() => { TICKETS.orgName = 'SRV Co <x>'; TICKETS.orgAddress = '9 Srv Rd, Srv City'; CONFIG.org = 'ACME <Test> & Co'; CONFIG.address = '12 Foo St, Bar Ward, Baz City'; __pw.writes.length = 0; });
  await page.click(printBtn(1)); await sleep(80);
  const sw = await E(() => __pw.writes[0] || '');
  check(`[${lang}] server orgName/orgAddress win over CONFIG and the constants (escaped)`, sw.includes('SRV Co &lt;x&gt;') && sw.includes('<span class="seg">9 Srv Rd</span>') && sw.includes('<span class="seg">Srv City</span>') && !sw.includes('ACME') && !sw.includes('Foo St') && !sw.includes('CÔNG TY TNHH GRAB'), '');
  await E(() => { TICKETS.orgName = ''; TICKETS.orgAddress = ''; delete CONFIG.org; CONFIG.address = ''; });
  await E(() => { delete CONFIG.address; });

  // ---- C) popup blocked (window.open -> null) => hidden iframe, exactly once, no double print ----
  await E(() => { __printMode = 'null'; __pw.writes.length = 0; __pw.opens.length = 0; __iframePrints = 0; __prints = 0; });
  await page.click(printBtn(1)); await sleep(1800);
  const ifr = await E(() => {
    const f = __iframes[0];
    return { n: __iframes.length, inDom: document.querySelectorAll('body > iframe').length, opens: __pw.opens.length, prints: __prints, ifPrints: __iframePrints,
      css: f && f.style.cssText, hasDoc: f && f.contentDocument.body.innerHTML.length, logo: f && (f.contentDocument.querySelector('img.lgi') || {}).src, ticketBlocks: f && f.contentDocument.querySelectorAll('.ticket').length,
      title: f && f.contentDocument.title, fakeWrites: __pw.writes.length, toasts: [...document.querySelectorAll('#toastHost .toast')].map((t) => t.textContent) };
  });
  check(`[${lang}] popup blocked: exactly one hidden iframe created and the ticket rendered inside it`, ifr.n === 1 && ifr.inDom === 1 && ifr.hasDoc > 1000 && ifr.ticketBlocks === 1 && /width: ?0(px)?;/.test(ifr.css || '') && (ifr.logo || '').startsWith('data:image'), JSON.stringify(ifr));
  check(`[${lang}] popup blocked: print triggered once by the document script (iframe.print=${ifr.ifPrints}), parent window.print=${ifr.prints}, window.open called once`, ifr.ifPrints === 1 && ifr.prints === 0 && ifr.opens === 1, JSON.stringify({ ifPrints: ifr.ifPrints, prints: ifr.prints, opens: ifr.opens }));
  check(`[${lang}] popup blocked: no error toast when the iframe route works`, ifr.toasts.length === 0, JSON.stringify(ifr.toasts));
  // afterprint cleanup
  await E(() => { __iframes[0].contentWindow.dispatchEvent(new Event('afterprint')); });
  await sleep(900);
  check(`[${lang}] iframe removed after afterprint (cleanup)`, (await E(() => document.querySelectorAll('body > iframe').length)) === 0);

  // ---- D) window.open throws / returns closed window -> same fallback once ----
  for (const mode of ['throw', 'closed']) {
    await E((m) => { __printMode = m; __iframes.length = 0; __iframePrints = 0; document.querySelectorAll('body > iframe').forEach((x) => x.remove()); }, mode);
    await page.click(printBtn(1)); await sleep(1500);
    const r = await E(() => ({ n: __iframes.length, ifPrints: __iframePrints, prints: __prints }));
    check(`[${lang}] window.open ${mode === 'throw' ? 'throws' : 'returns a closed window'} => one iframe, one print`, r.n === 1 && r.ifPrints === 1, JSON.stringify(r));
  }
  // ---- E) both fail => toast ----
  await E(() => { __printMode = 'null'; __failIframe = true; document.querySelectorAll('body > iframe').forEach((x) => x.remove()); document.querySelectorAll('#toastHost .toast').forEach((t) => t.remove()); });
  await page.click(printBtn(1)); await sleep(300);
  const bad = await E(() => ({ toasts: [...document.querySelectorAll('#toastHost .toast')].map((t) => t.className + '|' + t.textContent), frames: document.querySelectorAll('body > iframe').length }));
  check(`[${lang}] popup blocked AND iframe fails => error toast with blocked message`, bad.toasts.length === 1 && /err/.test(bad.toasts[0]) && /pop-?up/i.test(bad.toasts[0]), JSON.stringify(bad));
  // iframe whose contentDocument is unavailable (leaves the element behind?)
  await E(() => { __failIframe = false; document.querySelectorAll('#toastHost .toast').forEach((t) => t.remove()); window.__cdDesc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentDocument'); Object.defineProperty(HTMLIFrameElement.prototype, 'contentDocument', { configurable: true, get() { return null; } }); });
  await page.click(printBtn(1)); await sleep(300);
  const bad2 = await E(() => { const r = { toasts: [...document.querySelectorAll('#toastHost .toast')].map((t) => t.className + '|' + t.textContent), frames: document.querySelectorAll('body > iframe').length }; Object.defineProperty(HTMLIFrameElement.prototype, 'contentDocument', window.__cdDesc); return r; });
  check(`[${lang}] iframe write throws => error toast`, bad2.toasts.length === 1 && /err/.test(bad2.toasts[0]), JSON.stringify(bad2));
  if (bad2.frames > 0) obs(`[3.10] when writing to the fallback iframe throws (contentDocument unavailable) the <iframe> stays in the DOM: openPrintWindow's catch block never calls cleanup (AdminAndTickets.html ~L827-839) -> ${bad2.frames} orphan iframe(s) per failed attempt`);
  // print-all with null popup => one iframe, one print
  await E(() => { __printMode = 'null'; __iframes.length = 0; __iframePrints = 0; document.querySelectorAll('body > iframe').forEach((x) => x.remove()); });
  await page.click('#tkPrintAll'); await sleep(1500);
  const pa = await E(() => ({ n: __iframes.length, ifPrints: __iframePrints, blocks: __iframes[0].contentDocument.querySelectorAll('.ticket').length, total: TICKETS.rows.length }));
  check(`[${lang}] print-all via iframe: 1 iframe, 1 print, ${pa.total} tickets`, pa.n === 1 && pa.ifPrints === 1 && pa.blocks === pa.total, JSON.stringify(pa));
  // printAll with no data
  await E(() => { TICKETS = { rows: [], range: {} }; document.querySelectorAll('#toastHost .toast').forEach((t) => t.remove()); printAllTickets(); });
  check(`[${lang}] print-all with empty data => toast (no window)`, (await page.toasts()).some((x) => x.kind === 'err'), JSON.stringify(await page.toasts()));
  flushErrors('3.10-' + lang);
}

/* =====================================================================================================*/
async function t311(lang) {
  CUR = '3.11';
  await openAdmin(lang, 'M');
  const sw = await E(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, dpr: devicePixelRatio, coarse: matchMedia('(pointer:coarse)').matches }));
  check(`[${lang}] M viewport 390, coarse pointer, no horizontal overflow on admin page`, sw.iw === 390 && sw.coarse && sw.sw <= 390, JSON.stringify(sw));
  await shot('g3-3.11-admin-top-M');
  const regOv = await E(() => { const r = document.getElementById('regAdmin'); if (!r || r.hidden) return null; return { scrollW: r.scrollWidth, clientW: r.clientWidth, docW: document.documentElement.scrollWidth, btnRight: Math.round([...r.querySelectorAll('.btn, button')].map((b) => b.getBoundingClientRect().right).sort((a, b) => b - a)[0] || 0) }; });
  if (regOv && (regOv.scrollW > regOv.clientW + 1 || regOv.btnRight > 390)) obs('[3.11] #regAdmin card (user registrations, features/Register.html) on 390px: ' + JSON.stringify(regOv) + ' - its buttons/columns overflow the card; it is not a .rt table so it does not get the card layout');
  await E(() => document.getElementById('userForm').scrollIntoView({ block: 'center' })); await sleep(100); await shot('g3-3.11-userform-firstload-M');
  const uform = await E(() => { const b = document.getElementById('btnUserSave'); const r = b.getBoundingClientRect(); return { txt: b.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height) }; });
  check(`[${lang}] mobile: add-user save button shows its label on first load`, uform.txt.length > 0, JSON.stringify(uform));
  await E(() => document.querySelector('#apTable tbody tr').scrollIntoView({ block: 'start' }));
  const card = await E(() => {
    const t = document.getElementById('apTable');
    const tr = t.querySelector('tbody tr');
    const q = (el, p) => getComputedStyle(el, p);
    const cells = [...tr.cells];
    return {
      tableDisplay: q(t).display, theadDisplay: q(t.tHead).display, trDisplay: q(tr).display, trBorder: q(tr).borderTopWidth, trRadius: q(tr).borderTopLeftRadius,
      cells: cells.map((c) => ({ label: c.getAttribute('data-label'), disp: q(c).display, before: q(c, '::before').content, vis: c.getBoundingClientRect().height > 0, w: Math.round(c.getBoundingClientRect().width) })),
      trW: Math.round(tr.getBoundingClientRect().width), trScrollW: tr.scrollWidth
    };
  });
  check(`[${lang}] approval table becomes cards (table/rows display:block, thead hidden, row border+radius)`, card.tableDisplay === 'block' && card.theadDisplay === 'none' && card.trDisplay === 'block' && parseFloat(card.trBorder) >= 1 && parseFloat(card.trRadius) > 0, JSON.stringify({ t: card.tableDisplay, th: card.theadDisplay, tr: card.trDisplay, b: card.trBorder }));
  const labelled = card.cells.filter((c) => c.label && c.vis);
  check(`[${lang}] each data cell shows its column label via ::before`, labelled.length >= 8 && labelled.every((c) => c.before.replace(/"/g, '') === c.label), JSON.stringify(labelled.map((c) => [c.label, c.before])).slice(0, 400));
  check(`[${lang}] card does not overflow horizontally`, card.trScrollW <= card.trW + 1, `${card.trScrollW} vs ${card.trW}`);
  await E(() => document.querySelector('#apTable tbody tr').scrollIntoView({ block: 'start' }));
  await shot('g3-3.11-approval-card-M');
  // checkbox + actions tappable
  const tap = await E(() => {
    const tr = document.querySelector('#apTable tbody tr');
    const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; };
    const chk = tr.querySelector('.ap-chk'), actions = [...tr.querySelectorAll('.cell-actions > .btn, .cell-actions > details > summary')];
    return { chk: r(chk), chkTd: r(chk.parentElement), actions: actions.map((a) => [a.textContent.trim(), ...r(a)]), selAllVisible: document.getElementById('apSelAll').getBoundingClientRect().height > 0 };
  });
  check(`[${lang}] row checkbox tap area: checkbox ${tap.chk.join('x')} in cell ${tap.chkTd.join('x')} (>= 24px WCAG min target)`, tap.chkTd[0] >= 24 && tap.chkTd[1] >= 24, JSON.stringify(tap));
  check(`[${lang}] action buttons Duyệt / Từ chối / Thêm are >= 40px tall (coarse pointer)`, tap.actions.length === 3 && tap.actions.every((a) => a[2] >= 40), JSON.stringify(tap.actions));
  if (!tap.selAllVisible) obs(`[3.11/3.06] On 390px the thead is hidden, so the "chọn tất cả" checkbox (#apSelAll lives in <thead>) is not reachable on mobile; only per-row checkboxes + the bulk button work`);
  await page.resetCalls();
  await page.click('#apTable tbody tr:nth-child(1) .ap-chk');
  await page.click('#apTable tbody tr:nth-child(3) .ap-chk');
  const sel = await E(() => ({ btn: document.getElementById('apBulkBtn').innerText.trim(), n: Object.keys(AP_SEL).length }));
  check(`[${lang}] real taps on 2 row checkboxes select them and update the bulk button`, sel.n === 2 && sel.btn.includes('2'), JSON.stringify(sel));
  await E(() => document.getElementById('apBulk').scrollIntoView({ block: 'center' }));
  const bulkTap = await E(() => { const b = document.getElementById('apBulkBtn').getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; });
  check(`[${lang}] bulk button is tappable (>=40px) and opens the confirm dialog`, bulkTap[1] >= 40, JSON.stringify(bulkTap));
  await page.click('#apBulkBtn'); await sleep(100);
  const bd = await E(() => { const d = document.querySelector('#uiDlg .guide-card').getBoundingClientRect(); return { open: !!document.getElementById('uiDlg'), w: Math.round(d.width), left: Math.round(d.left), bottom: Math.round(d.bottom), vh: innerHeight, okW: Math.round(document.getElementById('uiDlgOk').getBoundingClientRect().width), dir: getComputedStyle(document.querySelector('#uiDlg .guide-actions')).flexDirection }; });
  check(`[${lang}] bulk confirm dialog fits the phone (inside viewport, stacked buttons)`, bd.open && bd.left >= 0 && bd.left + bd.w <= 390 && bd.bottom <= bd.vh && bd.dir === 'column-reverse', JSON.stringify(bd));
  await shot('g3-3.11-bulk-dialog-M');
  await page.click('#uiDlgNo');
  await page.click('#apTable tbody tr:nth-child(2) .cell-actions > .btn.sm:not(.ghost)'); await sleep(80);
  check(`[${lang}] real tap on Duyệt opens the approve dialog`, await dlgOpen());
  await page.click('#uiDlgNo');

  // "Thêm" sheet
  await E(() => document.querySelector('#apTable tbody tr:nth-child(2)').scrollIntoView({ block: 'center' }));
  await page.click('#apTable tbody tr:nth-child(2) details.more > summary'); await sleep(150);
  const sheet = await E(() => {
    const d = document.querySelector('#apTable tbody tr:nth-child(2) details.more'); const pop = d.querySelector('.more-pop'); const r = pop.getBoundingClientRect();
    const nav = document.querySelector('.topnav'); const nr = nav.getBoundingClientRect();
    const mid = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const btn = pop.querySelector('.btn').getBoundingClientRect();
    return { open: d.open, pos: getComputedStyle(pop).position, inline: pop.style.cssText, r: [r.left, r.top, r.right, r.bottom].map(Math.round), nav: [nr.top, nr.bottom].map(Math.round), navPos: getComputedStyle(nav).position, vh: innerHeight, vw: innerWidth, hit: pop.contains(mid), btnH: Math.round(btn.height), btnW: Math.round(btn.width), z: getComputedStyle(pop).zIndex, navZ: getComputedStyle(nav).zIndex };
  });
  check(`[${lang}] "Thêm" opens as bottom sheet: fixed, full width (12px gutters), bottom above the bottom nav (no overlap), on top`, sheet.open && sheet.pos === 'fixed' && sheet.r[0] === 12 && sheet.r[2] === 378 && sheet.r[3] <= sheet.nav[0] && sheet.hit && sheet.inline === '', JSON.stringify(sheet));
  check(`[${lang}] sheet item is >= 40px tall`, sheet.btnH >= 40, `${sheet.btnW}x${sheet.btnH}`);
  await shot('g3-3.11-more-sheet-M');
  await page.click('#apTable tbody tr:nth-child(2) .more-pop .btn'); await sleep(100);
  check(`[${lang}] tapping "Xóa yêu cầu" in the sheet closes it and opens the confirm dialog`, (await dlgOpen()) && !(await E(() => document.querySelector('#apTable details.more[open]'))));
  await page.click('#uiDlgNo');
  // tap outside closes sheet
  await page.click('#apTable tbody tr:nth-child(2) details.more > summary'); await sleep(100);
  await page.click('#page-admin .page-title'); await sleep(80);
  check(`[${lang}] tap outside closes the sheet`, !(await E(() => document.querySelector('#apTable details.more[open]'))));

  // users table
  await E(() => document.getElementById('userTable').scrollIntoView({ block: 'start' }));
  await sleep(100);
  const u = await E(() => {
    const t = document.getElementById('userTable'); const tr = t.querySelector('tbody tr'); const q = (e, p) => getComputedStyle(e, p);
    const acts = [...tr.querySelectorAll('.cell-actions .btn')].map((b) => [b.textContent.trim(), Math.round(b.getBoundingClientRect().width), Math.round(b.getBoundingClientRect().height)]);
    return { disp: q(t).display, thead: q(t.tHead).display, tr: q(tr).display, cells: [...tr.cells].map((c) => [c.getAttribute('data-label'), q(c, '::before').content, c.getBoundingClientRect().height > 0]), acts, ov: document.documentElement.scrollWidth, link: tr.cells[1].querySelector('.link').getBoundingClientRect().height };
  });
  check(`[${lang}] users table: cards, labelled cells (email/username/CC/dept/role), no overflow`, u.disp === 'block' && u.thead === 'none' && u.tr === 'block' && u.cells.filter((c) => c[0] && c[2]).length >= 5 && u.cells.filter((c) => c[0] && c[2]).every((c) => c[1].replace(/"/g, '') === c[0]) && u.ov <= 390, JSON.stringify(u.cells));
  check(`[${lang}] users: Sửa/Xóa buttons >= 40px tall`, u.acts.length >= 1 && u.acts.every((a) => a[2] >= 40), JSON.stringify(u.acts));
  const nm = await E(() => { const l = document.querySelector('#userTable tbody tr .link').getBoundingClientRect(); return [Math.round(l.width), Math.round(l.height)]; });
  if (nm[1] < 32) obs(`[3.11] user-name link tap target on mobile is ${nm.join('x')}px (inline span, below 44px comfortable target, WCAG 24px min is met only if height >= 24)`);
  await shot('g3-3.11-users-card-M');
  await page.click('#userTable tbody tr:nth-child(2) .cell-actions .btn.ghost:not(.danger)'); await sleep(250);
  check(`[${lang}] real tap on Sửa enters edit mode`, (await E(() => document.getElementById('uEmail').disabled)));
  await page.click('#btnUserCancel');
  await E(() => { const tr = [...document.querySelectorAll('#userTable tbody tr')].find((t) => t.querySelector('.btn.danger')); tr.scrollIntoView({ block: 'center' }); });
  await page.click('#userTable tbody tr:nth-child(2) .cell-actions .btn.danger'); await sleep(100);
  check(`[${lang}] real tap on Xóa opens the confirm dialog`, await dlgOpen());
  await shot('g3-3.11-delete-dialog-M');
  await page.click('#uiDlgNo');
  // empty approvals card (td.empty) renders normally
  await E(() => __setServer({ getPendingRequests: () => ({ ok: true, rows: [] }) }));
  await E(() => loadApproval()); await page.idle(250);
  const emp = await E(() => ({ txt: document.getElementById('apTable').innerText.replace(/\s+/g, ' ').trim(), bulkHidden: document.getElementById('apBulk').hidden, ov: document.documentElement.scrollWidth }));
  check(`[${lang}] empty approval list: message shown, bulk bar hidden, no overflow`, emp.txt.length > 3 && emp.bulkHidden && emp.ov <= 390, JSON.stringify(emp));
  await shot('g3-3.11-approval-empty-M');
  flushErrors('3.11-' + lang);

  // phiếu kho at mobile (card layout of nested items table + header)
  if (lang === 'vi') {
    CUR = '3.09';
    await page.open({ role: 'admin', lang, viewport: 'M' });
    await page.eval('goto("ticket")'); await page.waitFor('#tkList .ticket-card'); await page.idle(250);
    await E(() => { const d = document.querySelector('#tkList .ticket-card details'); d.open = true; d.scrollIntoView({ block: 'center' }); });
    await sleep(150);
    const m = await E(() => ({ ov: document.documentElement.scrollWidth, disp: getComputedStyle(document.querySelector('.tk-items table')).display, lbl: document.querySelector('.tk-items tbody td').getAttribute('data-label'), before: getComputedStyle(document.querySelector('.tk-items tbody td'), '::before').content }));
    check(`[vi] (bonus, mobile) Phiếu kho items section: no overflow, items table is card list with labels`, m.ov <= 390 && m.disp === 'block' && !!m.lbl, JSON.stringify(m));
    await shot('g3-3.09-items-open-M');
    CUR = '3.11';
    flushErrors('3.09-M');
  }
}

/* ===================================================================================================== */
const PLAN = [['3.01', t301], ['3.02', t302], ['3.03', t303], ['3.04', t304], ['3.05', t305], ['3.06', t306], ['3.07', t307], ['3.08', t308], ['3.09', t309], ['3.10', t310], ['3.11', t311]];
try {
  for (const [id, fn] of PLAN) {
    if (ONLY.length && !ONLY.includes(id)) continue;
    for (const lang of (id === '3.01' || id === '3.02' || id === '3.03' || id === '3.04' || id === '3.05' || id === '3.06' || id === '3.07' || id === '3.08' || id === '3.09' || id === '3.10' || id === '3.11') ? ['vi', 'en'] : ['vi']) {
      CUR = id; console.log(`\n== ${id} (${lang})`);
      try { await fn(lang); }
      catch (e) { CUR = id; check(`[${lang}] test script crashed: ${e.message.split('\n')[0]}`, false, (e.stack || '').split('\n').slice(0, 4).join(' | ')); flushErrors(id + '-' + lang + '-crash'); try { await shot(`g3-${id}-crash-${lang}`); } catch { } }
    }
  }
} finally {
  await page.close();
  const out = Object.keys(R).sort().map((k) => ({ item: k, checks: R[k].checks, blocked: R[k].blocked }));
  fs.writeFileSync(path.join(HERE, 'results', 'group3.json'), JSON.stringify({ items: out, observations: OBS, consoleErrors: ERRS }, null, 2));
  console.log('\n=========== SUMMARY');
  for (const o of out) {
    const f = o.checks.filter((c) => !c.ok);
    console.log(`${o.item}: ${f.length ? 'FAIL' : o.blocked.length ? 'BLOCKED' : 'PASS'}  (${o.checks.length - f.length}/${o.checks.length})` + f.map((c) => '\n     - ' + c.name + ' :: ' + String(c.detail).slice(0, 220)).join(''));
  }
  console.log('console errors:', JSON.stringify(ERRS));
}
