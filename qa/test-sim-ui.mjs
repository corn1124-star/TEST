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
} catch (e) {
  check('test chạy hết không văng lỗi', false, String(e && e.message || e).split('\n')[0]);
} finally {
  await page.close();
  fs.mkdirSync(path.join(HERE, 'results'), { recursive: true });
  fs.writeFileSync(path.join(HERE, 'results', 'sim-ui.json'), JSON.stringify(results, null, 2));
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
