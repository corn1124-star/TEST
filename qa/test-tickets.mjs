// test-tickets.mjs - định dạng phiếu in (buildPrintHtml) của Phiếu nhập / Phiếu xuất.
//  - MỘT ô ký "NGƯỜI LẬP PHIẾU" nằm bên trái; không còn "NGƯỜI NHẬN HÀNG" / "Admin"
//  - đầu phiếu: địa chỉ không nhãn, bên phải Số phiếu + Ngày; không còn dòng "In lúc"
//  - chỉ #000/#fff, không đường kẻ trang trí, 8 cột (kể cả Vị trí), phiếu dài: thead lặp, tfoot một lần
// Chạy: node test-tickets.mjs
import { build } from './build.mjs';
import { createDriver } from './driver.mjs';

const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, ok, detail = '') { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  - ' + detail : '')); }

/* page-side stub: window.open trả về cửa sổ giả, gom HTML mà app document.write vào */
const PRINT_HOOK = () => {
  window.__pw = { writes: [] };
  window.print = function () { };
  window.open = function () {
    return { closed: false, document: { open() { }, write(h) { window.__pw.writes.push(h); }, close() { } } };
  };
};

/* page-side: một phiếu có 40 dòng hàng (nhân bản dòng đầu) để thử nhiều trang */
const INIT_LONG = (server) => {
  const g = server.getTickets;
  server.getTickets = (f) => {
    const r = g(f);
    const t = r.rows[0], base = t.items[0];
    t.items = Array.from({ length: 40 }, (_, i) => Object.assign({}, base, { no: i + 1, code: base.code + '-' + i }));
    t.itemCount = 40; t.totalQty = t.items.reduce((s, it) => s + it.qty, 0);
    return r;
  };
};

/* mở trang Phiếu kho, bấm "In phiếu" của thẻ idx (1-based), trả HTML của tài liệu in */
async function printed(page, idx) {
  await page.eval(PRINT_HOOK);
  await page.click(`#tkList .ticket-card:nth-child(${idx}) .ticket-head > .btn`);
  await sleep(100);
  return page.eval(() => window.__pw.writes[0] || '');
}
async function openTickets(page, init) {
  await page.open({ role: 'admin', lang: 'vi', viewport: 'D', init });
  await page.eval('goto("ticket")');
  await page.waitFor('#tkList .ticket-card');
  await page.idle(250);
}

const count = (s, re) => (s.match(re) || []).length;
const cssOf = (html) => html.slice(html.indexOf('<style>'), html.indexOf('.bar{'));

build({ quiet: true });

{
  const page = await createDriver();
  try {
    await openTickets(page);
    const idx = await page.eval(() => ({
      imp: TICKETS.rows.findIndex((g) => g.type === 'Import') + 1,
      exp: TICKETS.rows.findIndex((g) => g.type === 'Export') + 1,
    }));
    check('fixture has one Import and one Export ticket', idx.imp > 0 && idx.exp > 0, JSON.stringify(idx));

    for (const [label, k] of [['import', idx.imp], ['export', idx.exp]]) {
      if (!(k > 0)) continue;
      const g = await page.eval((k) => { const g = TICKETS.rows[k - 1]; return { id: g.ticketId, dateVn: g.dateVn }; }, k);
      const html = await printed(page, k);
      const css = cssOf(html);
      const P = `${label}`;

      const sgc = html.match(/<td class="sgc">([\s\S]*?)<\/td>/g) || [];
      const sgText = sgc.map((c) => c.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
      check(`${P}: exactly one .sgc box and it starts with "NGƯỜI LẬP PHIẾU"`, sgc.length === 1 && sgText[0].startsWith('NGƯỜI LẬP PHIẾU'), JSON.stringify(sgText));
      check(`${P}: "NGƯỜI NHẬN HÀNG", "Received by", "Admin" absent`, !html.includes('NGƯỜI NHẬN HÀNG') && !html.includes('Received by') && !/Admin/.test(html));

      const sgRule = (css.match(/table\.sg td\.sgc\{[^}]*\}/) || [''])[0];
      check(`${P}: signature box is left-aligned (first cell, no text-align:right)`,
        count(html, /<td class="sgc">/g) === 1 && /<table class="sg"><tbody><tr><td class="sgc">/.test(html) && !/text-align:\s*right/.test(sgRule), sgRule);

      check(`${P}: "Địa chỉ" and "Address)" absent, address text present`,
        !html.includes('Địa chỉ') && !html.includes('Address)') && html.includes('<span class="seg">Tầng 15</span>'));
      check(`${P}: no "In lúc" footer`, !html.includes('In lúc') && !html.includes('class="ft"'));

      const no = (html.match(/<div class="no">([\s\S]*?)<\/div>/) || [])[1] || '';
      check(`${P}: header shows Số phiếu (No.) = ticketId and Ngày (Date) = dateVn`,
        /Số phiếu <i>\(No\.\)<\/i>/.test(no) && no.includes('<b>' + g.id + '</b>') && /Ngày <i>\(Date\)<\/i>/.test(no) && no.includes('<b>' + g.dateVn + '</b>'), no);

      const colors = css.match(/#[0-9a-fA-F]{3,6}\b/g) || [];
      check(`${P}: print CSS uses only #000/#fff`, colors.length > 0 && colors.every((c) => c === '#000' || c === '#fff'), [...new Set(colors)].join(','));

      check(`${P}: no decorative rule (.ln, hdBox/hd border-bottom, class="ln")`,
        !/\.ln\b/.test(css) && !/\.(hdBox|hd)\{[^}]*border-bottom/.test(css) && !html.includes('class="ln"'));

      const it = (html.match(/<table class="it">[\s\S]*?<\/table>/) || [''])[0];
      check(`${P}: 8 columns incl. "Vị trí" / Bin`, count(it, /<col\b/g) === 8 && count(it, /<th>/g) === 8 && /Vị trí<span class="en">Bin<\/span>/.test(it), `cols=${count(it, /<col\b/g)} th=${count(it, /<th>/g)}`);
    }
  } finally { await page.close(); }
}

{   // phiếu dài: thead lặp, tfoot một lần, một khối ký
  const page = await createDriver();
  try {
    await openTickets(page, INIT_LONG);
    const html = await printed(page, 1);
    const css = cssOf(html);
    const n = await page.eval(() => TICKETS.rows[0].items.length);
    check('long ticket: fixture really has 40 items', n === 40 && count(html, /<td class="cd">/g) === 40, `items=${n}`);
    check('long ticket: thead repeats, tfoot does not',
      css.includes('thead{display:table-header-group}') && css.includes('tfoot{display:table-row-group}') && css.includes('table.it tr{page-break-inside:avoid}'));
    check('long ticket: one signature table', count(html, /<table class="sg">/g) === 1);
  } finally { await page.close(); }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
