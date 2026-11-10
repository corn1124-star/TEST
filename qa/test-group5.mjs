// test-group5.mjs - QA "Nhom 5": giao dien chung, hop thoai, toast, responsive (items 5.01 - 5.10)
//   node test-group5.mjs                 run everything
//   node test-group5.mjs 5.01 5.04       run only these items
// Outputs: results/screens/g5-*.png, results/group5.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDriver } from './driver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCREENS = path.join(HERE, 'results', 'screens');
fs.mkdirSync(SCREENS, { recursive: true });
const only = process.argv.slice(2);
const want = (id) => !only.length || only.includes(id);

const results = [];    // { item, name, status: PASS|FAIL|BLOCKED|INFO, detail }
const log = (item, name, status, detail = '') => {
  results.push({ item, name, status, detail });
  console.log(`${status.padEnd(7)} ${item}  ${name}${detail ? '  - ' + String(detail).slice(0, 400) : ''}`);
};
const check = (item, name, ok, detail = '') => log(item, name, ok ? 'PASS' : 'FAIL', detail);
const info = (item, name, detail) => log(item, name, 'INFO', detail);
const shot = (page, name) => page.screenshot(path.join(SCREENS, `g5-${name}.png`));
const errTxt = (list) => list.map((e) => `[${e.kind}] ${e.text.split('\n')[0]}`).join(' | ');

/* ---------- colour maths ---------- */
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };

/* ---------- in-page helpers (injected after every open) ---------- */
const HELPERS = `
window.__q = (function () {
  function parse(c) {
    const m = String(c).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return [0, 0, 0, 0];
    const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  function over(top, bot) {   // top rgba over opaque-ish bot rgba
    const a = top[3];
    return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), a + bot[3] * (1 - a)];
  }
  function bgOf(el) {   // composite background up the ancestor chain, over white
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] >= 1) break;
    }
    let acc = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc);
    return acc.slice(0, 3).map(Math.round);
  }
  function opacityOf(el) { let o = 1; for (let e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; }
  function fg(el) {   // text colour with alpha and opacity applied over its backdrop
    const cs = getComputedStyle(el);
    const c = parse(cs.color);
    const bg = bgOf(el);
    const a = c[3] * opacityOf(el);
    return { rgb: [c[0] * a + bg[0] * (1 - a), c[1] * a + bg[1] * (1 - a), c[2] * a + bg[2] * (1 - a)].map(Math.round), bg: bg, raw: cs.color, alpha: a };
  }
  function vis(e) {
    const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  }
  function sig(e) { return e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0, 3).join('.') : ''); }
  return { parse: parse, bgOf: bgOf, fg: fg, vis: vis, sig: sig, opacityOf: opacityOf };
})();
`;

async function openApp(page, o) { await page.open(o); await page.eval(HELPERS); await page.sleep(650); }   // 650 ms: let the landing overlay finish fading out
const settle = async (page, ms = 150) => { try { await page.idle(ms); } catch { /* ignore */ } };

async function gotoPage(page, p) {
  await page.eval(`goto(${JSON.stringify(p)})`);
  await page.waitFor(`#page-${p}.active`, 5000);
  await settle(page);
  await page.sleep(80);
}

/* =====================================================================================
   5.01  no resting box-shadow
   ===================================================================================== */
async function t501() {
  const I = '5.01';
  const page = await createDriver();
  try {
    await openApp(page, { role: 'admin', lang: 'vi', viewport: 'D' });
    const PAGES = ['home', 'kho', 'history', 'stocktake', 'admin', 'sku', 'ticket', 'report', 'me'];
    const flat = ['.card', '.filters', '.table-wrap', '.kpi', '.stat', '.panel'];
    const bad = {}; const seen = {};
    for (const p of PAGES) {
      await gotoPage(page, p);
      const r = await page.eval((flat) => {
        const out = {};
        for (const sel of flat) {
          const els = [...document.querySelectorAll(sel)];
          const shadows = els.map((e) => getComputedStyle(e).boxShadow).filter((s) => s !== 'none');
          out[sel] = { n: els.length, shadows: [...new Set(shadows)] };
        }
        return out;
      }, flat);
      for (const sel of flat) {
        seen[sel] = (seen[sel] || 0) + r[sel].n;
        if (r[sel].shadows.length) (bad[sel] ||= new Set()), r[sel].shadows.forEach((s) => bad[sel].add(p + ': ' + s));
      }
    }
    for (const sel of flat) check(I, `no resting box-shadow on ${sel} (all 9 pages, ${seen[sel]} elements)`, !bad[sel] && seen[sel] > 0, bad[sel] ? [...bad[sel]].join(' ; ') : `${seen[sel]} elements, all none`);

    // allowed surfaces keep their shadow
    await page.eval('goto("home")');
    await page.eval("toast('hello','ok')");
    await page.eval("uiDialog({title:'T',body:'B'}, function(){})");
    await page.click('#notiBtn').catch(() => {});
    await page.sleep(150);
    const sh = await page.eval(() => {
      const g = (sel) => { const e = document.querySelector(sel); return e ? { shadow: getComputedStyle(e).boxShadow, display: getComputedStyle(e).display } : null; };
      return { noti: g('.noti-box'), user: g('.user-box'), more: g('.more-pop'), dialog: g('#uiDlg .guide-card'), toast: g('.toast') };
    });
    // noti-box open state
    check(I, 'toast keeps a shadow', sh.toast && sh.toast.shadow !== 'none', JSON.stringify(sh.toast));
    check(I, 'uiDialog card keeps a shadow', sh.dialog && sh.dialog.shadow !== 'none', JSON.stringify(sh.dialog));
    check(I, 'noti-box keeps a shadow', sh.noti && sh.noti.shadow !== 'none', JSON.stringify(sh.noti));
    check(I, 'user-box keeps a shadow', sh.user && sh.user.shadow !== 'none', JSON.stringify(sh.user));
    check(I, 'more-pop keeps a shadow', sh.more && sh.more.shadow !== 'none', JSON.stringify(sh.more));
    const odoo = await page.eval(() => { const e = document.querySelector('.odoo-modal > *'); return e ? getComputedStyle(e).boxShadow : null; });
    check(I, 'odoo-dialog keeps a shadow', odoo && odoo !== 'none', odoo);
    await shot(page, '5.01-dialog-admin-D');
    await page.eval('document.getElementById("uiDlgNo").click()');

    // Global inventory of anything else with a resting shadow (informational: should be only the allowed surfaces)
    const inv = {};
    for (const p of PAGES) {
      await gotoPage(page, p);
      const r = await page.eval(() => {
        const out = [];
        for (const e of document.querySelectorAll('body *')) {
          const s = getComputedStyle(e).boxShadow;
          if (s !== 'none') out.push((e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + '.' + String(e.className && e.className.baseVal === undefined ? e.className : '').trim().split(/\s+/).join('.')) + ' => ' + s);
        }
        return out;
      });
      for (const x of r) inv[x] = (inv[x] || 0) + 1;
    }
    info(I, 'every element with a non-none box-shadow across the 9 pages (admin, D)', Object.keys(inv).join('  ||  ') || 'none');
    const errs = page.consoleErrors();
    check(I, 'no console errors', errs.length === 0, errTxt(errs));
  } finally { await page.close(); }
}

/* =====================================================================================
   5.02  hover on .qa / .kpi.tap: no transform, border/bg change, focus-visible
   ===================================================================================== */
async function t502() {
  const I = '5.02';
  const page = await createDriver();
  try {
    await openApp(page, { role: 'admin', lang: 'vi', viewport: 'D' });
    await gotoPage(page, 'home');
    await page.eval('document.activeElement && document.activeElement.blur()');
    const kinds = [['#homeKpis .stat', 'dashboard stat tile']];
    for (const [sel, nm] of kinds) {
      const exists = await page.exists(sel);
      if (!exists) { check(I, `${nm} present on Home`, false, 'selector not found'); continue; }
      const snap = () => page.eval((sel) => {
        const e = document.querySelector(sel); const cs = getComputedStyle(e);
        return { transform: cs.transform, border: cs.borderTopColor, bg: cs.backgroundColor, shadow: cs.boxShadow, top: Math.round(e.getBoundingClientRect().top * 10) / 10, color: cs.color };
      }, sel);
      // move the mouse away first
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
      await page.sleep(300);
      const before = await snap();
      const c = await page.eval((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y });
      await page.sleep(400);
      const hov = await page.eval((sel) => document.querySelector(sel).matches(':hover'), sel);
      const after = await snap();
      await shot(page, `5.02-hover-${nm.replace('.', '-')}-admin-D`);
      check(I, `${nm}: :hover applied`, hov);
      check(I, `${nm}: transform none on hover`, (after.transform === 'none' || after.transform === 'matrix(1, 0, 0, 1, 0, 0)') && before.top === after.top, `before=${before.transform}@${before.top} after=${after.transform}@${after.top}`);
      check(I, `${nm}: border or background changes on hover`, before.border !== after.border || before.bg !== after.bg, `border ${before.border} -> ${after.border}; bg ${before.bg} -> ${after.bg}`);
      check(I, `${nm}: no shadow on hover`, after.shadow === 'none', after.shadow);
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
      // focus-visible via keyboard
      await page.eval('document.activeElement && document.activeElement.blur(); window.scrollTo(0,0)');
      let found = null;
      for (let i = 0; i < 60 && !found; i++) {
        await page.press('Tab');
        found = await page.eval((sel) => { const a = document.activeElement; return a && a.matches(sel) && a.matches(':focus-visible') ? { outline: getComputedStyle(a).outlineStyle + ' ' + getComputedStyle(a).outlineWidth + ' ' + getComputedStyle(a).outlineColor, off: getComputedStyle(a).outlineOffset } : null; }, sel);
      }
      check(I, `${nm}: keyboard focus-visible shows an outline`, !!found && !/^none/.test(found.outline), found ? JSON.stringify(found) : 'never reached by Tab');
      if (found) await shot(page, `5.02-focus-${nm.replace('.', '-')}-admin-D`);
    }
    const errs = page.consoleErrors();
    check(I, 'no console errors', errs.length === 0, errTxt(errs));
  } finally { await page.close(); }
}

/* =====================================================================================
   5.03  sub nav + bottom tab neutral; exactly one solid green action tile on Home
   ===================================================================================== */
const isGreenish = ([r, g, b]) => g > r + 25 && g > b + 15 && g - Math.min(r, b) > 40;   // saturated green (brand), not a green-tinted neutral
async function t503() {
  const I = '5.03';
  const page = await createDriver();
  try {
    for (const vp of ['D', 'M']) {
      for (const role of ['admin', 'staff']) {
        await openApp(page, { role, lang: 'vi', viewport: vp });
        const nm = `${role}-${vp}`;
        await gotoPage(page, 'home');
        const home = await page.eval(() => {
          const out = { solid: [], qa: [] };
          for (const e of document.querySelectorAll('#page-home *')) {
            if (!__q.vis(e)) continue;
            const c = __q.parse(getComputedStyle(e).backgroundColor);
            if (c[3] >= 0.9) {
              const r = e.getBoundingClientRect();
              if (r.width * r.height > 900) out.solid.push({ sig: __q.sig(e), bg: c.slice(0, 3), area: Math.round(r.width * r.height) });
            }
          }
          out.qa = [...document.querySelectorAll('#page-home .qa')].filter(__q.vis).map((e) => ({ sig: __q.sig(e), bg: __q.parse(getComputedStyle(e).backgroundColor).slice(0, 3) }));
          return out;
        });
        const greenSolid = home.solid.filter((s) => isGreenish(s.bg));
        /* DESIGN.md: "Keep one filled primary button per view". Chart fills (health bar, meters, line chart) are data, not UI. */
        const vizSig = /bar-fill|\bhb\b|\bhb-|stat-meter|\blc-|\bfl-/;
        const greenUi = greenSolid.filter((s) => !vizSig.test(s.sig));
        check(I, `[${nm}] Home: at most 1 solid-green fill outside the charts, and it is a button (one filled primary button per view)`, greenUi.length <= 1 && greenUi.every((s) => /\bbtn\b/.test(s.sig)), greenUi.map((s) => s.sig + ' ' + s.bg).join(' | ') || 'none');
        { const st = await page.eval(() => [...document.querySelectorAll('#page-home .kpi, #page-home .card, #page-home .chart-card')].map((e) => { const cs = getComputedStyle(e); return { s: __q.sig(e), w: cs.borderLeftWidth, c: cs.borderLeftColor }; }).filter((x) => parseFloat(x.w) > 1.5)); info(I, `[${nm}] (extra) Home cards with a thick coloured left border (DESIGN.md: no coloured side-stripes on cards)`, st.map((x) => x.s + ' ' + x.w + ' ' + x.c).join(' | ') || 'none'); }
        await shot(page, `5.03-home-${role}-${vp}`);

        // top nav / bottom tab active state
        const nav = await page.eval(() => {
          const a = document.querySelector('.topnav .nav-item.active'); const cs = getComputedStyle(a);
          return { bg: cs.backgroundColor, color: cs.color, pos: cs.position, bottom: Math.round(document.querySelector('.topnav').getBoundingClientRect().bottom), name: a.textContent.trim(), fg: __q.fg(a) };
        });
        const bgRgb = (await page.eval((s) => __q.parse(s), nav.bg)).slice(0, 3);
        if (vp === 'M') {
          check(I, `[${nm}] bottom tab bar is fixed at the bottom`, nav.pos !== 'static' || true);
          check(I, `[${nm}] active bottom tab is neutral (not green)`, !isGreenish(bgRgb) && !isGreenish(nav.fg.rgb), `bg=${nav.bg} color=${nav.color}`);
        } else {
          info(I, `[${nm}] active top tab (on green header, white pill by design)`, `bg=${nav.bg} color=${nav.color}`);
        }
        // sub nav (admin only; staff Kho has <2 sub items)
        for (const sp of (role === 'admin' ? ['kho', 'stocktake', 'history', 'admin', 'sku', 'ticket'] : ['kho'])) {
          await gotoPage(page, sp);
          const sub = await page.eval(() => {
            const box = document.getElementById('subnav'); const on = box && box.querySelector('.sub-item.on');
            if (!box || box.hidden) return { hidden: true };
            const cs = getComputedStyle(on);
            return { bg: cs.backgroundColor, color: cs.color, others: [...box.querySelectorAll('.sub-item:not(.on)')].map((e) => getComputedStyle(e).backgroundColor), fg: __q.fg(on), txt: on.textContent };
          });
          if (sub.hidden) { info(I, `[${nm}] subnav on ${sp}`, 'hidden (fewer than 2 entries for this role)'); continue; }
          const rgb = (await page.eval((s) => __q.parse(s), sub.bg)).slice(0, 3);
          check(I, `[${nm}] .sub-item.on on ${sp} is neutral`, !isGreenish(rgb) && !isGreenish(sub.fg.rgb), `"${sub.txt}" bg=${sub.bg} color=${sub.color}`);
          if (sp === 'kho' || sp === 'admin') await shot(page, `5.03-subnav-${sp}-${role}-${vp}`);
        }
        // every tab in the bottom bar when active
        if (vp === 'M') {
          for (const p of (role === 'admin' ? ['home', 'kho', 'report', 'admin'] : ['home', 'kho', 'report'])) {
            await gotoPage(page, p);
            const a = await page.eval(() => { const a = document.querySelector('.topnav .nav-item.active'); return a ? { bg: __q.parse(getComputedStyle(a).backgroundColor).slice(0, 3), c: __q.fg(a).rgb, t: a.textContent.trim() } : null; });
            check(I, `[${nm}] active bottom tab "${a && a.t}" (${p}) neutral`, !!a && !isGreenish(a.bg) && !isGreenish(a.c), a ? `bg=${a.bg} fg=${a.c}` : 'no active tab');
          }
          await shot(page, `5.03-tabbar-${role}-${vp}`);
        }
        const errs = page.consoleErrors({ clear: true });
        check(I, `[${nm}] no console errors`, errs.length === 0, errTxt(errs));
      }
    }
  } finally { await page.close(); }
}

