/* ==========================================================================
   mock.js - fake Apps Script runtime (window.google) for the SEC WH QA harness.
   Inlined by build.mjs at the top of <head>, BEFORE any app script.

   Page URL query (all optional)
     role=admin|staff        who is logged in (default admin)
     lang=vi|en              seeds localStorage 'gim_lang' (default: leave as is, app default is vi)
     tour=1                  show the first-run guide (default: tour is marked as seen)
     latency=20 | 5-80       server latency in ms (fixed or min-max). Default 0-20
     boot=fail|error|register|pending|slow
                             make bootstrapAll fail in the given way (landing error screens)
     history=fake|none       provide a fake google.script.history/url, or omit them (build default: fake)
     page=kho|...            embed mode (sets window.SECWH_EMBED like the real doGet does)
     now=2026-10-29T09:00    freeze/shift the browser clock (Date.now and new Date())
     fixtures=0              do not load the fixture factory (every call returns {ok:true,message:'(mock)'})

   Globals exposed to tests
     __calls                 [{fn, args, t, id}] every google.script.run call, oldest first
     __resetCalls()          empty __calls (and __unhandled)
     __server                { fnName(...args) } handlers; defaults come from fixtures.mjs
     __setServer(obj)        Object.assign(__server, obj); returns __server
     __server.__fail         { fnName|'*': 'message' } -> failure handler is called with Error(message)
     __server.__latency      { fnName: ms } per-function latency override
     __server.__hold         { fnName: true } -> calls to fnName stay pending until __release(fnName)
     __setLatency(min, max)  change the default latency
     __release(fn?)          resolve held calls (all if fn omitted)
     __pending               [{fn,args}] calls currently held
     __unhandled             [fnName] calls that had no handler (answered with the default reply)
     __fx                    the fixture bundle ({data, rows, ...}) for read access / tweaking state
     __history               fake history recorder {pushes, replaces, fire(hash)} (when history=fake)
   ========================================================================== */
