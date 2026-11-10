// test-dashboard-data.mjs - số liệu và hành vi của trang Tổng quan (dashboard mới), đối chiếu với dữ liệu thô.
// Khác test-dashboard.mjs (hình thức: đủ 5 ô, không tràn, tooltip): file này tự TÍNH LẠI mọi con số từ STOCK / HOME rồi so với màn hình,
// thay cho các kiểm tra dữ liệu của 1.01, 1.02, 1.03, 1.05, 1.06 và 1.16 (alert row) đã nghỉ hưu.
// Chạy: node test-dashboard-data.mjs
import { build } from './build.mjs';
import { createDriver } from './driver.mjs';

const results = [];
function check(name, ok, detail = '') { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  - ' + String(detail).slice(0, 400) : '')); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- oracle: everything below is recomputed from the raw STOCK / HOME arrays, not by calling the app's own helpers ---- */
const ORACLE = () => {
  const cnt = (f) => STOCK.filter(f).length;
  const neg = cnt((s) => s.stock < 0), out = cnt((s) => s.stock === 0), low = cnt((s) => s.stock > 0 && s.stock <= LOW);
  const withStock = cnt((s) => s.stock > 0), total = STOCK.length;
  const days = HOME.days || [];
  const imp = days.reduce((a, d) => a + d.imp, 0), exp = days.reduce((a, d) => a + d.exp, 0);
  const old = cnt((s) => { if (!(s.stock > 0)) return false; const ms = Date.parse(s.lastOut || s.last); return !isNaN(ms) && Math.floor((Date.now() - ms) / 86400000) > 90; });
  const pending = IS_ADMIN ? __server.getPendingRequests().rows.length : __server.getMyRequests().summary.pending;
  const tiles = [...document.querySelectorAll('#homeKpis .stat')].map((e) => ({
    label: e.querySelector('.stat-label').textContent.trim(), value: e.querySelector('.stat-value').textContent.trim(),
    foot: e.querySelector('.stat-foot').textContent.trim(), cls: e.className, meter: e.querySelector('.stat-meter i') ? e.querySelector('.stat-meter i').style.width : null,
  }));
  const sign = imp - exp > 0 ? '+' : imp - exp < 0 ? '−' : '';
  return {
    neg, out, low, withStock, total, imp, exp, old, pending, attn: neg + out + low, tiles, pendingN: PENDING_N,
    exp_: {
      attnFoot: t('hm.kAlertFoot2', { neg: num(neg), out: num(out), low: num(low) }),
      stockFoot: t('hm.kStockFoot', { n: num(total), p: Math.round(withStock / total * 100) }),
      netVal: sign + num(Math.abs(imp - exp)), netFoot: t('hm.kNetFoot', { i: num(imp), o: num(exp) }),
      lab: { attn: t('hm.kAlert'), stock: t('hm.kStock'), net: t('hm.kNet'), dead: t('hm.kDead'), pend: t(IS_ADMIN ? 'hm.kPendAdmin' : 'hm.kPendMe') },
      hello: [].concat(PENDING_N ? [t(IS_ADMIN ? 'hm.sumPendAdmin' : 'hm.sumPendMe', { n: num(PENDING_N) })] : [], (neg + out + low) ? [t('hm.sumAttn', { n: num(neg + out + low) })] : []).join(', '),
    },
    helloText: document.getElementById('homeHello').textContent.trim(),
    role: IS_ADMIN ? 'admin' : 'staff',
  };
};

const rowsOf = (page) => page.eval(() => document.querySelectorAll('#stockTable tbody tr').length);
const kho = (page) => page.eval(() => ({ pg: document.querySelector('.page.active').id, attnOn: document.getElementById('stTabAttn').classList.contains('on'), tabsOn: document.querySelectorAll('#stTabAll.on, #stTabIn.on, #stTabAttn.on, #stTabLow.on, #stTabOut.on').length, q: document.getElementById('kSearch').value }));
const goHome = async (page) => { await page.eval('goto("home")'); await page.waitFor('#page-home.active'); await page.sleep(150); };

build({ quiet: true });
const page = await createDriver();
try {
  /* ===================== 1. the five tiles ===================== */
  for (const role of ['admin', 'staff']) {
    await page.open({ role, lang: 'vi', viewport: 'D' });
    const o = await page.eval(ORACLE);
    const L = `[${role}] `;
    const by = (label) => o.tiles.find((x) => x.label === label) || {};
    const want = role === 'admin' ? [o.exp_.lab.pend, o.exp_.lab.attn, o.exp_.lab.stock, o.exp_.lab.net, o.exp_.lab.dead] : [o.exp_.lab.attn, o.exp_.lab.pend, o.exp_.lab.stock, o.exp_.lab.net, o.exp_.lab.dead];
    check(L + 'tile order: ' + (role === 'admin' ? 'pending first (admin acts on it)' : 'attention first'), o.tiles.map((x) => x.label).join('|') === want.join('|'), o.tiles.map((x) => x.label).join('|'));
    const a = by(o.exp_.lab.attn);
    check(L + `attention tile = codes with stock <= ${'LOW'} incl. zero and negative (${o.attn})`, a.value === String(o.attn) && o.attn === o.neg + o.out + o.low, `value=${a.value} neg=${o.neg} out=${o.out} low=${o.low}`);
    check(L + 'attention foot lists the negative / out / low breakdown', a.foot === o.exp_.attnFoot, `"${a.foot}" want "${o.exp_.attnFoot}"`);
    const wantTone = (o.out || o.neg) ? 'bad' : (o.low ? 'warn' : '');
    check(L + `attention tone = ${wantTone || 'none'}`, wantTone ? a.cls.split(' ').includes(wantTone) : !/\b(bad|warn)\b/.test(a.cls), a.cls);
    const s = by(o.exp_.lab.stock);
    check(L + `stock tile = codes with stock > 0 (${o.withStock}) out of ${o.total}`, s.value === String(o.withStock) && s.foot === o.exp_.stockFoot, `value=${s.value} foot="${s.foot}" want "${o.exp_.stockFoot}"`);
    check(L + 'stock meter width = share of codes in stock', Math.abs(parseFloat(s.meter) - o.withStock / o.total * 100) < 0.11, `${s.meter} vs ${(o.withStock / o.total * 100).toFixed(1)}%`);
    const n = by(o.exp_.lab.net);
    check(L + `30-day net tile = receipts ${o.imp} - issues ${o.exp}`, n.value === o.exp_.netVal && n.foot === o.exp_.netFoot, `value=${n.value} want ${o.exp_.netVal}; foot="${n.foot}"`);
    const d = by(o.exp_.lab.dead);
    check(L + `slow stock tile = stock > 0 untouched for more than 90 days (${o.old})`, d.value === String(o.old) && (o.old ? d.cls.includes('warn') : !d.cls.includes('warn')), `value=${d.value} cls=${d.cls}`);
    const p = by(o.exp_.lab.pend);
    check(L + `pending tile = ${role === 'admin' ? 'all pending requests' : 'my pending requests'} (${o.pending})`, p.value === String(o.pending) && o.pendingN === o.pending && (o.pending ? p.cls.includes('info') : !p.cls.includes('info')), `value=${p.value} PENDING_N=${o.pendingN} server=${o.pending}`);
    check(L + 'greeting line = pending part, attention part joined by ", "', o.helloText === o.exp_.hello || (!o.exp_.hello && o.helloText.length > 0), `"${o.helloText}" want "${o.exp_.hello}"`);
  }

  /* ===================== 2. clicks lead to the right place (admin) ===================== */
  await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
  const attn = await page.eval(() => STOCK.filter((s) => s.stock <= LOW).length);
  const attnLabel = await page.eval(() => t('hm.kAlert'));
  const clickTile = (label) => page.eval((label) => { [...document.querySelectorAll('#homeKpis .stat')].find((e) => e.querySelector('.stat-label').textContent.trim() === label).click(); }, label);

  await clickTile(attnLabel); await page.waitFor('#page-kho.active'); await page.idle(200);
  let k = await kho(page), r = await rowsOf(page);
  check('attention tile opens Kho on the "Cần chú ý" tab only, with exactly N rows', k.attnOn && k.tabsOn === 1 && r === attn, `tab=${k.attnOn} tabsOn=${k.tabsOn} rows=${r} want ${attn}`);

  await page.eval('goto("kho")'); await page.waitFor('#page-kho.active');
  await page.type('#kSearch', 'UNI');
  await goHome(page); await clickTile(attnLabel); await page.waitFor('#page-kho.active'); await page.idle(200);
  r = await rowsOf(page); k = await kho(page);
  check('attention tile after a leftover Kho search ("UNI") still shows exactly N rows', r === attn && k.q === '', `rows=${r} want ${attn}, search now "${k.q}"`);

  await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
  await page.eval('goto("kho")'); await page.waitFor('#page-kho.active');
  await page.eval(() => { const s = document.getElementById('kFilterCat'); s.value = s.options[1].value; s.onchange && s.onchange(); renderStock(); });
  await goHome(page); await clickTile(attnLabel); await page.waitFor('#page-kho.active'); await page.idle(200);
  r = await rowsOf(page);
  check('attention tile after a leftover category filter still shows exactly N rows', r === attn, `rows=${r} want ${attn}`);

  await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
  await clickTile(await page.eval(() => t('hm.kPendAdmin'))); await page.waitFor('#page-admin.active');
  check('admin: pending tile opens the approvals page', true);
  await page.open({ role: 'staff', lang: 'vi', viewport: 'D' });
  await clickTile(await page.eval(() => t('hm.kPendMe'))); await page.waitFor('#page-me.active');
  check('staff: pending tile opens "my requests"', true);

  /* ===================== 3. alert list ===================== */
  await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
  const al = await page.eval(() => {
    const all = STOCK.filter((s) => s.stock <= LOW);
    const five = all.map((s) => s.stock).sort((a, b) => a - b).slice(0, 5);
    const rows = [...document.querySelectorAll('#homeAlerts .arow')].map((e) => ({ code: e.querySelector('.mono').textContent, qty: Number(e.querySelector('.figure').textContent.replace(/[^\d-−]/g, '').replace('−', '-')) }));
    const more = document.querySelector('#homeAlerts .alert-more');
    const byCode = Object.fromEntries(STOCK.map((s) => [s.code, s.stock]));
    return { n: all.length, five, rows, shown: rows.map((x) => byCode[x.code]), more: more ? more.textContent : null };
  });
  check('alert list shows the 5 lowest-stock codes, lowest first (negatives, then zero, then low)', al.rows.length === 5 && al.shown.join() === al.five.join(), `shown stock=${al.shown} want ${al.five}`);
  check('alert "Xem tất cả" link exists when more than 5 and carries the full count', !!al.more && al.more.includes('(' + al.n + ')'), `"${al.more}" n=${al.n}`);

  const first = al.rows[0];
  await page.eval(() => document.querySelector('#homeAlerts .arow').click());
  await page.waitFor('#page-kho.active'); await page.idle(200);
  k = await kho(page); r = await rowsOf(page);
  check('clicking an alert row opens Kho filtered to that code, even for zero / negative stock', k.q === first.code && r >= 1, `search="${k.q}" want ${first.code}, rows=${r}, stock=${first.qty}`);

  await goHome(page);
  await page.eval(() => document.querySelector('#homeAlerts .alert-more').click());
  await page.waitFor('#page-kho.active'); await page.idle(200);
  k = await kho(page); r = await rowsOf(page);
  check('"Xem tất cả" opens the attention tab with exactly N rows', k.attnOn && r === al.n, `tab=${k.attnOn} rows=${r} want ${al.n}`);

  /* keyboard: Tab reaches the rows and the link, they show a focus ring, Enter / Space activate them */
  const tabTo = async (cls) => { await page.eval(() => document.activeElement && document.activeElement.blur()); for (let i = 0; i < 80; i++) { await page.press('Tab'); if (await page.eval((cls) => document.activeElement.classList.contains(cls), cls)) return true; } return false; };
  const ring = () => page.eval(() => { const cs = getComputedStyle(document.activeElement); return { fv: document.activeElement.matches(':focus-visible'), os: cs.outlineStyle, ow: parseFloat(cs.outlineWidth) }; });
  await goHome(page);
  const reachedRow = await tabTo('arow'); const rg = await ring();
  check('keyboard: Tab reaches the first alert row and it shows a focus ring', reachedRow && rg.fv && rg.os !== 'none' && rg.ow >= 2, JSON.stringify(rg));
  await page.press('Enter'); await page.waitFor('#page-kho.active'); k = await kho(page);
  check('keyboard: Enter on an alert row opens its code in Kho', k.q === first.code, `search="${k.q}" want ${first.code}`);
  await goHome(page);
  await page.eval(() => document.querySelectorAll('#homeAlerts .arow')[1].focus());
  const second = await page.eval(() => document.activeElement.querySelector('.mono').textContent);
  await page.press('Space'); await page.waitFor('#page-kho.active'); k = await kho(page);
  check('keyboard: Space on an alert row opens its code in Kho', k.q === second, `search="${k.q}" want ${second}`);
  await goHome(page);
  const reachedMore = await tabTo('alert-more'); const rg2 = await ring();
  check('keyboard: Tab reaches "Xem tất cả" and it shows a focus ring', reachedMore && rg2.fv && rg2.os !== 'none' && rg2.ow >= 2, JSON.stringify(rg2));
  await page.press('Enter'); await page.waitFor('#page-kho.active'); k = await kho(page); r = await rowsOf(page);
  check('keyboard: Enter on "Xem tất cả" opens the attention tab with N rows', k.attnOn && r === al.n, `tab=${k.attnOn} rows=${r}`);

  /* ===================== 4. health panel ===================== */
  await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
  const hp = await page.eval(() => {
    const neg = STOCK.filter((s) => s.stock < 0).length, out = STOCK.filter((s) => s.stock === 0).length, low = STOCK.filter((s) => s.stock > 0 && s.stock <= LOW).length;
    const total = STOCK.length, ok = STOCK.filter((s) => s.stock > LOW).length;
    const rows = [...document.querySelectorAll('#homeHealth .hrow')].map((e) => ({ name: e.querySelector('.hrow-name').textContent.trim(), n: Number(e.querySelector('b.figure').textContent.replace(/\D/g, '')), pc: e.querySelector('.hrow-pc').textContent.trim() }));
    const want = [[t('hm.hOk'), ok], [t('hm.hLow'), low], [t('hm.hOut'), out], [t('hm.hNeg'), neg]].map(([name, n]) => ({ name, n, pc: Math.round(n / total * 100) + '%' }));
    const flex = [...document.querySelectorAll('#homeHealth .hb')].map((e) => Number(e.style.flexGrow || e.style.flex.split(' ')[0]));
    return { rows, want, flex, wantFlex: want.map((w) => w.n).filter((n) => n > 0), sum: ok + low + out + neg, total };
  });
  check('health panel: counts and percentages per row match the stock data', JSON.stringify(hp.rows) === JSON.stringify(hp.want), JSON.stringify({ got: hp.rows, want: hp.want }));
  check('health panel: the four rows add up to every code', hp.sum === hp.total, `${hp.sum} vs ${hp.total}`);
  check('health bar: one segment per non-empty row, sized by count', JSON.stringify(hp.flex) === JSON.stringify(hp.wantFlex), `${hp.flex} vs ${hp.wantFlex}`);
  await page.eval(() => { const b = [...document.querySelectorAll('#homeHealth button.hrow')][0]; b.click(); });
  await page.waitFor('#page-kho.active'); r = await rowsOf(page);
  check('health panel: a clickable row opens Kho with a non-empty list', r >= 1, `rows=${r}`);

  /* ===================== 5. stock by category ===================== */
  await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
  const cb = await page.eval(() => {
    const map = {}, unitSum = {}, catUnits = {};
    STOCK.forEach((s) => { const c = s.cat || '—', u = s.unit || '—', q = Math.max(s.stock, 0), k = c + '|' + u; (map[k] = map[k] || { cat: c, unit: u, val: 0 }).val += q; unitSum[u] = (unitSum[u] || 0) + q; if (q > 0) (catUnits[c] = catUnits[c] || {})[u] = true; });
    const want = Object.values(map).filter((x) => x.val > 0).sort((a, b) => (unitSum[b.unit] - unitSum[a.unit]) || (a.unit < b.unit ? -1 : a.unit > b.unit ? 1 : 0) || (b.val - a.val)).slice(0, 6)
      .map((x) => ({ name: x.cat + (Object.keys(catUnits[x.cat]).length > 1 ? ' (' + x.unit + ')' : ''), val: x.val, unit: x.unit }));
    const got = [...document.querySelectorAll('#catBars .bar-row')].map((e) => ({ name: e.querySelector('.bar-name').textContent.trim(), val: Number(e.querySelector('.bar-val').firstChild.textContent.replace(/\D/g, '')), unit: e.querySelector('.bar-val .cell-sub').textContent.trim(), w: parseFloat(e.querySelector('.bar-fill').style.width) }));
    const peak = {}; got.forEach((g) => { peak[g.unit] = Math.max(peak[g.unit] || 0, g.val); });
    return { want, got, widthsOk: got.every((g) => Math.abs(g.w - g.val / peak[g.unit] * 100) < 0.11) };
  });
  check('category bars: each bar is the sum for its (category, unit), units never mixed, same order', JSON.stringify(cb.got.map(({ name, val, unit }) => ({ name, val, unit }))) === JSON.stringify(cb.want), JSON.stringify({ got: cb.got, want: cb.want }));
  check('category bars: bar length is relative to the largest bar of the same unit', cb.widthsOk, JSON.stringify(cb.got.map((g) => g.w)));

  /* ===================== 6. 30-day flow chart ===================== */
  await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
  const chart = () => page.eval(() => {
    const box = document.getElementById('flowChart'), svg = box.querySelector('svg');
    if (!svg) return { svg: false, txt: box.textContent.trim() };
    const parse = (s) => { const m = /^([\d.]+)([KM]?)$/.exec(s); return m ? Number(m[1]) * (m[2] === 'K' ? 1e3 : m[2] === 'M' ? 1e6 : 1) : NaN; };
    const ticks = [...svg.querySelectorAll('text.lc-label[text-anchor=end]')].filter((e) => e.getAttribute('x') === '32').map((e) => parse(e.textContent));
    const vb = svg.viewBox.baseVal, r = svg.getBoundingClientRect();
    return { svg: true, ticks, vbW: vb.width, w: r.width, boxW: box.clientWidth, docW: document.documentElement.scrollWidth, iw: innerWidth };
  });
  const days30 = await page.eval(() => HOME.days.length);
  const legend = await page.eval(() => ({ txt: [...document.querySelectorAll('#flowLegend .lg b')].map((b) => Number(b.textContent.replace(/\D/g, ''))), sums: [HOME.days.reduce((a, d) => a + d.imp, 0), HOME.days.reduce((a, d) => a + d.exp, 0)] }));
  check('flow legend totals = sum of the daily receipts / issues', legend.txt.join() === legend.sums.join(), `${legend.txt} vs ${legend.sums}`);
  const tbl = await page.eval(() => [...document.querySelectorAll('#flowTable tbody tr')].map((r) => [...r.cells].map((c) => c.textContent.trim().replace(/\D/g, '') ? Number(c.textContent.replace(/\D/g, '')) : 0)).length + '/' + HOME.days.length);
  check('flow table has one row per day', tbl.split('/')[0] === tbl.split('/')[1], tbl);

  for (const peak of [1, 2, 3, 7, 13, 99, 101, 1234, 25000]) {
    await page.eval((peak) => { HOME.days = HOME.days.map((d, i) => ({ d: d.d, imp: i === 3 ? peak : (i % 5 === 0 ? 1 : 0), exp: i === 7 ? Math.max(1, Math.round(peak / 2)) : 0 })); drawFlowChart(); }, peak);
    const c = await chart();
    const asc = c.ticks; const diffs = asc.slice(1).map((v, i) => v - asc[i]);
    check(`axis for peak ${peak}: ${asc.join(' ')} - 5 whole, unique, equally spaced marks from 0 up to at least the peak`, asc.length === 5 && asc[0] === 0 && new Set(asc).size === 5 && asc.every(Number.isInteger) && diffs.every((d) => d === diffs[0]) && asc[4] >= peak, `diffs=${diffs}`);
  }
  await page.eval(() => { HOME.days = []; drawFlowChart(); });
  let e = await chart();
  check('chart: empty days -> message, no svg', !e.svg && /Chưa có phát sinh/.test(e.txt), JSON.stringify(e));
  await page.eval(() => { HOME.days = Array.from({ length: 30 }, (_, i) => ({ d: '2026-10-' + String(i % 28 + 1).padStart(2, '0'), imp: 0, exp: 0 })); drawFlowChart(); });
  e = await chart();
  check('chart: all-zero days -> message, no svg', !e.svg && /Chưa có phát sinh/.test(e.txt), JSON.stringify(e));
  await page.eval(() => { HOME = {}; drawFlowChart(); });
  e = await chart();
  check('chart: HOME without days -> message, no svg', !e.svg && /Chưa có/.test(e.txt), JSON.stringify(e));

  await page.open({ role: 'admin', lang: 'en', viewport: 'D', init: (server) => { const b = server.bootstrapAll; server.bootstrapAll = () => { const r = b(); r.data.home.days = []; return r; }; } });
  e = await chart();
  check('chart: boot with no days -> English empty message, no errors', !e.svg && /No movement/.test(e.txt) && page.consoleErrors().length === 0, JSON.stringify(e));

  await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
  const d0 = await chart();
  check('chart: drawn 1:1 (viewBox width == pixel width) and fits its card', Math.abs(d0.vbW - d0.w) < 1 && d0.w <= d0.boxW + 1 && d0.docW <= d0.iw, JSON.stringify(d0));
  await page.setViewport('M'); await page.sleep(700);
  const m1 = await chart();
  check('chart: resize desktop -> phone redraws to the card width without sideways scroll', Math.abs(m1.w - m1.boxW) < 2 && m1.w < d0.w - 300 && m1.docW <= m1.iw, JSON.stringify({ d: d0.w, m: m1.w, box: m1.boxW }));
  await page.setViewport('D'); await page.sleep(700);
  const d2 = await chart();
  check('chart: resize phone -> desktop redraws back to the wide card', d2.w > m1.w + 300 && Math.abs(d2.w - d2.boxW) < 2, JSON.stringify({ m: m1.w, d: d2.w, box: d2.boxW }));

  check('no console errors during the whole run', page.consoleErrors().length === 0, JSON.stringify(page.consoleErrors().slice(0, 2)));
} finally { await page.close(); }

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} PASS, ${failed.length} FAIL`);
process.exit(failed.length ? 1 : 0);