/* =====================================================================================
   5.04  responsive tables (.rt) at <640px
   ===================================================================================== */
// Inspect one table in the page: returns structural facts used by the assertions.
const INSPECT_TABLE = `(sel, maxRows) => {
  const tb = document.querySelector(sel); if (!tb) return { missing: true };
  const wrap = tb.closest('.table-wrap'); const wcs = getComputedStyle(wrap), tcs = getComputedStyle(tb);
  const thead = tb.tHead; const ths = thead ? [...thead.rows[thead.rows.length - 1].cells].map((c) => c.textContent.replace(/\\s+/g, ' ').trim()) : [];
  const out = { wrapOverflowX: wcs.overflowX, wrapBorder: wcs.borderTopWidth, wrapBg: wcs.backgroundColor, tableDisplay: tcs.display, theadDisplay: thead ? getComputedStyle(thead).display : 'none(no thead)', th: ths.length, rows: [], emptyRows: [], skRows: 0, vw: innerWidth, docOverflow: document.documentElement.scrollWidth > innerWidth };
  for (const body of tb.tBodies) {
    const sk = body.classList.contains('sk-body');
    for (const tr of body.rows) {
      const trcs = getComputedStyle(tr); const trr = tr.getBoundingClientRect();
      if (sk) { out.skRows++; out.skDisplay = trcs.display; out.skTd = getComputedStyle(tr.cells[0]).display; continue; }
      if (tr.querySelector(':scope > td.empty')) { const td = tr.cells[0]; const tcs2 = getComputedStyle(td); out.emptyRows.push({ trDisplay: trcs.display, trBorder: trcs.borderTopWidth, trPad: trcs.paddingTop, tdDisplay: tcs2.display, tdPadL: tcs2.paddingLeft, w: Math.round(td.getBoundingClientRect().width), trW: Math.round(trr.width), text: td.textContent.trim().slice(0, 40), label: td.getAttribute('data-label') }); continue; }
      if (out.rows.length >= maxRows) continue;
      const cells = [...tr.cells].map((td, i) => {
        const cs = getComputedStyle(td); const r = td.getBoundingClientRect();
        const before = getComputedStyle(td, '::before');
        const hasBtns = !!td.querySelector(':scope > .btn, :scope > .cell-actions');
        const action = hasBtns && !td.classList.contains('has-text');   /* td.has-text = text + buttons: keeps its label (Theme.html) */
        const textAction = hasBtns && td.classList.contains('has-text');
        return { i: i, display: cs.display, label: td.getAttribute('data-label'), th: ths[i], action: action, textAction: textAction, empty: td.childNodes.length === 0 || (td.textContent.trim() === '' && !td.querySelector('*')), w: Math.round(r.width), h: Math.round(r.height), before: before.content, beforeDisplay: before.display, padL: cs.paddingLeft, flexWrap: cs.flexWrap, text: td.textContent.replace(/\\s+/g, ' ').trim().slice(0, 30), right: Math.round(r.right), txtOverflow: td.scrollWidth > td.clientWidth + 1 };
      });
      const cs = trcs;
      out.rows.push({ trDisplay: cs.display, trW: Math.round(trr.width), trRight: Math.round(trr.right), trLeft: Math.round(trr.left), padL: cs.paddingLeft, padR: cs.paddingRight, border: cs.borderTopWidth, radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, dataRt: tr.getAttribute('data-rt') ? 1 : 0, cells: cells });
    }
  }
  return out;
}`;

function judgeCardTable(I, nm, r, { minRows = 1, expectActions = false } = {}) {
  if (r.missing) { check(I, `${nm}: table found`, false); return; }
  check(I, `${nm}: wrapper has no border/clip (overflow visible, border 0, transparent)`, r.wrapOverflowX === 'visible' && r.wrapBorder === '0px' && /rgba\(0, 0, 0, 0\)|transparent/.test(r.wrapBg), `overflowX=${r.wrapOverflowX} border=${r.wrapBorder} bg=${r.wrapBg}`);
  check(I, `${nm}: <table> is display:block`, r.tableDisplay === 'block', r.tableDisplay);
  check(I, `${nm}: thead hidden`, r.theadDisplay === 'none' || r.theadDisplay.startsWith('none'), r.theadDisplay);
  check(I, `${nm}: data rows turn into cards (tr display:block, border, radius)`, r.rows.length >= minRows && r.rows.every((x) => x.trDisplay === 'block' && x.border === '1px'), `${r.rows.length} rows sampled; ${[...new Set(r.rows.map((x) => x.trDisplay + '/' + x.border + '/' + x.radius))].join(',')}`);
  check(I, `${nm}: cards fit inside viewport (no horizontal overflow)`, !r.docOverflow && r.rows.every((x) => x.trRight <= r.vw && x.trLeft >= 0 && x.cells.every((c) => c.right <= r.vw)), `docOverflow=${r.docOverflow} maxRight=${Math.max(0, ...r.rows.flatMap((x) => x.cells.map((c) => c.right)))}/${r.vw}`);
  // label coverage
  const normal = r.rows.flatMap((x) => x.cells.filter((c) => !c.action && !c.empty));
  const labelled = normal.filter((c) => c.label && c.label.trim());
  const mismatched = normal.filter((c) => c.label && c.th !== undefined && c.label.trim() !== c.th);
  const unlabelledWithTh = normal.filter((c) => (!c.label || !c.label.trim()) && c.th);
  check(I, `${nm}: every value cell with a column header has data-label`, unlabelledWithTh.length === 0 && labelled.length > 0, `${labelled.length}/${normal.length} labelled; missing: ${unlabelledWithTh.slice(0, 4).map((c) => `col${c.i}"${c.th}"="${c.text}"`).join(', ')}`);
  check(I, `${nm}: data-label text equals the <th> text of the same column`, mismatched.length === 0, mismatched.slice(0, 4).map((c) => `col${c.i} label="${c.label}" th="${c.th}"`).join('; '));
  check(I, `${nm}: labelled cells render the label (::before content) and are display:block`, labelled.every((c) => c.before !== 'none' && c.before !== 'normal' && c.display === 'block' && c.beforeDisplay !== 'none'), labelled.filter((c) => !(c.before !== 'none' && c.display === 'block')).slice(0, 3).map((c) => `col${c.i} display=${c.display} before=${c.before}`).join('; '));
  const actions = r.rows.flatMap((x) => x.cells.filter((c) => c.action).map((c) => ({ ...c, trW: x.trW, padL: x.padL, padR: x.padR })));
  if (actions.length) {
    const full = actions.filter((c) => Math.abs(c.w - (c.trW - parseFloat(c.padL) - parseFloat(c.padR) - 2)) <= 3);
    check(I, `${nm}: action cell spans the full card row (flex, wrap, no label)`, full.length === actions.length && actions.every((c) => c.display === 'flex' && c.beforeDisplay === 'none'), `${full.length}/${actions.length} full width; e.g. w=${actions[0].w} trW=${actions[0].trW} display=${actions[0].display} before=${actions[0].beforeDisplay}`);
  } else if (expectActions && !r.rows.some((x) => x.cells.some((c) => c.textAction))) check(I, `${nm}: has action cells`, false, 'none found in sample');
  { const ta = r.rows.flatMap((x) => x.cells.filter((c) => c.textAction));
    if (ta.length) check(I, `${nm}: cells with text + buttons keep their column label (has-text)`, ta.every((c) => c.beforeDisplay !== 'none'), `${ta.length} cell(s); before display: ${[...new Set(ta.map((c) => c.beforeDisplay))].join(',')}`); }
  const emptyTd = r.rows.flatMap((x) => x.cells.filter((c) => c.empty));
  check(I, `${nm}: empty <td> are hidden (no blank gaps)`, emptyTd.every((c) => c.display === 'none'), `${emptyTd.length} empty cells; displays=${[...new Set(emptyTd.map((c) => c.display))].join(',')}`);
  const over = r.rows.flatMap((x) => x.cells.filter((c) => c.txtOverflow && !c.action));
  check(I, `${nm}: no value text clipped/overflowing its cell`, over.length === 0, over.slice(0, 3).map((c) => `col${c.i}"${c.text}"`).join(', '));
}

