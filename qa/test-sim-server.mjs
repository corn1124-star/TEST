// test-sim-server.mjs - chạy THẬT server/sims/Sims.js với sheet giả trong bộ nhớ.
// Kiểm tra hai cột ngày của SIM: Requested On / Received On (chuỗi yyyy-MM-dd, cột 17-18).
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRV = path.join(HERE, '..', 'server');
const results = [];
function check(name, ok, detail = '') { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  - ' + detail : '')); }

const HEADERS16 = ['SIM ID','Phone','Holder Name','Holder Email','Contact Name','Contact Email','Note',
  'Created At','Created By','Updated At','Updated By','Deleted','Deleted At','Deleted By','Source','Legacy Code'];
const pad2 = (n) => String(n).padStart(2, '0');

/** Sheet giả: lưới 2 chiều (hàng 1 = header), có ghi lại các lần setValues / setNumberFormat. */
function makeSheet(grid, maxCols) {
  const sheet = { grid, maxCols, writes: [], formats: [], weights: [], seq: 0 };
  const cellAt = (r, c) => (grid[r - 1] && grid[r - 1][c - 1] !== undefined ? grid[r - 1][c - 1] : '');
  sheet.getLastRow = () => grid.length;
  sheet.getMaxColumns = () => sheet.maxCols;
  sheet.getRange = (r, c, nr = 1, nc = 1) => ({
    getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cellAt(r + i, c + j))),
    getValue: () => cellAt(r, c),
    setValues: (vals) => {
      sheet.writes.push({ r, c, nr, nc, seq: ++sheet.seq });
      vals.forEach((row, i) => row.forEach((v, j) => {
        while (grid.length < r + i) grid.push([]);
        const line = grid[r + i - 1];
        while (line.length < c + j - 1) line.push('');
        line[c + j - 1] = v;
      }));
    },
    setNumberFormat: (fmt) => { sheet.formats.push({ r, c, nr, nc, fmt, seq: ++sheet.seq }); },
    setFontWeight: (w) => { sheet.weights.push({ r, c, nr, nc, w }); },
  });
  return sheet;
}

function makeSandbox(grid, opts = {}) {
  const sheet = makeSheet(grid, opts.maxCols || 18);
  const logs = [];
  const ctx = {
    console, Date, String, Number, Array, Object, JSON, Math, Error, RegExp, isNaN,
    Utilities: {
      getUuid: () => 'aaaaaaaa-bbbb-cccc-dddd-' + Math.random().toString(16).slice(2).padEnd(12, '0').slice(0, 12),
      formatDate: (d, tz, f) => f === 'yyyy-MM-dd'
        ? d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
        : pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()),
    },
    sheetTz_: () => 'Asia/Ho_Chi_Minh',
    ss_: () => ({ getSheetByName: (n) => (n === 'Sim' ? sheet : null) }),
    ensureSheet_: () => sheet,
    auth_: () => ({ email: 'pops.user@example.com', role: 'admin' }),
    popsIsAllowed_: () => true,
    skuPeople_: () => [],
    withLock_: (fn) => fn(),
    log_: (u, action, detail) => logs.push({ action, detail }),
    cell_: (v, force) => (typeof v === 'string' && v !== '' && (force || /^[=+\-@]/.test(v)) ? "'" + v : v),
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(SRV, 'sims', 'Sims.js'), 'utf8'), ctx, { filename: 'sims/Sims.js' });
  return { ctx, sheet, logs };
}

const headers18 = () => HEADERS16.concat(['Requested On', 'Received On']);
const oldRow = (extra) => ['SIM-AAA', '0902343108', 'An', '', 'Binh', '', 'ghi chú', new Date(2026, 9, 1, 8, 30), 'x@example.com', '', '', false, '', '', 'Database', 'LEG1'].concat(extra || []);

