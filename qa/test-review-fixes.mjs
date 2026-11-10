// test-review-fixes.mjs - kiểm tra các sửa sau vòng duyệt thiết kế (mobile, báo cáo, toast, POPS, kiểm kê, màn chờ)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';
import { createDriver } from './driver.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const results = [];
function check(name, ok, detail = '') { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  - ' + detail : '')); }

build({ quiet: true });
const page = await createDriver();
try {
  /* 1. mobile: các nút lựa chọn ở Tổng quan chia đều, canh giữa, không tràn */
  for (const role of ['admin', 'staff']) {
    await page.open({ role, lang: 'vi', viewport: 'M' });
    await page.waitFor('js:document.querySelectorAll("#homeQuick .btn").length === 4', 8000);
    const q = await page.eval(`(() => { const bs = Array.from(document.querySelectorAll('#homeQuick .btn')).map(b => b.getBoundingClientRect()); const c = document.getElementById('content').getBoundingClientRect(); const left = Math.min(...bs.map(b => b.left)), right = Math.max(...bs.map(b => b.right)); return { n: bs.length, w: bs.map(b => Math.round(b.width)), leftGap: Math.round(left - c.left), rightGap: Math.round(c.right - right), jc: getComputedStyle(document.querySelector('#homeQuick .btn')).justifyContent }; })()`);
    check(`[${role}-M] 4 quick actions equal width, centred`, q.n === 4 && Math.max(...q.w) - Math.min(...q.w) <= 2 && Math.abs(q.leftGap - q.rightGap) <= 3 && q.jc === 'center', JSON.stringify(q));
  }

  /* 2. kiểm kê (kiểu E): trạng thái là các bước, kết quả là biểu tượng + số; không còn thanh, vòng hay nhãn số */
  await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
  await page.eval('goto("stocktake")');
  await page.waitFor('#stkListTable .stk-steps', 6000);
  const st1 = await page.eval(`(() => { const rows = Array.from(document.querySelectorAll('#stkListTable tbody tr')).map(r => ({ steps: Array.from(r.querySelectorAll('.stk-steps li')).map(l => l.className + ':' + l.textContent.trim()), cnt: (r.querySelector('.stk-prog-n') || {}).innerText || '', res: Array.from(r.querySelectorAll('.stk-r')).map(x => x.className.replace('stk-r ', '') + ':' + x.textContent.replace(/\\s+/g, ' ').trim()) })); return { bars: document.querySelectorAll('#stkListTable .stk-bar, #stkListTable .stk-ring, #stkListTable .stk-chip, #stkListTable .badge').length, cols: document.querySelectorAll('#stkListTable thead th').length, rows }; })()`);
  const r0 = st1.rows[0], r1 = st1.rows[1], r2 = st1.rows[2];
  check('stocktake list (E): 4 columns, no bar / ring / chip / badge', st1.bars === 0 && st1.cols === 4, JSON.stringify({ bars: st1.bars, cols: st1.cols }));
  check('counting session: "Đang đếm" is the current step, "Đã xác nhận" still to do, 11 / 24 counted', /^now:Đang đếm/.test(r0.steps[0]) && /^todo:Đã xác nhận/.test(r0.steps[1]) && /11 \/ 24/.test(r0.cnt), JSON.stringify(r0));
  check('results show match / over / short with their numbers', r0.res.length === 3 && /^ok:.*Khớp 4/.test(r0.res[0]) && /^warn:.*Dư 2/.test(r0.res[1]) && /^bad:.*Thiếu 5/.test(r0.res[2]), JSON.stringify(r0.res));
  check('cancelled session shows only "Đã huỷ" and no results', r1.steps.length === 1 && /Đã huỷ/.test(r1.steps[0]) && r1.res.length === 1 && /none:—/.test(r1.res[0]), JSON.stringify(r1));
  check('closed session shows the decision as the finished second step', /^done:Đang đếm/.test(r2.steps[0]) && /^now ok:Hiệu chỉnh một phần/.test(r2.steps[1]), JSON.stringify(r2.steps));
  await page.eval(`document.querySelector('#stkListTable tbody tr').click()`);
  await page.waitFor('#stkDetail:not([hidden]), .odoo-title', 6000).catch(() => {});
  const opened = await page.eval(`!!document.querySelector('.odoo-step')`);
  check('clicking a row still opens the session detail', opened);
  await page.open({ role: 'admin', lang: 'vi', viewport: 'M' });
  await page.eval('goto("stocktake")');
  await page.waitFor('#stkListTable .stk-steps', 6000);
  const mob = await page.eval(`(() => { const w = document.querySelector('#stkListTable').closest('.table-wrap'); return { over: w.scrollWidth > w.clientWidth + 1, cut: Array.from(document.querySelectorAll('#stkListTable .stk-steps')).some(e => e.getBoundingClientRect().right > window.innerWidth + 1), page: document.documentElement.scrollWidth > window.innerWidth + 1 }; })()`);
  check('[M] session list reflows as cards: nothing cut off, no sideways scroll', !mob.over && !mob.cut && !mob.page, JSON.stringify(mob));

  /* 3. báo cáo: ô tick Cái / Thùng */
  for (const vp of ['D', 'M']) {
    await page.open({ role: 'admin', lang: 'vi', viewport: vp });
    await page.eval('goto("report")');
    await page.waitFor('#rpUnitChecks', 6000);
    const st = async () => page.eval(`({ each: document.getElementById('rpUEach').checked, box: document.getElementById('rpUBox').checked, unit: RP.unit, cols: Array.from(document.querySelectorAll('#rpTable thead th')).map(t => t.textContent.trim()).join('|') })`);
    const s0 = await st();
    check(`[${vp}] report starts with Cái ticked only`, s0.each && !s0.box && s0.unit === 'each', JSON.stringify(s0));
    await page.click('#rpUBox'); await page.idle();
    const s1 = await st();
    check(`[${vp}] ticking Thùng too shows both (cái + thùng columns)`, s1.each && s1.box && s1.unit === 'both' && /thùng/i.test(s1.cols), JSON.stringify(s1));
    await page.click('#rpUEach'); await page.idle();
    const s2 = await st();
    check(`[${vp}] unticking Cái leaves Thùng only`, !s2.each && s2.box && s2.unit === 'box', JSON.stringify(s2));
    await page.click('#rpUBox'); await page.idle();
    const s3 = await st();
    check(`[${vp}] the last tick cannot be removed`, s3.box && s3.unit === 'box', JSON.stringify(s3));
    for (const tab of [1, 2]) {
      await page.eval(`document.querySelectorAll('#rpTabs .rp-tab')[${tab}].click()`); await page.idle();
      const ok = await page.eval(`!!document.getElementById('rpUEach') && !!document.getElementById('rpUBox') && RP.unit === (document.getElementById('rpUEach').checked && document.getElementById('rpUBox').checked ? 'both' : document.getElementById('rpUBox').checked ? 'box' : 'each')`);
      check(`[${vp}] tab ${tab + 1}: tick boxes present and in sync`, ok);
    }
  }
  await page.open({ role: 'admin', lang: 'vi', viewport: 'M' });
  await page.eval('goto("report")'); await page.waitFor('#rpQuickSeg', 6000);
  const m = await page.eval(`(() => { const bs = Array.from(document.querySelectorAll('#rpQuickSeg button')); return { cols: new Set(bs.map(b => Math.round(b.getBoundingClientRect().left))).size, wrapped: bs.some(b => b.scrollHeight > b.clientHeight + 1), tabsOverflow: document.getElementById('rpTabs').scrollWidth > document.getElementById('rpTabs').clientWidth + 1, pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1 }; })()`);
  check('[M] quick ranges form 2 columns, no clipped text; tabs fit; no page overflow', m.cols === 2 && !m.wrapped && !m.tabsOverflow && !m.pageOverflow, JSON.stringify(m));

  /* 4. toast: gọn, canh giữa ngang, nằm ngay dưới thanh trên cùng */
  for (const vp of ['D', 'M']) {
    await page.open({ role: 'admin', lang: 'vi', viewport: vp });
    await page.eval(`toast('Đã lưu phiếu nhập kho.', 'ok'); toast('Không thể lưu: thiếu PO No.', 'err')`);
    const tt = await page.eval(`(() => { const ts = Array.from(document.querySelectorAll('#toastHost .toast')); const r = ts[0].getBoundingClientRect(); const hd = document.querySelector('.header').getBoundingClientRect(); return { n: ts.length, centre: Math.round(r.left + r.width / 2), vw: window.innerWidth, top: Math.round(r.top), hdBottom: Math.round(hd.bottom), w: Math.round(r.width), h: Math.round(r.height), bg: ts.map(t => getComputedStyle(t).backgroundColor), icon: ts.every(t => !!t.querySelector('.ico-wrap .ico')), fs: getComputedStyle(ts[0]).fontSize }; })()`);
    check(`[${vp}] toasts compact, centred, just under the top bar, solid colours, with icon`, tt.n === 2 && Math.abs(tt.centre - tt.vw / 2) <= 2 && tt.top >= tt.hdBottom && tt.top <= tt.hdBottom + 24 && tt.w <= 444 && tt.h <= 64 && tt.bg[0] !== tt.bg[1] && tt.icon && parseInt(tt.fs) <= 15, JSON.stringify(tt));
  }

  /* 5. POPS: một tab trên thanh trên cùng, chỉ hiện khi session có popsUrl */
  await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
  let top = await page.eval(`Array.from(document.querySelectorAll('.topnav .nav-item')).filter(a => !a.hidden).map(a => a.textContent.trim())`);
  check('no POPS tab when the user has no POPS access', !top.includes('POPS'), top.join(','));
  await page.eval(`SESSION.canSim = true; SESSION.popsUrl = 'https://script.google.com/macros/s/TEST/exec?page=pops'; navSync('home'); window.__opened = null; window.open = function (u, tgt) { window.__opened = [u, tgt]; }`);
  top = await page.eval(`Array.from(document.querySelectorAll('.topnav .nav-item')).filter(a => !a.hidden).map(a => a.textContent.trim())`);
  check('POPS tab is the last tab of the top bar', top[top.length - 1] === 'POPS' && top.length === 5, top.join(','));
  const sub = await page.eval(`(goto('kho'), Array.from(document.querySelectorAll('#subnav .sub-item')).map(a => a.textContent.trim()))`);
  check('POPS is no longer in the Kho sub-nav', !sub.includes('POPS'), sub.join(','));
  await page.eval(`document.querySelector('.topnav .nav-item[data-page="pops"]').click()`);
  const op = await page.eval(`window.__opened`);
  check('clicking the POPS tab opens ?page=pops in the whole window', op && /page=pops$/.test(op[0]) && op[1] === '_top', JSON.stringify(op));
  const still = await page.eval(`document.querySelector('.page.active').id`);
  check('the app stays on the page it was on (no empty page opened)', still === 'page-kho', still);
  await page.open({ role: 'admin', lang: 'vi', viewport: 'M' });
  await page.eval(`SESSION.canSim = true; SESSION.popsUrl = 'https://x/exec?page=pops'; navSync('home')`);
  const mb = await page.eval(`(() => { const items = Array.from(document.querySelectorAll('.topnav .nav-item')).filter(a => !a.hidden); const r = document.querySelector('.topnav').getBoundingClientRect(); return { n: items.length, within: items.every(a => a.getBoundingClientRect().right <= r.right + 1 && a.getBoundingClientRect().left >= r.left - 1) }; })()`);
  check('[M] five tabs fit the bottom bar', mb.n === 5 && mb.within, JSON.stringify(mb));

  /* 6. màn chờ: ô tô Grab chạy ngang các địa danh TP.HCM (SVG thuần) + dòng vui xoay vòng */
  await page.open({ role: 'admin', lang: 'vi', viewport: 'D', boot: 'slow', waitLanding: false });
  await new Promise((r) => setTimeout(r, 600));
  const T = 'const t = (q) => new DOMMatrix(getComputedStyle(document.querySelector(q)).transform).m41;';
  const l1 = await page.eval(`({ run: document.getElementById('landSpin').classList.contains('run'), names: Array.from(document.querySelectorAll('#landSpin .lm-name')).map(n => n.textContent), car: !!document.querySelector('#landSpin .sc-car'), lib: typeof window.lottie, fun: document.getElementById('landFun').textContent, status: document.getElementById('landSub').textContent, w: Math.round(document.querySelector('.land-scene').getBoundingClientRect().width) })`);
  const want = ['Chợ Bến Thành', 'Nhà hát Thành phố', 'Bitexco', 'Landmark 81', 'Dinh Độc Lập', 'Nhà thờ Đức Bà'];
  check('loading screen: car scene with the six HCMC landmarks, no animation library, playful line, factual status line', l1.run && l1.car && want.every(n => l1.names.includes(n)) && l1.lib === 'undefined' && l1.fun.length > 5 && /xác thực|tải/i.test(l1.status) && l1.w >= 300, JSON.stringify(l1));
  /* xe chạy thật: các lớp phố dịch chuyển với tốc độ khác nhau, bánh xe quay */
  const snap = `(() => { ${T} const w = (i) => new DOMMatrix(getComputedStyle(document.querySelectorAll('.car-wheel')[i]).transform); return { far: t('.sc-far'), lm: t('.sc-lm'), near: t('.sc-near'), cloud: t('.sc-clouds'), dash: t('.sc-dash'), wheel: Math.atan2(w(0).b, w(0).a) }; })()`;
  const m0 = await page.eval(snap);
  await new Promise((r) => setTimeout(r, 300));
  const m1 = await page.eval(snap);
  const dFar = Math.abs(m1.far - m0.far), dLm = Math.abs(m1.lm - m0.lm), dNear = Math.abs(m1.near - m0.near);
  check('the street scrolls past the car: clouds < far < landmarks < trees, dashes move, wheels turn', dFar > 0.1 && dLm > dFar && dNear > dLm && m1.cloud !== m0.cloud && m1.dash !== m0.dash && m1.wheel !== m0.wheel, JSON.stringify({ m0, m1 }));
  const sc = await page.eval(`(() => { const r = document.querySelector('.land-scene').getBoundingClientRect(), c = document.querySelector('.sc-car').getBoundingClientRect(); return { sceneVisible: !document.querySelector('.land-scene').hidden && r.width > 300, carInside: c.left >= r.left - 1 && c.right <= r.right + 1 && c.top >= r.top - 1 && c.bottom <= r.bottom + 1 }; })()`);
  check('scene is visible and the car sits inside it', sc.sceneVisible && sc.carInside, JSON.stringify(sc));
  await page.screenshot(path.join(HERE, 'results', 'screens', 'review-loading-D.png'));
  await new Promise((r) => setTimeout(r, 2000));
  const l2 = await page.eval(`document.getElementById('landFun').textContent`);
  check('playful line rotates', l2 && l2 !== l1.fun, `${l1.fun} -> ${l2}`);
  await page.waitFor('js:document.getElementById("landing").hidden === true', 15000);
  const l3 = await page.eval(`({ fun: document.getElementById('landFun').textContent, run: document.getElementById('landSpin').classList.contains('run') })`);
  check('after loading: playful line cleared and the scene stops animating (no CPU left running)', l3.fun === '' && !l3.run, JSON.stringify(l3));

  /* giảm chuyển động: cả cảnh đứng yên */
  await page.open({ role: 'admin', lang: 'vi', viewport: 'D', boot: 'slow', waitLanding: false, reducedMotion: true });
  await new Promise((r) => setTimeout(r, 500));
  const rm = await page.eval(`({ run: document.getElementById('landSpin').classList.contains('run'), anim: ['.sc-near', '.sc-far', '.sc-lm', '.sc-clouds', '.sc-dash', '.car-body', '.car-wheel', '.car-speed'].map(q => getComputedStyle(document.querySelector(q)).animationName) })`);
  check('reduced motion: the street, car body and wheels hold still', rm.run && rm.anim.every(n => n === 'none'), JSON.stringify(rm));

  /* [M] cảnh vừa khung, không tràn ngang */
  await page.open({ role: 'admin', lang: 'vi', viewport: 'M', boot: 'slow', waitLanding: false });
  await new Promise((r) => setTimeout(r, 400));
  const lm = await page.eval(`(() => { const r = document.querySelector('.land-scene').getBoundingClientRect(); return { w: Math.round(r.width), fit: r.left >= 0 && r.right <= window.innerWidth, page: document.documentElement.scrollWidth > window.innerWidth + 1 }; })()`);
  check('[M] loading scene fits the screen, no sideways scroll', lm.fit && !lm.page && lm.w > 250, JSON.stringify(lm));

  const errs = page.consoleErrors();
  check('no console errors in the whole run', errs.length === 0, errs.map((e) => e.text.split('\n')[0]).join(' | '));
} finally {
  await page.close();
  fs.writeFileSync(path.join(HERE, 'results', 'review-fixes.json'), JSON.stringify(results, null, 2));
}
const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad} PASS, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
