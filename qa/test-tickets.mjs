// test-tickets.mjs - định dạng phiếu in (buildPrintHtml) của Phiếu nhập / Phiếu xuất.
//  - MỘT ô ký "NGƯỜI LẬP PHIẾU" nằm bên trái; không còn "NGƯỜI NHẬN HÀNG" / "Admin"
//  - đầu phiếu: địa chỉ không nhãn, bên phải Số phiếu + Ngày; không còn dòng "In lúc"
//  - chỉ #000/#fff, không đường kẻ trang trí, 8 cột (kể cả Vị trí), phiếu dài: thead lặp, tfoot một lần
//  - Phiếu giao hàng (nút chỉ ở phiếu xuất): một tờ, 7 cột, ba ô ký, "Giao đến" ghi đủ địa điểm
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

/* ═══════════════ PHIẾU GIAO HÀNG (chỉ phiếu xuất) ═══════════════ */

/* page-side: phiếu xuất đầu tiên đổi Location / người yêu cầu / tên hàng theo cấu hình */
const INIT_EXPORT_FN = (server, cfg) => {
  const g = server.getTickets;
  server.getTickets = (f) => {
    const r = g(f);
    const t = r.rows.find((x) => x.type === 'Export');
    if (cfg.locs) {
      t.items.forEach((it, i) => { it.loc = cfg.locs[Math.min(i, cfg.locs.length - 1)]; });
      t.locList = cfg.locs.filter(Boolean).join(', ');
    }
    if (cfg.pic) t.pic = cfg.pic;
    if (cfg.name) t.items[0].name = cfg.name;
    return r;
  };
};
/* init chạy trong trang (được serialize thành chuỗi) nên cfg phải nhúng vào chuỗi, không dùng closure */
const INIT_EXPORT = (cfg) => `(function (server) { return (${INIT_EXPORT_FN.toString()})(server, ${JSON.stringify(cfg)}); })`;

/* bấm "In phiếu giao hàng" của thẻ k (1-based), trả về mọi lần document.write */
async function delivered(page, k) {
  await page.eval(PRINT_HOOK);
  await page.click(`#tkList .ticket-card:nth-child(${k}) .tk-deliver`);
  await sleep(100);
  return page.eval(() => window.__pw.writes.slice());
}
const stripTags = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const idxOf = (page) => page.eval(() => ({
  imp: TICKETS.rows.findIndex((g) => g.type === 'Import') + 1,
  exp: TICKETS.rows.findIndex((g) => g.type === 'Export') + 1,
}));