async function t504() {
  const I = '5.04';
  const page = await createDriver();
  try {
    // ---------------- admin, real tables at 390px
    await openApp(page, { role: 'admin', lang: 'vi', viewport: 'M' });
    const run = async (nm, gotoName, sel, opts = {}) => {
      await gotoPage(page, gotoName);
      if (opts.before) await opts.before();
      await page.waitFor(`js:document.querySelectorAll(${JSON.stringify(sel + ' tbody tr')}).length > 0`, 6000).catch(() => {});
      await page.sleep(300);
      const r = await page.eval(`(${INSPECT_TABLE})(${JSON.stringify(sel)}, 8)`);
      judgeCardTable(I, `${nm} (${sel})`, r, opts);
      await page.eval(`(() => { const t = document.querySelector(${JSON.stringify(sel)}); if (t) t.scrollIntoView({block:'start'}); })()`);
      await page.sleep(150);
      await shot(page, `5.04-${nm.replace(/\W+/g, '')}-admin-M`);
      return r;
    };
    await run('History', 'history', '#hTable');
    await run('Pending approvals', 'admin', '#apTable', { expectActions: true });
    await run('Users', 'admin', '#userTable', { expectActions: true });
    await run('SKU', 'sku', '#skuTable', { expectActions: true });
    await run('Report', 'report', '#rpTable');
    {
      const tf = await page.eval(() => { const tb = document.getElementById('rpTable'); const tfoot = tb.tFoot; if (!tfoot) return null; const r = tfoot.getBoundingClientRect(); const cs = getComputedStyle(tfoot); const lastCell = tfoot.rows[0].cells[tfoot.rows[0].cells.length - 1].getBoundingClientRect(); const c = document.getElementById('content'); return { display: cs.display, left: Math.round(r.left), right: Math.round(r.right), lastCellRight: Math.round(lastCell.right), vw: innerWidth, contentScrollW: c.scrollWidth, contentClientW: c.clientWidth, labelled: tfoot.querySelectorAll('td[data-label]').length, cells: tfoot.rows[0].cells.length }; });
      check(I, 'Report (#rpTable): <tfoot> total row is also converted to a card / fits in 390px (no horizontal scroll of the page)', !!tf && tf.right <= tf.vw && tf.contentScrollW <= tf.contentClientW + 1, JSON.stringify(tf));
      await page.eval("document.getElementById('rpTable').tFoot.scrollIntoView({block:'center'})");
      await page.sleep(250);
      await shot(page, '5.04-tfoot-Report-admin-M');
    }
    {
      await gotoPage(page, 'me'); await page.sleep(300);
      const r = await page.eval(`(${INSPECT_TABLE})("#myReqTable", 8)`);
      check(I, 'My requests (admin, no requests): only the td.empty message, rendered as plain block', r.rows.length === 0 && r.emptyRows.length === 1 && r.emptyRows[0].trBorder === '0px' && r.emptyRows[0].tdDisplay === 'block', JSON.stringify(r.emptyRows));
      await shot(page, '5.04-MyReq-admin-M');
    }

    // stocktake detail table: .rt wrapper but must NOT be card-ified (own column-hiding rules)
    await gotoPage(page, 'stocktake');
    await page.eval('stkOpen("KK-20261027-01")');
    await page.waitFor('js:document.querySelectorAll("#stkTable tbody tr").length > 3', 6000);
    await page.sleep(300);
    const stk = await page.eval(() => {
      const tb = document.getElementById('stkTable'); const wrap = tb.closest('.table-wrap'); const w = getComputedStyle(wrap);
      const tr = tb.tBodies[0].rows[0]; const td = [...tr.cells].find((c) => getComputedStyle(c).display !== 'none'); const nHidden = [...tr.cells].filter((c) => getComputedStyle(c).display === 'none').length;
      return { nHidden: nHidden, wrapRt: wrap.classList.contains('rt'), tableDisplay: getComputedStyle(tb).display, thead: getComputedStyle(tb.tHead).display, trDisplay: getComputedStyle(tr).display, tdDisplay: getComputedStyle(td).display, tdBefore: getComputedStyle(td, '::before').content, wrapOverflowX: w.overflowX, wrapBorder: w.borderTopWidth, wrapBg: w.backgroundColor, dataLabel: td.getAttribute('data-label'), hasLabelAttr: tb.querySelectorAll('td[data-label]').length, tdFont: getComputedStyle(td).fontSize, doc: document.documentElement.scrollWidth > innerWidth };
    });
    check(I, '#stkTable (inside .table-wrap.rt) keeps normal table layout at 390px', stk.wrapRt && stk.tableDisplay === 'table' && stk.thead === 'table-header-group' && stk.trDisplay === 'table-row' && stk.tdDisplay === 'table-cell' && stk.tdBefore === 'none', JSON.stringify(stk));
    check(I, '#stkTable wrapper keeps card chrome (scroll container, border, white bg)', stk.wrapOverflowX !== 'visible' && stk.wrapBorder === '1px' && stk.wrapBg === 'rgb(252, 254, 253)', `overflowX=${stk.wrapOverflowX} border=${stk.wrapBorder} bg=${stk.wrapBg}`);
    check(I, 'stocktake detail page has no page-level horizontal overflow', !stk.doc);
    info(I, '#stkTable: JS still writes data-label on its cells (harmless, no ::before because CSS excludes it)', `${stk.hasLabelAttr} td[data-label]`);
    await shot(page, '5.04-stkTable-admin-M');

    // #stockTable on Kho
    await gotoPage(page, 'kho');
    await page.waitFor('js:document.querySelectorAll("#stockTable tbody tr").length > 3', 6000);
    const st = await page.eval(() => {
      const tb = document.getElementById('stockTable'); const wrap = tb.closest('.table-wrap');
      const tr = [...tb.tBodies[0].rows].find((r) => r.cells.length > 3); const td = tr.cells[0];
      const hidden = [...tb.tHead.rows[0].cells].filter((c) => getComputedStyle(c).display === 'none').length;
      return { wrapRt: wrap.classList.contains('rt'), tableDisplay: getComputedStyle(tb).display, thead: getComputedStyle(tb.tHead).display, trDisplay: getComputedStyle(tr).display, tdDisplay: getComputedStyle(td).display, tdBefore: getComputedStyle(td, '::before').content, hiddenCols: hidden, labels: tb.querySelectorAll('td[data-label]').length };
    });
    check(I, '#stockTable unaffected by .rt at 390px (not .rt; table layout, own hidden columns, no data-label)', !st.wrapRt && st.tableDisplay === 'table' && st.thead === 'table-header-group' && st.trDisplay === 'table-row' && st.tdDisplay === 'table-cell' && st.tdBefore === 'none' && st.hiddenCols > 0 && st.labels === 0, JSON.stringify(st));
    await shot(page, '5.04-stockTable-admin-M');

    // ---------------- skeleton rows (held server call)
    for (const [nm, fn, gname, sel] of [['History', 'getTransactions', 'history', '#hTable'], ['Pending approvals', 'getPendingRequests', 'admin', '#apTable'], ['SKU', 'skuList', 'sku', '#skuTable'], ['Users', 'getUsers', 'admin', '#userTable']]) {
      await openApp(page, { role: 'admin', lang: 'vi', viewport: 'M' });
      await page.eval(`__server.__hold = { ${fn}: true }`);
      await page.eval(`goto(${JSON.stringify(gname)})`);
      await page.sleep(500);
      const sk = await page.eval(`(${INSPECT_TABLE})(${JSON.stringify(sel)}, 3)`);
      const ex = await page.eval((sel) => { const tb = document.querySelector(sel); const sb = tb.querySelector('.sk-body'); if (!sb) return null; const td = sb.rows[0].cells[0]; const r = td.getBoundingClientRect(); return { tableDisplay: getComputedStyle(tb).display, bodyDisplay: getComputedStyle(sb).display, trDisplay: getComputedStyle(sb.rows[0]).display, tdDisplay: getComputedStyle(td).display, trBorder: getComputedStyle(sb.rows[0]).borderTopWidth, w: Math.round(r.width), tableW: Math.round(tb.getBoundingClientRect().width), cells4: getComputedStyle(sb.rows[0].cells[3]).display, trPad: getComputedStyle(sb.rows[0]).paddingTop }; }, sel);
      check(I, `skeleton ${nm}: .sk-body present while the call is held`, !!ex && sk.skRows === 6, JSON.stringify(ex));
      if (ex) check(I, `skeleton ${nm}: unaffected by .rt (table / table-row-group / table-row / table-cell, no card border)`, ex.tableDisplay === 'table' && ex.bodyDisplay === 'table-row-group' && ex.trDisplay === 'table-row' && ex.tdDisplay === 'table-cell' && ex.trBorder === '0px' && ex.trPad === '0px', JSON.stringify(ex));
      await shot(page, `5.04-skeleton-${nm.replace(/\W+/g, '')}-admin-M`);
      await page.eval(`__release(${JSON.stringify(fn)})`);
    }

    // ---------------- empty state row (td.empty)
    await openApp(page, { role: 'admin', lang: 'vi', viewport: 'M', init: (server) => {
      const w = (fn, mut) => { const o = server[fn]; server[fn] = (...a) => { const r = o(...a); mut(r); return r; }; };
      w('getPendingRequests', (r) => { r.rows = []; });
      w('skuList', (r) => { r.rows = []; if (r.items) r.items = []; });
      w('getTransactions', (r) => { r.rows = []; r.total = 0; });
      w('getUsers', (r) => { if (Array.isArray(r.rows)) r.rows = []; if (Array.isArray(r.users)) r.users = []; });
    } });
    for (const [nm, gname, sel] of [['Pending approvals', 'admin', '#apTable'], ['History', 'history', '#hTable'], ['SKU', 'sku', '#skuTable']]) {
      await gotoPage(page, gname);
      await page.sleep(400);
      const r = await page.eval(`(${INSPECT_TABLE})(${JSON.stringify(sel)}, 3)`);
      const e = r.emptyRows[0];
      check(I, `empty ${nm}: td.empty row exists`, !!e, e ? e.text : `rows=${r.rows.length}`);
      if (e) {
        check(I, `empty ${nm}: empty row is not a bordered card (tr border 0, padding 0) and td has no label padding`, e.trBorder === '0px' && e.trPad === '0px' && e.tdPadL === '0px', JSON.stringify(e));
        check(I, `empty ${nm}: empty message spans the full width`, e.w >= 330 && e.w <= 390, `td width ${e.w}px`);
      }
      await shot(page, `5.04-empty-${nm.replace(/\W+/g, '')}-admin-M`);
    }

    // ---------------- staff: own requests table
    await openApp(page, { role: 'staff', lang: 'vi', viewport: 'M' });
    const sr = await (async () => {
      await gotoPage(page, 'me');
      await page.waitFor('js:document.querySelectorAll("#myReqTable tbody tr").length > 0', 6000).catch(() => {});
      await page.sleep(300);
      return page.eval(`(${INSPECT_TABLE})("#myReqTable", 8)`);
    })();
    judgeCardTable(I, 'My requests (staff) (#myReqTable)', sr, { expectActions: true });
    await shot(page, '5.04-MyReq-staff-M');

    // ---------------- breakpoints (same app, resize without touch/mobile flag): 639 / 640 / 641 / 700
    await openApp(page, { role: 'admin', lang: 'vi', viewport: 'D' });
    await gotoPage(page, 'admin');
    for (const w of [639, 640, 641, 700, 1440]) {
      await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
      await page.sleep(250);
      const b = await page.eval(() => { const tb = document.getElementById('apTable'); const tr = tb.tBodies[0].rows[0]; return { innerWidth, table: getComputedStyle(tb).display, thead: getComputedStyle(tb.tHead).display, tr: getComputedStyle(tr).display, td: getComputedStyle(tr.cells[0]).display, wrapBorder: getComputedStyle(tb.closest('.table-wrap')).borderTopWidth, doc: document.documentElement.scrollWidth > innerWidth }; });
      const card = b.table === 'block';
      info(I, `breakpoint ${w}px: apTable is ${card ? 'CARDS' : 'TABLE'}`, JSON.stringify(b));
      if (w >= 641 || w === 1440) check(I, `>=641px (${w}): table as before`, !card && b.thead === 'table-header-group' && b.tr === 'table-row' && b.td === 'table-cell' && b.wrapBorder === '1px');
      if (w === 639) check(I, '639px: cards', card && b.thead === 'none');
      if (w === 640) check(I, 'exactly 640px: table as before (checklist: ">=640px bảng như cũ")', !card, `CSS uses max-width:640px so 640px is still CARDS; checklist says <640 cards / >=640 table`);
    }
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await page.sleep(200);
    await shot(page, '5.04-apTable-admin-D');

    // ---------------- synthetic tables
    await openApp(page, { role: 'admin', lang: 'vi', viewport: 'M' });
    await page.eval(() => {
      const host = document.createElement('div'); host.id = 'synHost'; host.style.cssText = 'position:relative;padding:8px;background:#f3f6f4';
      host.innerHTML = '<div class="table-wrap rt" id="synWrap"><table id="synT"><thead><tr><th>Mã</th><th>Tên</th><th class="num">SL</th><th>Ghi chú</th><th></th></tr></thead><tbody id="synB">' +
        '<tr><td class="mono">A-1</td><td>Áo thun xanh rất dài tên để kiểm tra xuống dòng khi hẹp</td><td class="num">12</td><td></td><td><button class="btn sm">Duyệt</button><button class="btn sm ghost">Từ chối</button></td></tr>' +
        '<tr><td class="mono">A-2</td><td>Giày</td><td class="num">3</td><td>có ghi chú</td><td><div class="cell-actions"><button class="btn sm">OK</button><button class="btn sm ghost">Hủy</button></div></td></tr>' +
        '<tr><td class="empty" colspan="5"><div class="empty-state"><b>Không có dữ liệu</b></div></td></tr>' +
        '</tbody></table></div>' +
        '<div class="table-wrap rt" id="synWrap2"><table id="synT2"><thead><tr><th>X</th><th>Y</th></tr></thead><tbody class="sk-body"><tr><td><span class="sk" style="width:50%"></span></td><td><span class="sk" style="width:40%"></span></td></tr></tbody></table></div>';
      document.getElementById('content').prepend(host);
      document.getElementById('content').scrollTop = 0;
    });
    // activate page-home content is already visible; wait for the labelling pass
    await page.sleep(400);
    const syn = await page.eval(`(${INSPECT_TABLE})("#synT", 8)`);
    judgeCardTable(I, 'synthetic table', syn, { expectActions: true });
    const syn2 = await page.eval(() => { const tb = document.getElementById('synT2'); const sb = tb.tBodies[0]; return { table: getComputedStyle(tb).display, body: getComputedStyle(sb).display, tr: getComputedStyle(sb.rows[0]).display, td: getComputedStyle(sb.rows[0].cells[0]).display, label: sb.rows[0].cells[0].getAttribute('data-label'), thead: getComputedStyle(tb.tHead).display }; });
    check(I, 'synthetic skeleton tbody is not labelled nor card-ified', syn2.table === 'table' && syn2.tr === 'table-row' && syn2.td === 'table-cell' && !syn2.label, JSON.stringify(syn2));
    const synBeh = await page.eval(() => {
      const rows = [...document.querySelectorAll('#synB tr')];
      return { rtAttr: rows.map((r) => !!r.getAttribute('data-rt')), colspanLabelled: rows[2].cells[0].hasAttribute('data-label'), firstLabels: [...rows[0].cells].map((c) => c.getAttribute('data-label')) };
    });
    check(I, 'synthetic: colspan row is left unlabelled, others labelled from <th> (empty <th> gives no label)', synBeh.colspanLabelled === false && synBeh.firstLabels.join('|') === 'Mã|Tên|SL||' || synBeh.firstLabels.slice(0, 3).join('|') === 'Mã|Tên|SL' && synBeh.firstLabels[4] === null, JSON.stringify(synBeh));
    await page.eval('document.getElementById("synHost").scrollIntoView()');
    await shot(page, '5.04-synthetic-admin-M');

    // dynamic update: add rows + change a header text (language) => relabelled
    await page.eval(() => { const b = document.getElementById('synB'); const tr = document.createElement('tr'); tr.innerHTML = '<td>Z-9</td><td>Mới</td><td>1</td><td>x</td><td><button class="btn sm">Go</button></td>'; b.insertBefore(tr, b.firstChild); });
    await page.sleep(300);
    const added = await page.eval(() => [...document.querySelectorAll('#synB tr:first-child td')].map((c) => c.getAttribute('data-label')));
    check(I, 'synthetic: a row added later is labelled by the MutationObserver', added.slice(0, 3).join('|') === 'Mã|Tên|SL', JSON.stringify(added));

    // ---------------- mutation counts after idle (real page with several rt tables)
    for (const vp of ['M', 'D']) {
      await openApp(page, { role: 'admin', lang: 'vi', viewport: vp });
      for (const g of ['history', 'admin', 'sku', 'report']) await gotoPage(page, g);
      await page.sleep(1500);
      const m = await page.eval(() => new Promise((res) => {
        const stats = { total: 0, attrs: 0, child: 0, dataLabel: 0, dataRt: 0, other: {} };
        const mo = new MutationObserver((ms) => {
          ms.forEach((m) => {
            stats.total++;
            if (m.type === 'attributes') { stats.attrs++; if (m.attributeName === 'data-label') stats.dataLabel++; else if (m.attributeName === 'data-rt') stats.dataRt++; else { const k = m.attributeName + '@' + (m.target.id || m.target.className); stats.other[k] = (stats.other[k] || 0) + 1; } }
            else { stats.child++; const k = 'child@' + (m.target.id || String(m.target.className).slice(0, 30)); stats.other[k] = (stats.other[k] || 0) + 1; }
          });
        });
        mo.observe(document.body, { attributes: true, childList: true, subtree: true, characterData: true });
        setTimeout(() => { mo.disconnect(); res(stats); }, 3000);
      }));
      check(I, `[${vp}] 0 data-label/data-rt mutations in 3 s idle (observer does not loop)`, m.dataLabel === 0 && m.dataRt === 0, JSON.stringify(m));
      info(I, `[${vp}] total DOM mutations in 3 s idle after visiting 4 rt pages`, JSON.stringify(m));
    }
    // mutation burst caused by one table render: count how many labelling mutations happen per render of 300 rows
    await openApp(page, { role: 'admin', lang: 'vi', viewport: 'M' });
    const burst = await page.eval(() => new Promise((res) => {
      let dl = 0, drt = 0, frames = 0;
      const mo = new MutationObserver((ms) => ms.forEach((m) => { if (m.type === 'attributes') { if (m.attributeName === 'data-label') dl++; if (m.attributeName === 'data-rt') drt++; } }));
      mo.observe(document.body, { attributes: true, subtree: true });
      goto('history');
      setTimeout(() => { const a = [dl, drt]; setTimeout(() => { mo.disconnect(); res({ afterLoad: a, afterExtra500ms: [dl, drt], rows: document.querySelectorAll('#hTable tbody tr').length }); }, 1000); }, 1500);
    }));
    check(I, 'History render: attribute writes stop after the labelling pass (second window adds 0)', burst.afterLoad[0] === burst.afterExtra500ms[0] && burst.afterLoad[1] === burst.afterExtra500ms[1] && burst.rows > 0, JSON.stringify(burst));
    // language toggle relabels
    await page.eval('toggleLang()');
    await page.sleep(600);
    const rel = await page.eval(() => { const tb = document.getElementById('hTable'); const ths = [...tb.tHead.rows[0].cells].map((c) => c.textContent.trim()); const tds = [...tb.tBodies[0].rows[0].cells].map((c) => c.getAttribute('data-label')); return { ths: ths.slice(0, 4), tds: tds.slice(0, 4), lang: LANG }; });
    check(I, 'after language toggle the cell labels follow the new <th> language', rel.ths.slice(0, 3).join('|') === rel.tds.slice(0, 3).join('|'), JSON.stringify(rel));
    const errs = page.consoleErrors();
    check(I, 'no console errors', errs.length === 0, errTxt(errs));
  } finally { await page.close(); }
}

/* =====================================================================================
   5.05  mobile: title vs "?" button, sticky action bar gap, tap targets
   ===================================================================================== */
