// test-tablesort.mjs - sắp xếp theo cột (client/app/TableSort.html) trên bảng "Yêu cầu của tôi".
//  - cột "Gửi lúc": server trả 'dd/MM HH:mm' (không có năm) -> phải sắp theo thời gian, kể cả qua ranh giới tháng/năm
//  - cột số: sắp theo giá trị (3 < 12 < 100), ô trống "—" luôn nằm cuối ở cả hai chiều
//  - aria-sort đổi theo chiều sắp
// Chạy: node test-tablesort.mjs
import { build } from './build.mjs';
import { createDriver } from './driver.mjs';

const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, ok, detail = '') { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  - ' + detail : '')); }

/* page-side stubs (serialised into the page, so the values are literals): 4 requests with chosen submittedAt / boxCount */
const INIT_MONTH = (server) => {
  const g = server.getMyRequests;
  const D = ['29/10 09:00', '03/11 10:00', '08/11 14:30', '15/10 08:00'];
  server.getMyRequests = (lim) => { const r = g(lim); r.rows = r.rows.slice(0, 4); r.rows.forEach((row, i) => { row.submittedAt = D[i]; }); return r; };
};
const INIT_YEAR = (server) => {
  const g = server.getMyRequests;
  const D = ['02/01 09:00', '28/12 10:00', '04/01 07:00', '30/12 18:00'];
  server.getMyRequests = (lim) => { const r = g(lim); r.rows = r.rows.slice(0, 4); r.rows.forEach((row, i) => { row.submittedAt = D[i]; }); return r; };
};
const INIT_BOX = (server) => {
  const g = server.getMyRequests;
  const B = ['12', '3', '100', '0'];          // 0 renders as "—" (blank)
  server.getMyRequests = (lim) => { const r = g(lim); r.rows = r.rows.slice(0, 4); r.rows.forEach((row, i) => { row.boxCount = B[i]; }); return r; };
};

const column = (page, key) => page.eval((key) => {
  const tb = document.getElementById('myReqTable');
  const th = [...tb.tHead.rows[0].cells].find((c) => c.textContent.trim() === t(key));
  return { sort: th.getAttribute('aria-sort'), vals: [...tb.tBodies[0].rows].map((r) => r.cells[th.cellIndex].textContent.trim()) };
}, key);
const clickHeading = (page, key) => page.eval((key) => {
  const tb = document.getElementById('myReqTable');
  [...tb.tHead.rows[0].cells].find((c) => c.textContent.trim() === t(key)).querySelector('.th-sort').click();
}, key);

async function scenario(label, init, now, key, ascExpected) {
  const page = await createDriver();
  try {
    await page.open({ role: 'staff', lang: 'vi', viewport: 'D', now, init });
    await page.eval('goto("me")');
    await page.waitFor('js:document.querySelectorAll("#myReqTable tbody tr").length>=4');
    await page.idle();
    let c = await column(page, key);
    check(`${label}: 4 requests are listed`, c.vals.length === 4, c.vals.join(' | '));

    for (let i = 0; i < 3 && c.sort !== 'ascending'; i++) { await clickHeading(page, key); await page.idle(); c = await column(page, key); }
    check(`${label}: ascending sort (aria-sort=ascending) gives the right order`, c.sort === 'ascending' && c.vals.join(' | ') === ascExpected.join(' | '), `got ${c.vals.join(' | ')}  want ${ascExpected.join(' | ')}`);

    await clickHeading(page, key); await page.idle(); c = await column(page, key);
    return { page, c, label, ascExpected };
  } catch (e) { await page.close(); throw e; }
}

build({ quiet: true });

for (const [label, init, now, ascExpected] of [
  ['month boundary (today 09/11)', INIT_MONTH, '2026-11-09T09:00', ['15/10 08:00', '29/10 09:00', '03/11 10:00', '08/11 14:30']],
  ['year boundary (today 05/01)', INIT_YEAR, '2027-01-05T09:00', ['28/12 10:00', '30/12 18:00', '02/01 09:00', '04/01 07:00']],
]) {
  const { page, c } = await scenario(label, init, now, 'col.submittedAt', ascExpected);
  try { check(`${label}: descending sort is the exact reverse (newest first)`, c.sort === 'descending' && c.vals.join(' | ') === [...ascExpected].reverse().join(' | '), `got ${c.vals.join(' | ')}`); }
  finally { await page.close(); }
}

{   // numeric column with a blank cell: numeric order, blank last in BOTH directions
  const asc = ['3', '12', '100', '—'];
  const { page, c } = await scenario('numeric column + blank', INIT_BOX, '2026-11-09T09:00', 'col.box', asc);
  try { check('numeric column + blank: descending is numeric (100, 12, 3) and the blank cell stays last', c.sort === 'descending' && c.vals.join(' | ') === ['100', '12', '3', '—'].join(' | '), `got ${c.vals.join(' | ')}`); }
  finally { await page.close(); }
}

/* ---- paged report: the sort must cover ALL rows, not just the page on screen ---- */
{
  const page = await createDriver();
  try {
    await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
    await page.eval('goto("report")'); await page.waitFor('#page-report.active #rpTable thead th'); await page.idle();
    await page.eval(() => {          // 250 extra items with distinct stock (1000..1249) and distinct names, so the report spans 3 pages
      const base = STOCK[1];
      for (let i = 0; i < 250; i++) STOCK.push(Object.assign({}, base, { code: 'ZZ-' + String(i).padStart(4, '0'), name: 'N' + String(1000 + (i * 91) % 250), variant: '', stock: 1000 + (i * 37) % 250, boxLeft: 0 }));
      rpTab('stock'); rpRunStock();
    });
    await page.idle(); await sleep(200);
    const total = await page.eval(() => RP.rows.length);
    check('paged report: more than 2 pages of rows', total > 200, `rows=${total}`);

    const heading = (key) => page.eval((key) => { const lab = RP.cols.find((c) => c.k === key).label; [...document.querySelectorAll('#rpTable thead th')].find((th) => th.textContent.trim() === lab).querySelector('.th-sort').click(); }, key);
    const dirOf = (key) => page.eval((key) => { const lab = RP.cols.find((c) => c.k === key).label; return [...document.querySelectorAll('#rpTable thead th')].find((th) => th.textContent.trim() === lab).getAttribute('aria-sort'); }, key);
    const shown = (key) => page.eval((key) => { const i = RP.cols.findIndex((c) => c.k === key); return [...document.querySelectorAll('#rpTable tbody tr')].map((r) => r.cells[i].textContent.trim()); }, key);
    const pagerText = () => page.eval(() => document.getElementById('rpPager').textContent.trim());
    const nums = (a) => a.map((s) => Number(s.replace(/\D/g, '')));
    const allStock = await page.eval(() => RP.rows.map((r) => r.stock));
    const desc = [...allStock].sort((a, b) => b - a), asc = [...allStock].sort((a, b) => a - b);

    for (let i = 0; i < 3 && (await dirOf('stock')) !== 'descending'; i++) { await heading('stock'); await page.idle(); await sleep(150); if ((await dirOf('stock')) === 'ascending') { await heading('stock'); await page.idle(); await sleep(150); } }
    check('paged report: sorted descending by stock', (await dirOf('stock')) === 'descending');
    let v = nums(await shown('stock'));
    check('paged report: page 1 holds the 100 LARGEST stock values of all rows', v.length === 100 && v.join() === desc.slice(0, 100).join(), `first=${v[0]} (global max ${desc[0]}), last=${v[v.length - 1]} (100th largest ${desc[99]})`);

    await page.eval(() => document.querySelectorAll('#rpPager button')[1].click()); await page.idle(); await sleep(150);
    v = nums(await shown('stock'));
    check('paged report: page 2 continues the same order (ranks 101-200)', v.join() === desc.slice(100, 200).join(), `first=${v[0]} want ${desc[100]}`);

    await heading('stock'); await page.idle(); await sleep(150);          // flip to ascending while on page 2
    v = nums(await shown('stock'));
    const pg = await pagerText();
    check('paged report: changing the sort returns to page 1 (the 100 SMALLEST values)', (await dirOf('stock')) === 'ascending' && /^‹?1[–-]100/.test(pg) && v.join() === asc.slice(0, 100).join(), `pager="${pg}" first=${v[0]} want ${asc[0]}`);

    await heading('name'); await page.idle(); await sleep(150);
    const names = await page.eval(() => { const c = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' }); return RP.rows.map((r) => String(r.name == null || r.name === '' ? '—' : r.name)).sort((a, b) => c.compare(a, b)); });
    const got = await shown('name');
    check('paged report: sorting a text column is global too (page 1 = the 100 alphabetically first names)', (await dirOf('name')) === 'ascending' && got.join('|') === names.slice(0, 100).join('|'), `first="${got[0]}" want "${names[0]}"`);
  } finally { await page.close(); }
}

/* ---- same on a phone: the "Sắp xếp theo…" select + direction button above the cards ---- */
{
  const page = await createDriver();
  try {
    await page.open({ role: 'admin', lang: 'vi', viewport: 'M' });
    await page.eval('goto("report")'); await page.waitFor('#page-report.active #rpTable thead th'); await page.idle();
    await page.eval(() => {
      const base = STOCK[1];
      for (let i = 0; i < 250; i++) STOCK.push(Object.assign({}, base, { code: 'ZZ-' + String(i).padStart(4, '0'), name: 'N' + String(1000 + (i * 91) % 250), variant: '', stock: 1000 + (i * 37) % 250, boxLeft: 0 }));
      rpTab('stock'); rpRunStock();
    });
    await page.idle(); await sleep(250);
    const col = await page.eval(() => RP.cols.findIndex((c) => c.k === 'stock'));
    await page.eval((col) => { const s = document.querySelector('.ts-bar select'); s.value = String(col); s.dispatchEvent(new Event('change', { bubbles: true })); }, col);
    await page.idle(); await sleep(200);
    await page.eval(() => document.querySelector('.ts-bar button').click());      // ascending -> descending
    await page.idle(); await sleep(200);
    const all = await page.eval(() => RP.rows.map((r) => r.stock).sort((a, b) => b - a));
    const shownM = await page.eval((col) => [...document.querySelectorAll('#rpTable tbody tr')].map((r) => Number(r.cells[col].textContent.replace(/\D/g, ''))), col);
    check('phone: the sort bar sorts ALL report rows (page 1 = the 100 largest, descending)', shownM.length === 100 && shownM.join() === all.slice(0, 100).join(), `first=${shownM[0]} last=${shownM[shownM.length - 1]} want ${all[0]}..${all[99]}`);
  } finally { await page.close(); }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} PASS, ${failed.length} FAIL`);
process.exit(failed.length ? 1 : 0);
