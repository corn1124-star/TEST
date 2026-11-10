// test-sim-ui.mjs - trang SIM: hai ngày (Ngày tạo yêu cầu / Ngày nhận SIM) trong bảng, sắp xếp và form. Run: node test-sim-ui.mjs
// Mock harness không có fixture SIM nên test tự cài simList / simSave.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';
import { createDriver } from './driver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const results = [];
function check(name, ok, detail = '') { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  - ' + detail : '')); }

/* cùng hình dạng với simRows_() trong server/sims/Sims.js */
function row(id, phone, extra) {
  return Object.assign({
    id, row: 2, phone, holderName: 'An Dinh', holderEmail: 'an.dinh@example.com', contactName: 'Minh Admin', contactEmail: 'minh.admin@example.com',
    note: '', createdAt: '01/11/2026 09:00', createdBy: 'minh.admin@example.com', createdByName: 'Minh Admin', updatedAt: '', updatedBy: '',
    createdTs: 1793523600000, deleted: false, deletedAt: '', deletedBy: '', source: '', legacyCode: '', requestedOn: '', receivedOn: ''
  }, extra);
}
const ROWS = [
  row('SIM-0001', '0901111111', { requestedOn: '2026-11-03', receivedOn: '2026-11-05' }),
  row('SIM-0002', '0902222222', { requestedOn: '2026-11-01' }),
  row('SIM-0003', '0903333333', {}),
  row('SIM-0004', '0904444444', { receivedOn: '2026-11-02' })
];
const SERVER = `__setServer({
  simList: () => ({ ok: true, isAdmin: true, people: [{ username: 'An Dinh', email: 'an.dinh@example.com' }], rows: ${JSON.stringify(ROWS)} }),
  simSave: (d) => ({ ok: true, message: 'Đã lưu.' })
})`;

async function openSim(viewport) {
  await page.open({ role: 'admin', lang: 'vi', viewport });
  await page.eval('SESSION.canSim = true');
  await page.eval(SERVER);
  await page.eval("goto('sim')");
  await page.waitFor('#simTable tbody tr .sim-tools');
}
const phones = () => page.eval(() => [...document.querySelectorAll('#simTable tbody tr .sim-phone')].map((td) => td.textContent.replace(/\s/g, '')));

build({ quiet: true });
const page = await createDriver();
try {
  /* ---- desktop ---- */
  await openSim('D');

  check('simShowDate đổi yyyy-MM-dd sang dd/MM/yyyy', (await page.eval("simShowDate('2026-11-05')")) === '05/11/2026');
  check('simShowDate của chuỗi rỗng là chuỗi rỗng', (await page.eval("simShowDate('')")) === '');

  const heads = await page.eval(() => [...document.querySelectorAll('#simTable thead th')].map((th) => th.textContent.trim()));
  check('bảng có tiêu đề "Ngày tạo yêu cầu" và "Ngày nhận SIM"', heads.includes('Ngày tạo yêu cầu') && heads.includes('Ngày nhận SIM'), JSON.stringify(heads));

  const cells = await page.eval(() => {
    const th = [...document.querySelectorAll('#simTable thead th')].map((x) => x.textContent.trim());
    const iq = th.indexOf('Ngày tạo yêu cầu'), ir = th.indexOf('Ngày nhận SIM');
    const out = {};
    document.querySelectorAll('#simTable tbody tr').forEach((tr) => {
      out[tr.querySelector('.sim-phone').textContent.replace(/\s/g, '')] = [tr.cells[iq].textContent.trim(), tr.cells[ir].textContent.trim()];
    });
    return out;
  });
  check('ô có ngày hiển thị dd/MM/yyyy', cells['0901111111']?.[0] === '03/11/2026' && cells['0901111111']?.[1] === '05/11/2026', JSON.stringify(cells['0901111111']));
  check('chỉ có ngày yêu cầu: ngày nhận hiển thị —', cells['0902222222']?.[0] === '01/11/2026' && cells['0902222222']?.[1] === '—', JSON.stringify(cells['0902222222']));
  check('không có ngày nào: cả hai ô hiển thị —', cells['0903333333']?.[0] === '—' && cells['0903333333']?.[1] === '—', JSON.stringify(cells['0903333333']));

  const sortOpts = await page.eval(() => [...document.querySelectorAll('#simSort option')].map((o) => o.value));
  check('ô chọn sắp xếp có requested và received', sortOpts.includes('requested') && sortOpts.includes('received'), JSON.stringify(sortOpts));

  await page.eval("simSortPick('received')");
  const asc = await phones();
  check('sắp xếp received tăng dần: SIM không có ngày ở cuối', asc.join() === '0904444444,0901111111,0902222222,0903333333', JSON.stringify(asc));
  await page.eval('simSortFlip()');
  const desc = await phones();
  check('sắp xếp received giảm dần: SIM có ngày nhận lên trước, SIM không ngày ở cuối', desc.join() === '0901111111,0904444444,0902222222,0903333333', JSON.stringify(desc));
  await page.eval("simSortPick('requested')");
  await page.eval('simSortFlip()');
  const rdesc = await phones();
  check('sắp xếp requested giảm dần: 03/11 rồi 01/11, SIM không ngày yêu cầu ở cuối', rdesc.join() === '0901111111,0902222222,0903333333,0904444444', JSON.stringify(rdesc));

  /* mở form sửa SIM có cả hai ngày */
  await page.eval("simFormOpen('SIM-0001')");
  const f = await page.eval(() => ['simFRequested', 'simFReceived'].map((id) => { const e = document.getElementById(id); return e ? [e.type, e.value] : null; }));
  check('form sửa: hai ô type=date, đã điền sẵn 2026-11-03 / 2026-11-05', JSON.stringify(f) === JSON.stringify([['date', '2026-11-03'], ['date', '2026-11-05']]), JSON.stringify(f));

  await page.resetCalls();
  await page.click('#simFSave');
  await page.idle();
  const c1 = await page.calls('simSave');
  const a1 = c1[0]?.args?.[0] || {};
  check('Lưu gửi requestedOn và receivedOn', c1.length === 1 && a1.requestedOn === '2026-11-03' && a1.receivedOn === '2026-11-05', JSON.stringify(a1));

  await page.eval("simFormOpen('SIM-0001')");
  await page.eval("(() => { const e = document.getElementById('simFReceived'); e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await page.resetCalls();
  await page.click('#simFSave');
  await page.idle();
  const a2 = (await page.calls('simSave'))[0]?.args?.[0] || {};
  check('xoá ô nhận rồi Lưu gửi receivedOn rỗng (không bỏ trường)', a2.requestedOn === '2026-11-03' && 'receivedOn' in a2 && a2.receivedOn === '', JSON.stringify(a2));

  await page.eval("simFormOpen('')");
  await page.resetCalls();
  await page.click('#simFSave');
  await page.idle();
  const a3 = (await page.calls('simSave'))[0]?.args?.[0] || {};
  check('thêm SIM mới để trống ngày vẫn gửi cả hai trường rỗng', a3.requestedOn === '' && a3.receivedOn === '', JSON.stringify(a3));

  /* ---- Xuất báo cáo (CSV / XLSX) ---- */
  const setVal = (id, v) => page.eval((i, x) => { const e = document.getElementById(i); e.value = x; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, id, v);
  const xState = () => page.eval(() => ({
    count: (document.getElementById('simXCount') || {}).textContent || '',
    disabled: !!(document.getElementById('simXGo') || {}).disabled,
    msg: (document.querySelector('#simExportCard .box:not([hidden])') || {}).textContent || ''
  }));
  const expectN = (opt) => page.eval((o) => simReportRows(SM.rows, o).length, opt);
  const stubDownloads = () => page.eval(() => {
    window.__dl = []; window.__lastBlob = null;
    URL.createObjectURL = (b) => { window.__lastBlob = b; return 'blob:stub'; };
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function () { window.__dl.push({ name: this.download, blob: window.__lastBlob }); };
  });
  const lastDownload = () => page.eval(async () => {
    const d = window.__dl[window.__dl.length - 1];
    if (!d) return null;
    const u = new Uint8Array(await d.blob.arrayBuffer());
    return { name: d.name, n: window.__dl.length, head: Array.from(u.slice(0, 4)), text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(u), latin1: Array.from(u).map((c) => String.fromCharCode(c)).join('') };
  });

  await stubDownloads();
  await page.resetCalls();
  check('thẻ xuất báo cáo ẩn khi chưa bấm nút', (await page.eval("document.getElementById('simExportCard') && document.getElementById('simExportCard').hidden")) === true);
  await page.click('text=Xuất báo cáo');
  check('bấm "Xuất báo cáo" thì thẻ hiện ra', (await page.eval("(() => { const c = document.getElementById('simExportCard'); return !!c && !c.hidden && c.getBoundingClientRect().height > 0; })()")) === true);
  check('mở thẻ xuất không gọi máy chủ', (await page.calls()).length === 0, JSON.stringify(await page.calls()));
  const ctl = await page.eval(() => ({
    by: [...document.querySelectorAll('#simXBy option')].map((o) => o.value), byVal: document.getElementById('simXBy').value,
    fmt: [...document.querySelectorAll('#simXFmt option')].map((o) => o.value), fmtVal: document.getElementById('simXFmt').value,
    types: [document.getElementById('simXFrom').type, document.getElementById('simXTo').type],
    fmtLabels: [...document.querySelectorAll('#simXFmt option')].map((o) => o.textContent)
  }));
  check('ô lọc theo: requestedOn (mặc định) và receivedOn', JSON.stringify(ctl.by) === '["requestedOn","receivedOn"]' && ctl.byVal === 'requestedOn', JSON.stringify(ctl));
  check('ô định dạng: csv (mặc định) và xlsx, không có PDF', JSON.stringify(ctl.fmt) === '["csv","xlsx"]' && ctl.fmtVal === 'csv' && !ctl.fmtLabels.join().match(/pdf/i), JSON.stringify(ctl));
  check('hai ô từ/đến là type=date', ctl.types.join() === 'date,date', JSON.stringify(ctl.types));

  let st = await xState();
  check('chưa chọn ngày: đếm đủ số SIM chưa xoá và nút Tải về mở', st.count.includes('Sẽ xuất 4 SIM') && !st.disabled, JSON.stringify(st));

  await setVal('simXBy', 'receivedOn'); await setVal('simXFrom', '2026-11-02'); await setVal('simXTo', '2026-11-05');
  st = await xState();
  let n = await expectN({ by: 'receivedOn', from: '2026-11-02', to: '2026-11-05' });
  check('đổi cột lọc + khoảng ngày: số SIM khớp simReportRows (bao gồm hai đầu)', n === 2 && st.count.includes('Sẽ xuất ' + n + ' SIM') && !st.disabled, JSON.stringify([n, st]));

  await setVal('simXBy', 'requestedOn');
  st = await xState();
  n = await expectN({ by: 'requestedOn', from: '2026-11-02', to: '2026-11-05' });
  check('đổi sang ngày tạo yêu cầu: đếm lại (chỉ 03/11)', n === 1 && st.count.includes('Sẽ xuất 1 SIM'), JSON.stringify([n, st]));

  await setVal('simXFrom', '2027-01-01'); await setVal('simXTo', '');
  st = await xState();
  check('khoảng không có SIM: khoá Tải về và báo "Không có SIM nào trong khoảng này"', st.disabled && st.msg.includes('Không có SIM nào trong khoảng này') && st.count.includes('Sẽ xuất 0 SIM'), JSON.stringify(st));

  await setVal('simXFrom', '2026-11-05'); await setVal('simXTo', '2026-11-01');
  st = await xState();
  check('từ > đến: khoá Tải về và báo "Ngày bắt đầu không được sau ngày kết thúc"', st.disabled && st.msg.includes('Ngày bắt đầu không được sau ngày kết thúc') && !st.msg.includes('Không có SIM nào'), JSON.stringify(st));

  await setVal('simXFrom', '2026-11-01'); await setVal('simXTo', '2026-11-01');
  st = await xState();
  check('từ = đến là hợp lệ (1 SIM ngày 01/11), thông báo lỗi biến mất', !st.disabled && st.count.includes('Sẽ xuất 1 SIM') && st.msg === '', JSON.stringify(st));

  /* CSV */
  await setVal('simXFrom', '2026-11-01'); await setVal('simXTo', '2026-11-30');
  await page.resetCalls();
  await page.click('#simXGo');
  let dl = await lastDownload();
  check('tải CSV: tên SIM_<từ>_<đến>.csv', dl && dl.name === 'SIM_2026-11-01_2026-11-30.csv', JSON.stringify(dl && dl.name));
  check('CSV bắt đầu bằng BOM (EF BB BF)', dl && dl.head.slice(0, 3).join() === '239,187,191', JSON.stringify(dl && dl.head));
  const csvLines = dl ? dl.text.replace(/^﻿/, '').split('\n') : [];
  check('CSV dòng đầu là tiêu đề 5 cột', csvLines[0] === 'Ngày tạo yêu cầu,Ngày nhận SIM,Người nhận,Người giữ,Số thuê bao', csvLines[0]);
  check('CSV: 2 dòng dữ liệu, số thuê bao dạng 0901 111 111', csvLines.length === 3 && dl.text.includes('0901 111 111') && dl.text.includes('0902 222 222'), JSON.stringify(csvLines));

  /* XLSX */
  await setVal('simXBy', 'receivedOn'); await setVal('simXFrom', ''); await setVal('simXTo', ''); await setVal('simXFmt', 'xlsx');
  await page.click('#simXGo');
  dl = await lastDownload();
  check('tải XLSX: tên SIM_all_all.xlsx', dl && dl.name === 'SIM_all_all.xlsx' && dl.n === 2, JSON.stringify(dl && [dl.name, dl.n]));
  check('XLSX bắt đầu bằng PK\\x03\\x04', dl && dl.head.join() === '80,75,3,4', JSON.stringify(dl && dl.head));
  check('XLSX: số thuê bao là ô chữ giữ số 0 đầu', dl && dl.latin1.includes('t="inlineStr"><is><t xml:space="preserve">0901111111</t>'), '');
  check('XLSX: tên sheet là SIM', dl && dl.latin1.includes('name="SIM"'), '');
  check('xuất file không gọi máy chủ', (await page.calls()).length === 0, JSON.stringify(await page.calls()));

  /* chuỗi vi/en */
  const i18n = await page.eval(() => {
    const re = /^simx\.[a-z]+$|^sim\.export$/;
    const keys = Object.keys(I18N.vi).filter((k) => re.test(k));
    return { keys, missingEn: keys.filter((k) => !I18N.en[k]), extraEn: Object.keys(I18N.en).filter((k) => re.test(k) && !I18N.vi[k]) };
  });
  check('mọi chuỗi simx.* và sim.export có cả vi và en', i18n.keys.includes('sim.export') && i18n.keys.includes('simx.go') && !i18n.missingEn.length && !i18n.extraEn.length, JSON.stringify(i18n));

  /* ảnh chụp: thẻ mở, có dữ liệu */
  await setVal('simXBy', 'requestedOn'); await setVal('simXFmt', 'csv');
  await page.eval("document.querySelectorAll('#toastHost .toast').forEach((x) => x.remove())");
  await page.screenshot(path.join(HERE, 'results', 'screens', 'sim-export-D.png'));

  const errD = page.consoleErrors();
  check('không có lỗi console ở viewport D', errD.length === 0, errD.map((e) => e.text.split('\n')[0]).join(' | '));
  await page.screenshot(path.join(HERE, 'results', 'screens', 'sim-ui-D.png'));

  /* ---- mobile ---- */
  await openSim('M');
  await page.eval("simFormOpen('SIM-0001')");
  const ov = await page.eval(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  check('viewport M: không tràn ngang', ov.sw <= ov.iw, JSON.stringify(ov));
  const fm = await page.eval(() => [!!document.getElementById('simFRequested'), !!document.getElementById('simFReceived')]);
  check('viewport M: form có hai ô ngày', fm[0] && fm[1], JSON.stringify(fm));
  const errM = page.consoleErrors();
  check('không có lỗi console ở viewport M', errM.length === 0, errM.map((e) => e.text.split('\n')[0]).join(' | '));
  await page.screenshot(path.join(HERE, 'results', 'screens', 'sim-ui-M.png'));

  /* thẻ xuất báo cáo ở 390px */
  await page.resetCalls();
  await page.click('text=Xuất báo cáo');
  const ovx = await page.eval(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, open: !document.getElementById('simExportCard').hidden }));
  check('viewport M: thẻ xuất mở và không tràn ngang', ovx.open && ovx.sw <= ovx.iw, JSON.stringify(ovx));
  const fx = await page.eval(() => ['simXBy', 'simXFrom', 'simXTo', 'simXFmt', 'simXCount', 'simXGo'].map((id) => { const e = document.getElementById(id); const r = e && e.getBoundingClientRect(); return !!r && r.width > 0 && r.right <= innerWidth; }));
  check('viewport M: mọi ô của thẻ xuất nằm trong màn hình', fx.every(Boolean), JSON.stringify(fx));
  check('viewport M: mở thẻ xuất không gọi máy chủ', (await page.calls()).length === 0);
  await page.eval("document.getElementById('simXGo').scrollIntoView({ block: 'center', behavior: 'instant' })");
  await page.sleep(400);
  await page.screenshot(path.join(HERE, 'results', 'screens', 'sim-export-M.png'));
  const errM2 = page.consoleErrors();
  check('không có lỗi console ở viewport M sau khi mở thẻ xuất', errM2.length === 0, errM2.map((e) => e.text.split('\n')[0]).join(' | '));
} catch (e) {
  check('test chạy hết không văng lỗi', false, String(e && e.message || e).split('\n')[0]);
} finally {
  await page.close();
  fs.mkdirSync(path.join(HERE, 'results'), { recursive: true });
  fs.writeFileSync(path.join(HERE, 'results', 'sim-ui.json'), JSON.stringify(results, null, 2));
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