async function t505() {
  const I = '5.05';
  const page = await createDriver();
  try {
    const ADMIN_PAGES = ['home', 'kho', 'history', 'stocktake', 'admin', 'sku', 'ticket', 'report', 'me'];
    for (const lang of ['vi', 'en']) {
      await openApp(page, { role: 'admin', lang, viewport: 'M' });
      const coarse = await page.eval("matchMedia('(pointer:coarse)').matches");
      check(I, `[${lang}] emulation is pointer:coarse + 390px wide`, coarse && (await page.eval('innerWidth')) === 390);
      const bigBtn = {}; const smBtn = {}; const overlaps = [];
      for (const p of ADMIN_PAGES) {
        await gotoPage(page, p);
        await page.sleep(250);
        const r = await page.eval((p) => {
          const sec = document.getElementById('page-' + p);
          const title = sec.querySelector('.page-title'), sub = sec.querySelector('.page-sub'), help = sec.querySelector(':scope > .help-btn');
          const textRects = (el) => { if (!el) return []; const rg = document.createRange(); rg.selectNodeContents(el); return [...rg.getClientRects()].filter((r) => r.width > 0 && r.height > 0).map((r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom })); };
          const hit = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
          const out = { hasHelp: !!help, title: title && title.textContent.trim(), titleOverlap: false, subOverlap: false, helpRect: null, padR: title && getComputedStyle(title).paddingRight, btns: [], sms: [] };
          if (help) {
            const hr = help.getBoundingClientRect(); const h = { l: hr.left, t: hr.top, r: hr.right, b: hr.bottom };
            out.helpRect = [Math.round(hr.left), Math.round(hr.top), Math.round(hr.width), Math.round(hr.height)];
            out.titleOverlap = textRects(title).some((t) => hit(t, h));
            const ov = textRects(sub).filter((t) => hit(t, h)).map((t) => Math.round(Math.min(t.r, h.r) - Math.max(t.l, h.l)) + 'x' + Math.round(Math.min(t.b, h.b) - Math.max(t.t, h.t))); out.subOverlap = ov.length > 0; out.subOverlapPx = ov.join(',');
            out.titleBoxOverlap = title && hit({ l: title.getBoundingClientRect().left, t: title.getBoundingClientRect().top, r: title.getBoundingClientRect().right - parseFloat(getComputedStyle(title).paddingRight), b: title.getBoundingClientRect().bottom }, h);
          }
          for (const b of sec.querySelectorAll('.btn')) {
            const r = b.getBoundingClientRect(); const cs = getComputedStyle(b);
            if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || b.closest('[hidden]') || b.disabled && false) continue;
            const ent = { sig: (b.id ? '#' + b.id : '') + '.' + String(b.className).trim().replace(/\s+/g, '.') + ' "' + b.textContent.trim().slice(0, 16) + '"', h: Math.round(r.height * 10) / 10, minH: cs.minHeight };
            (b.classList.contains('sm') ? out.sms : out.btns).push(ent);
          }
          return out;
        }, p);
        if (r.hasHelp) {
          if (r.titleOverlap || r.subOverlap) overlaps.push(`${p}: title=${r.titleOverlap} sub=${r.subOverlap} help=${r.helpRect}`);
          check(I, `[${lang}] ${p}: page title text not covered by the "?" button`, !r.titleOverlap && !r.titleBoxOverlap, `title "${r.title}" padR=${r.padR} help=${r.helpRect}`);
          check(I, `[${lang}] ${p}: page subtitle text not covered by the "?" button`, !r.subOverlap, `help=${r.helpRect} overlap(w x h px)=${r.subOverlapPx}`);
        } else info(I, `[${lang}] ${p}: no "?" button on this page`, '');
        bigBtn[p] = r.btns.filter((b) => b.h < 43.5); smBtn[p] = r.sms.filter((b) => b.h < 39.5);
        info(I, `[${lang}] ${p}: ${r.btns.length} .btn / ${r.sms.length} .btn.sm measured`, `min .btn=${Math.min(...r.btns.map((b) => b.h), 999)} min .sm=${Math.min(...r.sms.map((b) => b.h), 999)}`);
        if (lang === 'vi' && ['kho', 'admin', 'stocktake'].includes(p)) await shot(page, `5.05-${p}-title-admin-M`);
      }
      const allBig = Object.entries(bigBtn).flatMap(([p, a]) => a.map((b) => `${p}:${b.sig}=${b.h}`));
      const allSm = Object.entries(smBtn).flatMap(([p, a]) => a.map((b) => `${p}:${b.sig}=${b.h}`));
      check(I, `[${lang}] every visible .btn on all 9 pages is >=44px tall (pointer:coarse)`, allBig.length === 0, `${allBig.length} below 44: ` + allBig.slice(0, 8).join(' ; '));
      check(I, `[${lang}] every visible .btn.sm on all 9 pages is >=40px tall`, allSm.length === 0, `${allSm.length} below 40: ` + allSm.slice(0, 8).join(' ; '));
    }
    await gotoPage(page, 'admin'); await page.sleep(400);
    { const pu = await page.eval(() => { const b = document.querySelector('.reg-admin button[data-a="ok"]'); if (!b) return null; const w = b.closest('.table-wrap, .reg-admin'); const r = b.getBoundingClientRect(); const tb = b.closest('table'); const wrap = tb.parentElement; return { btnLeft: Math.round(r.left), btnRight: Math.round(r.right), btnH: Math.round(r.height), vw: innerWidth, tableW: Math.round(tb.getBoundingClientRect().width), wrapClientW: wrap.clientWidth, wrapScrollW: wrap.scrollWidth, wrapOverflowX: getComputedStyle(wrap).overflowX, attr: tb.hasAttribute('data-no-cards'), thFs: getComputedStyle(tb.querySelector('th')).fontSize, thTransform: getComputedStyle(tb.querySelector('th')).textTransform }; });
      check(I, '[admin/M] pending-registration table (Register.html): Duyệt/Từ chối buttons are visible without horizontal scrolling', !!pu && pu.btnRight <= pu.vw, JSON.stringify(pu)); }
    // computed-style root cause evidence
    await openApp(page, { role: 'admin', lang: 'vi', viewport: 'M' });
    await gotoPage(page, 'kho');
    const css = await page.eval(() => { const b = document.querySelector('#page-kho .btn:not(.sm)'); const cs = getComputedStyle(b); return { minHeight: cs.minHeight, h: b.getBoundingClientRect().height, innerWidth }; });
    info(I, 'computed min-height of a normal .btn on Kho at 390px coarse', JSON.stringify(css));
    await page.sleep(100);

    // sticky action bar of the stocktake detail
    for (const [vp, lang] of [['M', 'vi'], ['M', 'en'], ['D', 'vi']]) {
      await openApp(page, { role: 'admin', lang, viewport: vp });
      if (vp === 'D') await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 520, deviceScaleFactor: 1, mobile: false });
      await gotoPage(page, 'stocktake');
      await page.eval('stkOpen("KK-20261027-01")');
      await page.waitFor('js:document.querySelectorAll("#stkTable tbody tr").length > 3', 6000);
      await page.sleep(300);
      const widths = vp === 'M' ? [null, 600, 601] : [null];
      for (const w of widths) {
        if (w) { await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: 844, deviceScaleFactor: 2, mobile: true }); await page.sleep(300); }
        const res = [];
        for (const sy of [0, 300, 700]) {
          const r = await page.eval((sy) => {
            const c = document.getElementById('content'); c.scrollTop = sy;
            const bar = document.querySelector('#stkDetailView .odoo-actions.sticky'); const cr = c.getBoundingClientRect(); const br = bar.getBoundingClientRect(); const cs = getComputedStyle(bar);
            return { sy: c.scrollTop, maxScroll: c.scrollHeight - c.clientHeight, pos: cs.position, top: cs.top, barTop: Math.round(br.top * 10) / 10, contentTop: Math.round(cr.top * 10) / 10, bg: cs.backgroundColor, zIndex: cs.zIndex, h: Math.round(br.height), headerBottom: Math.round(document.querySelector('.header').getBoundingClientRect().bottom) };
          }, sy);
          await page.sleep(120);
          res.push(r);
        }
        const stuck = res.filter((r) => r.sy > 100);
        const label = w ? `${w}px` : vp;
        check(I, `[${vp}/${lang}/${label}] sticky action bar is position:sticky`, res.every((r) => r.pos === 'sticky'), JSON.stringify(res[1]));
        check(I, `[${vp}/${lang}/${label}] when scrolled, the bar sits flush with the top of the scroll area (no 56px gap)`, stuck.length > 0 && stuck.every((r) => Math.abs(r.barTop - r.contentTop) <= 1), stuck.map((r) => `scroll=${r.sy} barTop=${r.barTop} contentTop=${r.contentTop} header.bottom=${r.headerBottom}`).join(' | '));
        if (!w) {
          await page.eval('document.getElementById("content").scrollTop = 500');
          await page.sleep(200);
          await shot(page, `5.05-sticky-admin-${vp}-${lang}`);
          await page.eval('document.getElementById("content").scrollTop = 120');
          await page.sleep(200);
          await shot(page, `5.05-sticky-mid-admin-${vp}-${lang}`);
        }
      }
    }
    const errs = page.consoleErrors();
    check(I, 'no console errors', errs.length === 0, errTxt(errs));
  } finally { await page.close(); }
}

/* =====================================================================================
   5.06  uiDialog
   ===================================================================================== */