/* 1. simNormDate_ */
{
  const s = makeSandbox([headers18()]);
  const n = s.ctx.simNormDate_;
  check('simNormDate_ is defined', typeof n === 'function');
  if (typeof n === 'function') {
    check("simNormDate_ '2026-11-05' -> '2026-11-05'", n('2026-11-05') === '2026-11-05');
    check("simNormDate_ '' and null -> ''", n('') === '' && n(null) === '');
    check("simNormDate_ rejects '2026-02-30'", n('2026-02-30') === '');
    check("simNormDate_ rejects '05/11/2026'", n('05/11/2026') === '');
    check("simNormDate_ rejects 'abc'", n('abc') === '');
    check('simNormDate_ formats a Date', n(new Date(2026, 10, 5)) === '2026-11-05');
  }
}

/* 2. tạo SIM mới có hai ngày */
{
  const s = makeSandbox([headers18()]);
  const res = s.ctx.simSave({ phone: '0902343108', holder: 'An', contact: 'Binh', note: '', requestedOn: '2026-11-03', receivedOn: '2026-11-05' });
  const row = s.sheet.grid[1] || [];
  check('create: ok', res.ok === true, JSON.stringify(res));
  check('create: row has 18 cells, dates at index 16 and 17', row.length === 18 && row[16] === '2026-11-03' && row[17] === '2026-11-05', JSON.stringify(row.slice(14)));
  const at = 2;
  const fmt = s.sheet.formats.filter((f) => f.fmt === '@' && f.r === at && f.c <= 17 && f.c + f.nc - 1 >= 18);
  check("create: setNumberFormat('@') on both date cells", fmt.length >= 1, JSON.stringify(s.sheet.formats));
  const wrote = s.sheet.writes.find((w) => w.r === at && w.nc === 18);
  const dfmt = s.sheet.formats.find((f) => f.r === at && f.c <= 17 && f.c + f.nc - 1 >= 18);
  check('create: date cells formatted as text before values written', !!wrote && !!dfmt && dfmt.seq < wrote.seq);
  const l = s.ctx.simList();
  check('create: simList returns requestedOn/receivedOn', l.ok && l.rows[0].requestedOn === '2026-11-03' && l.rows[0].receivedOn === '2026-11-05', JSON.stringify(l.rows && l.rows[0]));
}

/* 3. sửa SIM: xoá receivedOn, giữ requestedOn, không đụng cột khác */
{
  const base = oldRow(['2026-11-03', '2026-11-05']);
  const s = makeSandbox([headers18(), base.slice()]);
  const res = s.ctx.simSave({ id: 'SIM-AAA', phone: '0902343108', holder: 'An', contact: 'Binh', note: 'ghi chú', requestedOn: '2026-11-03', receivedOn: '' });
  const row = s.sheet.grid[1];
  check('edit: ok', res.ok === true, JSON.stringify(res));
  check('edit: receivedOn cleared, requestedOn kept', row[17] === '' && row[16] === '2026-11-03', JSON.stringify(row.slice(16)));
  const same = [0, 7, 8, 11, 12, 13, 14, 15].every((i) => row[i] === base[i]);
  check('edit: Created At/By, Deleted*, Source, Legacy Code unchanged', same);
  check('edit: other data columns 1-6 intact', [1, 2, 3, 4, 5, 6].every((i) => row[i] === base[i]), JSON.stringify(row.slice(1, 7)));
  const fmt = s.sheet.formats.filter((f) => f.fmt === '@' && f.r === 2 && f.c <= 17 && f.c + f.nc - 1 >= 18);
  check("edit: date cells set to text format '@'", fmt.length >= 1);
}

/* 4. ngày không hợp lệ -> báo lỗi, không ghi */
{
  const s = makeSandbox([headers18()]);
  const res = s.ctx.simSave({ phone: '0902343108', holder: 'An', requestedOn: '2026-02-30', receivedOn: '' });
  check('invalid date: ok=false with "Ngày không hợp lệ"', res.ok === false && /Ngày không hợp lệ/.test(res.message || ''), JSON.stringify(res));
  check('invalid date: sheet not written', s.sheet.writes.length === 0 && s.sheet.grid.length === 1);
  const r2 = s.ctx.simSave({ phone: '0902343108', holder: 'An', requestedOn: '', receivedOn: '05/11/2026' });
  check('invalid receivedOn also rejected', r2.ok === false && /Ngày không hợp lệ/.test(r2.message || '') && s.sheet.writes.length === 0, JSON.stringify(r2));
}