(function () {
  'use strict';

  var Q = new URLSearchParams(location.search);
  var BUILD = window.__MOCK_BUILD || {};
  var ROLE = Q.get('role') === 'staff' ? 'staff' : 'admin';
  var LANG = Q.get('lang') === 'en' ? 'en' : (Q.get('lang') === 'vi' ? 'vi' : '');
  window.__ROLE = ROLE;

  /* ---- optional clock shift ------------------------------------------------ */
  if (Q.get('now')) {
    var RealDate = Date;
    var shift = new RealDate(Q.get('now')).getTime() - RealDate.now();
    if (!isNaN(shift)) {
      var FakeDate = function () {
        if (!new.target) return new RealDate(RealDate.now() + shift).toString();
        return arguments.length === 0 ? new RealDate(RealDate.now() + shift) : Reflect.construct(RealDate, arguments);
      };
      FakeDate.prototype = RealDate.prototype;
      FakeDate.now = function () { return RealDate.now() + shift; };
      FakeDate.parse = RealDate.parse;
      FakeDate.UTC = RealDate.UTC;
      window.Date = FakeDate;
    }
  }

  /* ---- localStorage seeding ------------------------------------------------ */
  try {
    if (LANG) localStorage.setItem('gim_lang', LANG);
    if (Q.get('tour') === '1') localStorage.removeItem('gim_tour_v2');
    else localStorage.setItem('gim_tour_v2', '1');
  } catch (e) { /* storage blocked: ignore */ }

  /* ---- embed mode ---------------------------------------------------------- */
  if (Q.get('page')) window.SECWH_EMBED = { page: String(Q.get('page')).toLowerCase(), url: 'about:blank#embed-url' };

  /* ---- state --------------------------------------------------------------- */
  var calls = window.__calls = [];
  var unhandled = window.__unhandled = [];
  var pending = window.__pending = [];
  var seq = 0;
  var latency = [0, 20];
  (function () {
    var q = Q.get('latency');
    if (!q) return;
    var m = /^(\d+)(?:-(\d+))?$/.exec(q);
    if (m) latency = [Number(m[1]), Number(m[2] || m[1])];
  })();

  /* ---- server handlers ----------------------------------------------------- */
  var server = window.__server = {};
  if (Q.get('fixtures') !== '0' && typeof window.__createFixtures === 'function') {
    var fx = window.__fx = window.__createFixtures({
      role: ROLE, lang: LANG || 'vi', now: Date.now()
    });
    Object.assign(server, fx.handlers);
  }

  (function bootMode() {
    var b = Q.get('boot');
    if (!b) return;
    if (b === 'fail') server.__fail = { bootstrapAll: 'Mock: server exploded during boot' };
    if (b === 'error') server.bootstrapAll = function () { return { ok: false, message: 'Không xác định được email. Hãy mở link bằng tài khoản Google công ty.' }; };
    if (b === 'register') { server.__regStatus = 'register'; server.bootstrapAll = function () { return { ok: false, message: '__NEED_REGISTER__' }; }; }
    if (b === 'pending') { server.__regStatus = 'pending'; server.bootstrapAll = function () { return { ok: false, message: '__PENDING__' }; }; }
    if (b === 'slow') server.__latency = { bootstrapAll: 7000 };
  })();

  /* test hook: driver.open({ init: (server, fx) => {...} }) installs window.__mockInit before the page loads */
  if (typeof window.__mockInit === 'function') window.__mockInit(server, window.__fx);

  window.__setServer = function (obj) { return Object.assign(server, obj || {}); };
  window.__resetCalls = function () { calls.length = 0; unhandled.length = 0; };
  window.__setLatency = function (min, max) { latency = [Number(min) || 0, Number(max == null ? min : max) || 0]; };

  function clone(v) {
    if (v === undefined) return null;
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
  }

  function delayFor(fn) {
    var o = server.__latency && server.__latency[fn];
    if (typeof o === 'number') return o;
    return latency[0] + Math.floor(Math.random() * (latency[1] - latency[0] + 1));
  }

  function failureOf(fn) {
    var f = server.__fail;
    if (!f) return null;
    if (Object.prototype.hasOwnProperty.call(f, fn) && f[fn]) return String(f[fn]);
    if (f['*']) return String(f['*']);
    return null;
  }

  /* Real GAS passes an Error-like object to the failure handler (e.message is the server exception text). */
  function mkError(msg) { var e = new Error(msg); e.name = 'Error'; return e; }

  function run(fn, args, st) {
    var rec = { fn: fn, args: clone(args), t: Date.now(), id: ++seq };
    calls.push(rec);

    var go = function () {
      var out, err = null;
      try {
        var f = failureOf(fn);
        if (f !== null) throw mkError(f);
        if (typeof server[fn] === 'function') out = server[fn].apply(server, clone(args));
        else { unhandled.push(fn); out = { ok: true, message: '(mock)' }; }
      } catch (e) { err = e; }

      var finish = function (value, error) {
        setTimeout(function () {
          if (error) {
            if (typeof st.fail === 'function') st.fail(error instanceof Error ? error : mkError(String(error && error.message || error)), st.user);
            else console.error('[mock] server function ' + fn + ' failed with no failure handler: ' + (error && error.message || error));
          } else if (typeof st.ok === 'function') {
            st.ok(clone(value), st.user);
          }
        }, 0);
      };

      if (err) return finish(null, err);
      if (out && typeof out.then === 'function') out.then(function (v) { finish(v); }, function (e) { finish(null, e); });
      else finish(out);
    };

    var hold = server.__hold && server.__hold[fn];
    if (hold) pending.push({ fn: fn, args: rec.args, go: go });
    else setTimeout(go, delayFor(fn));
  }

  window.__release = function (fn) {
    var keep = [];
    pending.splice(0).forEach(function (p) { if (!fn || p.fn === fn) setTimeout(p.go, 0); else keep.push(p); });
    keep.forEach(function (p) { pending.push(p); });
  };

  function runner(st) {
    return new Proxy({}, {
      get: function (_t, prop) {
        if (typeof prop !== 'string' || prop === 'then') return undefined;
        if (prop === 'withSuccessHandler') return function (fn) { return runner({ ok: fn, fail: st.fail, user: st.user }); };
        if (prop === 'withFailureHandler') return function (fn) { return runner({ ok: st.ok, fail: fn, user: st.user }); };
        if (prop === 'withUserObject') return function (o) { return runner({ ok: st.ok, fail: st.fail, user: o }); };
        return function () { run(prop, Array.prototype.slice.call(arguments), st); };
      }
    });
  }

  /* ---- google.script ------------------------------------------------------- */
  var script = { run: runner({}) };
  var historyMode = Q.get('history') || BUILD.history || 'fake';

  if (historyMode !== 'none') {
    var H = window.__history = { pushes: [], replaces: [], handler: null, state: null, hash: '' };
    H.fire = function (hash) {
      H.hash = String(hash || '');
      if (H.handler) H.handler({ state: H.state, location: { hash: H.hash, parameter: {}, parameters: {} } }, false);
    };
    script.history = {
      push: function (state, params, hash) { H.pushes.push({ state: clone(state), params: clone(params), hash: hash }); H.state = state; H.hash = hash || ''; },
      replace: function (state, params, hash) { H.replaces.push({ state: clone(state), params: clone(params), hash: hash }); H.state = state; H.hash = hash || ''; },
      setChangeHandler: function (fn) { H.handler = fn; }
    };
    script.url = {
      getLocation: function (cb) { setTimeout(function () { cb({ hash: H.hash, parameter: {}, parameters: {} }); }, 0); }
    };
  }

  window.google = { script: script };
})();