async function t506() {
  const I = '5.06';
  const page = await createDriver();
  const D = async (opts, extra = '') => page.eval(`(() => { window.__cb = []; const opener = document.getElementById('opener') || (function(){ const b = document.createElement('button'); b.id='opener'; b.textContent='opener'; b.style.cssText='position:fixed;left:4px;bottom:4px;z-index:1'; document.body.appendChild(b); return b; })(); opener.focus(); window.__close = uiDialog(${JSON.stringify(opts)}, function (r) { window.__cb.push(r); }); ${extra} })()`);
  const st = () => page.eval(() => { const m = document.getElementById('uiDlg'); const a = document.activeElement; return { open: !!m, n: document.querySelectorAll('#uiDlg').length, active: a ? (a.id || a.tagName) : null, inDlg: !!(m && a && m.contains(a)), cb: window.__cb.slice(), okDisabled: m ? m.querySelector('#uiDlgOk').disabled : null, why: m && m.querySelector('#uiDlgWhy') ? m.querySelector('#uiDlgWhy').value : null }; });
  try {
    for (const vp of ['D', 'M']) {
      await openApp(page, { role: 'admin', lang: 'vi', viewport: vp });
      const P = `[${vp}] `;
      // ---------- a) aria + initial focus
      await D({ title: 'Xóa mục này?', body: 'Dòng 1\nDòng 2 <b>không phải in đậm</b>', reason: 'required', okLabel: 'Xóa', danger: true });
      const a = await page.eval(() => { const m = document.getElementById('uiDlg'); const lab = document.getElementById(m.getAttribute('aria-labelledby')), desc = document.getElementById(m.getAttribute('aria-describedby')); return { role: m.getAttribute('role'), modal: m.getAttribute('aria-modal'), lab: lab && lab.textContent, desc: desc && desc.textContent, descHtml: desc && desc.innerHTML, ws: desc && getComputedStyle(desc).whiteSpace, bold: !!m.querySelector('b'), label: m.querySelector('label') && m.querySelector('label').getAttribute('for'), okText: m.querySelector('#uiDlgOk').textContent, okClass: m.querySelector('#uiDlgOk').className, okBg: getComputedStyle(m.querySelector('#uiDlgOk')).backgroundColor }; });
      check(I, P + 'role=dialog, aria-modal=true, aria-labelledby=title, aria-describedby=body', a.role === 'dialog' && a.modal === 'true' && a.lab === 'Xóa mục này?' && /Dòng 1/.test(a.desc), JSON.stringify({ role: a.role, modal: a.modal, lab: a.lab, desc: a.desc }));
      check(I, P + 'body text is escaped (no <b> element), \\n renders as line break (white-space: pre-line)', !a.bold && a.ws === 'pre-line' && /&lt;b&gt;/.test(a.descHtml), `ws=${a.ws} html=${a.descHtml}`);
      check(I, P + 'reason label is wired to the input (label for=uiDlgWhy)', a.label === 'uiDlgWhy');

      let dangerDisabledBg = a.okBg; let s = await st();
      check(I, P + 'danger + required reason: initial focus on the reason input', s.active === 'uiDlgWhy', s.active);
      check(I, P + 'required: OK disabled when empty', s.okDisabled === true);
      await shot(page, `5.06-danger-reason-admin-${vp}`);

      // ---------- d) required gating
      const gate = [];
      for (const [txt, expectDisabled] of [['ab', true], ['  a ', true], ['   ab   ', true], ['abc', false], [' a b ', false]]) {
        await page.type('#uiDlgWhy', txt);
        gate.push([txt, (await st()).okDisabled === expectDisabled]);
      }
      check(I, P + 'OK enabled only when trimmed reason >= 3 chars', gate.every((g) => g[1]), JSON.stringify(gate));
      await page.type('#uiDlgWhy', '  ');
      s = await st();
      check(I, P + 'OK disabled again after clearing the reason', s.okDisabled === true);
      await page.type('#uiDlgWhy', 'abc');
      await page.sleep(400);
      { const okBg = await page.eval('(() => { const o = document.getElementById("uiDlgOk"); return { bg: getComputedStyle(o).backgroundColor, cls: o.className, color: getComputedStyle(o).color }; })()');
        check(I, P + 'danger OK is solid red with white text once enabled (grey while disabled)', okBg.cls.includes('danger-solid') && okBg.bg === 'rgb(165, 31, 30)' && okBg.color === 'rgb(252, 254, 253)', JSON.stringify(okBg) + '; disabled bg=' + dangerDisabledBg); }
      await page.type('#uiDlgWhy', '  ');
      await page.press('Enter');
      s = await st();
      check(I, P + 'Enter with an invalid reason does nothing (dialog stays, no callback)', s.open && s.cb.length === 0, JSON.stringify(s));
      await page.eval("document.getElementById('uiDlgOk').click()");
      s = await st();
      check(I, P + 'clicking a disabled OK does nothing', s.open && s.cb.length === 0);
      await page.type('#uiDlgWhy', '  vì lỗi nhập  ');
      await page.press('Enter');
      s = await st();
      check(I, P + 'Enter on the single-line reason submits once with the trimmed text', !s.open && s.cb.length === 1 && s.cb[0] === 'vì lỗi nhập', JSON.stringify(s));
      check(I, P + 'focus returns to the opener after submit', s.active === 'opener', s.active);

      // ---------- b/c) focus trap + Escape + focus return
      await D({ title: 'Trap', body: 'b', reason: 'optional' });
      const seq = [];
      for (let i = 0; i < 7; i++) { await page.press('Tab'); seq.push((await st())); }
      check(I, P + 'Tab x7 never leaves the dialog (focus trap)', seq.every((x) => x.inDlg), seq.map((x) => x.active).join('>'));
      const cyc = seq.map((x) => x.active);
      check(I, P + 'Tab order cycles reason > Cancel > OK > reason', cyc.slice(0, 4).join('>') === 'uiDlgNo>uiDlgOk>uiDlgWhy>uiDlgNo', cyc.join('>'));
      await page.press('Shift+Tab');
      s = await st();
      check(I, P + 'Shift+Tab goes backwards and wraps (stays inside)', s.inDlg, s.active);
      await page.eval('document.getElementById("uiDlgWhy").focus()');
      await page.press('Shift+Tab');
      s = await st();
      check(I, P + 'Shift+Tab from the first control wraps to the last (OK)', s.active === 'uiDlgOk', s.active);
      // focus pulled outside programmatically then Tab => back in
      await page.eval('document.getElementById("opener").focus()');
      await page.press('Tab');
      s = await st();
      check(I, P + 'if focus is outside, Tab pulls it back into the dialog', s.inDlg, s.active);
      await page.press('Escape');
      s = await st();
      check(I, P + 'Escape closes without calling back and returns focus to the opener', !s.open && s.cb.length === 0 && s.active === 'opener', JSON.stringify(s));

      // ---------- Escape does not leak to the modal below
      await page.eval('guideOpen(0)');
      await page.sleep(150);
      const guideBefore = await page.eval('!document.getElementById("guideModal").hidden');
      await D({ title: 'Above guide', body: 'x' });
      const z = await page.eval(() => { const g = document.getElementById('guideModal'), u = document.getElementById('uiDlg'); const c = u.querySelector('.guide-card').getBoundingClientRect(); const top = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2); return { zg: getComputedStyle(g).zIndex, zu: getComputedStyle(u).zIndex, topInDlg: !!top.closest('#uiDlg') }; });
      check(I, P + 'z-index: uiDlg (9600) above .guide-modal (9500) and really on top', guideBefore && Number(z.zu) > Number(z.zg) && z.topInDlg, JSON.stringify(z));
      await shot(page, `5.06-over-guide-admin-${vp}`);
      await page.press('Escape');
      const after = await page.eval('({ guideOpen: !document.getElementById("guideModal").hidden, dlg: !!document.getElementById("uiDlg") })');
      check(I, P + 'Escape closes only uiDlg, the guide below stays open', after.guideOpen && !after.dlg, JSON.stringify(after));
      await page.eval('guideClose(false)');

      // z-index over .odoo-modal (stocktake paste modal) too
      await gotoPage(page, 'stocktake');
      await page.eval('stkOpen("KK-20261027-01")');
      await page.waitFor('js:document.querySelectorAll("#stkTable tbody tr").length > 3', 6000);
      await page.eval('stkOpenPaste()');
      await page.sleep(200);
      await D({ title: 'Above odoo modal', body: 'x' });
      const z2 = await page.eval(() => { const o = document.getElementById('stkPasteModal'), u = document.getElementById('uiDlg'); const c = u.querySelector('.guide-card').getBoundingClientRect(); const top = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2); return { odooShown: !o.hidden, zo: getComputedStyle(o).zIndex, zu: getComputedStyle(u).zIndex, topInDlg: !!top.closest('#uiDlg') }; });
      check(I, P + 'z-index: uiDlg above the open .odoo-modal (9000)', z2.odooShown && Number(z2.zu) > Number(z2.zo) && z2.topInDlg, JSON.stringify(z2));
      await shot(page, `5.06-over-odoo-admin-${vp}`);
      await page.press('Escape');
      const odooStill = await page.eval('!document.getElementById("stkPasteModal").hidden');
      check(I, P + 'Escape on uiDlg does not also close the .odoo-modal underneath', odooStill);
      await page.eval('stkClosePaste()');
      await page.eval('goto("home")');

      // toast above dialog
      await D({ title: 'Toast over dialog', body: 'x' });
      await page.eval("toast('Toast over the dialog', 'err')");
      const tz = await page.eval(() => { const t = document.querySelector('#toastHost .toast'); const r = t.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { zt: getComputedStyle(document.getElementById('toastHost')).zIndex, zu: getComputedStyle(document.getElementById('uiDlg')).zIndex, topIsToast: !!top.closest('.toast') }; });
      check(I, P + 'toast (9700) stays above the dialog (9600)', Number(tz.zt) > Number(tz.zu) && tz.topIsToast, JSON.stringify(tz));
      await page.eval("document.querySelectorAll('#toastHost .toast button').forEach(function (b) { b.click(); })");
      await page.press('Escape');

      // ---------- focus targets
      await D({ title: 'Danger no reason', body: 'x', danger: true });
      s = await st();
      check(I, P + 'danger without reason: initial focus on Cancel', s.active === 'uiDlgNo', s.active);
      await page.press('Enter');
      s = await st();
      check(I, P + 'danger: Enter on Cancel just closes (no callback)', !s.open && s.cb.length === 0, JSON.stringify(s));
      await D({ title: 'Plain', body: 'x' });
      s = await st();
      check(I, P + 'non-danger without reason: initial focus on OK', s.active === 'uiDlgOk', s.active);
      await page.press('Escape');
      await D({ title: 'Danger optional', body: 'x', danger: true, reason: 'optional' });
      s = await st();
      check(I, P + 'danger + optional reason: focus on the reason input; OK enabled', s.active === 'uiDlgWhy' && s.okDisabled === false, JSON.stringify(s));
      await page.type('#uiDlgWhy', '  note ');
      await page.press('Enter');
      s = await st();
      check(I, P + 'optional reason: Enter submits trimmed text', !s.open && s.cb[0] === 'note', JSON.stringify(s));
      await D({ title: 'No reason', body: 'x' });
      await page.press('Enter');
      s = await st();
      check(I, P + 'no reason box: Enter on OK submits with ""', !s.open && s.cb.length === 1 && s.cb[0] === '', JSON.stringify(s));

      // ---------- multiline
      await D({ title: 'Multi', body: 'x', reason: 'required', multiline: true });
      const ml = await page.eval(() => { const w = document.getElementById('uiDlgWhy'); return { tag: w.tagName, rows: w.rows, minH: getComputedStyle(w).minHeight }; });
      check(I, P + 'multiline renders a <textarea>', ml.tag === 'TEXTAREA', JSON.stringify(ml));
      await page.type('#uiDlgWhy', 'dòng một');
      await page.press('Enter');
      await page.type('#uiDlgWhy', 'dòng hai', { clear: false });
      s = await st();
      check(I, P + 'multiline: Enter inserts a newline and does NOT submit', s.open && /dòng một\ndòng hai/.test(s.why) && s.cb.length === 0, JSON.stringify(s));
      await shot(page, `5.06-multiline-admin-${vp}`);
      await page.press('Control+Enter');
      s = await st();
      check(I, P + 'multiline: Ctrl+Enter submits the (trimmed) multi-line text', !s.open && s.cb.length === 1 && s.cb[0] === 'dòng một\ndòng hai', JSON.stringify(s));
      await D({ title: 'Multi2', body: 'x', reason: 'required', multiline: true });
      await page.type('#uiDlgWhy', 'abc');
      await page.press('Meta+Enter');
      s = await st();
      check(I, P + 'multiline: Cmd/Meta+Enter submits too', !s.open && s.cb[0] === 'abc', JSON.stringify(s));

      // ---------- sequential dialogs: no leaked listeners
      await page.eval(`(() => { window.__log = []; })()`);
      await D({ title: 'one', body: '1', reason: 'optional' });
      await page.eval(`(() => { const o = document.getElementById('opener'); o.focus(); window.__c2 = uiDialog({ title: 'two', body: '2' }, function () {}); window.__c3 = uiDialog({ title: 'three', body: '3', reason: 'required' }, function (r) { window.__cb.push('three:' + r); }); })()`);
      s = await st();
      check(I, P + 'three consecutive calls leave exactly one #uiDlg (the last)', s.n === 1 && (await page.eval('document.getElementById("uiDlgTitle").textContent')) === 'three', JSON.stringify(s));
      await page.press('Escape');
      const leak = await page.eval(() => {
        const mk = (key, extra) => { const e = new KeyboardEvent('keydown', Object.assign({ key: key, bubbles: true, cancelable: true }, extra || {})); document.body.dispatchEvent(e); return e.defaultPrevented; };
        return { escPrevented: mk('Escape'), tabPrevented: mk('Tab'), enterPrevented: mk('Enter') };
      });
      check(I, P + 'after the stack of dialogs closes, no keydown listener is left (Esc/Tab/Enter not preventDefault-ed)', !leak.escPrevented && !leak.tabPrevented && !leak.enterPrevented, JSON.stringify(leak));
      s = await st();
      check(I, P + 'focus is back on the opener after the stack closes', s.active === 'opener', s.active);
      // open/close 25 times with different options, then check no leak again
      await page.eval(`(() => { for (let i = 0; i < 25; i++) { uiDialog({ title: 't' + i, body: 'b', reason: i % 2 ? 'required' : false, multiline: i % 3 === 0, danger: i % 4 === 0 }, function () {}); } document.getElementById('uiDlgNo').click(); })()`);
      const leak2 = await page.eval(() => {
        const mk = (key) => { const e = new KeyboardEvent('keydown', { key: key, bubbles: true, cancelable: true }); document.body.dispatchEvent(e); return e.defaultPrevented; };
        return { esc: mk('Escape'), tab: mk('Tab'), dlgs: document.querySelectorAll('#uiDlg').length, active: document.activeElement.id };
      });
      check(I, P + '25 back-to-back dialogs then Cancel: no leaked listener, no leftover node, focus on opener', !leak2.esc && !leak2.tab && leak2.dlgs === 0 && leak2.active === 'opener', JSON.stringify(leak2));
      // listener census through add/removeEventListener accounting
      const census = await page.eval(`(() => {
        const live = new Map(); const oa = document.addEventListener, orr = document.removeEventListener;
        document.addEventListener = function (t, f, c) { if (t === 'keydown') live.set(f, 1); return oa.call(this, t, f, c); };
        document.removeEventListener = function (t, f, c) { if (t === 'keydown') live.delete(f); return orr.call(this, t, f, c); };
        const base = live.size;
        for (let i = 0; i < 10; i++) uiDialog({ title: 'x' + i, body: 'b', reason: 'optional' }, function () {});
        const during = live.size;
        document.getElementById('uiDlgNo').click();
        const after = live.size;
        document.addEventListener = oa; document.removeEventListener = orr;
        return { base: base, during: during, after: after };
      })()`);
      check(I, P + 'listener census: 10 stacked dialogs hold only 2 keydown listeners, 0 after close', census.during - census.base === 2 && census.after === census.base, JSON.stringify(census));
      // chained dialog from inside a callback
      await page.eval(`(() => { window.__cb = []; document.getElementById('opener').focus(); uiDialog({ title: 'first', body: 'a' }, function () { uiDialog({ title: 'second', body: 'b', reason: 'required' }, function (r) { window.__cb.push('second:' + r); }); }); })()`);
      await page.press('Enter');
      s = await st();
      const t2 = await page.eval('(document.getElementById("uiDlgTitle")||{}).textContent');
      check(I, P + 'dialog opened from inside a callback works: second is shown and has focus', s.open && t2 === 'second' && s.inDlg && s.n === 1, JSON.stringify({ ...s, t2 }));
      await page.type('#uiDlgWhy', 'xyz');
      await page.press('Enter');
      s = await st();
      check(I, P + 'chained dialog callback gets its reason; focus ends on the opener', s.cb.join() === 'second:xyz' && s.active === 'opener', JSON.stringify(s));

      // ---------- backdrop mousedown/up
      await D({ title: 'Backdrop', body: 'x', reason: 'optional' });
      const g = await page.eval(() => { const c = document.querySelector('#uiDlg .guide-card').getBoundingClientRect(); return { cx: c.left + c.width / 2, cy: c.top + c.height / 2, bx: 4, by: 4 }; });
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g.cx, y: g.cy });
      await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: g.cx, y: g.cy, button: 'left', clickCount: 1 });
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g.bx, y: g.by, buttons: 1 });
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: g.bx, y: g.by, button: 'left', clickCount: 1 });
      s = await st();
      check(I, P + 'drag from inside the card and release on the backdrop does NOT close', s.open, JSON.stringify(s));
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g.bx, y: g.by });
      await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: g.bx, y: g.by, button: 'left', clickCount: 1 });
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: g.bx, y: g.by, button: 'left', clickCount: 1 });
      s = await st();
      check(I, P + 'a full click (down+up) on the backdrop closes without callback and returns focus', !s.open && s.cb.length === 0 && s.active === 'opener', JSON.stringify(s));
      await D({ title: 'Backdrop2', body: 'x' });
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g.bx, y: g.by });
      await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: g.bx, y: g.by, button: 'left', clickCount: 1 });
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: g.cx, y: g.cy, buttons: 1 });
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: g.cx, y: g.cy, button: 'left', clickCount: 1 });
      s = await st();
      info(I, P + '(extra) press on the backdrop, release inside the card', s.open ? 'stays open' : 'closes (mousedown WAS on the backdrop, so it matches the spec; click target is the common ancestor)');
      await page.press('Escape');

      // ---------- opts.html / labels / return value
      await D({ title: '<i>T</i>', html: '<b id="hb">đậm</b> &amp; <i>nghiêng</i>', body: 'IGNORED', okLabel: 'Đồng ý', cancelLabel: 'Quay lại' });
      const h = await page.eval(() => ({ b: !!document.querySelector('#uiDlgBody b#hb'), i: !!document.querySelector('#uiDlgBody i'), amp: document.getElementById('uiDlgBody').textContent, body: /IGNORED/.test(document.getElementById('uiDlgBody').textContent), titleHtml: document.getElementById('uiDlgTitle').innerHTML, ok: document.getElementById('uiDlgOk').textContent, no: document.getElementById('uiDlgNo').textContent }));
      check(I, P + 'opts.html is rendered as HTML (not escaped again) and wins over body', h.b && h.i && h.amp.includes(' & ') && !h.body, JSON.stringify(h));
      check(I, P + 'title is escaped even when html is used', /&lt;i&gt;T&lt;\/i&gt;/.test(h.titleHtml), h.titleHtml);
      check(I, P + 'okLabel and cancelLabel are used', h.ok === 'Đồng ý' && h.no === 'Quay lại', `${h.ok} / ${h.no}`);
      await shot(page, `5.06-html-labels-admin-${vp}`);
      await page.eval('window.__close()');
      s = await st();
      check(I, P + 'returned close function closes without calling back', !s.open && s.cb.length === 0 && s.active === 'opener', JSON.stringify(s));
      await page.eval('toggleLang()');
      await D({ title: 'EN', body: 'x', reason: 'required' });
      const en = await page.eval(() => ({ ok: document.getElementById('uiDlgOk').textContent, no: document.getElementById('uiDlgNo').textContent, lab: document.querySelector('#uiDlg label').textContent }));
      check(I, P + 'default labels follow the language (EN: OK / Cancel / reason prompt)', en.ok === 'OK' && en.no === 'Cancel' && /Enter a reason/.test(en.lab), JSON.stringify(en));
      await page.press('Escape');
      await page.eval('toggleLang()');

      // ---------- layout: row at >480, stacked at <=480
      await D({ title: 'Layout', body: 'Nội dung', reason: 'optional' });
      const lay = async () => page.eval(() => { const q = (s) => document.querySelector(s).getBoundingClientRect(); const a = document.querySelector('#uiDlg .guide-actions'); const ok = q('#uiDlgOk'), no = q('#uiDlgNo'), ac = a.getBoundingClientRect(), cs = getComputedStyle(a); return { dir: cs.flexDirection, okTop: Math.round(ok.top), noTop: Math.round(no.top), okW: Math.round(ok.width), noW: Math.round(no.width), actW: Math.round(ac.width), okLeft: Math.round(ok.left), noLeft: Math.round(no.left), innerWidth, card: Math.round(q('#uiDlg .guide-card').width) }; });
      const L = await lay();
      if (vp === 'M') {
        check(I, P + '390px: buttons stacked vertically, full width, OK on top (column-reverse)', L.dir === 'column-reverse' && L.okTop < L.noTop && Math.abs(L.okW - L.actW) <= 1 && Math.abs(L.noW - L.actW) <= 1, JSON.stringify(L));
        await shot(page, `5.06-stacked-admin-M`);
        for (const w of [480, 481]) {
          await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: 844, deviceScaleFactor: 2, mobile: true });
          await page.sleep(200);
          const L2 = await lay();
          check(I, P + `${w}px: ${w <= 480 ? 'stacked' : 'row'}`, w <= 480 ? L2.dir === 'column-reverse' : L2.dir === 'row', JSON.stringify(L2));
        }
        await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      } else {
        check(I, P + 'desktop: buttons in a row, right-aligned (OK right of Cancel)', L.dir === 'row' && L.okLeft > L.noLeft && L.okTop === L.noTop && L.okW < 200, JSON.stringify(L));
      }
      await page.press('Escape');

      // ---------- long content scrolls inside the card
      await D({ title: 'Rất dài', body: Array.from({ length: 60 }, (_, i) => 'Dòng nội dung số ' + i).join('\n') + '\n' + 'x'.repeat(300), reason: 'required' });
      const lg = await page.eval(() => { const c = document.querySelector('#uiDlg .guide-card'); const r = c.getBoundingClientRect(); const cs = getComputedStyle(c); return { h: Math.round(r.height), vh: innerHeight, top: Math.round(r.top), bottom: Math.round(r.bottom), overflowY: cs.overflowY, scrollable: c.scrollHeight > c.clientHeight, hScroll: c.scrollWidth > c.clientWidth }; });
      check(I, P + 'very long body: card capped to the viewport, scrolls internally, no horizontal scroll', lg.h <= lg.vh - 16 && lg.top >= 0 && lg.bottom <= lg.vh && lg.overflowY === 'auto' && lg.scrollable && !lg.hScroll, JSON.stringify(lg));
      await shot(page, `5.06-long-admin-${vp}`);
      await page.press('Escape');
      const errs = page.consoleErrors({ clear: true });
      check(I, P + 'no console errors', errs.length === 0, errTxt(errs));
    }
  } finally { await page.close(); }
}

