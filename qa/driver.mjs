// driver.mjs - tiny Chrome DevTools Protocol driver. Node 22 builtins only (global WebSocket + fetch), no npm.
//
//   import { createDriver } from './driver.mjs';
//   const page = await createDriver();                       // launches headless Chrome
//   await page.open({ role: 'admin', lang: 'vi', viewport: 'D' });
//   await page.eval('goto("kho")');
//   await page.screenshot('results/screens/x.png');
//   await page.close();                                      // kills Chrome (whole process tree) + removes temp profile
//
// See README.md for the full API.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from './build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DIST = path.join(HERE, 'dist', 'index.html');
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

export const VIEWPORTS = {
  D: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
  M: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
};
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const IGNORED_URL = /fonts\.(googleapis|gstatic)\.com/i;     // Google Fonts are blocked on purpose (no network needed)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const KEYS = {
  Enter: { code: 'Enter', vk: 13, text: '\r' }, Escape: { code: 'Escape', vk: 27 }, Tab: { code: 'Tab', vk: 9 },
  Backspace: { code: 'Backspace', vk: 8 }, Delete: { code: 'Delete', vk: 46 }, Space: { code: 'Space', vk: 32, text: ' ', key: ' ' },
  ArrowLeft: { code: 'ArrowLeft', vk: 37 }, ArrowUp: { code: 'ArrowUp', vk: 38 }, ArrowRight: { code: 'ArrowRight', vk: 39 }, ArrowDown: { code: 'ArrowDown', vk: 40 },
  Home: { code: 'Home', vk: 36 }, End: { code: 'End', vk: 35 }, PageUp: { code: 'PageUp', vk: 33 }, PageDown: { code: 'PageDown', vk: 34 },
};