/* 5. sheet cũ 16 cột */
{
  const s = makeSandbox([HEADERS16.slice(), oldRow()], { maxCols: 16 });
  const l = s.ctx.simList();
  check('legacy 16-col sheet: simList gives empty dates', l.ok && l.rows.length === 1 && l.rows[0].requestedOn === '' && l.rows[0].receivedOn === '', JSON.stringify(l));
  s.ctx.simSheet_();
  const h = s.sheet.grid[0];
  check('legacy sheet: simSheet_ writes the two new headers', h[16] === 'Requested On' && h[17] === 'Received On', JSON.stringify(h.slice(14)));
  check('legacy sheet: old data intact', JSON.stringify(s.sheet.grid[1]) === JSON.stringify(oldRow()) && h.slice(0, 16).join('|') === HEADERS16.join('|'));
}

/* 6. ô ngày là Date (người sửa tay trong Sheet) */
{
  const s = makeSandbox([headers18(), oldRow([new Date(2026, 10, 3), new Date(2026, 10, 5)])]);
  const l = s.ctx.simList();
  check('Date cells -> yyyy-MM-dd in simList', l.ok && l.rows[0].requestedOn === '2026-11-03' && l.rows[0].receivedOn === '2026-11-05', JSON.stringify(l.rows && l.rows[0]));
}

/* 7. hằng số */
{
  const s = makeSandbox([headers18()]);
  const c = vm.runInContext('[SIM.REQUESTED_ON, SIM.RECEIVED_ON, SIM_COLS, SIM_HEADERS[16], SIM_HEADERS[17]]', s.ctx);
  check('constants: indices 16/17, SIM_COLS 18, headers', c[0] === 16 && c[1] === 17 && c[2] === 18 && c[3] === 'Requested On' && c[4] === 'Received On', JSON.stringify(c));
}

/* 8. simReadDate_: Sheet là chữ (@), admin có thể gõ tay dd/MM/yyyy như app đang hiển thị */
{
  const s = makeSandbox([headers18()]);
  const r = s.ctx.simReadDate_;
  check('simReadDate_ is defined', typeof r === 'function');
  if (typeof r === 'function') {
    check("simReadDate_ '2026-11-05' and Date still work", r('2026-11-05') === '2026-11-05' && r(new Date(2026, 10, 5)) === '2026-11-05');
    check("simReadDate_ '05/11/2026' -> '2026-11-05' (day/month/year)", r('05/11/2026') === '2026-11-05');
    check("simReadDate_ ' 5/1/2026 ' (1 digit, spaces) -> '2026-01-05'", r(' 5/1/2026 ') === '2026-01-05');
    check("simReadDate_ '31/02/2026' -> '' (not a real date)", r('31/02/2026') === '');
    check("simReadDate_ '13/13/2026', 'chưa có', '', null -> ''", r('13/13/2026') === '' && r('chưa có') === '' && r('') === '' && r(null) === '');
  }
  check("simNormDate_ stays strict: '05/11/2026' -> ''", s.ctx.simNormDate_('05/11/2026') === '');
}

/* 9. ô ngày gõ tay dd/MM/yyyy: simList đọc được; sửa SIM với cùng ngày thì ghi yyyy-MM-dd */
{
  const s = makeSandbox([headers18(), oldRow(['05/11/2026', '31/02/2026'])]);
  const l = s.ctx.simList();
  check("hand-typed '05/11/2026' reads as '2026-11-05' via simList", l.ok && l.rows[0].requestedOn === '2026-11-05', JSON.stringify(l.rows && l.rows[0]));
  check("hand-typed '31/02/2026' reads as ''", l.ok && l.rows[0].receivedOn === '', JSON.stringify(l.rows && l.rows[0]));
  check('simList does not leak raw cell fields to the client', l.ok && !('requestedOnRaw' in l.rows[0]) && !('receivedOnRaw' in l.rows[0]), Object.keys(l.rows[0] || {}).join(','));
  const res = s.ctx.simSave({ id: 'SIM-AAA', phone: '0902343108', holder: 'An', contact: 'Binh', note: 'ghi chú', requestedOn: l.rows[0].requestedOn, receivedOn: l.rows[0].receivedOn });
  const row = s.sheet.grid[1];
  check("edit with the same date keeps '2026-11-05' written", res.ok === true && row[16] === '2026-11-05', JSON.stringify([res, row.slice(16)]));
  check("edit: '31/02/2026' (unreadable, submitted '') is kept, not wiped", row[17] === '31/02/2026', JSON.stringify(row.slice(16)));
}

