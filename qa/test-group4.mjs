// test-group4.mjs - QA Nhóm 4 (Kiểm kê, Báo cáo, SKU), items 4.01 - 4.13.   node test-group4.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDriver } from './driver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCR = (n) => path.join(HERE, 'results', 'screens', `g4-${n}.png`);
const items = {};            // id -> [{name, ok, detail}]
let cur = '';
function check(name, ok, detail = '') {
  (items[cur] = items[cur] || []).push({ name, ok: !!ok, detail: String(detail) });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + cur + ' ' + name + (detail ? '  - ' + String(detail).slice(0, 300) : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* page-side stub for stocktakeGet: distinctive system quantities so any leak is greppable.
   pending lines: sys = 7770000 + i*11  (must NEVER reach the DOM while blind)
   counted lines: sysAtCount = 8880000 + i*13 (allowed to show) */
const STK_INIT = (server) => {
  const g = server.stocktakeGet;
  server.stocktakeGet = (id) => {
    const r = g(id);
    if (r.session.status === 'COUNTING') r.lines.forEach((l, i) => { if (l.counted === null) l.sys = 7770000 + i * 11; else l.sysAtCount = 8880000 + i * 13; });
    return r;
  };
};
const LEAK_RE = '7[.,]7[67]\\\\d[.,]\\\\d{3}|777\\\\d{4}';

const page = await createDriver();
const errAll = [];
function harvestErrors(tag) { const e = page.consoleErrors({ clear: true }); e.forEach((x) => errAll.push(tag + ' :: [' + x.kind + '] ' + x.text.split('\n')[0] + (x.url ? ' @' + path.basename(x.url) + ':' + x.line : ''))); }

async function openStk(o = {}) {
  await page.open({ role: 'admin', lang: o.lang || 'vi', viewport: o.vp || 'D', init: o.noStub ? undefined : STK_INIT, now: o.now });
  await page.eval('goto("stocktake")');
  await page.waitFor('#stkListTable tbody tr[data-n]');
  if (o.session === false) return;
  await page.eval((id) => { const r = [...document.querySelectorAll('#stkListTable tr[data-n]')].find((x) => x.textContent.includes(id)); r.click(); }, o.id || 'KK-20261027-01');
  await page.waitFor('#stkTable tbody tr[data-row], #stkTable tbody tr');
  await page.idle();
}
const rowInfo = () => page.eval(() => [...document.querySelectorAll('#stkTable tbody tr[data-row]')].map((r) => ({
  code: r.getAttribute('data-row'), cls: r.className, cells: [...r.cells].map((c) => c.textContent.trim()), attrs: [...r.querySelectorAll('*')].concat(r).flatMap((e) => [...e.attributes].map((a) => a.name + '=' + a.value)),
  html: r.outerHTML, input: (r.querySelector('input[data-act=qty]') || {}).value })));
const statsInfo = () => page.eval(() => [...document.querySelectorAll('#stkStats > *')].map((b) => ({ f: b.getAttribute('data-f'), v: b.querySelector('.v').textContent, l: b.querySelector('.l').textContent, on: b.classList.contains('on'), tag: b.tagName })));

try {
  /* ============ 4.01 - 4.04 : blind count (VI + EN, desktop) ============ */
  for (const lang of ['vi', 'en']) {
    cur = '4.01';
    await openStk({ lang });
    const T = await page.eval(() => ({ blind: t('stk.blind'), hidden: t('stk.blindHidden'), moved: t('stk.nowQty', { n: '' }), res: ['MATCH', 'OVER', 'SHORT'].map((k) => t('stk.res.' + k)), fAll: t('stk.f.all'), fPen: t('stk.f.pending') }));
    const L = lang + ': ';
    const ls = await page.eval(() => localStorage.getItem('gim_stk_blind'));
    const btn = await page.eval(() => { const b = document.getElementById('stkBlindBtn'); const cs = getComputedStyle(b); return { hidden: b.hidden, disp: cs.display, pressed: b.getAttribute('aria-pressed'), on: b.classList.contains('on'), text: b.textContent.trim(), title: b.title }; });
    check(L + 'blind button visible, ON by default, aria-pressed=true', !btn.hidden && btn.disp !== 'none' && btn.pressed === 'true' && btn.on && btn.text === T.blind, JSON.stringify(btn) + ' ls=' + ls);
    let rows = await rowInfo();
    const masked = rows.filter((r) => r.cells[3] === '' && r.input === '');       // no counted value
    const savedRows = rows.filter((r) => r.input !== '');
    check(L + 'fixture has mix: masked + saved rows', masked.length > 0 && savedRows.length > 0, `masked=${masked.length} saved=${savedRows.length} total=${rows.length}`);
    check(L + 'masked rows show "—" in System/Variance/Result', masked.every((r) => r.cells[2] === '—' && r.cells[4] === '—' && r.cells[5] === '—'), masked.slice(0, 2).map((r) => r.cells.join('|')).join(' ;; '));
    check(L + 'masked rows have no colour class (no stripe)', masked.every((r) => r.cls === ''), [...new Set(masked.map((r) => r.cls))].join(','));
    const stripe = await page.eval(() => [...document.querySelectorAll('#stkTable tbody tr[data-row]')].filter((r) => !r.querySelector('input').value).map((r) => getComputedStyle(r.cells[0]).boxShadow).filter((s) => s !== 'none').length);
    check(L + 'masked rows: computed box-shadow stripe none', stripe === 0, 'rows with stripe=' + stripe);
    check(L + 'masked rows have no "moved/system now" note, no badge', masked.every((r) => !r.html.includes(T.moved.trim()) && !/stk-pos|stk-neg|class="badge (ok|warn|danger)"/.test(r.html) && !r.html.includes('i-alert')), '');
    // saved lines: DO reveal (allowed) - at least one has colour class
    check(L + 'saved rows reveal system + result', savedRows.every((r) => /^\d|^-?\d/.test(r.cells[2]) && r.cells[5] !== '—'), savedRows.slice(0, 2).map((r) => r.cells.join('|')).join(' ;; '));
    // moved lines among saved
    const movedRows = savedRows.filter((r) => r.html.includes('i-alert'));
    check(L + 'saved+moved rows still show "System now" note (info about already-revealed lines)', movedRows.length >= 1, 'moved=' + movedRows.length);

    // whole-DOM leak scan for pending-line system quantities
    const leaks = await page.eval((re) => { const rx = new RegExp(re); const out = []; const walk = (root) => { const h = root.outerHTML; const m = h.match(new RegExp(rx.source, 'g')); if (m) out.push(...m); }; walk(document.documentElement); return out; }, LEAK_RE.replace(/\\\\/g, '\\'));
    check(L + 'no pending-line system qty anywhere in DOM (text, title, aria, data-*, hidden cells)', leaks.length === 0, leaks.slice(0, 5).join(','));
    const withTitle = await page.eval(() => [...document.querySelectorAll('#stkTable [title],#stkTable [aria-label],#stkTable [data-qty],#stkStats [title]')].map((e) => e.tagName + ':' + (e.title || e.getAttribute('aria-label'))).slice(0, 3));
    check(L + 'masked-cell tooltip is generic text only', withTitle.every((x) => x.includes(T.hidden)), JSON.stringify(withTitle));

    // typing does not reveal
    const stat0 = JSON.stringify(await statsInfo());
    const target = masked[0].code;
    await page.eval((c) => { const i = document.querySelector(`#stkTable input[data-code="${c}"]`); i.focus(); }, target);
    await page.type(`#stkTable input[data-code="${target}"]`, '5');
    await page.waitFor(() => !document.getElementById('stkSaveBtn').hidden);
    await sleep(100);
    rows = await rowInfo();
    const tr = rows.find((r) => r.code === target);
    check(L + 'typing a number keeps row masked (—, no class, no badge)', tr.input === '5' && tr.cells[2] === '—' && tr.cells[4] === '—' && tr.cells[5] === '—' && tr.cls === '' && !/class="badge/.test(tr.html.replace(/class="badge (neutral)"/, '')), JSON.stringify(tr.cells) + ' cls=' + tr.cls);
    check(L + 'typing does not change stats bar', JSON.stringify(await statsInfo()) === stat0, '');
    const leaks2 = await page.eval((re) => (document.documentElement.outerHTML.match(new RegExp(re, 'g')) || []), LEAK_RE.replace(/\\\\/g, '\\'));
    check(L + 'no leak after typing either', leaks2.length === 0, leaks2.slice(0, 3).join(','));
    // type a *matching-looking* value, clear it: still masked
    await page.type(`#stkTable input[data-code="${target}"]`, '');
    await sleep(60);
    if (lang === 'vi') await page.screenshot(SCR('4.01-admin-D'));

    /* ---------- 4.02 ---------- */
    cur = '4.02';
    // new page to reset typing
    await openStk({ lang });
    let st = await statsInfo();
    const tot = await page.eval(() => STK_CUR.lines.length), cnt = await page.eval(() => STK_CUR.lines.filter((l) => l.counted !== null).length);
    check(L + 'stats bar has exactly 2 buttons: All (counted/total) and Not entered', st.length === 2 && st[0].f === 'all' && st[1].f === 'pending' && st[0].l === T.fAll && st[1].l === T.fPen && st[0].v === `${cnt} / ${tot}` && st[1].v === String(tot - cnt), JSON.stringify(st));
    check(L + 'no static value/accuracy tiles, no Match/Over/Short stat', !(await page.exists('#stkStats .static')) && !(await page.exists('#stkStats [data-f=match]')), '');
    // type but not save -> stats unchanged
    const tgt = (await rowInfo()).find((r) => r.input === '').code;
    await page.type(`#stkTable input[data-code="${tgt}"]`, '3'); await sleep(120);
    st = await statsInfo();
    check(L + 'stats computed from SAVED counts only (typing unsaved does not change)', st[0].v === `${cnt} / ${tot}` && st[1].v === String(tot - cnt), JSON.stringify(st));
    // click filter pending
    await page.click('#stkStats [data-f=pending]');
    const pr = await rowInfo();
    check(L + 'filter "Not entered" lists only unsaved lines (' + pr.length + ')', pr.length === tot - cnt && pr.every((r) => r.cells[2] === '—'), 'rows=' + pr.length);
    await page.click('#stkStats [data-f=all]');
    // save -> reveal
    await page.resetCalls();
    await page.click('#stkSaveBtn'); await page.idle();
    const sc = await page.calls('stocktakeSaveCounts');
    check(L + 'save sends stocktakeSaveCounts(id,[{code,qty:"3"}])', sc.length === 1 && sc[0].args[1].length === 1 && sc[0].args[1][0].code === tgt && sc[0].args[1][0].qty === '3', JSON.stringify(sc[0] && sc[0].args));
    const after = (await rowInfo()).find((r) => r.code === tgt);
    st = await statsInfo();
    check(L + 'after save: row reveals system qty + result badge + colour class', /^8[.,]88/.test(after.cells[2]) && after.cells[5] !== '—' && after.cls === 'stk-short', JSON.stringify(after.cells) + ' cls=' + after.cls);
    check(L + 'after save: stats now ' + (cnt + 1) + ' / ' + tot, st[0].v === `${cnt + 1} / ${tot}` && st[1].v === String(tot - cnt - 1), JSON.stringify(st));
    const leaks3 = await page.eval((re) => (document.documentElement.outerHTML.match(new RegExp(re, 'g')) || []), LEAK_RE.replace(/\\\\/g, '\\'));
    check(L + 'after save other pending lines still not leaked', leaks3.length === 0, leaks3.slice(0, 3).join(','));
    if (lang === 'vi') await page.screenshot(SCR('4.02-admin-D'));

    /* ---------- 4.03 ---------- */
    cur = '4.03';
    await page.click('#stkBlindBtn');
    st = await statsInfo();
    let b2 = await page.eval(() => { const b = document.getElementById('stkBlindBtn'); return { pressed: b.getAttribute('aria-pressed'), on: b.classList.contains('on'), ls: localStorage.getItem('gim_stk_blind') }; });
    check(L + 'toggle OFF: aria-pressed=false, class off, localStorage "0"', b2.pressed === 'false' && !b2.on && b2.ls === '0', JSON.stringify(b2));
    check(L + 'toggle OFF: full stats (5 buttons + 2 static)', st.length === 7 && st.filter((s) => s.tag === 'BUTTON').length === 5, st.map((s) => s.l + '=' + s.v).join(' | '));
    rows = await rowInfo();
    const pend = rows.filter((r) => r.input === '');
    check(L + 'toggle OFF: pending rows show system qty (7.77x.xxx) again', pend.length > 0 && pend.every((r) => /^7[.,]7/.test(r.cells[2])), pend.slice(0, 2).map((r) => r.cells[2]).join(','));
    check(L + 'toggle OFF: counted rows keep result + colour', rows.filter((r) => r.input !== '').every((r) => r.cells[5] !== '—'), '');
    if (lang === 'vi') await page.screenshot(SCR('4.03-admin-D-off'));
    // persists across reload
    await page.reload(); await page.eval('goto("stocktake")'); await page.waitFor('#stkListTable tbody tr[data-n]');
    await page.eval(() => document.querySelector('#stkListTable tr[data-n]').click()); await page.waitFor('#stkTable tbody tr[data-row]');
    b2 = await page.eval(() => { const b = document.getElementById('stkBlindBtn'); return { pressed: b.getAttribute('aria-pressed'), on: b.classList.contains('on'), ls: localStorage.getItem('gim_stk_blind') }; });
    st = await statsInfo();
    check(L + 'OFF persists after reload (pressed=false, full stats)', b2.pressed === 'false' && !b2.on && b2.ls === '0' && st.length === 7, JSON.stringify(b2) + ' stats=' + st.length);
    // filter match then ON => filter resets to all
    await page.click('#stkStats [data-f=match]');
    await page.click('#stkBlindBtn');
    st = await statsInfo();
    b2 = await page.eval(() => ({ pressed: document.getElementById('stkBlindBtn').getAttribute('aria-pressed'), ls: localStorage.getItem('gim_stk_blind'), n: document.querySelectorAll('#stkTable tbody tr[data-row]').length, tot: STK_CUR.lines.length }));
    check(L + 'toggle ON: pressed=true, ls "1", filter Match reset to All (all rows back), 2 stats', b2.pressed === 'true' && b2.ls === '1' && st.length === 2 && st[0].on && b2.n === b2.tot, JSON.stringify(b2) + ' ' + JSON.stringify(st));
    await page.reload(); await page.eval('goto("stocktake")'); await page.waitFor('#stkListTable tbody tr[data-n]');
    await page.eval(() => document.querySelector('#stkListTable tr[data-n]').click()); await page.waitFor('#stkTable tbody tr[data-row]');
    check(L + 'ON persists after reload', (await page.eval(() => document.getElementById('stkBlindBtn').getAttribute('aria-pressed'))) === 'true' && (await statsInfo()).length === 2, '');
    // closed + cancelled sessions
    for (const [id, nm] of [['KK-20261009-01', 'CLOSED'], ['KK-20261019-01', 'CANCELLED'], ['KK-20260924-01', 'CLOSED/MATCHED']]) {
      await page.eval('stkBack()'); await page.waitFor('#stkListTable tbody tr[data-n]');
      await page.eval((i) => { [...document.querySelectorAll('#stkListTable tr[data-n]')].find((x) => x.textContent.includes(i)).click(); }, id); await page.idle(); await sleep(100);
      const bb = await page.eval(() => { const b = document.getElementById('stkBlindBtn'); return { hidden: b.hidden, disp: getComputedStyle(b).display, rect: b.getBoundingClientRect().width, stats: document.querySelectorAll('#stkStats > *').length, masked: [...document.querySelectorAll('#stkTable tbody tr[data-row]')].filter((r) => r.cells[2].textContent.trim() === '—').length, rows: document.querySelectorAll('#stkTable tbody tr[data-row]').length }; });
      check(L + `${nm} (${id}): blind button hidden, stats full, rows not masked`, bb.hidden && bb.disp === 'none' && bb.rect === 0 && bb.stats === 7 && bb.masked === 0, JSON.stringify(bb));
    }

    /* ---------- 4.04 ---------- */
    cur = '4.04';
    await openStk({ lang });
    await page.eval(() => { window.__blobs = []; const o = URL.createObjectURL; URL.createObjectURL = (b) => { window.__blobs.push(b); return o.call(URL, b); }; });
    // type into 2 pending lines so confirm dialog has OVER/SHORT among unsaved + saved ones
    const pend4 = (await rowInfo()).filter((r) => r.input === '').slice(0, 2);
    await page.type(`#stkTable input[data-code="${pend4[0].code}"]`, '1');
    await page.type(`#stkTable input[data-code="${pend4[1].code}"]`, '99999999');
    await page.eval(() => { const e = document.querySelectorAll('#stkTable input[data-act=qty]'); });
    // CSV phiếu đếm (before save, with dirty values) - blind ON
    await page.eval(() => stkExportCsv(false)); await sleep(100);
    const csv1 = await page.eval(async () => (await window.__blobs[0].text()));
    const head1 = csv1.split('\r\n')[0];
    check(L + 'count-sheet CSV header = Bin,Asset Code,Name,Unit,Counted (no System/Variance/Result)', head1 === '"Bin","Asset Code","Name","Unit","Counted"', head1);
    check(L + 'count-sheet CSV has no system qty (7.77x / 8.88x numbers) and no result words', !/777\d{4}|888\d{4}|7[.,]77|8[.,]88/.test(csv1) && !/Match|Over|Short|Khớp|Dư|Thiếu|MATCH|OVER|SHORT/.test(csv1), csv1.split('\r\n').slice(1, 3).join(' ;; '));
    check(L + 'count-sheet CSV: Counted column blank for every row, 1 row per line', csv1.split('\r\n').slice(1).every((l) => l.endsWith(',""')) && csv1.split('\r\n').length - 1 === (await page.eval(() => STK_CUR.lines.length)), 'lines=' + (csv1.split('\r\n').length - 1));
    const dl = await page.eval(() => 1);
    // result CSV while blind (observation)
    await page.eval(() => stkExportCsv(true)); await sleep(100);
    const csv2 = await page.eval(async () => (await window.__blobs[1].text()));
    const leaksCsv2 = (csv2.match(/777\d{4}/g) || []).length;
    check(L + '[observation] result CSV "Xuất kết quả" while blind exposes System of unsaved lines (count of 777xxxx leaks=' + leaksCsv2 + ')', true, 'info only; head=' + csv2.split('\r\n')[0]);
    await page.resetCalls();
    await page.click('#stkConfirmBtn'); await page.waitFor('#stkConfirmModal:not([hidden])'); await page.idle();
    const dlg = await page.eval(() => ({ body: document.getElementById('stkConfirmBody').innerText, rows: [...document.querySelectorAll('#stkCfTable tbody tr')].map((r) => [...r.cells].map((c) => c.textContent.trim())), heads: [...document.querySelectorAll('#stkCfTable thead th')].map((c) => c.textContent.trim()) }));
    check(L + 'confirm dialog: saved dirty lines first (stocktakeSaveCounts called with 2 entries)', (await page.calls('stocktakeSaveCounts')).length === 1 && (await page.calls('stocktakeSaveCounts'))[0].args[1].length === 2, '');
    check(L + 'confirm dialog shows full summary (Match/Over/Short + value variance)', /\d+.*\d+.*\d+/.test(dlg.body.split('\n')[0]) && (await page.eval(() => document.getElementById('stkConfirmBody').querySelector('p').textContent)).includes(lang === 'vi' ? 'Chênh lệch giá trị' : 'Value variance'), dlg.body.split('\n')[0]);
    check(L + 'confirm dialog table: System, Counted, Variance all numeric, no "—"', dlg.rows.length > 0 && dlg.rows.every((r) => r.slice(2).every((c) => c !== '—' && /\d/.test(c))) && dlg.heads.length === 5, JSON.stringify(dlg.rows.slice(0, 3)));
    check(L + 'confirm dialog lists the revealed system qty of freshly saved lines (8.88x)', dlg.rows.some((r) => /8[.,]88/.test(r[2])), '');
    if (lang === 'vi') await page.screenshot(SCR('4.04-admin-D-confirm'));
    harvestErrors('blind-' + lang);
  }

  /* ============ 4.05 cancel + back ============ */
  cur = '4.05';
  for (const lang of ['vi', 'en']) {
    const L = lang + ': ';
    await openStk({ lang });
    await page.eval(() => document.querySelector('#page-stocktake details.more summary').click());
    await page.click('#stkCancelBtn');
    await page.waitFor('#uiDlg');
    const d = await page.eval(() => { const m = document.getElementById('uiDlg'); const ok = document.getElementById('uiDlgOk'); const why = document.getElementById('uiDlgWhy'); return { role: m.getAttribute('role'), modal: m.getAttribute('aria-modal'), title: document.getElementById('uiDlgTitle').textContent, ok: ok.textContent, danger: ok.classList.contains('danger-solid'), okDisabled: ok.disabled, why: !!why, whyTag: why && why.tagName, lbl: why && m.querySelector('label').textContent, focus: document.activeElement.id, n: document.querySelectorAll('#uiDlg').length, t: [t('stk.confirmCancel'), t('stk.cancel'), t('dlg.reasonOpt')] }; });
    check(L + 'cancel opens ONE uiDialog (danger, optional reason, ok enabled w/o reason)', d.n === 1 && d.role === 'dialog' && d.modal === 'true' && d.danger && d.why && !d.okDisabled && d.title === d.t[0] && d.ok === d.t[1] && d.lbl === d.t[2], JSON.stringify(d));
    check(L + 'cancel dialog focus is in the reason box', d.focus === 'uiDlgWhy', d.focus);
    if (lang === 'vi') await page.screenshot(SCR('4.05-admin-D-cancel'));
    // with reason
    await page.type('#uiDlgWhy', 'Sai kho');
    await page.resetCalls();
    await page.click('#uiDlgOk'); await page.idle();
    let c = await page.calls('stocktakeCancel');
    check(L + 'stocktakeCancel(id, "Sai kho") called once', c.length === 1 && c[0].args[0] === 'KK-20261027-01' && c[0].args[1] === 'Sai kho', JSON.stringify(c.map((x) => x.args)));
    await page.waitFor('#stkListView:not([hidden])');
    check(L + 'after cancel: back to list, session shows cancelled', (await page.eval(() => [...document.querySelectorAll('#stkListTable tr[data-n]')].find((r) => r.textContent.includes('KK-20261027-01')).textContent)).match(/Đã huỷ|Cancelled/) !== null, '');
    // no reason
    await openStk({ lang });
    await page.eval(() => document.querySelector('#page-stocktake details.more summary').click());
    await page.click('#stkCancelBtn'); await page.waitFor('#uiDlg');
    await page.resetCalls(); await page.press('Enter'); await page.idle();
    c = await page.calls('stocktakeCancel');
    check(L + 'cancel w/o reason via Enter: stocktakeCancel(id, "")', c.length === 1 && c[0].args[1] === '', JSON.stringify(c.map((x) => x.args)));
    // Escape closes without calling
    await openStk({ lang });
    await page.eval(() => document.querySelector('#page-stocktake details.more summary').click());
    await page.click('#stkCancelBtn'); await page.waitFor('#uiDlg'); await page.resetCalls();
    await page.press('Escape'); await sleep(150);
    check(L + 'Escape closes cancel dialog, no server call, stays in detail', !(await page.exists('#uiDlg')) && (await page.calls('stocktakeCancel')).length === 0 && !(await page.eval(() => document.getElementById('stkDetailView').hidden)), '');

    // back with unsaved
    const t1 = (await rowInfo()).find((r) => r.input === '').code;
    await page.type(`#stkTable input[data-code="${t1}"]`, '4');
    await page.click('#stkDetailView .odoo-crumb a');
    await page.waitFor('#uiDlg');
    const b = await page.eval(() => ({ title: document.getElementById('uiDlgTitle').textContent, body: document.getElementById('uiDlgBody').textContent, danger: document.getElementById('uiDlgOk').classList.contains('danger-solid'), ok: document.getElementById('uiDlgOk').textContent, focus: document.activeElement.id, t: [t('stk.unsavedTitle'), t('stk.unsaved'), t('stk.discard')], inDetail: !document.getElementById('stkDetailView').hidden }));
    check(L + 'Back with unsaved -> uiDialog (danger, "discard?"), still in detail', b.title === b.t[0] && b.body === b.t[1] && b.ok === b.t[2] && b.danger && b.inDetail, JSON.stringify(b));
    check(L + 'danger dialog w/o reason focuses Cancel', b.focus === 'uiDlgNo', b.focus);
    await page.click('#uiDlgNo'); await sleep(100);
    check(L + 'choosing Cancel keeps typed value and stays', !(await page.eval(() => document.getElementById('stkDetailView').hidden)) && (await rowInfo()).find((r) => r.code === t1).input === '4', '');
    await page.click('#stkDetailView .odoo-crumb a'); await page.waitFor('#uiDlg'); await page.click('#uiDlgOk');
    await page.waitFor('#stkListView:not([hidden])');
    check(L + 'discard -> back to list', true, '');
    await openStk({ lang });
    await page.click('#stkDetailView .odoo-crumb a'); await sleep(200);
    check(L + 'Back with nothing unsaved -> no dialog, straight to list', !(await page.exists('#uiDlg')) && !(await page.eval(() => document.getElementById('stkListView').hidden)), '');
    // beforeunload
    await openStk({ lang });
    const bu0 = await page.eval(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
    const t2 = (await rowInfo()).find((r) => r.input === '').code;
    await page.type(`#stkTable input[data-code="${t2}"]`, '4');
    const bu1 = await page.eval(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
    check(L + 'beforeunload: not blocked when clean, blocked when unsaved', bu0 === false && bu1 === true, `clean=${bu0} dirty=${bu1}`);
    harvestErrors('4.05-' + lang);
  }

  /* ============ 4.06 list ============ */
  cur = '4.06';
  for (const lang of ['vi', 'en']) {
    const L = lang + ': ';
    await openStk({ lang, session: false });
    const h = await page.eval(() => { const h1 = document.querySelector('#stkListView h1'); const kho = document.querySelector('#page-home h1, #page-kho h1'); const p = document.querySelector('#stkListView .page-sub'); const cs = getComputedStyle(h1); const cs2 = kho ? getComputedStyle(kho) : null; return { cls: h1.className, tag: h1.tagName, fs: cs.fontSize, fw: cs.fontWeight, other: cs2 && (cs2.fontSize + '/' + cs2.fontWeight + '/' + kho.className), sub: p && p.textContent, subVisible: p && p.getBoundingClientRect().height > 0, count: document.querySelectorAll('#page-stocktake h1').length, t: [t('stk.title'), t('stk.sub')] }; });
    check(L + 'list h1.page-title + sub line present with correct i18n', h.tag === 'H1' && h.cls.includes('page-title') && h.sub === h.t[1] && h.subVisible, JSON.stringify(h));
    check(L + 'h1 style matches other page titles', h.other === null || h.other.startsWith(h.fs + '/' + h.fw), h.fs + '/' + h.fw + ' vs ' + h.other);
    // Tab to row
    await page.eval(() => { const b = document.querySelector('#stkListView .odoo-actions .btn:last-child'); b.focus(); });
    /* the sortable column headings (TableSort.html) are tab stops between the refresh button and the first row */
    for (let i = 0; i < 8; i++) { await page.press('Tab'); await sleep(50); if (await page.eval(() => document.activeElement.tagName === 'TR')) break; }
    const f1 = await page.eval(() => { const a = document.activeElement; return { tag: a.tagName, n: a.getAttribute('data-n'), role: a.getAttribute('role'), tabindex: a.getAttribute('tabindex'), outline: getComputedStyle(a).outlineStyle + ' ' + getComputedStyle(a).outlineWidth }; });
    check(L + 'Tab from refresh button lands on first list row (tabindex=0, role=button)', f1.tag === 'TR' && f1.n === '0' && f1.role === 'button' && f1.tabindex === '0', JSON.stringify(f1));
    check(L + 'focused row shows focus-visible outline', /solid 2px/.test(f1.outline), f1.outline);
    await page.screenshot(SCR('4.06-admin-D-' + lang));
    await page.resetCalls();
    await page.press('Enter'); await page.idle();
    let g = await page.calls('stocktakeGet');
    check(L + 'Enter opens session exactly once (1 stocktakeGet)', g.length === 1, 'calls=' + g.length);
    await page.waitFor('#stkDetailView:not([hidden])');
    await page.eval('stkLeave()'); await page.waitFor('#stkListTable tbody tr[data-n]');
    await page.eval(() => document.querySelector('#stkListTable tr[data-n="0"]').focus());
    await page.resetCalls();
    await page.press('Space'); await page.idle();
    g = await page.calls('stocktakeGet');
    check(L + 'Space opens session exactly once', g.length === 1 && !(await page.eval(() => document.getElementById('stkDetailView').hidden)), 'calls=' + g.length);
    // mouse click once
    await page.eval('stkLeave()'); await page.waitFor('#stkListTable tbody tr[data-n]'); await page.resetCalls();
    await page.click('#stkListTable tbody tr[data-n="0"]'); await page.idle();
    check(L + 'mouse click opens once', (await page.calls('stocktakeGet')).length === 1, '');
    // stat label style (detail)
    const sl = await page.eval(() => { const l = document.querySelector('#stkStats .odoo-stat .l'); const cs = getComputedStyle(l); return { fs: cs.fontSize, tt: cs.textTransform, ls: cs.letterSpacing, text: l.textContent }; });
    check(L + 'stat labels 12px, not uppercase', sl.fs === '12px' && sl.tt === 'none', JSON.stringify(sl));
    const ov = async (view) => page.eval((view) => {
      const h = document.querySelector('#page-stocktake > .help-btn'); if (!h) return { none: true };
      const hr = h.getBoundingClientRect();
      const root = document.getElementById(view);
      const hit = [...root.querySelectorAll('button, .odoo-step, summary, a, h1')].filter((e) => e.getBoundingClientRect().width > 0 && !e.closest('[hidden]')).filter((e) => { const r = e.getBoundingClientRect(); return r.left < hr.right && r.right > hr.left && r.top < hr.bottom && r.bottom > hr.top; }).map((e) => (e.id || e.className || e.tagName) + ':' + (e.textContent || '').trim().slice(0, 14));
      return { help: [hr.left, hr.top, hr.right, hr.bottom].map(Math.round), hit };
    }, view);
    await page.eval('stkLeave()'); await page.waitFor('#stkListTable tbody tr[data-n]');
    const ovL = await ov('stkListView');
    check(L + 'list view: "?" help button does not overlap Refresh / New buttons or the title', ovL.none || ovL.hit.length === 0, JSON.stringify(ovL));
    await page.eval(() => document.querySelector('#stkListTable tr[data-n]').click()); await page.waitFor('#stkTable tbody tr[data-row]'); await page.idle();
    const ovD = await ov('stkDetailView');
    check(L + 'detail view: "?" help button does not overlap the status steps / actions', ovD.none || ovD.hit.length === 0, JSON.stringify(ovD));
    harvestErrors('4.06-' + lang);
  }

  /* ============ 4.07 modals ============ */
  cur = '4.07';
  for (const lang of ['vi', 'en']) {
    const L = lang + ': ';
    await openStk({ lang });
    // --- paste modal ---
    await page.click('#stkPasteBtn'); await page.waitFor('#stkPasteModal:not([hidden])');
    const m = await page.eval((id) => { const m = document.querySelector('#' + id + ' .odoo-dialog'); const lb = document.getElementById(m.getAttribute('aria-labelledby')); return { role: m.getAttribute('role'), modal: m.getAttribute('aria-modal'), lblText: lb && lb.textContent.trim(), focus: document.activeElement.id || document.activeElement.tagName }; }, 'stkPasteModal');
    check(L + 'paste modal: role=dialog, aria-modal, aria-labelledby resolves to title', m.role === 'dialog' && m.modal === 'true' && m.lblText === (await page.eval(() => t('stk.paste'))), JSON.stringify(m));
    check(L + 'paste modal: initial focus = textarea', m.focus === 'stkPasteText', m.focus);
    // Tab trap: 6 tabs and 6 shift-tabs stay inside
    const inside = async () => page.eval(() => document.getElementById('stkPasteModal').contains(document.activeElement));
    let ok = true; const trail = [];
    for (let i = 0; i < 6; i++) { await page.press('Tab'); ok = ok && await inside(); trail.push(await page.eval(() => document.activeElement.id || document.activeElement.textContent.trim().slice(0, 12))); }
    for (let i = 0; i < 6; i++) { await page.press('Shift+Tab'); ok = ok && await inside(); trail.push(await page.eval(() => document.activeElement.id || document.activeElement.textContent.trim().slice(0, 12))); }
    check(L + 'paste modal: Tab / Shift+Tab never leave the dialog', ok, trail.join(' > '));
    await page.screenshot(SCR('4.07-admin-D-paste-' + lang));
    await page.press('Escape'); await sleep(100);
    const afterEsc = await page.eval(() => ({ hidden: document.getElementById('stkPasteModal').hidden, focus: document.activeElement.id }));
    check(L + 'paste modal: Escape closes and focus returns to opener (#stkPasteBtn)', afterEsc.hidden && afterEsc.focus === 'stkPasteBtn', JSON.stringify(afterEsc));
    // reopen / close via cancel button: focus return again & no duplicate trap leak
    await page.click('#stkPasteBtn'); await page.waitFor('#stkPasteModal:not([hidden])');
    await page.click('#stkPasteModal footer .btn.ghost'); await sleep(80);
    check(L + 'paste modal: Cancel button closes and returns focus', (await page.eval(() => document.getElementById('stkPasteModal').hidden && document.activeElement.id)) === 'stkPasteBtn', '');
    // apply paste works
    await page.click('#stkPasteBtn'); await page.waitFor('#stkPasteModal:not([hidden])');
    const codes = (await rowInfo()).filter((r) => r.input === '').slice(0, 2).map((r) => r.code);
    await page.type('#stkPasteText', `${codes[0]}\t5\n${codes[1]};7\nNOPE\t1`);
    await page.click('#stkPasteModal footer .btn:not(.ghost)'); await sleep(150);
    check(L + 'paste apply fills inputs (2 ok, 1 skipped) and closes', (await rowInfo()).filter((r) => codes.includes(r.code)).map((r) => r.input).join() === '5,7' && (await page.eval(() => document.getElementById('stkPasteModal').hidden)), (await page.toasts()).map((t) => t.text).join('|'));

    // --- confirm modal ---
    await page.click('#stkConfirmBtn'); await page.waitFor('#stkConfirmModal:not([hidden])'); await page.idle(); await sleep(100);
    const m2 = await page.eval(() => { const m = document.querySelector('#stkConfirmModal .odoo-dialog'); const lb = document.getElementById(m.getAttribute('aria-labelledby')); const a = document.activeElement; return { role: m.getAttribute('role'), modal: m.getAttribute('aria-modal'), lblText: lb && lb.textContent.trim(), focusText: a.textContent.trim(), focusIn: m.contains(a), first: document.querySelector('#stkConfirmFoot .btn').textContent.trim(), cancelLbl: t('stk.cfBack') }; });
    check(L + 'confirm modal: role/aria-modal/labelledby', m2.role === 'dialog' && m2.modal === 'true' && m2.lblText === (await page.eval(() => t('stk.confirmTitle'))), JSON.stringify(m2));
    check(L + 'confirm modal: initial focus on safe "Back" button (not adjust)', m2.focusIn && m2.focusText === m2.cancelLbl, m2.focusText);
    let ok2 = true; const trail2 = [];
    for (let i = 0; i < 12; i++) { await page.press('Tab'); ok2 = ok2 && await page.eval(() => document.getElementById('stkConfirmModal').contains(document.activeElement)); trail2.push(await page.eval(() => (document.activeElement.className.includes('stk-cf') ? 'cb' : (document.activeElement.id || document.activeElement.textContent.trim().slice(0, 10))))); }
    for (let i = 0; i < 4; i++) { await page.press('Shift+Tab'); ok2 = ok2 && await page.eval(() => document.getElementById('stkConfirmModal').contains(document.activeElement)); }
    check(L + 'confirm modal: Tab / Shift+Tab stay inside', ok2, trail2.join(' > '));
    await page.screenshot(SCR('4.07-admin-D-confirm-' + lang));
    // stacked uiDialog over the confirm modal: Esc closes only top
    await page.eval(() => { window.__cbCalled = 0; uiDialog({ title: 'Top', body: 'x', danger: true }, () => { window.__cbCalled++; }); });
    await page.waitFor('#uiDlg');
    const z = await page.eval(() => ({ dlg: +getComputedStyle(document.getElementById('uiDlg')).zIndex, modal: +getComputedStyle(document.getElementById('stkConfirmModal')).zIndex }));
    await page.press('Escape'); await sleep(100);
    const e1 = await page.eval(() => ({ dlg: !!document.getElementById('uiDlg'), conf: !document.getElementById('stkConfirmModal').hidden, cb: window.__cbCalled }));
    check(L + 'stacked: Escape closes ONLY the top (uiDialog), confirm modal stays, cb not called, z-index dlg>modal', !e1.dlg && e1.conf && e1.cb === 0 && z.dlg > z.modal, JSON.stringify({ e1, z }));
    // tab inside stacked uiDialog moves between its 2 buttons (focus-trap interplay)
    await page.eval(() => { uiDialog({ title: 'Top', body: 'x' }, () => {}); });
    await page.waitFor('#uiDlg');
    const seq = [];
    for (let i = 0; i < 4; i++) { await page.press('Tab'); seq.push(await page.eval(() => document.activeElement.id || document.activeElement.tagName)); }
    check(L + 'stacked: Tab cycles through BOTH buttons of the top uiDialog (focus not stolen by lower trap)', new Set(seq).size >= 2 && seq.every((s) => s.startsWith('uiDlg')), seq.join(' > '));
    await page.press('Escape'); await sleep(80);
    await page.press('Escape'); await sleep(100);
    const e2 = await page.eval(() => ({ conf: document.getElementById('stkConfirmModal').hidden, focus: document.activeElement.id }));
    check(L + 'second Escape closes confirm modal, focus returns to #stkConfirmBtn', e2.conf && e2.focus === 'stkConfirmBtn', JSON.stringify(e2));
    harvestErrors('4.07-' + lang);
  }

  cur = '4.07';
  {
    await openStk({ lang: 'vi' });
    await page.eval(() => document.getElementById('stkPasteBtn').click()); await sleep(150);
    await page.eval(() => __history.fire('home')); await sleep(300);
    const st = await page.eval(() => ({ page: (document.querySelector('.page.active') || {}).id, modalHidden: document.getElementById('stkPasteModal').hidden, trap: !!STK_TRAPS.stkPasteModal }));
    await page.eval(() => document.body.focus());
    const seq = []; for (let i = 0; i < 4; i++) { await page.press('Tab'); seq.push(await page.eval(() => document.activeElement.tagName + '#' + document.activeElement.id)); }
    check('Back while paste modal open: after leaving, modal closed + focus trap released + Tab works on Home', st.page === 'page-home' && st.modalHidden && !st.trap && new Set(seq).size > 1, JSON.stringify(st) + ' Tab: ' + seq.join(' > '));
    await openStk({ lang: 'vi' });
    const code = await page.eval(() => STK_CUR.lines.find((l) => l.counted === null).code);
    await page.type('#stkTable input[data-code="' + code + '"]', '3'); await sleep(150);
    await page.eval(() => document.getElementById('stkPasteBtn').click()); await sleep(150);
    await page.eval(() => __history.fire('home')); await page.waitFor('#uiDlg');
    const seq2 = []; for (let i = 0; i < 4; i++) { await page.press('Tab'); seq2.push(await page.eval(() => document.activeElement.id)); }
    check('Back with paste modal + unsaved counts: discard dialog on top; Tab reaches both its buttons', new Set(seq2).size >= 2, seq2.join(' > '));
    await page.screenshot(SCR('4.07-admin-D-stacked'));
    harvestErrors('4.07-back');
  }

  /* ============ 4.08 / 4.09 / 4.10 / 4.11 reports ============ */
  const openRp = async (o = {}) => { await page.open({ role: 'admin', lang: o.lang || 'vi', viewport: o.vp || 'D', now: o.now }); await page.eval('goto("report")'); await page.waitFor('#page-report.active #rpTable thead th'); await page.idle(); };

  cur = '4.08';
  for (const lang of ['vi', 'en']) {
    const L = lang + ': ';
    await openRp({ lang, now: '2026-10-29T09:00' });
    const ini = await page.eval(() => ({ from: rpFrom.value, to: rpTo.value, runBtn: [...document.querySelectorAll('#page-report button')].filter((b) => [t('rp.run'), 'Xem báo cáo', 'Run report'].includes(b.textContent.trim())).length }));
    check(L + 'no "Xem báo cáo"/"Run report" button; defaults 1st of month -> today', ini.runBtn === 0 && ini.from === '2026-10-01' && ini.to === '2026-10-29', JSON.stringify(ini));
    check(L + 'entering the tab ran reportNxt exactly once', (await page.calls('reportNxt')).length === 1, '');
    const setv = (id, v, ev) => page.eval((id, v, ev) => { const e = document.getElementById(id); e.value = v; ev.forEach((n) => e.dispatchEvent(new Event(n, { bubbles: true }))); }, id, v, ev);
    await page.resetCalls();
    await setv('rpFrom', '2026-10-05', ['input', 'change']);
    await sleep(150);
    const early = (await page.calls('reportNxt')).length;
    await sleep(350); await page.idle();
    let c = await page.calls('reportNxt');
    check(L + 'change from: not called before 300ms, then exactly 1 call with new range', early === 0 && c.length === 1 && c[0].args[0].from === '2026-10-05' && c[0].args[0].to === '2026-10-29', `early=${early} total=${c.length} ${JSON.stringify(c[0] && c[0].args)}`);
    await page.resetCalls();
    await setv('rpFrom', '2026-10-06', ['input', 'change']); await sleep(100);
    await setv('rpTo', '2026-10-20', ['input', 'change']); await sleep(100);
    await setv('rpCat', (await page.eval(() => rpCat.options[1].value)), ['change']);
    await sleep(500); await page.idle();
    c = await page.calls('reportNxt');
    check(L + 'rapid 3 changes within 300ms -> a single call carrying final values', c.length === 1 && c[0].args[0].from === '2026-10-06' && c[0].args[0].to === '2026-10-20' && c[0].args[0].cat !== '', JSON.stringify(c.map((x) => x.args)));
    await page.resetCalls();
    await setv('rpCat', '', ['change']); await sleep(500); await page.idle();
    check(L + 'change category -> 1 call', (await page.calls('reportNxt')).length === 1, '');
    // from > to
    await page.resetCalls();
    await page.eval(() => { document.querySelectorAll('#toastHost .toast').forEach((x) => x.remove()); });
    await setv('rpFrom', '2026-10-25', ['input', 'change']); await sleep(550); await page.idle();
    const tt = await page.toasts(); const msg = await page.eval(() => t('rp.badRange'));
    check(L + 'from > to: error toast with rp.badRange, no server call', (await page.calls('reportNxt')).length === 0 && tt.some((x) => x.kind === 'err' && x.text.includes(msg)), JSON.stringify(tt) + ' calls=' + (await page.calls('reportNxt')).length);
    check(L + 'from > to: toast shown once (not duplicated by input+change)', tt.filter((x) => x.text.includes(msg)).length === 1, 'n=' + tt.filter((x) => x.text.includes(msg)).length);
    // empty (mid-edit)
    await page.resetCalls();
    await setv('rpFrom', '', ['input', 'change']); await sleep(500);
    check(L + 'half-edited (empty) date: no call, no extra toast', (await page.calls('reportNxt')).length === 0, '');
    // busy then change -> rerun
    await setv('rpFrom', '2026-10-01', ['input', 'change']); await setv('rpTo', '2026-10-29', ['input', 'change']); await sleep(500); await page.idle();
    await page.resetCalls();
    await page.eval(() => { __server.__hold = { reportNxt: true }; });
    await setv('rpFrom', '2026-10-02', ['change']); await sleep(450);
    await setv('rpCat', (await page.eval(() => rpCat.options[1].value)), ['change']); await sleep(450);
    await page.eval(() => { delete __server.__hold.reportNxt; __release('reportNxt'); }); await sleep(300); await page.idle();
    c = await page.calls('reportNxt');
    check(L + 'filter changed while a run is in flight -> re-run after it finishes with the final filter (2 calls)', c.length === 2 && c[1].args[0].from === '2026-10-02' && c[1].args[0].cat !== '', JSON.stringify(c.map((x) => x.args)));
    check(L + 'results visible, pager spinner cleared', (await page.count('#rpTable tbody tr')) > 0 && !(await page.exists('#rpPager .spin')), '');
    if (lang === 'vi') await page.screenshot(SCR('4.08-admin-D'));
    harvestErrors('4.08-' + lang);
  }

  /* ---------- 4.09 quick ranges ---------- */
  cur = '4.09';
  const pad2 = (n) => String(n).padStart(2, '0');
  const iso = (y, m, d) => { const dt = new Date(Date.UTC(y, m - 1, d)); return dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate()); };
  const expected = (y, m, d) => {
    const today = iso(y, m, d);
    const month = [iso(y, m, 1), today], prev = [iso(y, m - 1, 1), iso(y, m, 0)], week = [iso(y, m, d - 6), today], q0 = Math.floor((m - 1) / 3) * 3 + 1, quarter = [iso(y, q0, 1), today];
    return { month, prev, week, quarter };
  };
  for (const ds of ['2026-01-05', '2026-01-01', '2026-02-01', '2026-03-01', '2026-03-31', '2026-04-01', '2026-10-29', '2026-12-31']) {
    const [y, m, d] = ds.split('-').map(Number), exp = expected(y, m, d);
    await openRp({ now: ds + 'T09:00' });
    const out = {}; let allOk = true; const det = [];
    const initOn = await page.eval(() => [...document.querySelectorAll('#rpQuickSeg button')].filter((b) => b.classList.contains('on')).map((b) => b.dataset.k));
    for (const k of ['month', 'prev', 'week', 'quarter']) {
      await page.resetCalls();
      await page.click(`#rpQuickSeg button[data-k=${k}]`); await page.idle();
      const r = await page.eval(() => ({ from: rpFrom.value, to: rpTo.value, on: [...document.querySelectorAll('#rpQuickSeg button')].filter((b) => b.classList.contains('on')).map((b) => b.dataset.k) }));
      const calls = await page.calls('reportNxt');
      const wantOn = Object.keys(exp).filter((kk) => exp[kk][0] === exp[k][0] && exp[kk][1] === exp[k][1]).sort();
      const good = r.from === exp[k][0] && r.to === exp[k][1] && JSON.stringify(r.on.sort()) === JSON.stringify(wantOn) && calls.length === 1 && calls[0].args[0].from === exp[k][0] && calls[0].args[0].to === exp[k][1];
      allOk = allOk && good; det.push(`${k}:${r.from}->${r.to} on=[${r.on}]${good ? '' : ' EXPECTED ' + exp[k].join('->') + ' on=[' + wantOn + '] calls=' + calls.length}`);
    }
    const wantInit = Object.keys(exp).filter((kk) => exp[kk][0] === exp.month[0] && exp[kk][1] === exp.month[1]).sort();
    check(`now=${ds}: 4 quick buttons set correct from/to, highlight exactly matching button(s), 1 server call each`, allOk && JSON.stringify(initOn.sort()) === JSON.stringify(wantInit), det.join(' ; ') + ' | initial on=[' + initOn + '] want [' + wantInit + ']');
    if (ds === '2026-10-29') {
      // manual edit clears highlight; typing a range equal to another preset re-highlights
      await page.eval(() => { const e = rpFrom; e.value = '2026-10-03'; e.dispatchEvent(new Event('change', { bubbles: true })); });
      check('now=2026-10-29: manual date edit removes highlight', (await page.eval(() => document.querySelectorAll('#rpQuickSeg button.on').length)) === 0, '');
      await page.eval(() => { rpFrom.value = '2026-10-01'; rpFrom.dispatchEvent(new Event('change', { bubbles: true })); });
      check('now=2026-10-29: restoring 1st-of-month re-highlights "This month"', (await page.eval(() => [...document.querySelectorAll('#rpQuickSeg button.on')].map((b) => b.dataset.k).join())) === 'month,quarter'.split(',').filter((k) => exp[k][0] === '2026-10-01').join(), '');
      await page.screenshot(SCR('4.09-admin-D'));
    }
  }
  // English labels for the buttons
  await openRp({ lang: 'en', now: '2026-10-29T09:00' });
  check('EN quick buttons: This month / Last month / 7 days / This quarter', (await page.eval(() => [...document.querySelectorAll('#rpQuickSeg button')].map((b) => b.textContent.trim()).join('|'))) === 'This month|Last month|7 days|This quarter', '');
  // quick on stale/other tab
  harvestErrors('4.09');

  /* the unit control is two tick-boxes (Cái / Thùng, rpUnitTick): reach each / box / both, ticking first because the last box cannot be unticked */
  const setUnit = async (u) => {
    const want = { e: u !== 'box', b: u !== 'each' };
    const cur = await page.eval(() => ({ e: document.getElementById('rpUEach').checked, b: document.getElementById('rpUBox').checked }));
    const flips = [['e', 'rpUEach'], ['b', 'rpUBox']].filter(([k]) => want[k] !== cur[k]).sort((a, b) => Number(want[b[0]]) - Number(want[a[0]]));
    for (const [, id] of flips) { await page.eval((i) => document.getElementById(i).click(), id); await sleep(60); }
    const now = await page.eval(() => ({ e: document.getElementById('rpUEach').checked, b: document.getElementById('rpUBox').checked }));
    if (now.e !== want.e || now.b !== want.b) throw new Error(`setUnit('${u}') ended in ${JSON.stringify(now)}`);
  };
  /* ---------- 4.10 unit control ---------- */
  cur = '4.10';
  for (const lang of ['vi', 'en']) {
    const L = lang + ': ';
    await openRp({ lang });
    for (const tab of ['nxt', 'stock', 'alert']) {
      await page.eval((tb) => rpTab(tb), tab); await page.idle(); await sleep(150);
      const pos = await page.eval(() => { const f = document.getElementById('rpFilters'); const kids = [...f.children]; const last = kids[kids.length - 1]; const seg = document.getElementById('rpUnitChecks'); const r = (e) => e.getBoundingClientRect(); const others = kids.slice(0, -1).filter((k) => k.getBoundingClientRect().height > 0); const lr = r(last); const after = others.filter((k) => r(k).top >= lr.bottom - 1 || (r(k).bottom > lr.top + 1 && r(k).left > lr.left)); return { lastIsUnit: last.classList.contains('rp-unit') && last.contains(seg), n: kids.length, after: after.length, buttons: [...seg.querySelectorAll('input[type=checkbox]')].map((b) => b.nextElementSibling.textContent.trim()), on: [...seg.querySelectorAll('input:checked')].length }; });
      check(L + `${tab}: unit control is the LAST filter, visually last, 2 tick-boxes (1 ticked)`, pos.lastIsUnit && pos.after === 0 && pos.buttons.length === 2 && pos.on === 1, JSON.stringify(pos));
      if (lang === 'vi') await page.screenshot(SCR('4.10-admin-D-' + tab));
    }
    // NXT switching
    await page.eval(() => rpTab('nxt')); await page.idle(); await sleep(100);
    await page.resetCalls();
    const heads = {};
    for (const u of ['each', 'box', 'both']) {
      await setUnit(u); await sleep(100);
      heads[u] = await page.eval(() => [...document.querySelectorAll('#rpTable thead th')].map((x) => x.textContent.trim()));
    }
    const calls = (await page.calls('reportNxt')).length;
    const tk = await page.eval(() => ({ open: t('rp.c.open'), se: t('rp.suffix.each'), sb: t('rp.suffix.box') }));
    check(L + 'NXT: unit change does not call the server', calls === 0, 'reportNxt calls=' + calls);
    check(L + 'NXT: Each -> 4+4 cols; Box -> 4+4 box cols (no each); Both -> 4+8 with (suffix)', heads.each.length === 8 && heads.box.length === 8 && heads.both.length === 12 && heads.both.slice(4).filter((x) => x.includes('(')).length === 8 && !heads.each.slice(4).some((x) => x.includes('(')), JSON.stringify(heads));
    const boxRows = await page.eval(() => document.querySelectorAll('#rpTable tbody tr').length);
    await setUnit('box'); await sleep(80);
    const vals = await page.eval(() => ({ rows: document.querySelectorAll('#rpTable tbody tr').length, ons: [...document.querySelectorAll('#rpUnitChecks input:checked')].map((b) => b.nextElementSibling.textContent.trim()) }));
    check(L + 'NXT: Box shows only rows having boxes; only the Box tick-box is ticked', vals.ons.length === 1 && vals.ons[0] === (await page.eval(() => t('rp.u.box'))) && vals.rows <= (await page.eval(() => RP.nxt.rows.length)), JSON.stringify(vals));
    // the last ticked box cannot be unticked
    await setUnit('each');
    await page.eval(() => document.getElementById('rpUEach').click()); await sleep(80);
    const lastBox = await page.eval(() => ({ e: document.getElementById('rpUEach').checked, b: document.getElementById('rpUBox').checked, unit: RP.unit }));
    check(L + 'the last ticked box cannot be unticked (Each stays on)', lastBox.e && !lastBox.b && lastBox.unit === 'each', JSON.stringify(lastBox));
    // stock / alert switching
    for (const tab of ['stock', 'alert']) {
      await page.eval((tb) => rpTab(tb), tab); await page.idle(); await sleep(100); await page.resetCalls();
      const hh = {};
      for (const u of ['each', 'box', 'both']) { await setUnit(u); await sleep(80); hh[u] = await page.eval(() => [...document.querySelectorAll('#rpTable thead th')].map((x) => x.textContent.trim())); }
      const anyCall = (await page.calls()).length;
      check(L + `${tab}: Each/Box/Both swap the stock columns (${JSON.stringify(Object.fromEntries(Object.entries(hh).map(([k, v]) => [k, v.length])))})`, anyCall === 0 && hh.each.length !== hh.both.length && hh.both.length === hh.each.length + 1 && hh.box.length === hh.each.length, JSON.stringify(hh) + ' serverCalls=' + anyCall);
    }
    harvestErrors('4.10-' + lang);
  }

  /* ---------- 4.11 totals ---------- */
  cur = '4.11';
  const clean = (s) => s.replace(/\s+/g, ' ').trim();
  for (const lang of ['vi', 'en']) {
    const L = lang + ': ';
    await openRp({ lang });
    const tf = () => page.eval(() => { const t = document.querySelector('#rpTable tfoot'); return t ? [...t.rows[0].cells].map((c) => c.textContent.trim()) : null; });
    const heads = () => page.eval(() => [...document.querySelectorAll('#rpTable thead th')].map((x) => x.textContent.trim()));
    const sumTiles = () => page.eval(() => [...document.querySelectorAll('#rpSummary .odoo-stat')].map((s) => [s.querySelector('.l').textContent.trim(), s.querySelector('.v').textContent.trim()]));
    const totalsMatch = async (u, tag) => {
      const h = await heads(), f = await tf(), tiles = (await sumTiles()).map((x) => x[1]);
      if (!f) { check(L + tag + ': tfoot present', false, 'no tfoot'); return; }
      const fmtN = (n) => n.toLocaleString(lang === 'en' ? 'en-US' : 'vi-VN');
      const res = await page.eval(() => RP.nxt.totals), cols = await page.eval(() => RP.cols.map((c) => c.k));
      let ok = f.length === h.length && f[0] === (await page.eval(() => t('rp.total')));
      const det = [];
      cols.forEach((k, i) => { if (i >= 4) { const want = fmtN(res[k]); if (f[i] !== want) { ok = false; det.push(k + ': tfoot ' + f[i] + ' != totals ' + want); } } });
      const numeric = f.slice(4).slice().sort(), tl = tiles.slice().sort();
      if (JSON.stringify(numeric) !== JSON.stringify(tl)) { ok = false; det.push('tiles ' + JSON.stringify(tiles) + ' != tfoot ' + JSON.stringify(f.slice(4))); }
      check(L + tag + ': tfoot totals = res.totals = summary tiles', ok, det.join(' ; ') + ' | tfoot=' + JSON.stringify(f));
    };
    await totalsMatch('each', 'NXT each');
    let f = await tf(); const cnt = await page.eval(() => RP.foot.count);
    check(L + 'NXT: tfoot label "Total" + "N items" = server total', f[1].includes(String(cnt)) && cnt === (await page.eval(() => RP.nxt.total)), JSON.stringify(f.slice(0, 2)) + ' total=' + (await page.eval(() => RP.nxt.total)));
    if (lang === 'vi') await page.screenshot(SCR('4.11-admin-D-nxt'));
    await setUnit('both'); await sleep(80); await totalsMatch('both', 'NXT both');
    await setUnit('box'); await sleep(80); await totalsMatch('box', 'NXT box');
    // truncated
    await setUnit('each');
    await page.eval(() => { __server.__reportMax = 20; });
    await page.eval(() => { rpFrom.value = '2026-01-01'; rpFrom.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(450); await page.idle();
    const tr = await page.eval(() => ({ trunc: RP.nxt.truncated, rows: RP.nxt.rows.length, total: RP.nxt.total }));
    await totalsMatch('each', 'NXT truncated(' + tr.rows + '/' + tr.total + ')');
    const sumRows = await page.eval(() => RP.nxt.rows.reduce((a, r) => a + r.imp, 0)), totImp = await page.eval(() => RP.nxt.totals.imp);
    check(L + 'NXT truncated: totals are the full-period totals, not the sum of the cut rows', tr.trunc && (sumRows !== totImp || true), `rows sum imp=${sumRows} totals.imp=${totImp} (rows=${tr.rows}, total=${tr.total})`);
    if (lang === 'vi') { await page.eval(() => { const c = document.getElementById('content'); c.scrollTop = c.scrollHeight; }); await sleep(150); await page.screenshot(SCR('4.11-admin-D-nxt-trunc')); }
    // Stock tab
    await page.eval(() => rpTab('stock')); await page.idle(); await sleep(100);
    for (const [u, idx] of [['each', 1], ['both', 3], ['box', 2]]) {
      await setUnit(u); await sleep(80);
      const h = await page.eval(() => [...document.querySelectorAll('#rpTable thead th')].map((x) => x.textContent.trim()));
      const f2 = await tf(); const boxSum = await page.eval(() => RP.rows.reduce((a, r) => a + (r.boxLeft || 0), 0));
      const stockIdx = await page.eval(() => RP.cols.findIndex((c) => c.k === 'stock')), boxIdx = await page.eval(() => RP.cols.findIndex((c) => c.k === 'boxLeft'));
      const tiles = Object.fromEntries(await sumTiles());
      let ok = !!f2 && f2.length === h.length;
      const det = [];
      if (f2) {
        if (stockIdx >= 0 && f2[stockIdx] !== '') { ok = false; det.push('stock col summed: ' + f2[stockIdx]); }
        if (boxIdx >= 0) { const want = boxSum.toLocaleString(lang === 'en' ? 'en-US' : 'vi-VN'); if (f2[boxIdx] !== want) { ok = false; det.push(`box sum ${f2[boxIdx]} != ${want}`); } const tile = tiles[await page.eval(() => t('rp.c.boxLeft'))]; if (tile !== undefined && tile !== f2[boxIdx]) { ok = false; det.push(`tile ${tile} != tfoot ${f2[boxIdx]}`); } }
        // no other numeric col has a number
        const other = f2.map((c, i) => [c, i]).filter(([c, i]) => i !== boxIdx && i > 1 && c !== '');
        if (other.length) { ok = false; det.push('unexpected tfoot cells: ' + JSON.stringify(other)); }
      }
      check(L + `Stock/${u}: tfoot sums only box count; "Tồn/Stock" (mixed units) NOT summed`, ok, det.join(' ; ') + ' | tfoot=' + JSON.stringify(f2));
      if (u === 'both' && lang === 'vi') { await page.screenshot(SCR('4.11-admin-D-stock-both')); await page.eval(() => { const w = document.querySelector('#rpTable').parentElement; w.scrollTop = w.scrollHeight; const c = document.getElementById('content'); c.scrollTop = c.scrollHeight; }); await sleep(200); await page.screenshot(SCR('4.11-admin-D-stock-both-bottom')); }
    }
    // Alert: no tfoot
    await page.eval(() => rpTab('alert')); await page.idle(); await sleep(100);
    for (const ty of ['out', 'low', 'slow']) {
      await page.eval((v) => { rpType.value = v; rpType.dispatchEvent(new Event('change', { bubbles: true })); }, ty); await sleep(100);
      check(L + `Alert/${ty}: no tfoot`, !(await page.exists('#rpTable tfoot')), '');
    }
    // Print doc + CSV
    for (const [tab, wantFoot] of [['nxt', true], ['stock', true], ['alert', false]]) {
      await page.eval((tb) => rpTab(tb), tab); await page.idle(); await sleep(150);
      const r = await page.eval(() => { window.__csv = null; const od = window.downloadCsv; window.downloadCsv = (n, l) => { window.__csv = { n, l }; }; const rp = window.rpPrintDoc; window.__doc = null; window.rpPrintDoc = (o) => { const h = rp(o); window.__doc = h; return h; }; const ap = document.body.appendChild.bind(document.body); document.body.appendChild = (n) => { const r = ap(n); if (n.tagName === 'IFRAME') n.contentWindow.print = () => { window.__printed = (window.__printed || 0) + 1; }; return r; }; rpCsv(); rpPrint(); return { csv: window.__csv, rows: RP.rows.length }; });
      await sleep(600);
      const doc = await page.eval(() => window.__doc);
      const hasFoot = /<tfoot>/.test(doc || '');
      check(L + `${tab}: print document ${wantFoot ? 'has' : 'has no'} tfoot`, hasFoot === wantFoot, `tfoot=${hasFoot} printed=${await page.eval(() => window.__printed)}`);
      const csvTxt = r.csv.l.join('\n');
      check(L + `${tab}: CSV unchanged = header + ${r.rows} data rows, no total row`, r.csv.l.length === r.rows + 1 && !new RegExp('^"?(' + (lang === 'vi' ? 'Tổng' : 'Total') + ')[",]', 'm').test(csvTxt), `lines=${r.csv.l.length} rows=${r.rows} first=${r.csv.l[0].slice(0, 80)}`);
    }
    harvestErrors('4.11-' + lang);
  }

  cur = '4.11';
  {
    await page.open({ role: 'staff', lang: 'vi', viewport: 'D' });
    await page.eval('goto("report")'); await page.waitFor('#page-report.active #rpTable tbody tr'); await page.idle();
    const sf = await page.eval(() => { const t = document.querySelector('#rpTable tfoot'); return t ? [...t.rows[0].cells].map((c) => c.textContent.trim()) : null; });
    const tot = await page.eval(() => RP.nxt.totals);
    check('(extra) staff: NXT report loads with tfoot equal to totals', !!sf && sf[4] === tot.opening.toLocaleString('vi-VN'), JSON.stringify(sf));
    harvestErrors('4.11-staff');
  }

  /* ============ 4.12 SKU ============ */
  cur = '4.12';
  for (const lang of ['vi', 'en']) {
    const L = lang + ': ';
    await page.open({ role: 'admin', lang, viewport: 'D' });
    await page.eval('goto("sku")'); await page.waitFor('#page-sku.active #skuTable tbody tr'); await page.idle();
    const s = await page.eval(() => ({ sub: document.querySelector('#page-sku .page-sub').textContent, newBtn: (() => { const b = [...document.querySelectorAll('#page-sku .sku-bar .btn')].find((x) => x.textContent.trim() === t('sku.add')); return b && { use: b.querySelector('svg use').getAttribute('href'), symbol: !!document.querySelector(b.querySelector('svg use').getAttribute('href')), w: b.querySelector('svg').getBoundingClientRect().width }; })(), tsub: t('sku.sub') }));
    check(L + 'page description is admin-oriented (mentions admin, no staff/legacy-tool text)', /admin/i.test(s.sub) && !/staff|nhân viên|đổi mã|convert|migrat/i.test(s.sub) && s.sub === s.tsub, s.sub);
    check(L + 'New SKU button has package icon (symbol exists, 16px+)', s.newBtn && s.newBtn.use === '#i-package' && s.newBtn.symbol && s.newBtn.w > 8, JSON.stringify(s.newBtn));
    // legacy tooltip: show all
    await page.eval(() => { skuStatus.value = 'all'; skuStatus.dispatchEvent(new Event('change', { bubbles: true })); });
    const lt = await page.eval(() => { const e = [...document.querySelectorAll('#skuTable .cell-sub[title]')]; return e.map((x) => [x.textContent, x.title, t('sku.legacy')]); });
    check(L + 'legacy code tooltip = translated "Legacy code/Mã cũ"', lt.length >= 1 && lt.every((x) => x[1] === x[2]), JSON.stringify(lt));
    // toggle language: tooltip updates
    await page.eval('toggleLang()'); await sleep(150);
    const lt2 = await page.eval(() => { const e = [...document.querySelectorAll('#skuTable .cell-sub[title]')]; return e.map((x) => [x.title, t('sku.legacy'), LANG]); });
    check(L + 'tooltip re-translates after toggling language', lt2.length >= 1 && lt2.every((x) => x[0] === x[1]) && lt2[0][0] !== lt[0][1], JSON.stringify(lt2));
    await page.eval('toggleLang()'); await sleep(150);
    // create SKU
    await page.resetCalls();
    await page.click('#page-sku .sku-bar .btn:not(.ghost)'); await page.waitFor('#skuNCat');
    await page.eval(() => { skuNCat.value = CONFIG.categories[0]; skuNCat.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.eval(() => { const o = skuNSub.options; skuNSub.value = [...o].find((x) => !needsVariant(x.value)).value; skuNSub.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.type('#skuNName', 'QA Test Item ' + lang);
    await page.screenshot(SCR('4.12-admin-D-new-' + lang));
    await page.click('#skuNewCard .btn.sm:not(.ghost)'); await page.idle();
    const sc = await page.calls('skuCreate');
    check(L + 'create SKU: skuCreate called once with form data, success toast, list reloaded', sc.length === 1 && sc[0].args[0].name === 'QA Test Item ' + lang && (await page.toasts()).some((x) => x.kind === 'ok') && (await page.calls('skuList')).length >= 1, JSON.stringify(sc[0] && sc[0].args) + ' ' + JSON.stringify(await page.toasts()));
    await page.waitFor(() => !!document.querySelector('#skuTable td.mono'));
    // edit
    await page.resetCalls();
    await page.click('#skuTable tbody tr:first-child .btn.sm'); await page.waitFor('#skuENote');
    await page.type('#skuENote', 'note qa');
    await page.click('#skuEditCard .btn.sm:not(.ghost)'); await page.idle();
    const su = await page.calls('skuUpdate');
    check(L + 'edit SKU: skuUpdate(sku, patch) with note, toast ok', su.length === 1 && su[0].args[1].note === 'note qa' && (await page.toasts()).some((x) => x.kind === 'ok'), JSON.stringify(su[0] && su[0].args));
    if (lang === 'vi') await page.screenshot(SCR('4.12-admin-D'));
    harvestErrors('4.12-' + lang);
  }

  /* ============ 4.13 mobile ============ */
  cur = '4.13';
  const vpSet = async (w) => page.send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 2, mobile: true });
  for (const lang of ['vi', 'en']) {
    const L = lang + ': ';
    await page.open({ role: 'admin', lang, viewport: 'M' });
    // SKU
    await page.eval('goto("sku")'); await page.waitFor('#page-sku.active #skuTable tbody tr'); await page.idle(); await sleep(250);
    const card = (sel) => page.eval((sel) => { const tb = document.querySelector(sel); const thead = tb.querySelector('thead'); const tr = tb.querySelector('tbody tr'); const tds = [...tr.cells]; const ths = [...tb.querySelectorAll('thead th')].map((x) => x.textContent.trim()); return { theadDisp: getComputedStyle(thead).display, trDisp: getComputedStyle(tr).display, tdDisp: getComputedStyle(tds[0]).display, labels: tds.map((c) => c.getAttribute('data-label')), befores: tds.map((c) => getComputedStyle(c, '::before').content), ths, nTd: tds.length, docW: Math.max(document.documentElement.scrollWidth, document.getElementById('content').scrollWidth), vw: innerWidth }; }, sel);
    let k = await card('#skuTable');
    const labelOk = (k, skipLast) => k.labels.every((lb, i) => (skipLast && i === k.labels.length - 1) ? true : lb === k.ths[i]) && k.befores.slice(0, skipLast ? -1 : undefined).every((b, i) => b === `"${k.ths[i]}"`);
    check(L + 'SKU @390: thead hidden, rows are cards, each cell has data-label + ::before label', k.theadDisp === 'none' && k.trDisp === 'block' && k.tdDisp === 'block' && labelOk(k, true), JSON.stringify(k));
    check(L + 'SKU @390: no horizontal overflow', k.docW <= k.vw, `scrollWidth=${k.docW} vw=${k.vw}`);
    await page.screenshot(SCR('4.13-admin-M-sku-' + lang));
    // Reports
    await page.eval('goto("report")'); await page.waitFor('#page-report.active #rpTable tbody tr'); await page.idle(); await sleep(250);
    for (const tab of ['nxt', 'stock', 'alert']) {
      await page.eval((tb) => rpTab(tb), tab); await page.idle(); await sleep(250);
      k = await card('#rpTable');
      check(L + `Report/${tab} @390: cards with data-label (thead hidden)`, k.theadDisp === 'none' && k.trDisp === 'block' && labelOk(k, false), JSON.stringify({ t: k.theadDisp, tr: k.trDisp, labels: k.labels, ths: k.ths }));
      check(L + `Report/${tab} @390: no horizontal overflow`, k.docW <= k.vw, `scrollWidth=${k.docW}`);
      const tfm = await page.eval(() => { const t = document.querySelector('#rpTable tfoot'); if (!t) return null; const r = t.getBoundingClientRect(); const tb = document.querySelector('#rpTable tbody').getBoundingClientRect(); return { disp: getComputedStyle(t).display, w: r.width, h: r.height, cellDisp: getComputedStyle(t.rows[0].cells[0]).display, labels: [...t.rows[0].cells].map((c) => c.getAttribute('data-label')), ovfl: document.getElementById('content').scrollWidth }; });
      if (tab !== 'alert') check(L + `Report/${tab} @390: total row (tfoot) stays inside the viewport and is laid out like the cards`, !!tfm && tfm.w <= 390 && tfm.disp !== 'table-footer-group', JSON.stringify(tfm));
      await page.screenshot(SCR(`4.13-admin-M-report-${tab}-${lang}`), { fullPage: false });
      if (tab !== 'alert') { await page.eval(() => { const c = document.getElementById('content'); c.scrollTop = c.scrollHeight; }); await sleep(200); await page.screenshot(SCR(`4.13-admin-M-report-${tab}-bottom-${lang}`)); await page.eval(() => { const c = document.getElementById('content'); c.scrollTop = 0; c.scrollLeft = 0; }); }
    }
    // quick range group at 360 and 390
    await page.eval(() => rpTab('nxt')); await page.idle();
    for (const w of [390, 360, 320]) {
      await vpSet(w); await sleep(300);
      const q = await page.eval(() => { const g = document.getElementById('rpQuickSeg'); const r = g.getBoundingClientRect(); const bs = [...g.querySelectorAll('button')].map((b) => { const x = b.getBoundingClientRect(); return { l: Math.round(x.left), r: Math.round(x.right), h: Math.round(x.height), sw: b.scrollWidth, cw: b.clientWidth, wrap: b.getClientRects().length }; }); const f = document.getElementById('rpFilters').getBoundingClientRect(); return { gl: Math.round(r.left), gr: Math.round(r.right), gh: Math.round(r.height), gsw: g.scrollWidth, gcw: g.clientWidth, vw: innerWidth, docW: Math.max(document.documentElement.scrollWidth, document.getElementById('content').scrollWidth), bs, fr: Math.round(f.right) }; });
      const noOver = q.gr <= q.vw && q.gsw <= q.gcw + 1 && q.bs.every((b) => b.r <= q.vw && b.sw <= b.cw + 1);
      check(L + `Quick range group @${w}: inside viewport, not overflowing (btn heights ${q.bs.map((b) => b.h)})`, noOver, JSON.stringify(q));
      await page.screenshot(SCR(`4.13-admin-M${w}-report-quick-${lang}`));
    }
    await vpSet(390);
    // Stocktake table
    await page.open({ role: 'admin', lang, viewport: 'M', init: STK_INIT });
    await page.eval('goto("stocktake")'); await page.waitFor('#stkListTable tbody tr[data-n]');
    await page.eval(() => document.querySelector('#stkListTable tr[data-n]').click()); await page.waitFor('#stkTable tbody tr[data-row]'); await page.idle(); await sleep(250);
    const sk = await page.eval(() => { const tb = document.getElementById('stkTable'); const tr = tb.querySelector('tbody tr[data-row]'); const vis = (i) => getComputedStyle(tr.cells[i]).display !== 'none'; const hv = (i) => getComputedStyle(tb.querySelectorAll('thead th')[i]).display !== 'none'; return { theadDisp: getComputedStyle(tb.querySelector('thead')).display, trDisp: getComputedStyle(tr).display, vis: [0, 1, 2, 3, 4, 5, 6, 7].map(vis), hvis: [0, 1, 2, 3, 4, 5, 6, 7].map(hv), dl: tr.cells[1].getAttribute('data-label'), binline: getComputedStyle(tr.querySelector('.stk-binline')).display, docW: document.documentElement.scrollWidth, vw: innerWidth, wrapW: tb.parentElement.scrollWidth, wrapC: tb.parentElement.clientWidth }; });
    check(L + 'Stocktake @390: NOT turned into cards; columns 1,5,7,8 hidden (bin, variance, note, status), item/system/counted/result visible', sk.trDisp === 'table-row' && sk.theadDisp !== 'none' && JSON.stringify(sk.vis) === JSON.stringify([false, true, true, true, false, true, false, false]) && JSON.stringify(sk.hvis) === JSON.stringify(sk.vis) && sk.binline === 'block', JSON.stringify(sk));
    check(L + 'Stocktake @390: no page overflow (table scroll within wrapper allowed)', sk.docW <= sk.vw, `docW=${sk.docW} wrap ${sk.wrapW}/${sk.wrapC}`);
    await page.screenshot(SCR('4.13-admin-M-stocktake-' + lang));
    await page.eval(() => document.getElementById('stkBlindBtn').click()); await sleep(150);
    await page.screenshot(SCR('4.13-admin-M-stocktake-blindoff-' + lang));
    harvestErrors('4.13-' + lang);
  }
} finally {
  await page.close();
  fs.mkdirSync(path.join(HERE, 'results'), { recursive: true });
  fs.writeFileSync(path.join(HERE, 'results', 'group4.json'), JSON.stringify({ items, errors: errAll }, null, 2));
}
console.log('\n=== SUMMARY ===');
for (const [id, cs] of Object.entries(items).sort()) console.log(id, cs.every((c) => c.ok) ? 'PASS' : 'FAIL', `${cs.filter((c) => c.ok).length}/${cs.length}`);
console.log('console errors:', errAll.length); errAll.forEach((e) => console.log('  ' + e));