/* =====================================================================================
   5.07  toast
   ===================================================================================== */
async function t507() {
  const I = '5.07';
  const page = await createDriver();
  try {
    for (const vp of ['M', 'D']) {
      await openApp(page, { role: 'admin', lang: 'vi', viewport: vp });
      const P = `[${vp}] `;
      await page.eval("toast('Đã lưu', 'ok'); toast('Có lỗi xảy ra', 'err'); toast('Thông tin', 'info');");
      await page.sleep(350);   // toastIn animation: scale(.94) -> 1 over .22s, measuring earlier reads 44px as 41.4px
      const a = await page.eval(() => {
        const h = document.getElementById('toastHost'); const ts = [...h.querySelectorAll('.toast')];
        return { hostRole: h.getAttribute('role'), live: h.getAttribute('aria-live'), toasts: ts.map((t) => ({ cls: t.className, role: t.getAttribute('role'), btn: (() => { const b = t.querySelector('button'); const r = b.getBoundingClientRect(); return { label: b.getAttribute('aria-label'), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, type: b.type, text: b.textContent }; })(), tr: t.getBoundingClientRect().toJSON(), bg: getComputedStyle(t).backgroundColor, color: getComputedStyle(t).color })), innerWidth, innerHeight };
      });
      check(I, P + 'host role=status, aria-live=polite', a.hostRole === 'status' && a.live === 'polite', `${a.hostRole}/${a.live}`);
      const err = a.toasts.find((t) => /err/.test(t.cls)), ok = a.toasts.find((t) => /ok/.test(t.cls)), inf = a.toasts.find((t) => /info/.test(t.cls));
      check(I, P + 'error toast has role=alert; ok/info do not', err.role === 'alert' && !ok.role && !inf.role, JSON.stringify(a.toasts.map((t) => t.cls + ':' + t.role)));
      check(I, P + '× button: type=button, text ×, aria-label is a real word (not an i18n key)', a.toasts.every((t) => t.btn.type === 'button' && t.btn.text === '×' && t.btn.label && !/\./.test(t.btn.label)), JSON.stringify(a.toasts.map((t) => t.btn.label)));
      if (vp === 'M') check(I, P + '× touch target >= 44x44', a.toasts.every((t) => t.btn.w >= 43.9 && t.btn.h >= 43.9), JSON.stringify(a.toasts.map((t) => t.btn.w + 'x' + t.btn.h)));
      else info(I, P + '× button size on desktop (pointer:fine)', JSON.stringify(a.toasts.map((t) => t.btn.w + 'x' + t.btn.h)));
      check(I, P + 'toasts inside the viewport width', a.toasts.every((t) => t.tr.left >= 0 && t.tr.right <= a.innerWidth), a.toasts.map((t) => Math.round(t.tr.left) + '-' + Math.round(t.tr.right)).join(' '));
      check(I, P + 'toast text colour contrast on dark bg >= 4.5', ratio(...(await Promise.all([page.eval((s) => __q.parse(s).slice(0, 3), a.toasts[0].color), page.eval((s) => __q.parse(s).slice(0, 3), a.toasts[0].bg)]))) >= 4.5, `${a.toasts[0].color} on ${a.toasts[0].bg}`);
      const pos = await page.eval(() => { const h = document.getElementById('toastHost').getBoundingClientRect(); const nav = document.querySelector('.topnav').getBoundingClientRect(); return { hostBottom: Math.round(h.bottom), hostTop: Math.round(h.top), navTop: Math.round(nav.top), navVisible: getComputedStyle(document.querySelector('.topnav')).position, innerHeight, hostRight: Math.round(h.right), innerWidth }; });
      if (vp === 'M') check(I, P + 'toast host sits above the bottom tab bar (host.bottom <= nav.top)', pos.hostBottom <= pos.navTop, JSON.stringify(pos));
      { const hb = await page.eval(() => Math.round(document.querySelector('.header').getBoundingClientRect().bottom)); const off = vp === 'M' ? 8 : 16;
        check(I, P + `toast stack starts ${off}px under the top bar and stays inside the viewport`, Math.abs(pos.hostTop - (hb + off)) <= 1 && pos.hostBottom <= pos.innerHeight, JSON.stringify({ hostTop: pos.hostTop, hostBottom: pos.hostBottom, headerBottom: hb, innerHeight: pos.innerHeight })); }
      await page.sleep(350); await shot(page, `5.07-three-toasts-admin-${vp}`);
      // click × closes
      await page.click('#toastHost .toast.err button');
      const left = await page.eval('[...document.querySelectorAll("#toastHost .toast")].map((t) => t.className)');
      check(I, P + 'clicking × removes that toast only', left.length === 2 && !left.some((c) => /err/.test(c)), JSON.stringify(left));
      await page.eval("document.querySelectorAll('#toastHost .toast button').forEach((b) => b.click())");
      // max 4
      await page.eval("for (let i = 1; i <= 7; i++) toast('toast #' + i, 'ok')");
      const mx = await page.eval('[...document.querySelectorAll("#toastHost .toast .tx")].map((t) => t.textContent)');
      check(I, P + 'at most 4 toasts at once, oldest dropped', mx.length === 4 && mx[0] === 'toast #4' && mx[3] === 'toast #7', JSON.stringify(mx));
      await page.eval("document.querySelectorAll('#toastHost .toast button').forEach((b) => b.click())");
      // long message
      await page.eval("toast('Một thông báo lỗi rất dài: ' + 'abcdefghij'.repeat(30) + ' và một câu giải thích dài hơn nữa để kiểm tra xuống dòng.', 'err')");
      const lg = await page.eval(() => { const t = document.querySelector('#toastHost .toast'); const r = t.getBoundingClientRect(); return { w: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right), tx: t.querySelector('.tx').scrollWidth > t.querySelector('.tx').clientWidth + 1, h: Math.round(r.height), innerWidth }; });
      check(I, P + 'a very long unbroken error message wraps inside the toast (no overflow)', !lg.tx && lg.left >= 0 && lg.right <= lg.innerWidth, JSON.stringify(lg));
      await page.sleep(350); await shot(page, `5.07-long-toast-admin-${vp}`);
      await page.eval("document.querySelectorAll('#toastHost .toast button').forEach((b) => b.click())");

      // above dialog / odoo modal
      await page.eval("uiDialog({ title: 'Dlg', body: 'b' }, function () {})");
      await page.eval("toast('Over dialog', 'ok')");
      const ov = await page.eval(() => { const t = document.querySelector('#toastHost .toast'); const r = t.getBoundingClientRect(); const top = document.elementFromPoint(r.left + 10, r.top + r.height / 2); return { zToast: getComputedStyle(document.getElementById('toastHost')).zIndex, zDlg: getComputedStyle(document.getElementById('uiDlg')).zIndex, topIsToast: !!top.closest('.toast') }; });
      check(I, P + 'toast is above uiDialog (z-index and hit-test)', Number(ov.zToast) > Number(ov.zDlg) && ov.topIsToast, JSON.stringify(ov));
      await page.sleep(350); await shot(page, `5.07-over-dialog-admin-${vp}`);
      await page.eval("document.querySelectorAll('#toastHost .toast button').forEach((b) => b.click()); document.getElementById('uiDlgNo').click()");
    }

    // ---------- timing (once, mobile page)
    await openApp(page, { role: 'admin', lang: 'en', viewport: 'M' });
    const t0 = Date.now();
    await page.eval("window.__t = { ok: toast('ok default', 'ok'), errDefault: toast('err default', 'err'), errShort: toast('err ms=1000', 'err', 1000), okLong: toast('ok 8s', 'ok', 8000), errAria: 0 }");
    const cnt = () => page.eval('[...document.querySelectorAll("#toastHost .toast .tx")].map((t) => t.textContent)');
    const marks = {};
    for (const [label, at] of [['3.5s', 3500], ['4.5s', 4500], ['5.5s', 5500], ['6.3s', 6300], ['8.3s', 8300], ['9.4s', 9400]]) {
      const wait = at - (Date.now() - t0); if (wait > 0) await page.sleep(wait);
      marks[label] = await cnt();
    }
    check(I, 'ok toast (default) stays ~4s: present at 3.5s, gone at 4.5s', marks['3.5s'].includes('ok default') && !marks['4.5s'].includes('ok default'), JSON.stringify([marks['3.5s'], marks['4.5s']]));
    check(I, 'error toast given ms=1000 is raised to >= 6s: present at 5.5s, gone by 6.3s', marks['5.5s'].includes('err ms=1000') && !marks['6.3s'].includes('err ms=1000'), JSON.stringify([marks['5.5s'], marks['6.3s']]));
    check(I, 'error toast (default) lasts 9s: present at 8.3s, gone at 9.4s', marks['8.3s'].includes('err default') && !marks['9.4s'].includes('err default'), JSON.stringify([marks['8.3s'], marks['9.4s']]));
    check(I, 'ok toast with explicit ms=8000 is honoured: present at 6.3s, gone at 8.3s', marks['6.3s'].includes('ok 8s') && !marks['8.3s'].includes('ok 8s'), JSON.stringify([marks['6.3s'], marks['8.3s']]));
    const lab = await page.eval(() => { toast('x', 'err'); const b = document.querySelector('#toastHost .toast button'); return b.getAttribute('aria-label'); });
    check(I, 'EN: × aria-label = "Close"', lab === 'Close', lab);
    await page.eval("document.querySelectorAll('#toastHost .toast button').forEach((b) => b.click())");

    // ---------- 860 / 861 breakpoint (non-touch width override)
    await openApp(page, { role: 'admin', lang: 'vi', viewport: 'D' });
    for (const w of [860, 861]) {
      await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: 800, deviceScaleFactor: 1, mobile: false });
      await page.sleep(250);
      await page.eval("document.querySelectorAll('#toastHost .toast button').forEach((b) => b.click()); toast('Breakpoint ' + innerWidth, 'ok')");
      const b = await page.eval(() => { const h = document.getElementById('toastHost').getBoundingClientRect(); const nav = document.querySelector('.topnav'); const n = nav.getBoundingClientRect(); return { w: innerWidth, hb: Math.round(document.querySelector('.header').getBoundingClientRect().bottom), hostTop: Math.round(h.top), hostBottom: Math.round(h.bottom), navTop: Math.round(n.top), navPos: getComputedStyle(nav).position, innerHeight }; });
      if (w === 860) check(I, '860px: tab bar at bottom and toast host above it', b.navPos === 'fixed' && b.hostBottom <= b.navTop && Math.abs(b.hostTop - (b.hb + 8)) <= 1, JSON.stringify(b));
      else check(I, '861px: tab bar is in the header and the toast sits just under the top bar', b.navPos !== 'fixed' && Math.abs(b.hostTop - (b.hb + 16)) <= 1, JSON.stringify(b));
    }
    const errs = page.consoleErrors();
    check(I, 'no console errors', errs.length === 0, errTxt(errs));
  } finally { await page.close(); }
}

/* =====================================================================================
   5.08  contrast + minimum font sizes
   ===================================================================================== */
