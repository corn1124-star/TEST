// test-server-mail.mjs - chạy THẬT code server (AdminMail.js, Mail.js, Register.js) với MailApp/Sheet giả.
// Kiểm tra: đăng ký mới -> chỉ admin đã bật nhận thư được email; không ai bật thì không gửi; lỗi mail không chặn đăng ký.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRV = path.join(HERE, '..', 'server');
const results = [];
function check(name, ok, detail = '') { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  - ' + detail : '')); }

function makeSandbox(teamRows, opts = {}) {
  const sent = [], logs = [], notis = [];
  const rows = teamRows.map((r) => r.slice());
  const sheet = {
    getLastRow: () => rows.length + 1,
    getRange: (r, c, n, m) => ({ getValues: () => rows.map((x) => x.slice(0, m)), getValue: () => '', setValue() {} }),
    appendRow: (row) => rows.push(row),
  };
  const ctx = {
    console, Date, String, Number, Array, Object, JSON, Math, Error,
    APP_NAME: 'Grab Inventory Management',
    SH_TEAM: 'Team', TEAM_COLS: { EMAIL: 0, USERNAME: 1, CC: 2, ROLE: 3, NOTIFY: 4 }, TEAM_NOTIFY_HEADER: 'Notify Email',
    sheet_: () => sheet,
    log_: (a, action, detail) => logs.push({ action, detail }),
    MailApp: { getRemainingDailyQuota: () => opts.quota ?? 100, sendEmail: (m) => { if (opts.mailThrows) throw new Error('mail down'); sent.push(m); } },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/AKfy/exec' }) },
    appendNotification_: (d) => notis.push(d),
    cell_: (v) => v, withLock_: (fn) => fn(), clearAuthCacheFor_: () => {}, usernameTaken_: () => false, usernameTakenError_: (u) => new Error('taken ' + u),
    authLookup_: () => ({ notFound: true, email: 'moi.nguoi@example.com' }),
    regDepartments_: () => [{ name: 'Operations - COA', cc: 'OPS-COA', team: 'OPSCOA' }],
    sheet_ctx: null,
  };
  vm.createContext(ctx);
  for (const f of ['notifications/Mail.js', 'notifications/AdminMail.js', 'auth/Register.js']) {
    // const/let của file nạp ở cấp script: bọc để lộ ra sandbox
    let src = fs.readFileSync(path.join(SRV, f), 'utf8').replace(/^const (MAIL_ENABLED)/m, 'var $1');
    vm.runInContext(src, ctx, { filename: f });
  }
  ctx.regDepartments_ = () => [{ name: 'Operations - COA', cc: 'OPS-COA', team: 'OPSCOA' }];   // sheet Department giả
  return { ctx, sent, logs, notis, rows };
}

const TEAM = [
  ['an.admin@example.com', 'An Admin', 'WH-SEC', 'admin', true],        // admin, đã bật
  ['binh.admin@example.com', 'Binh Admin', 'WH-SEC', 'admin', false],    // admin, chưa bật
  ['chi.member@example.com', 'Chi Member', 'OPS-COA', 'member', true],   // không phải admin dù có cờ
];

/* 1. đăng ký thật qua registerSelf */
{
  const s = makeSandbox(TEAM);
  const res = s.ctx.registerSelf({ username: 'Moi Nguoi <b>', cc: 'ops-coa' });
  check('registerSelf succeeds', res.ok === true, JSON.stringify(res));
  check('exactly one email, to the opted-in admin only', s.sent.length === 1 && s.sent[0].to === 'an.admin@example.com', s.sent.map((m) => m.to).join(','));
  const m = s.sent[0] || { subject: '', htmlBody: '' };
  check('subject names the applicant', /Người dùng mới chờ duyệt/.test(m.subject || '') && /Moi Nguoi/.test(m.subject || ''), m.subject);
  check('body lists email, cost centre, team and an open-app button', /moi\.nguoi@example\.com/.test(m.htmlBody) && /OPS-COA/.test(m.htmlBody) && /OPSCOA/.test(m.htmlBody) && /Mở trang duyệt/.test(m.htmlBody) && /script\.google\.com/.test(m.htmlBody));
  check('applicant text is HTML-escaped in the email', !/<b>/.test(m.htmlBody.replace(/<\/?(b|p|a|div|table|tr|td)[^>]*>/g, '')) && /&lt;b&gt;/.test(m.htmlBody));
  check('in-app notification for admins still created', s.notis.length === 1 && s.notis[0].recipientEmail === '');
  check('MAIL_SENT audit entry written', s.logs.some((l) => l.action === 'MAIL_SENT'));
}
/* 2. không admin nào bật: không gửi, đăng ký vẫn ok */
{
  const s = makeSandbox(TEAM.map((r) => [r[0], r[1], r[2], r[3], false]));
  const res = s.ctx.registerSelf({ username: 'Nguoi Hai', cc: 'OPS-COA' });
  check('nobody opted in: no email, registration still ok', res.ok && s.sent.length === 0, JSON.stringify({ ok: res.ok, sent: s.sent.length }));
}
/* 3. mail hỏng / hết hạn mức: đăng ký không bị chặn */
{
  const s = makeSandbox(TEAM, { mailThrows: true });
  const res = s.ctx.registerSelf({ username: 'Nguoi Ba', cc: 'OPS-COA' });
  check('mail failure does not block registration', res.ok === true && s.logs.some((l) => l.action === 'MAIL_FAILED'), JSON.stringify(res));
  const q = makeSandbox(TEAM, { quota: 0 });
  const r2 = q.ctx.registerSelf({ username: 'Nguoi Bon', cc: 'OPS-COA' });
  check('exhausted quota: skipped and logged, registration ok', r2.ok === true && q.sent.length === 0 && q.logs.some((l) => l.action === 'MAIL_SKIPPED'));
}
/* 4. đăng ký lỗi (thiếu tên) thì không gửi mail */
{
  const s = makeSandbox(TEAM);
  const res = s.ctx.registerSelf({ username: '', cc: 'OPS-COA' });
  check('invalid registration sends nothing', res.ok === false && s.sent.length === 0, JSON.stringify(res));
}
fs.writeFileSync(path.join(HERE, 'results', 'server-mail.json'), JSON.stringify(results, null, 2));
const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad} PASS, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