{   // nút + nội dung
  const page = await createDriver();
  try {
    await openTickets(page);
    const idx = await idxOf(page);
    const btns = await page.eval(() => [...document.querySelectorAll('#tkList .ticket-card')].map((c, i) => ({
      type: TICKETS.rows[i].type, n: c.querySelectorAll('.tk-deliver').length,
      direct: c.querySelectorAll('.ticket-head > .tk-deliver').length })));
    check('only Export cards have .tk-deliver; Import cards have none',
      btns.length > 0 && btns.every((b) => b.type === 'Export' ? (b.n === 1 && b.direct === 1) : b.n === 0),
      `cards=${btns.length} withBtn=${btns.filter((b) => b.n).length} import=${btns.filter((b) => b.type === 'Import').length}`);

    const sib = await page.eval((k) => {
      const head = document.querySelector(`#tkList .ticket-card:nth-child(${k}) .ticket-head`);
      const d = head.querySelector(':scope > .tk-deliver'), p = head.querySelector(':scope > .btn:not(.tk-deliver)');
      return { dc: d.className.replace(/\btk-deliver\b/, '').trim().replace(/\s+/g, ' '), pc: p.className.trim().replace(/\s+/g, ' '),
        dh: d.getBoundingClientRect().height, ph: p.getBoundingClientRect().height, txt: d.textContent.trim(),
        adjacent: p.nextElementSibling === d };
    }, idx.exp);
    check('export card: print and delivery buttons are siblings with the same classes besides tk-deliver',
      sib.dc === sib.pc && Math.abs(sib.dh - sib.ph) < 0.5 && sib.adjacent, JSON.stringify(sib));
    check('vi: delivery button text "In phiếu giao hàng"', sib.txt === 'In phiếu giao hàng', sib.txt);

    const g = await page.eval((k) => { const g = TICKETS.rows[k - 1]; return { id: g.ticketId, qty: g.totalQty, codes: g.items.map((i) => i.code) }; }, idx.exp);
    const writes = await delivered(page, idx.exp);
    const html = writes[0] || '';
    const css = cssOf(html);
    const no = (html.match(/<div class="no">([\s\S]*?)<\/div>/) || [])[1] || '';
    check('delivery note: title "PHIẾU GIAO HÀNG" and "DELIVERY NOTE"; number is PGH_ + ticketId.slice(3); one .ticket block',
      writes.length === 1 && html.includes('<div class="ttl">PHIẾU GIAO HÀNG</div>') && html.includes('<div class="ttlEn">(DELIVERY NOTE)</div>')
      && g.id.startsWith('PX_') && no.includes('<b>PGH_' + g.id.slice(3) + '</b>') && !no.includes('PX_')
      && count(html, /<div class="ticket">/g) === 1 && html.includes('<title>PHIẾU GIAO HÀNG</title>'), no);

    const sgc = (html.match(/<td class="sgc">([\s\S]*?)<\/td>/g) || []).map(stripTags);
    check('delivery note: three .sgc boxes in order "NGƯỜI LẬP PHIẾU", "SHIPPER", "NGƯỜI NHẬN HÀNG"; no time fields',
      sgc.length === 3 && sgc[0].startsWith('NGƯỜI LẬP PHIẾU') && sgc[1].startsWith('SHIPPER') && sgc[2].startsWith('NGƯỜI NHẬN HÀNG')
      && !html.includes('Giờ') && !/\bTime\b/.test(html), JSON.stringify(sgc));
    check('delivery note: signature boxes have equal widths (33.33%)',
      count(html, /<td class="sgc">/g) === 3 && /table\.sg td\.sgc\{[^}]*width:33\.33%/.test(css), (css.match(/table\.sg td\.sgc\{[^}]*\}/g) || []).join(' '));

    const it = (html.match(/<table class="it">[\s\S]*?<\/table>/) || [''])[0];
    const body = (it.match(/<tbody>[\s\S]*<\/tbody>/) || [''])[0];
    const sumQty = (body.match(/<tr>[\s\S]*?<\/tr>/g) || []).reduce((s, r) => s + Number(stripTags((r.match(/<td class="r">([\s\S]*?)<\/td>/) || [])[1] || '0').replace(/[^\d]/g, '')), 0);
    check('delivery note: 7 columns, no "Bin"/"Vị trí" header; every item code present; total quantity equals ticket totalQty',
      count(it, /<col\b/g) === 7 && count(it, /<th>/g) === 7 && !it.includes('Bin') && !it.includes('Vị trí')
      && g.codes.every((c) => html.includes(c.split('-').join('-<wbr>'))) && count(body, /<tr>/g) === g.codes.length && sumQty === g.qty,
      `cols=${count(it, /<col\b/g)} th=${count(it, /<th>/g)} sum=${sumQty} qty=${g.qty}`);
    const foot = (it.match(/<tfoot>[\s\S]*<\/tfoot>/) || [''])[0];
    check('delivery note: tfoot spans exactly 7 columns (3 + 1 + 1 + 1 + 1)',
      /<td class="r" colspan="3">/.test(foot) && count(foot, /<td/g) === 5, foot);

    const colors = css.match(/#[0-9a-fA-F]{3,6}\b/g) || [];
    check('delivery note: print CSS only #000/#fff, no "Địa chỉ", no "In lúc"',
      colors.length > 0 && colors.every((c) => c === '#000' || c === '#fff') && !html.includes('Địa chỉ') && !html.includes('In lúc'), [...new Set(colors)].join(','));
    check('delivery note: "Giao đến" is its own row with 12.5pt bold value; no Khối row',
      /Giao đến <i>\(Deliver to\)<\/i>:/.test(html) && /tr\.to td\.vl\{[^}]*12\.5pt/.test(css) && !html.includes('Khối'));

    // In tất cả: không có phiếu giao hàng
    await page.eval(PRINT_HOOK);
    await page.eval('printAllTickets()');
    await sleep(100);
    const all = await page.eval(() => window.__pw.writes[0] || '');
    check('print-all html has no "PHIẾU GIAO HÀNG"', all.includes('PHIẾU XUẤT KHO') && !all.includes('PHIẾU GIAO HÀNG') && !all.includes('PGH_'));
  } finally { await page.close(); }
}