/** Launch Chrome and return a driver object. opts: { chromePath, headless=true, rebuild=false, keepProfile=false } */
export async function createDriver(opts = {}) {
  const chromePath = opts.chromePath || CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!chromePath) throw new Error('Chrome not found. Set CHROME_PATH or pass { chromePath }.');
  if (opts.rebuild || !fs.existsSync(DIST)) build({ out: DIST });

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'secwh-qa-'));
  const args = [
    opts.headless === false ? '' : '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--remote-allow-origins=*',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--disable-sync',
    '--disable-component-update', '--disable-features=Translate,MediaRouter', '--mute-audio', '--window-size=1440,900', 'about:blank',
  ].filter(Boolean);
  const proc = spawn(chromePath, args, { stdio: 'ignore', windowsHide: true });
  let exited = false;
  proc.on('exit', () => { exited = true; });

  let closed = false;
  function killSync() {
    if (proc.pid && !exited) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      else { try { process.kill(-proc.pid, 'SIGKILL'); } catch { try { proc.kill('SIGKILL'); } catch { /* gone */ } } }
    }
  }
  function rmProfile() {
    if (opts.keepProfile) return;
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* best effort */ }
  }
  const onExit = () => { killSync(); rmProfile(); };
  process.on('exit', onExit);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { onExit(); process.exit(130); });

  // ---- wait for DevToolsActivePort (port 0 => Chrome picks a free port and writes it here) ----
  let port = 0;
  const t0 = Date.now();
  while (!port) {
    if (exited) { rmProfile(); throw new Error('Chrome exited during startup'); }
    if (Date.now() - t0 > 20000) { onExit(); throw new Error('Timed out waiting for Chrome DevTools port'); }
    try {
      const txt = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8');
      port = Number(txt.split(/\r?\n/)[0]) || 0;
    } catch { /* not there yet */ }
    if (!port) await sleep(50);
  }

  let target = null;
  for (let i = 0; i < 100 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === 'page');
    } catch { /* retry */ }
    if (!target) await sleep(100);
  }
  if (!target) { onExit(); throw new Error('No page target found'); }

  // ---- CDP plumbing ----
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', () => rej(new Error('CDP websocket error')), { once: true }); });
  let nextId = 0;
  const waiting = new Map();
  const listeners = new Map();
  const on = (method, fn) => { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(fn); };
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8'));
    if (msg.id && waiting.has(msg.id)) {
      const { resolve, reject, method } = waiting.get(msg.id);
      waiting.delete(msg.id);
      if (msg.error) reject(new Error(`CDP ${method}: ${msg.error.message}`)); else resolve(msg.result);
    } else if (msg.method) {
      (listeners.get(msg.method) || []).forEach((fn) => { try { fn(msg.params); } catch (e) { console.error('[driver] listener failed', e); } });
    }
  });
  ws.addEventListener('close', () => { for (const w of waiting.values()) w.reject(new Error('CDP connection closed')); waiting.clear(); });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    waiting.set(id, { resolve, reject, method });
    ws.send(JSON.stringify({ id, method, params }));
  });

  // ---- error / log collection ----
  let errors = [];
  let logs = [];
  const dialogs = [];
  const urlOfRequest = new Map();
  const argText = (a) => (a.type === 'string' ? a.value : a.value !== undefined ? String(a.value) : (a.description || a.type));
  const note = (e) => { errors.push(Object.assign({ at: Date.now() }, e)); };

  on('Runtime.exceptionThrown', (p) => {
    const d = p.exceptionDetails || {};
    const ex = d.exception || {};
    note({ kind: 'exception', text: ex.description || d.text || 'exception', url: d.url || '', line: d.lineNumber, col: d.columnNumber,
           stack: (d.stackTrace?.callFrames || []).map((f) => `${f.functionName || '(anon)'} ${f.url}:${f.lineNumber + 1}:${f.columnNumber + 1}`).join('\n') });
  });
  on('Runtime.consoleAPICalled', (p) => {
    const text = (p.args || []).map(argText).join(' ');
    logs.push({ type: p.type, text, at: Date.now() });
    if (p.type === 'error' || p.type === 'assert') {
      const f = p.stackTrace?.callFrames?.[0];
      note({ kind: 'console.error', text, url: f?.url || '', line: f ? f.lineNumber + 1 : undefined,
             stack: (p.stackTrace?.callFrames || []).map((x) => `${x.functionName || '(anon)'} ${x.url}:${x.lineNumber + 1}:${x.columnNumber + 1}`).join('\n') });
    }
  });
  on('Log.entryAdded', (p) => {
    const e = p.entry || {};
    if (e.level !== 'error') return;
    if (IGNORED_URL.test(e.url || '') || IGNORED_URL.test(e.text || '')) return;
    if (e.source === 'javascript' || e.source === 'console-api') return;           // already reported through Runtime
    if (e.source === 'network' && errors.some((x) => x.kind === 'network' && x.url === e.url)) return;   // same failure as Network.loadingFailed
    note({ kind: 'log.' + (e.source || 'error'), text: e.text, url: e.url || '', line: e.lineNumber });
  });
  on('Network.requestWillBeSent', (p) => { urlOfRequest.set(p.requestId, p.request.url); });
  on('Network.loadingFailed', (p) => {
    const url = urlOfRequest.get(p.requestId) || '';
    if (IGNORED_URL.test(url) || p.canceled) return;
    note({ kind: 'network', text: `${p.errorText || 'request failed'}${p.blockedReason ? ' (' + p.blockedReason + ')' : ''}`, url });
  });
  on('Page.javascriptDialogOpening', async (p) => {
    dialogs.push({ type: p.type, message: p.message, url: p.url, at: Date.now() });
    const accept = driver.dialogMode !== 'dismiss';
    try { await send('Page.handleJavaScriptDialog', { accept, promptText: driver.promptText || '' }); } catch { /* page navigated */ }
  });

  await Promise.all([send('Page.enable'), send('Runtime.enable'), send('Log.enable'), send('Network.enable'), send('DOM.enable')]);
  await send('Network.setBlockedURLs', { urls: ['*://fonts.googleapis.com/*', '*://fonts.gstatic.com/*'] });

  // ---- page helpers ----
  const fnSource = (fn, args) => `(${fn.toString()})(...${JSON.stringify(args)})`;

  async function evaluate(expr, ...args) {
    const expression = typeof expr === 'function' ? fnSource(expr, args) : String(expr);
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true, allowUnsafeEvalBlockedByCSP: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('eval failed: ' + (d.exception?.description || d.text) + '\n  in: ' + expression.slice(0, 200));
    }
    return r.result.value;
  }

  /** Locate an element for click/type: CSS selector, or "text=Some label" (smallest visible element containing that text). */
  const FIND_JS = `(sel) => {
    const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    let el = null;
    if (sel.startsWith('text=')) {
      const want = sel.slice(5).trim().toLowerCase();
      const all = [...document.querySelectorAll('button,a,[onclick],[role=button],label,summary,li,td,th,span,div,h1,h2,h3,p,option')].filter(vis);
      const exact = all.filter((e) => e.textContent.trim().toLowerCase() === want);
      const part = all.filter((e) => e.textContent.toLowerCase().includes(want));
      const pool = exact.length ? exact : part;
      pool.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);
      el = pool[0] || null;
    } else {
      el = [...document.querySelectorAll(sel)].find(vis) || document.querySelector(sel);
    }
    return el;
  }`;

  /** what: CSS selector | 'text=Label' | 'js:<expression>' | function (runs in the page, may be async). Returns the truthy value. */
  async function waitFor(what, timeout = 10000, interval = 50) {
    const t1 = Date.now();
    const label = typeof what === 'string' ? what : (what.name || 'predicate');
    let last;
    for (;;) {
      try {
        if (typeof what === 'string' && what.startsWith('js:')) last = await evaluate(what.slice(3));
        else if (typeof what === 'string') last = await evaluate(`!!(${FIND_JS})(${JSON.stringify(what)})`);
        else last = await evaluate(what);
        if (last) return last;
      } catch (e) { last = e; }
      if (Date.now() - t1 > timeout) {
        const errs = errors.length ? ` (${errors.length} console error(s), first: ${errors[0].text.split('\n')[0]})` : '';
        throw new Error(`waitFor(${label}) timed out after ${timeout} ms${errs}`);
      }
      await sleep(interval);
    }
  }

  async function centerOf(selector, { timeout = 10000, scroll = true } = {}) {
    await waitFor(selector, timeout);
    const sel = JSON.stringify(selector);
    return evaluate(`(() => {
      const el = (${FIND_JS})(${sel});
      if (!el) return null;
      ${scroll ? "el.scrollIntoView({ block: 'center', inline: 'center' });" : ''}
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      return { x, y, w: r.width, h: r.height, disabled: !!el.disabled,
               covered: !!top && top !== el && !el.contains(top) && !top.contains(el) ? (top.tagName.toLowerCase() + (top.id ? '#' + top.id : '') + (top.className && typeof top.className === 'string' ? '.' + top.className.trim().split(/\\s+/).join('.') : '')) : '' };
    })()`);
  }

  let initScriptId = null;
  const driver = {
    dialogMode: 'accept', promptText: '', dialogs, send, on, chromePath, profile,
    get errors() { return errors; },
    viewport: 'D',

    /** Navigate to the built app. Resolves when the landing screen is gone (unless waitLanding:false). */
    async open(o = {}) {
      const { role = 'admin', lang = 'vi', viewport = 'D', noHistory = false, waitLanding = true, query = {}, reducedMotion = false } = o;
      const vp = VIEWPORTS[viewport];
      if (!vp) throw new Error(`viewport must be 'D' or 'M', got ${viewport}`);
      driver.viewport = viewport;

      await send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vp.deviceScaleFactor, mobile: vp.mobile, screenWidth: vp.width, screenHeight: vp.height });
      await send('Emulation.setTouchEmulationEnabled', vp.mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
      if (vp.mobile) await send('Emulation.setUserAgentOverride', { userAgent: MOBILE_UA });
      else await send('Emulation.setUserAgentOverride', { userAgent: DESKTOP_UA });
      const media = [{ name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' }];
      if (vp.mobile) media.push({ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' });
      try { await send('Emulation.setEmulatedMedia', { features: media }); } catch { /* pointer/hover features not supported by this Chrome */ }

      const q = new URLSearchParams({ role, lang });
      if (noHistory) q.set('history', 'none');
      for (const [k, v] of Object.entries(o.latency !== undefined ? { ...query, latency: o.latency } : query)) q.set(k, String(v));
      for (const k of ['boot', 'now', 'tour', 'page']) if (o[k] !== undefined) q.set(k, String(o[k]));
      /* fixtures date their stocktake ids (KK-20261027-01 ...) from the browser clock: freeze it to the day the
         fixtures were written unless the test asks for another one, so results do not drift with the real date */
      if (!q.has('now')) q.set('now', '2026-10-29T09:00');
      const url = pathToFileURL(o.dist || DIST).href + '?' + q.toString();

      // o.init: function (server, fx) { ... } run by mock.js right after the default handlers are installed, before the app boots
      if (initScriptId) { await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: initScriptId }); initScriptId = null; }
      if (o.init) {
        const src = typeof o.init === 'function' ? o.init.toString() : String(o.init);
        initScriptId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__mockInit = (${src});` })).identifier;
      }

      errors = []; logs = []; dialogs.length = 0;
      const loaded = new Promise((res) => { const h = (p) => res(p); on('Page.loadEventFired', h); });
      await send('Page.navigate', { url });
      await Promise.race([loaded, sleep(30000).then(() => { throw new Error('page load timed out'); })]);
      driver.url = url;
      if (waitLanding) {
        await waitFor(() => { const l = document.getElementById('landing'); return !l || l.hidden || l.classList.contains('gone'); }, o.landingTimeout || 15000)
          .catch((e) => { throw new Error(e.message + ' (landing still visible; boot error? ' + errors.map((x) => x.text.split('\n')[0]).join(' | ') + ')'); });
      }
      return url;
    },

    /** Evaluate an expression string (or a function + args) in the page. Promises are awaited, result returned by value. */
    eval: evaluate,
    waitFor,
    sleep,

    async click(selector, o = {}) {
      const c = await centerOf(selector, o);
      if (!c) throw new Error(`click: no element for ${selector}`);
      if (c.w === 0 || c.h === 0) throw new Error(`click: ${selector} has no size`);
      if (c.covered && !o.force) throw new Error(`click: ${selector} is covered by ${c.covered}`);
      if (c.disabled && !o.force) throw new Error(`click: ${selector} is disabled`);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    },

    /** Focus the element, optionally clear it, and type text (Input.insertText; {keys:true} sends real key events per character). */
    async type(selector, text, o = {}) {
      const { clear = true, keys = false } = o;
      await driver.click(selector, o);
      if (clear) {
        await evaluate(`(() => { const e = document.activeElement; if (e && 'value' in e) { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
      }
      if (keys) {
        for (const ch of String(text)) await send('Input.dispatchKeyEvent', { type: 'char', text: ch, key: ch, unmodifiedText: ch });
      } else if (text !== '') {
        await send('Input.insertText', { text: String(text) });
      }
    },

    /** press('Enter'), press('Escape'), press('a'), press('Control+a') */
    async press(key) {
      const parts = String(key).split('+');
      const main = parts.pop();
      const mods = { Alt: 1, Control: 2, Meta: 4, Shift: 8 };
      const modifiers = parts.reduce((m, p) => m | (mods[p] || 0), 0);
      const k = KEYS[main] || { code: /^[a-z]$/i.test(main) ? 'Key' + main.toUpperCase() : main, vk: main.length === 1 ? main.toUpperCase().charCodeAt(0) : 0, text: main.length === 1 ? main : undefined };
      const base = { key: k.key || main, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers };
      await send('Input.dispatchKeyEvent', { type: k.text && !modifiers ? 'keyDown' : 'rawKeyDown', ...base, ...(k.text && !modifiers ? { text: k.text } : {}) });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    },

    async screenshot(file, o = {}) {
      const abs = path.resolve(file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      const r = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: !!o.fullPage });
      fs.writeFileSync(abs, Buffer.from(r.data, 'base64'));
      return abs;
    },

    /** Console/runtime problems since open() (or since the last clear). Each: { kind, text, url, line, stack }. */
    consoleErrors({ clear = false } = {}) { const out = errors.slice(); if (clear) errors = []; return out; },
    consoleLog() { return logs.slice(); },
    clearErrors() { errors = []; },

    /** google.script.run calls recorded by the mock: [{fn, args, t, id}] (optionally only calls of one function). */
    async calls(fn) { const all = await evaluate('window.__calls || []'); return fn ? all.filter((c) => c.fn === fn) : all; },
    resetCalls() { return evaluate('__resetCalls()'); },

    /** Wait until the mock has no held calls and no new calls appeared for `quiet` ms. */
    async idle(quiet = 120, timeout = 10000) {
      const t1 = Date.now();
      let n = -1, since = Date.now();
      for (;;) {
        const cur = await evaluate('(window.__calls || []).length + ":" + (window.__pending || []).length');
        const [calls, pend] = cur.split(':').map(Number);
        if (calls !== n || pend) { n = calls; since = Date.now(); }
        else if (Date.now() - since >= quiet) return calls;
        if (Date.now() - t1 > timeout) throw new Error('idle() timed out (calls still arriving or held)');
        await sleep(30);
      }
    },

    /** Convenience helpers */
    exists: (sel) => evaluate(`!!document.querySelector(${JSON.stringify(sel)})`),
    text: (sel) => evaluate(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent`),
    count: (sel) => evaluate(`document.querySelectorAll(${JSON.stringify(sel)}).length`),
    toasts: () => evaluate(`[...document.querySelectorAll('#toastHost .toast')].map((t) => ({ kind: t.classList.contains('err') ? 'err' : t.classList.contains('info') ? 'info' : 'ok', text: (t.querySelector('.tx') || t).textContent }))`),
    activePage: () => evaluate(`(document.querySelector('.page.active') || {}).id || null`),
    reload() { return driver.open({ ...driver._last }); },
    async setViewport(v) {
      const vp = VIEWPORTS[v];
      await send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: vp.deviceScaleFactor, mobile: vp.mobile });
      driver.viewport = v;
    },

    async close() {
      if (closed) return;
      closed = true;
      try { ws.close(); } catch { /* already closed */ }
      killSync();
      process.removeListener('exit', onExit);
      for (let i = 0; i < 50 && !exited; i++) await sleep(50);
      rmProfile();
    },
  };

  const origOpen = driver.open;
  driver.open = async (o = {}) => { driver._last = o; return origOpen(o); };
  return driver;
}