/* 10. chữ không đọc được ('chưa có', 'Nov 5'): sửa mà gửi '' thì giữ nguyên ô; gửi ngày hợp lệ thì thay */
{
  const s = makeSandbox([headers18(), oldRow(['chưa có', 'Nov 5'])]);
  const res = s.ctx.simSave({ id: 'SIM-AAA', phone: '0902343108', holder: 'An', contact: 'Binh', note: 'ghi chú', requestedOn: '', receivedOn: '' });
  const row = s.sheet.grid[1];
  check("edit submitting '' keeps unparseable raw 'chưa có' / 'Nov 5'", res.ok === true && row[16] === 'chưa có' && row[17] === 'Nov 5', JSON.stringify([res, row.slice(16)]));
  const res2 = s.ctx.simSave({ id: 'SIM-AAA', phone: '0902343108', holder: 'An', contact: 'Binh', note: 'ghi chú', requestedOn: '2026-11-03', receivedOn: '' });
  check("edit submitting a valid date replaces the raw text (other field still kept)", res2.ok === true && row[16] === '2026-11-03' && row[17] === 'Nov 5', JSON.stringify([res2, row.slice(16)]));
  const s2 = makeSandbox([headers18(), oldRow(['2026-11-03', '2026-11-05'])]);
  s2.ctx.simSave({ id: 'SIM-AAA', phone: '0902343108', holder: 'An', contact: 'Binh', note: 'ghi chú', requestedOn: '', receivedOn: '' });
  check('edit submitting \'\' still clears a parseable date', s2.sheet.grid[1][16] === '' && s2.sheet.grid[1][17] === '', JSON.stringify(s2.sheet.grid[1].slice(16)));
}

/* 11. simSheet_ không ghi đè dữ liệu khác ở Q1/R1 */
{
  const g = [HEADERS16.concat(['Ghi chú riêng', 'Received On']), oldRow(['x', 'y'])];
  const s = makeSandbox(g);
  let err = null;
  try { s.ctx.simSheet_(); } catch (e) { err = e; }
  check('simSheet_ throws when Q1 holds a different non-empty value', !!err && /Cột Q\/R/.test(err.message), err && err.message);
  check('simSheet_ leaves Q1/R1 untouched on conflict', s.sheet.grid[0][16] === 'Ghi chú riêng' && s.sheet.grid[0][17] === 'Received On');
  const s2 = makeSandbox([headers18()]);
  let ok2 = true; try { s2.ctx.simSheet_(); } catch (e) { ok2 = false; }
  check('simSheet_ does not throw when headers already match', ok2);
  const s3 = makeSandbox([HEADERS16.slice(), oldRow()], { maxCols: 16 });
  let ok3 = true; try { s3.ctx.simSheet_(); } catch (e) { ok3 = false; }
  check('simSheet_ still fills empty Q1:R1', ok3 && s3.sheet.grid[0][16] === 'Requested On' && s3.sheet.grid[0][17] === 'Received On');
  const bold = s3.sheet.weights;
  check("simSheet_ makes the new header cells Q1:R1 bold", bold.some((b) => b.r === 1 && b.c === 17 && b.nc === 2 && b.w === 'bold'), JSON.stringify(bold));
}

fs.mkdirSync(path.join(HERE, 'results'), { recursive: true });
fs.writeFileSync(path.join(HERE, 'results', 'sim-server.json'), JSON.stringify(results, null, 2));
const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad} PASS, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