{   // nhiều địa điểm: vẫn đúng một tờ, "Giao đến" ghi đủ
  const page = await createDriver();
  try {
    await openTickets(page, INIT_EXPORT({ locs: ['Văn phòng Quận 7', 'Văn phòng Quận 1'] }));
    const idx = await idxOf(page);
    const writes = await delivered(page, idx.exp);
    const html = writes[0] || '';
    const to = (html.match(/<tr class="to">([\s\S]*?)<\/tr>/) || [])[1] || '';
    check('delivery note: "Giao đến" lists both locations', writes.length === 1 && count(html, /<div class="ticket">/g) === 1
      && stripTags(to).includes('Văn phòng Quận 7, Văn phòng Quận 1'), stripTags(to));
  } finally { await page.close(); }
}

{   // không có Location
  const page = await createDriver();
  try {
    await openTickets(page, INIT_EXPORT({ locs: [''] }));
    const idx = await idxOf(page);
    const html = (await delivered(page, idx.exp))[0] || '';
    const to = (html.match(/<tr class="to">([\s\S]*?)<\/tr>/) || [])[1] || '';
    check('delivery note: no Location on any row -> "Giao đến" value cell empty, html has no "undefined"/"null"',
      /<td class="vl" colspan="3"><\/td>/.test(to) && !html.includes('undefined') && !/\bnull\b/.test(html), to);
  } finally { await page.close(); }
}

{   // escape
  const page = await createDriver();
  try {
    await openTickets(page, INIT_EXPORT({ pic: '<b>&Co', name: 'Áo "Grab" <i>x</i>' }));
    const idx = await idxOf(page);
    const html = (await delivered(page, idx.exp))[0] || '';
    check('delivery note: requester "<b>&Co" and item name with quotes are escaped',
      html.includes('&lt;b&gt;&amp;Co') && !html.includes('<b>&Co') && html.includes('&quot;Grab&quot;') && html.includes('&lt;i&gt;x&lt;/i&gt;') && !html.includes('<i>x</i>'));
  } finally { await page.close(); }
}

{   // lang=en
  const page = await createDriver();
  try {
    await page.open({ role: 'admin', lang: 'en', viewport: 'D' });
    await page.eval('goto("ticket")');
    await page.waitFor('#tkList .ticket-card');
    await page.idle(250);
    const idx = await idxOf(page);
    const txt = await page.eval((k) => document.querySelector(`#tkList .ticket-card:nth-child(${k}) .tk-deliver`).textContent.trim(), idx.exp);
    const html = (await delivered(page, idx.exp))[0] || '';
    check('lang=en: card button text "Print delivery note"; printed document still contains "PHIẾU GIAO HÀNG" and "Received by"',
      txt === 'Print delivery note' && html.includes('PHIẾU GIAO HÀNG') && html.includes('Received by'), txt);
  } finally { await page.close(); }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