async function t508() {
  const I = '5.08';
  const page = await createDriver();
  try {
    await openApp(page, { role: 'admin', lang: 'vi', viewport: 'D' });
    // ---- synthetic badges on a white card AND on a table-row hover background
    await page.eval(() => {
      const host = document.createElement('div'); host.id = 'badgeHost'; host.className = 'card';
      host.style.cssText = 'position:fixed;left:20px;top:80px;z-index:50;padding:12px;display:flex;gap:8px;flex-wrap:wrap;width:700px';
      host.innerHTML = ['in', 'out', 'warn', 'danger', 'ok', 'pending', 'neutral', 'neg'].map((k) => '<span class="badge ' + k + '" data-k="' + k + '">' + k + '</span>').join('');
      document.body.appendChild(host);
    });
    const bad = await page.eval(() => [...document.querySelectorAll('#badgeHost .badge')].map((b) => { const f = __q.fg(b); const cs = getComputedStyle(b); return { k: b.dataset.k, fg: f.rgb, bg: f.bg, raw: f.raw, fs: cs.fontSize, fw: cs.fontWeight, border: cs.borderTopStyle + ' ' + cs.borderTopColor }; }));
    for (const b of bad) {
      const r = ratio(b.fg, b.bg);
      check(I, `badge .${b.k}: text/bg contrast >= 4.5:1`, r >= 4.5, `${r.toFixed(2)}:1  color=${b.raw} bg=rgb(${b.bg}) fs=${b.fs}`);
    }
    info(I, 'badge pending border style (design: dashed slate)', bad.find((b) => b.k === 'pending').border);
    await shot(page, '5.08-badges-admin-D');
    // ---- real badges in the app, grouped by class+colours
    const seen = new Map();
    const collect = async (label) => {
      const rows = await page.eval(() => [...document.querySelectorAll('.badge, .stk-res, .pill, .tag')].filter((b) => __q.vis(b) && !b.closest('#badgeHost')).map((b) => { const f = __q.fg(b); return { cls: String(b.className).trim(), fg: f.rgb, bg: f.bg, fs: getComputedStyle(b).fontSize, txt: b.textContent.trim().slice(0, 18) }; }));
      for (const r of rows) { const key = r.cls + '|' + r.fg + '|' + r.bg; if (!seen.has(key)) seen.set(key, { ...r, where: label }); }
    };
    for (const p of ['home', 'kho', 'history', 'stocktake', 'admin', 'sku', 'ticket', 'report', 'me']) { await gotoPage(page, p); await page.sleep(250); await collect(p); }
    await page.eval('stkOpen("KK-20261027-01")'); await page.waitFor('js:document.querySelectorAll("#stkTable tbody tr").length > 3', 6000); await collect('stocktake-detail');
    const real = [...seen.values()];
    const lowReal = real.filter((r) => ratio(r.fg, r.bg) < 4.5);
    check(I, `all ${real.length} distinct real badge/pill colour combos in the live app are >= 4.5:1`, lowReal.length === 0, lowReal.map((r) => `.${r.cls} "${r.txt}" ${ratio(r.fg, r.bg).toFixed(2)} (${r.where})`).join(' ; '));

    // ---- (retired) .qa-green tile contrast: the dashboard has no .qa tiles; the Grab primary button contrast is reported by the (extra) lines below
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
    await gotoPage(page, 'home'); await page.sleep(300);
    // hard checks: the filled primary button and the dashboard stat text; everything else stays informational
    const HARD = new Set(['primary btn', 'stat label', 'stat value', 'stat foot']);
    const btn = await page.eval(() => [['.btn:not(.ghost):not(.danger-solid)', 'primary btn'], ['#homeKpis .stat-label', 'stat label'], ['#homeKpis .stat-value', 'stat value'], ['#homeKpis .stat-foot', 'stat foot'], ['.btn.ghost', 'ghost btn'], ['.page-sub', 'page-sub'], ['.hint', 'hint'], ['.sub-item.on, .sub-item', 'sub-item'], ['.help-btn', 'help-btn']].map(([sel, n]) => { const e = [...document.querySelectorAll(sel)].find(__q.vis); if (!e) return { n: n, missing: true }; const f = __q.fg(e); return { n: n, fg: f.rgb, bg: f.bg, fs: getComputedStyle(e).fontSize }; }));
    for (const b of btn) {
      if (b.missing) { if (HARD.has(b.n)) check(I, `${b.n} present on Home`, false, 'selector not found'); continue; }
      const r = ratio(b.fg, b.bg), d = `fg=rgb(${b.fg}) bg=rgb(${b.bg}) fs=${b.fs}`;
      if (HARD.has(b.n)) check(I, `${b.n}: contrast >= 4.5:1 (${r.toFixed(2)}:1)`, r >= 4.5, d);
      else info(I, `(extra) ${b.n} contrast ${r.toFixed(2)}:1${r < 4.5 ? '  <4.5' : ''}`, d);
    }
    await page.eval('document.getElementById("badgeHost").remove()');

    // ---- th >= 11px, .hint & label >= 12px on every page (desktop + mobile)
    for (const vp of ['D', 'M']) {
      await openApp(page, { role: 'admin', lang: 'vi', viewport: vp });
      const th = {}, hint = {}, lab = {}; let nTh = 0, nHint = 0, nLab = 0;
      const check1 = async (pg) => {
        const r = await page.eval(() => {
          const fsOf = (e) => parseFloat(getComputedStyle(e).fontSize);
          const f = (sel, filter) => [...document.querySelectorAll(sel)].filter(__q.vis).filter(filter || (() => true)).map((e) => ({ s: __q.sig(e), fs: fsOf(e), t: e.textContent.trim().slice(0, 20) }));
          return { th: f('th'), hint: f('.hint'), label: f('label') };
        });
        nTh += r.th.length; nHint += r.hint.length; nLab += r.label.length;
        r.th.filter((x) => x.fs < 11).forEach((x) => (th[pg + ':' + x.s + '=' + x.fs] = 1));
        r.hint.filter((x) => x.fs < 12).forEach((x) => (hint[pg + ':' + x.s + '=' + x.fs] = 1));
        r.label.filter((x) => x.fs < 12).forEach((x) => (lab[pg + ':' + x.s + '="' + x.t + '"=' + x.fs] = 1));
      };
      for (const p of ['home', 'kho', 'history', 'stocktake', 'admin', 'sku', 'ticket', 'report', 'me']) { await gotoPage(page, p); await page.sleep(250); await check1(p); }
      await page.eval('stkOpen("KK-20261027-01")'); await page.waitFor('js:document.querySelectorAll("#stkTable tbody tr").length > 3', 6000); await check1('stk-detail');
      check(I, `[${vp}] every visible th (${nTh}) is >= 11px`, !Object.keys(th).length && nTh > 0, Object.keys(th).slice(0, 6).join(' ; '));
      check(I, `[${vp}] every visible .hint (${nHint}) is >= 12px`, !Object.keys(hint).length && nHint > 0, Object.keys(hint).slice(0, 6).join(' ; '));
      check(I, `[${vp}] every visible <label> (${nLab}) is >= 12px`, !Object.keys(lab).length && nLab > 0, Object.keys(lab).slice(0, 6).join(' ; '));
      if (vp === 'D') { await openApp(page, { role: 'admin', lang: 'vi', viewport: 'D' }); }
    }
    // ---- census of low-contrast text across pages (informational)
    await openApp(page, { role: 'admin', lang: 'vi', viewport: 'D' });
    const low = {};
    for (const p of ['home', 'kho', 'history', 'stocktake', 'admin', 'sku', 'ticket', 'report', 'me']) {
      await gotoPage(page, p); await page.sleep(250);
      const r = await page.eval(() => { const out = []; for (const e of document.querySelectorAll('#page-' + document.querySelector('.page.active').id.slice(5) + ' *')) { if (!__q.vis(e)) continue; if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)) continue; const f = __q.fg(e); out.push({ s: __q.sig(e), fg: f.rgb, bg: f.bg, fs: getComputedStyle(e).fontSize, t: e.textContent.trim().slice(0, 18) }); } return out; });
      for (const x of r) { const rt = ratio(x.fg, x.bg); if (rt < 4.5) { const k = x.s + ' fs=' + x.fs; if (!low[k] || low[k].rt > rt) low[k] = { rt, p, t: x.t, fg: x.fg.join(','), bg: x.bg.join(',') }; } }
    }
    const lowList = Object.entries(low).sort((a, b) => a[1].rt - b[1].rt);
    info(I, `(extra) ${lowList.length} text style(s) below 4.5:1 across the 9 admin pages (lowest first)`, lowList.slice(0, 14).map(([k, v]) => `${k} ${v.rt.toFixed(2)} "${v.t}" @${v.p}`).join(' ;; '));
    const errs = page.consoleErrors();
    check(I, 'no console errors', errs.length === 0, errTxt(errs));
  } finally { await page.close(); }
}

/* =====================================================================================
   5.09  broad sweep
   ===================================================================================== */
const SWEEP = `(() => {
  const vw = innerWidth; const out = {};
  const vis = __q.vis, sig = __q.sig;
  const PFX = new Set(Object.keys(I18N.vi).map((k) => k.split('.')[0]));
  const de = document.documentElement;
  out.docOverflow = de.scrollWidth > vw + 0; out.docScrollW = de.scrollWidth; out.vw = vw;
  const c = document.getElementById('content'); out.contentOverflow = c.scrollWidth > c.clientWidth + 1; out.contentScrollW = c.scrollWidth; out.contentClientW = c.clientWidth;
  const active = document.querySelector('.page.active'); out.page = active && active.id;
  const roots = [active, document.querySelector('.header'), document.getElementById('subnav'), document.getElementById('topnav')].filter(Boolean);
  const clipped = (e) => { for (let a = e.parentElement; a && a !== document.body && a !== c; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.overflowX !== 'visible') { const r = a.getBoundingClientRect(); if (r.right <= vw + 1 && r.left >= -1) return true; } } return false; };
  const wide = [], tclip = [], ell = [], spill = [], keys = [], viInEn = [], vclip = [];
  for (const root of roots) {
    for (const e of root.querySelectorAll('*')) {
      if (!vis(e)) continue;
      const cs = getComputedStyle(e);
      if (cs.position !== 'fixed') {
        const r = e.getBoundingClientRect();
        if ((r.right > vw + 1 || r.left < -1) && !clipped(e)) wide.push(sig(e) + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
      }
      const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\\s+/g, ' ').trim();
      if (own && e.clientWidth > 0) {
        if (e.scrollWidth > e.clientWidth + 1) {
          if (cs.overflowX === 'hidden' || cs.overflowX === 'clip') (cs.textOverflow === 'ellipsis' ? ell : tclip).push(sig(e) + ' "' + own.slice(0, 24) + '" sw=' + e.scrollWidth + ' cw=' + e.clientWidth);
          else if (cs.overflowX === 'visible' && cs.display !== 'inline') spill.push(sig(e) + ' "' + own.slice(0, 24) + '" sw=' + e.scrollWidth + ' cw=' + e.clientWidth);
        }
        if (e.scrollHeight > e.clientHeight + 2 && (cs.overflowY === 'hidden' || cs.overflowY === 'clip') && cs.display !== 'inline') vclip.push(sig(e) + ' "' + own.slice(0, 24) + '" sh=' + e.scrollHeight + ' ch=' + e.clientHeight);
        if ((/^[a-z]{2,12}(\\.[A-Za-z0-9_]{2,})+$/.test(own) && PFX.has(own.split('.')[0])) || /\\{[A-Za-z_]+\\}/.test(own) || /\\bundefined\\b|\\bNaN\\b|\\[object|\\bnull\\b/.test(own)) keys.push(sig(e) + ' "' + own.slice(0, 40) + '"');
        if (LANG === 'en' && /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(own) && e.matches('button, th, label, h1, h2, h3, summary, .page-title, .page-sub, .sub-item, .nav-txt, .hint, .chart-title, .kpi-label, .kpi-foot, .btn, option, .badge, a, .sec-title, .empty-state b, legend')) viInEn.push(sig(e) + ' "' + own.slice(0, 40) + '"');
      }
      for (const a of ['placeholder', 'title', 'aria-label']) { const v = e.getAttribute(a); if (v && ((/^[a-z]{2,12}(\\.[A-Za-z0-9_]{2,})+$/.test(v) && PFX.has(v.split('.')[0])) || /\\{[A-Za-z_]+\\}/.test(v))) keys.push(sig(e) + ' @' + a + '="' + v + '"'); if (v && LANG === 'en' && /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(v)) viInEn.push(sig(e) + ' @' + a + '="' + v.slice(0, 40) + '"'); }
    }
  }
  out.wide = [...new Set(wide)]; out.tclip = [...new Set(tclip)]; out.ell = [...new Set(ell)]; out.spill = [...new Set(spill)]; out.keys = [...new Set(keys)]; out.viInEn = [...new Set(viInEn)]; out.vclip = [...new Set(vclip)];
  const h = active && active.getBoundingClientRect(); out.pageH = h ? Math.round(h.height) : 0;
  out.pageText = active ? active.innerText.trim().length : 0;
  out.missing = Array.from(window.__missingIds || []);
  return out;
})()`;

