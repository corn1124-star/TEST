// test-sim-export.mjs - hàm thuần dựng báo cáo SIM (simReportRows / simReportTable / simCsvLines / simReportFileName). Run: node test-sim-export.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';
import { createDriver } from './driver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const results = [];
function check(name, ok, detail = '') { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  - ' + detail : '')); }
const J = (v) => JSON.stringify(v);

/* dữ liệu cố định: receivedOn có hai ngày biên 2026-11-01 / 2026-11-30, một ngày ngoài (2026-12-01, 2026-10-31), một dòng trống, một dòng đã xoá */
const ROWS = [
  { id: 'S1', phone: '0902343108', holderName: 'An', contactName: 'Lê, "Mai"', requestedOn: '2026-10-20', receivedOn: '2026-11-05', deleted: false },
  { id: 'S2', phone: '0911000002', holderName: 'Bình', contactName: '=1+1', requestedOn: '2026-10-25', receivedOn: '2026-11-01', deleted: false },
  { id: 'S3', phone: '0911000003', holderName: 'Chi', contactName: 'Dũng', requestedOn: '2026-11-10', receivedOn: '2026-11-30', deleted: false },
  { id: 'S4', phone: '0911000004', holderName: 'Em', contactName: 'Giang', requestedOn: '2026-11-11', receivedOn: '2026-12-01', deleted: false },
  { id: 'S5', phone: '0911000005', holderName: 'Hà', contactName: 'Khoa', requestedOn: '2026-09-01', receivedOn: '2026-10-31', deleted: false },
  { id: 'S6', phone: '0911000006', holderName: 'Lan', contactName: 'Minh', requestedOn: '2026-11-02', receivedOn: '', deleted: false },
  { id: 'S7', phone: '0911000007', holderName: 'Nam', contactName: 'Oanh', requestedOn: '2026-11-03', receivedOn: '2026-11-15', deleted: true },
  { id: 'S8', phone: '0911000001', holderName: 'Phúc', contactName: 'Quân', requestedOn: '', receivedOn: '', deleted: false },
  { id: 'S9', phone: '0911000009', holderName: 'Sơn', contactName: 'Tâm', requestedOn: '2026-10-25', receivedOn: '2026-11-05', deleted: false },
];

build({ quiet: true });
const page = await createDriver();
try {
  await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
  const run = (expr) => page.eval(`(() => { const R = ${J(ROWS)}; return ${expr}; })()`);
  const ids = (a) => a.map((r) => r.id);

  /* ---- lọc theo ngày nhận, bao gồm hai đầu ---- */
  const inRange = ids(await run(`simReportRows(R, { by: 'receivedOn', from: '2026-11-01', to: '2026-11-30' })`));
  check('lọc receivedOn 01/11-30/11 gồm cả hai ngày biên', inRange.includes('S2') && inRange.includes('S3'), J(inRange));
  check('lọc receivedOn loại 2026-12-01 và 2026-10-31', !inRange.includes('S4') && !inRange.includes('S5'), J(inRange));
  check('SIM đã xoá không có trong báo cáo', !inRange.includes('S7'));
  check('SIM không có receivedOn bị loại khi có từ/đến', !inRange.includes('S6') && !inRange.includes('S8'), J(inRange));
  check('kết quả lọc đúng tập S1,S2,S3,S9', J([...inRange].sort()) === J(['S1', 'S2', 'S3', 'S9']), J(inRange));

  const onlyFrom = ids(await run(`simReportRows(R, { by: 'receivedOn', from: '2026-11-05', to: '' })`));
  check('chỉ có "từ ngày": bỏ dòng trống, lấy các ngày >= từ', J(onlyFrom) === J(['S4', 'S3', 'S1', 'S9']), J(onlyFrom));
  const onlyTo = ids(await run(`simReportRows(R, { by: 'receivedOn', from: '', to: '2026-11-01' })`));
  check('chỉ có "đến ngày": bỏ dòng trống, lấy các ngày <= đến', J(onlyTo) === J(['S2', 'S5']), J(onlyTo));

  /* ---- không chặn: dòng trống có mặt, xếp cuối ---- */
  const all = ids(await run(`simReportRows(R, { by: 'receivedOn', from: '', to: '' })`));
  check('từ/đến rỗng: dòng không ngày có mặt', all.includes('S6') && all.includes('S8'), J(all));
  check('từ/đến rỗng: đã xoá vẫn không có', !all.includes('S7'));
  check('giảm dần, ngày trống cuối, hoà thì phone tăng dần',
    J(all) === J(['S4', 'S3', 'S1', 'S9', 'S2', 'S5', 'S8', 'S6']), J(all));
  const byReq = ids(await run(`simReportRows(R, { by: 'requestedOn', from: '2026-10-25', to: '2026-11-02' })`));
  check('lọc theo requestedOn: S6, S2, S9 (hoà 10-25 -> phone tăng dần)', J(byReq) === J(['S6', 'S2', 'S9']), J(byReq));
  const orig = await run(`(() => { const c = JSON.stringify(R); simReportRows(R, { by: 'receivedOn', from: '', to: '' }); return c === JSON.stringify(R); })()`);
  check('không làm đổi mảng đầu vào', orig === true);

  /* ---- bảng 5 cột ---- */
  const tbl = await run(`simReportTable(simReportRows(R, { by: 'receivedOn', from: '2026-11-01', to: '2026-11-30' }))`);
  check('simReportTable: đúng 5 tiêu đề theo thứ tự',
    J(tbl.headers) === J(['Ngày tạo yêu cầu', 'Ngày nhận SIM', 'Người nhận', 'Người giữ', 'Số thuê bao']), J(tbl.headers));
  check('simReportTable: mỗi dòng 5 ô', tbl.rows.length === 4 && tbl.rows.every((r) => r.length === 5), J(tbl.rows));
  check('simReportTable: ngày dạng dd/MM/yyyy', tbl.rows[1][0] === '20/10/2026' && tbl.rows[1][1] === '05/11/2026', J(tbl.rows[1]));
  check('simReportTable: thứ tự cột Người nhận, Người giữ, số liền', tbl.rows[1][2] === 'Lê, "Mai"' && tbl.rows[1][3] === 'An' && tbl.rows[1][4] === '0902343108', J(tbl.rows[1]));
  const tblBlank = await run(`simReportTable(simReportRows(R, { by: 'receivedOn', from: '', to: '' }))`);
  const last = tblBlank.rows[tblBlank.rows.length - 1];
  check('simReportTable: ngày trống thành chuỗi rỗng', last[0] === '2026-11-02'.split('-').reverse().join('/') && last[1] === '', J(last));

  /* ---- CSV ---- */
  const csv = await run(`simCsvLines(simReportTable(simReportRows(R, { by: 'receivedOn', from: '2026-11-01', to: '2026-11-30' })))`);
  check('simCsvLines: dòng đầu là tiêu đề', csv[0] === 'Ngày tạo yêu cầu,Ngày nhận SIM,Người nhận,Người giữ,Số thuê bao', csv[0]);
  check('simCsvLines: 1 tiêu đề + 4 dòng', csv.length === 5, String(csv.length));
  const csvJoined = csv.join('\n');
  check('simCsvLines: 0902343108 thành 0902 343 108', csv.some((l) => l.endsWith(',0902 343 108')));
  check('simCsvLines: tên Lê, "Mai" được bao nháy đúng', csv.some((l) => l.includes('"Lê, ""Mai"""')));
  check('simCsvLines: =1+1 có dấu nháy đơn đứng đầu', csv.some((l) => l.includes(",'=1+1,")));
  check('simCsvLines: không còn ô bắt đầu bằng = nào', !csv.some((l) => /(^|,)=/.test(l)));
  const rawPhone = await run(`simReportTable(simReportRows(R, { by: 'receivedOn', from: '2026-11-01', to: '2026-11-30' })).rows.every((r) => /^\\d{10}$/.test(r[4]))`);
  check('simCsvLines không làm đổi bảng gốc (số vẫn 10 số liền)', rawPhone === true);

  /* ---- tên file ---- */
  check('simReportFileName csv, chỉ có từ', (await run(`simReportFileName({ from: '2026-11-01', to: '', by: 'receivedOn' }, 'csv')`)) === 'SIM_2026-11-01_all.csv');
  check('simReportFileName xlsx, đủ từ-đến', (await run(`simReportFileName({ from: '2026-11-01', to: '2026-11-30', by: 'requestedOn' }, 'xlsx')`)) === 'SIM_2026-11-01_2026-11-30.xlsx');
  check('simReportFileName không lọc', (await run(`simReportFileName({ from: '', to: '', by: 'receivedOn' }, 'csv')`)) === 'SIM_all_all.csv');

  /* ---- tiếng Anh ---- */
  const keys = ['simx.c.requested', 'simx.c.received', 'simx.c.recipient', 'simx.c.holder', 'simx.c.phone'];
  const missing = await page.eval(`${J(keys)}.filter((k) => !I18N.vi[k] || !I18N.en[k])`);
  check('I18N vi + en đủ 5 khoá simx.c.*', missing.length === 0, J(missing));
  await page.open({ role: 'admin', lang: 'en', viewport: 'D' });
  const en = await page.eval(`simReportTable([]).headers`);
  check('tiêu đề báo cáo theo tiếng Anh, không lộ khoá', en.length === 5 && en.every((h) => h && !/^simx\./.test(h)) && J(en) !== J(['Ngày tạo yêu cầu', 'Ngày nhận SIM', 'Người nhận', 'Người giữ', 'Số thuê bao']), J(en));

  const errs = page.consoleErrors();
  check('không có lỗi console', errs.length === 0, errs.map((e) => e.text.split('\n')[0]).join(' | '));
} finally {
  await page.close();
  fs.mkdirSync(path.join(HERE, 'results'), { recursive: true });
  fs.writeFileSync(path.join(HERE, 'results', 'sim-export.json'), JSON.stringify(results, null, 2));
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
