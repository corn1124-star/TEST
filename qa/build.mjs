// build.mjs - render client/Index.html (Apps Script HtmlService template) to a standalone dist/index.html
// and inject the mock google.script runtime (mock.js + fixture factory) at the top of <head>.
//
//   node build.mjs [--project <dir>] [--out <file>] [--no-history | --fake-history] [--quiet]
//
//   --no-history     default for the built file: window.google.script has NO history/url (app must still work)
//   --fake-history   default for the built file: fake google.script.history + url (the default)
//   Either default can be overridden at runtime with ?history=none|fake.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createFixtures } from './fixtures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function build(opts = {}) {
  const project = path.resolve(opts.project || path.join(HERE, '..'));
  const out = path.resolve(opts.out || path.join(HERE, 'dist', 'index.html'));
  const history = opts.history === 'none' ? 'none' : 'fake';

  const constants = readConstants(path.join(project, 'server', 'config', 'Version.js'));

  /* include('client/styles/Styles') -> <project>/client/styles/Styles.html, resolved recursively */
  const seen = [];
  function include(name) {
    if (seen.includes(name)) throw new Error('include cycle: ' + seen.concat(name).join(' -> '));
    const file = path.join(project, ...name.split('/')) + '.html';
    if (!fs.existsSync(file)) throw new Error(`include('${name}'): ${file} not found`);
    seen.push(name);
    const html = render(fs.readFileSync(file, 'utf8'));
    seen.pop();
    return html;
  }

  function render(src) {
    // <?!= include('x'); ?>   (raw)
    src = src.replace(/<\?!=\s*include\(\s*(['"])([^'"]+)\1\s*\)\s*;?\s*\?>/g, (_m, _q, name) => include(name));
    // <?!= expr ?>  (raw)   and   <?= expr ?>  (HTML-escaped)
    src = src.replace(/<\?(!?)=([\s\S]*?)\?>/g, (_m, raw, expr) => {
      const v = evalExpr(expr.trim().replace(/;$/, ''), constants);
      return raw ? String(v) : escapeHtml(String(v));
    });
    if (/<\?(?!=|!=)/.test(src)) {
      const bad = src.match(/<\?[\s\S]{0,60}/)[0];
      throw new Error('Unsupported scriptlet left in template: ' + bad);
    }
    return src;
  }

  const indexFile = path.join(project, 'client', 'Index.html');
  let html = render(fs.readFileSync(indexFile, 'utf8'));

  const mockJs = fs.readFileSync(path.join(HERE, 'mock.js'), 'utf8');
  const factory = createFixtures.toString();
  const inject =
    '<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +     // Web.js doGet() adds this via addMetaTag

    '<script id="qa-mock-config">window.__MOCK_BUILD=' + JSON.stringify({ history, app: constants }) + ';</script>\n' +
    '<script id="qa-fixtures">window.__createFixtures=(' + safe(factory) + ');</script>\n' +
    '<script id="qa-mock">' + safe(mockJs) + '</script>\n';

  const m = /<head[^>]*>/i.exec(html);
  if (!m) throw new Error('No <head> in rendered Index.html');
  html = html.slice(0, m.index + m[0].length) + '\n' + inject + html.slice(m.index + m[0].length);

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  return { out, bytes: Buffer.byteLength(html), version: constants.APP_VERSION, buildId: constants.APP_BUILD_ID, history };
}

/** `const NAME = 'value';` pairs from Version.js (APP_VERSION, APP_BUILD_DATE, APP_BUILD_ID). */
function readConstants(file) {
  const src = fs.readFileSync(file, 'utf8');
  const c = {};
  for (const m of src.matchAll(/^const\s+([A-Z_]+)\s*=\s*(['"])(.*?)\2\s*;/gm)) c[m[1]] = m[3];
  return c;
}

/** Evaluate the simple expressions the template uses, e.g. typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?' */
function evalExpr(expr, constants) {
  const names = Object.keys(constants);
  try {
    // eslint-disable-next-line no-new-func
    return new Function(...names, `return (${expr});`)(...names.map((n) => constants[n]));
  } catch (e) {
    // names not defined by Version.js behave like "typeof X === 'undefined'" in the real server
    try { return new Function(`return (${expr});`)(); } catch (e2) { throw new Error(`Cannot evaluate <?= ${expr} ?>: ${e2.message}`); }
  }
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** keep inline <script> content from closing the tag */
function safe(js) { return js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--'); }

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const a = process.argv.slice(2);
  const arg = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; };
  const t0 = Date.now();
  const r = build({
    project: arg('--project'), out: arg('--out'),
    history: a.includes('--no-history') ? 'none' : 'fake',
  });
  if (!a.includes('--quiet')) {
    console.log(`built ${r.out} (${(r.bytes / 1024).toFixed(0)} KB) app v${r.version} ${r.buildId}, default history=${r.history}, ${Date.now() - t0} ms`);
  }
}