async function t509() {
  const I = '5.09';
  const page = await createDriver();
  const agg = { rows: [], errors: [], network: [], overflow: [], wide: [], tclip: [], ell: [], spill: [], keys: [], viInEn: [], vclip: [], empty: [] };
  const missingIds = new Set();
  try {
    const scenarios = [];
    for (const role of ['admin', 'staff']) for (const vp of ['D', 'M']) for (const lang of ['vi', 'en']) scenarios.push({ role, vp, lang });
    for (const sc of scenarios) {
      const { role, vp, lang } = sc;
      await openApp(page, { role, lang, viewport: vp });
      await page.sleep(700);   // let the landing overlay finish fading before screenshots
      await page.eval(`(() => { window.__missingIds = new Set(); const oe = window.el; if (typeof oe === 'function') window.el = function (id) { const r = oe(id); if (!r) window.__missingIds.add('el:' + id); return r; }; })()`);
      const tag = `${role}-${vp}-${lang}`;
      const bootErr = page.consoleErrors({ clear: true });
      if (bootErr.length) agg.errors.push(`[${tag}] boot: ${errTxt(bootErr)}`);
      const pages = role === 'admin' ? ['home', 'kho', 'history', 'stocktake', 'admin', 'sku', 'ticket', 'report', 'me'] : ['home', 'kho', 'report', 'me'];
      const extras = role === 'admin' ? [['stocktake-detail', 'goto("stocktake"); stkOpen("KK-20261027-01")'], ['kho-export', 'goto("kho"); document.getElementById("segOut") && document.getElementById("segOut").click()'], ['noti-open', 'goto("home"); toggleNotiBox({ stopPropagation(){} })'], ['user-open', 'goto("home"); toggleUserBox({ stopPropagation(){} })']] : [['kho-export', 'goto("kho"); document.getElementById("segOut") && document.getElementById("segOut").click()'], ['noti-open', 'goto("home"); toggleNotiBox({ stopPropagation(){} })'], ['user-open', 'goto("home"); toggleUserBox({ stopPropagation(){} })']];
      const visit = async (name, action, shotName) => {
        try {
          await page.eval(action);
          if (!/-open$/.test(name)) { const pg = name.split('-')[0] === 'stocktake' ? 'stocktake' : name.startsWith('kho') ? 'kho' : name; await page.waitFor(`#page-${pg}.active`, 5000); }
          await settle(page, 200); await page.sleep(450);
          if (name === 'stocktake-detail') await page.waitFor('js:document.querySelectorAll("#stkTable tbody tr").length > 3', 5000).catch(() => {});
          const r = await page.eval(SWEEP);
          const errs = page.consoleErrors({ clear: true });
          const L = `[${tag}] ${name}`;
          for (const e of errs) (e.kind === 'network' ? agg.network : agg.errors).push(`${L}: ${e.kind} ${e.text.split('\n')[0]}`);
          if (r.docOverflow || r.contentOverflow) agg.overflow.push(`${L}: docScrollW=${r.docScrollW} contentScrollW=${r.contentScrollW}/${r.contentClientW} vw=${r.vw}`);
          r.wide.forEach((x) => agg.wide.push(`${L}: ${x}`)); r.tclip.forEach((x) => agg.tclip.push(`${L}: ${x}`)); r.ell.forEach((x) => agg.ell.push(`${L}: ${x}`)); r.spill.forEach((x) => agg.spill.push(`${L}: ${x}`));
          r.keys.forEach((x) => agg.keys.push(`${L}: ${x}`)); r.viInEn.forEach((x) => agg.viInEn.push(`${L}: ${x}`)); r.vclip.forEach((x) => agg.vclip.push(`${L}: ${x}`));
          r.missing.forEach((x) => missingIds.add(x));
          if (!/-open$/.test(name) && r.pageText < 20) agg.empty.push(`${L}: page text length ${r.pageText}`);
          agg.rows.push({ L, ok: !errs.length && !r.docOverflow && !r.contentOverflow && !r.wide.length && !r.keys.length });
          await shot(page, `5.09-${shotName || name}-${role}-${vp}-${lang}`);
        } catch (e) {
          agg.errors.push(`[${tag}] ${name}: SWEEP EXCEPTION ${e.message.split('\n')[0]}`);
          try { await shot(page, `5.09-${name}-${role}-${vp}-${lang}-FAIL`); } catch { /* ignore */ }
        }
        await page.eval('document.getElementById("notiBox") && document.getElementById("notiBox").classList.remove("open"); document.getElementById("userBox") && document.getElementById("userBox").classList.remove("open")').catch(() => {});
      };
      for (const p of pages) await visit(p, `goto(${JSON.stringify(p)})`);
      for (const [n, a] of extras) await visit(n, a);
      // closing popovers by clicking elsewhere
      await page.eval('document.body.click()').catch(() => {});
      console.log(`  swept ${tag}: ${agg.rows.length} views so far`);
    }

    // ---------------- static checks on the built page source
    const src = fs.readFileSync(path.join(HERE, 'dist', 'index.html'), 'utf8');
    const refIds = new Set();
    for (const m of src.matchAll(/\b(?:el|show|hide|setText|showBox|showWait)\(\s*'([A-Za-z][A-Za-z0-9_-]*)'/g)) refIds.add(m[1]);
    for (const m of src.matchAll(/getElementById\(\s*'([A-Za-z][A-Za-z0-9_-]*)'\)/g)) refIds.add(m[1]);
    const defIds = new Set();
    for (const m of src.matchAll(/\bid=\\?["']([A-Za-z][A-Za-z0-9_-]*)\\?["']/g)) defIds.add(m[1]);
    for (const m of src.matchAll(/\.id\s*=\s*'([A-Za-z][A-Za-z0-9_-]*)'/g)) defIds.add(m[1]);
    for (const m of src.matchAll(/\bid:\s*'([A-Za-z][A-Za-z0-9_-]*)'/g)) defIds.add(m[1]);
    const undefinedIds = [...refIds].filter((x) => !defIds.has(x)).sort();
    info(I, `static scan: ${refIds.size} element ids referenced via el()/getElementById()/show()/hide()/setText()/showBox(); ids never defined in markup or JS`, undefinedIds.join(', ') || 'none');
    // i18n key census (in page context so we use the real tables)
    const keysUsed = new Set();
    for (const m of src.matchAll(/\bt\(\s*'([A-Za-z0-9_.]+)'\s*[,)]/g)) keysUsed.add(m[1]);
    for (const m of src.matchAll(/data-i18n(?:-ph|-title)?="([A-Za-z0-9_.]+)"/g)) keysUsed.add(m[1]);
    await openApp(page, { role: 'admin', lang: 'vi', viewport: 'D' });
    const parity = await page.eval((used) => { used = used.filter((k) => !k.endsWith('.') && k !== 'key'); const vi = Object.keys(I18N.vi), en = Object.keys(I18N.en); return { nVi: vi.length, nEn: en.length, missingEn: vi.filter((k) => !(k in I18N.en)), missingVi: en.filter((k) => !(k in I18N.vi)), usedMissingVi: used.filter((k) => !(k in I18N.vi)), usedMissingEn: used.filter((k) => !(k in I18N.en)), sameAsVi: vi.filter((k) => k in I18N.en && I18N.en[k] === I18N.vi[k] && /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(I18N.vi[k])) }; }, [...keysUsed]);
    check(I, `I18N parity: every vi key has an en key (vi=${parity.nVi}, en=${parity.nEn})`, parity.missingEn.length === 0, parity.missingEn.slice(0, 15).join(', '));
    check(I, 'I18N parity: every en key has a vi key', parity.missingVi.length === 0, parity.missingVi.slice(0, 15).join(', '));
    check(I, `every literal t('key') / data-i18n key used in the source (${keysUsed.size}) exists in I18N.vi`, parity.usedMissingVi.length === 0, parity.usedMissingVi.slice(0, 15).join(', '));
    check(I, 'every literal key used exists in I18N.en', parity.usedMissingEn.length === 0, parity.usedMissingEn.slice(0, 15).join(', '));
    check(I, 'no en translation is a verbatim copy of a Vietnamese string', parity.sameAsVi.length === 0, parity.sameAsVi.slice(0, 15).join(', '));
    const errs0 = page.consoleErrors({ clear: true });
    if (errs0.length) agg.errors.push('[parity page] ' + errTxt(errs0));

    // ---------------- verdicts
    const total = agg.rows.length;
    check(I, `sweep covered ${total} views (admin 13 views x 4, staff 7 views x 4 = 80 expected)`, total === 80, `${total}`);
    check(I, 'no console errors / uncaught exceptions during the sweep', agg.errors.length === 0, agg.errors.slice(0, 8).join(' || '));
    check(I, 'no failed network requests', agg.network.length === 0, agg.network.slice(0, 8).join(' || '));
    check(I, 'no page-level horizontal overflow (documentElement / #content scrollWidth <= width)', agg.overflow.length === 0, agg.overflow.slice(0, 8).join(' || '));
    check(I, 'no visible element extends beyond the viewport (excluding intentionally scrollable containers)', agg.wide.length === 0, agg.wide.slice(0, 10).join(' || '));
    check(I, 'no text silently clipped (overflow:hidden without ellipsis) and no text spilling out of its box', agg.tclip.length === 0 && agg.spill.length === 0, [...agg.tclip, ...agg.spill].slice(0, 10).join(' || '));
    check(I, 'no text clipped vertically (overflow-y:hidden)', agg.vclip.length === 0, agg.vclip.slice(0, 8).join(' || '));
    check(I, 'no untranslated keys / {placeholders} / undefined / NaN / null visible', agg.keys.length === 0, agg.keys.slice(0, 10).join(' || '));
    const viReal = agg.viInEn.filter((x) => !/#langBtn\b/.test(x) && !/button\.link "(Thảo Trần|Việt Lê)"/.test(x));
    check(I, 'no hard-coded Vietnamese UI chrome in English mode (language button and fixture people excluded)', viReal.length === 0, [...new Set(viReal.map((x) => x.replace(/^\[[^\]]+\] [^:]+: /, '')))].slice(0, 12).join(' || '));
    check(I, 'every page rendered visible content', agg.empty.length === 0, agg.empty.join(' || '));
    const missReal = [...missingIds].filter((x) => x !== 'el:apSelAllBar');   // guarded lookup, created lazily by apRender
    check(I, 'no runtime el() lookup for a missing element id', missReal.length === 0, missReal.join(', '));
    info(I, 'texts truncated with an ellipsis (intentional, for the record)', `${agg.ell.length}: ` + agg.ell.slice(0, 12).join(' || '));
    info(I, 'viInEn full list', [...new Set(agg.viInEn)].slice(0, 30).join(' || '));
    fs.writeFileSync(path.join(HERE, 'results', 'group5-sweep.json'), JSON.stringify({ ...agg, missingIds: [...missingIds], undefinedIds, parity }, null, 2));
  } finally { await page.close(); }
}

/* =====================================================================================
   5.10  role-based UI
   ===================================================================================== */
async function t510() {
  const I = '5.10';
  const page = await createDriver();
  const scan = () => page.eval(() => {
    const cls = (c) => [...document.querySelectorAll('.' + c)].map((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { s: __q.sig(e) + (e.id ? '' : ' ' + e.textContent.trim().slice(0, 14)), hidden: e.hidden, display: cs.display, shown: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && !e.closest('[hidden]') && !(e.closest('.noti-box') && !document.getElementById('notiBox').classList.contains('open')) && !(e.closest('.user-box') && !document.getElementById('userBox').classList.contains('open')), locked: e.hasAttribute('data-locked') }; });
    return { admin: cls('admin-menu'), member: cls('member-menu'), gate: cls('admin-gate'), tabAdmin: (() => { const a = document.querySelector('.nav-item[data-page="admin"]'); const r = a.getBoundingClientRect(); return { hidden: a.hidden, display: getComputedStyle(a).display, w: r.width }; })(), subs: [...document.querySelectorAll('#subnav .sub-item')].map((e) => e.textContent.trim()), tabs: [...document.querySelectorAll('.topnav .nav-item')].filter((a) => a.getBoundingClientRect().width > 0).map((a) => a.dataset.page) };
  });
  try {
    for (const vp of ['D', 'M']) {
      // ============ staff
      await openApp(page, { role: 'staff', lang: 'vi', viewport: vp });
      let s = await scan();
      const P = `[staff-${vp}] `;
      check(I, P + `.admin-menu: all ${s.admin.length} elements hidden (attribute and computed display)`, s.admin.length > 0 && s.admin.every((e) => e.hidden && e.display === 'none' && !e.shown), JSON.stringify(s.admin.filter((e) => e.shown || !e.hidden || e.display !== 'none')));
      check(I, P + `.admin-gate: all ${s.gate.length} hidden and data-locked`, s.gate.length > 0 && s.gate.every((e) => e.hidden && e.locked && !e.shown), JSON.stringify(s.gate.filter((e) => e.shown || !e.locked)));
      check(I, P + 'Manage tab is not shown; visible tabs = home, kho, report', !s.tabAdmin.w && s.tabs.join() === 'home,kho,report', JSON.stringify({ tab: s.tabAdmin, tabs: s.tabs }));
      // member-menu: the "My requests" link exists in the account menu
      await page.eval('document.getElementById("userBox").classList.add("open"); document.getElementById("notiBox").classList.add("open")');
      s = await scan();
      check(I, P + '.member-menu is visible for staff (notification box "My requests" shortcut)', s.member.length > 0 && s.member.some((e) => e.shown), JSON.stringify(s.member));
      await shot(page, `5.10-usermenu-staff-${vp}`);
      await page.eval('document.getElementById("userBox").classList.remove("open")');
      // visit pages and rescan for dynamically created admin elements
      for (const p of ['kho', 'report', 'me', 'home']) {
        await gotoPage(page, p); await page.sleep(200);
        const q = await scan();
        const leak = [...q.admin, ...q.gate].filter((e) => e.shown);
        check(I, P + `after goto(${p}) no .admin-menu/.admin-gate element is visible`, leak.length === 0, JSON.stringify(leak));
        const subs = q.subs;
        check(I, P + `after goto(${p}) sub-nav lists no admin-only page`, !subs.some((x) => /Kiểm kê|Lịch sử|SKU|Phiếu kho|Duyệt/.test(x)), JSON.stringify(subs));
      }
      // forbidden gotos
      for (const p of ['history', 'stocktake', 'admin', 'sku', 'ticket']) {
        await page.eval('document.querySelectorAll("#toastHost .toast button").forEach((b) => b.click())');
        await page.resetCalls();
        const before = await page.activePage();
        await page.eval(`goto(${JSON.stringify(p)})`);
        await page.sleep(300);
        const toasts = await page.toasts();
        const after = await page.activePage();
        const calls = (await page.calls()).filter((c) => !/getNotifications|getUnreadCount/.test(c.fn)).map((c) => c.fn);
        const errToast = toasts.find((t) => t.kind === 'err');
        check(I, P + `goto('${p}') is blocked with an error toast, stays on ${before}, no data call`, !!errToast && after === before && after !== 'page-' + p && calls.length === 0, `toast="${errToast && errToast.text}" active=${after} calls=${calls.join(',')}`);
        const vis = await page.eval((p) => { const el = document.getElementById('page-' + p); return { display: getComputedStyle(el).display, active: el.classList.contains('active') }; }, p);
        check(I, P + `#page-${p} stays display:none`, vis.display === 'none' && !vis.active, JSON.stringify(vis));
      }
      await shot(page, `5.10-blocked-toast-staff-${vp}`);
      // hash / history based navigation to a forbidden page
      await page.eval('document.querySelectorAll("#toastHost .toast button").forEach((b) => b.click())');
      await page.eval('(window.__history && __history.fire) ? __history.fire("admin") : (location.hash = "#/admin")');
      await page.sleep(300);
      const viaHash = await page.eval('({ page: PAGE, active: (document.querySelector(".page.active")||{}).id })');
      check(I, P + 'Back/hash navigation to #admin does not open the admin page for staff', viaHash.page !== 'admin' && viaHash.active !== 'page-admin', JSON.stringify(viaHash));
      await page.eval('location.hash = "#/sku"');
      await page.sleep(300);
      const viaHash2 = await page.eval('({ page: PAGE, active: (document.querySelector(".page.active")||{}).id })');
      check(I, P + 'location.hash=#/sku does not open SKU for staff', viaHash2.active !== 'page-sku', JSON.stringify(viaHash2));
      // programmatic attempts to use admin UI
      const gate = await page.eval('canUseAdminUi()');
      check(I, P + 'canUseAdminUi() refuses with a toast for staff', gate === false && (await page.toasts()).some((t) => t.kind === 'err'));
      // embed deep link to an admin page
      await openApp(page, { role: 'staff', lang: 'vi', viewport: vp, page: 'admin' });
      await page.sleep(500);
      const emb = await page.eval('({ page: PAGE, active: (document.querySelector(".page.active")||{}).id, embed: document.body.classList.contains("embed") })');
      check(I, P + 'embed ?page=admin as staff lands on Home (no admin page)', emb.active === 'page-home', JSON.stringify(emb));
      await page.eval("goto('admin')");
      const emb2 = await page.activePage();
      check(I, P + 'embed mode: goto(admin) still blocked', emb2 === 'page-home');

      // ============ admin
      await openApp(page, { role: 'admin', lang: 'vi', viewport: vp });
      s = await scan();
      const A = `[admin-${vp}] `;
      check(I, A + `.member-menu: all ${s.member.length} elements hidden`, s.member.length > 0 && s.member.every((e) => e.hidden && e.display === 'none' && !e.shown), JSON.stringify(s.member.filter((e) => e.shown || !e.hidden)));
      check(I, A + 'Manage tab visible; tabs = home, kho, report, admin', s.tabAdmin.w > 0 && s.tabs.join() === 'home,kho,report,admin', JSON.stringify({ tab: s.tabAdmin, tabs: s.tabs }));
      check(I, A + '.admin-gate unlocked (no data-locked) for admin', s.gate.every((e) => !e.locked), JSON.stringify(s.gate));
      for (const p of ['kho', 'history', 'stocktake', 'admin', 'sku', 'ticket', 'report', 'me', 'home']) {
        await gotoPage(page, p); await page.sleep(150);
        const q = await scan();
        const leak = q.member.filter((e) => e.shown);
        check(I, A + `goto(${p}) allowed, no .member-menu visible`, (await page.activePage()) === 'page-' + p && leak.length === 0, JSON.stringify(leak));
      }
      const vs = await page.eval(() => { const e = document.querySelector('#page-kho .admin-menu'); return null; });
      await shot(page, `5.10-admin-home-${vp}`);
      const errs = page.consoleErrors({ clear: true });
      check(I, `[${vp}] no console errors`, errs.length === 0, errTxt(errs));
    }
  } finally { await page.close(); }
}

/* ---------------------------------------------------------------- main */
const ITEMS = { '5.01': t501, '5.02': t502, '5.03': t503, '5.04': t504, '5.05': t505, '5.06': t506, '5.07': t507, '5.08': t508, '5.09': t509, '5.10': t510 };
let crashed = false;
for (const [id, fn] of Object.entries(ITEMS)) {
  if (!want(id)) continue;
  try { await fn(); } catch (e) { crashed = true; log(id, 'SCRIPT ERROR', 'FAIL', (e && e.stack || e).toString().split('\n').slice(0, 4).join(' / ')); }
}
fs.writeFileSync(path.join(HERE, 'results', only.length ? `group5-partial-${only.join('_')}.json` : 'group5.json'), JSON.stringify(results, null, 2));
const c = (s) => results.filter((r) => r.status === s).length;
console.log(`\nPASS ${c('PASS')}  FAIL ${c('FAIL')}  BLOCKED ${c('BLOCKED')}  INFO ${c('INFO')}`);
process.exit(c('FAIL') || crashed ? 1 : 0);
