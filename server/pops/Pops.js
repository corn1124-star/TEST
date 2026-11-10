/* ══════════════════════════════════════════════════════════════════════
   Pops.gs — TRANG QUẢN LÝ RIÊNG CỦA TEAM POPS
   ══════════════════════════════════════════════════════════════════════
   Truy cập: <URL web app>?page=pops

   CHỈ ĐỌC dữ liệu. Không ghi/sửa/xoá gì trong Sheet, ngoài 1 dòng
   AuditLog mỗi lần mở trang (để truy vết ai đã xem danh sách toàn bộ user).

   QUYỀN: user trong sheet Team có Cost Center chứa 'POPPSV', hoặc role
   = 'admin'. Người khác nhận thông báo từ chối truy cập.

   Mọi hàm/hằng đặt tiền tố POPS_ / pops... nên KHÔNG trùng tên với
   Code.gs. Dùng lại các hằng có sẵn: SS_ID, SH_DB, SH_TEAM, SH_DEPT,
   SH_PENDING, SH_LOG, C, P, TEAM_COLS, DB_COLS, PENDING_COLS.
   ══════════════════════════════════════════════════════════════════════ */

const POPS_CC    = 'POPPSV';                          // Cost Center của POPS
const POPS_TITLE = 'POPS · Quản lý tồn kho theo user';
const POPS_HTML  = 'client/pops/Pops';                // đường dẫn file HTML trong dự án

/* ── Nhận diện điện thoại / SIM ──────────────────────────────────────
   So khớp ĐÚNG TÊN Sub-Category (cột H sheet Database).
   Không phân biệt hoa/thường, khoảng trắng hay dấu gạch:
   'Mobile phone', 'MOBILE PHONE', 'Mobile-Phone' đều được tính.
   ★ Có thêm Sub-Category khác (vd 'Tablet') thì thêm vào mảng, viết HOA. */
const POPS_PHONE_SUBS = ['MOBILE PHONE'];
const POPS_SIM_SUBS   = ['SIM CARD'];

/* ═══════════ ĐIỂM VÀO ═══════════ */

/** Gọi từ doGet() trong Code.gs khi URL có ?page=pops */
function popsDoGet() {
  return HtmlService.createHtmlOutputFromFile(POPS_HTML)
    .setTitle(POPS_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ═══════════ HẠ TẦNG RIÊNG ═══════════ */

/** Đọc vùng dữ liệu 1 sheet (bỏ dòng tiêu đề), tự đệm cho đủ số cột. */
function popsRows_(name, cols) {
  const sh = sheet_(name);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const n = Math.min(cols, sh.getMaxColumns());
  const rows = sh.getRange(2, 1, lastRow - 1, n).getValues();
  if (n < cols) rows.forEach(function (r) { while (r.length < cols) r.push(''); });
  return rows;
}

/** Danh tính người đang mở trang: dùng chung auth_ của app (có cache). Email lấy từ Session, không thể giả mạo. */
function popsAuth_() {
  const u = authLookup_();
  if (u.notFound) throw new Error('Tài khoản ' + u.email + ' chưa có trong sheet Team. Liên hệ quản trị viên.');
  return u;
}

/** POPS hoặc admin mới được xem trang này. */
function popsIsAllowed_(u) {
  if (u.role === 'pending') return false;         
  if (u.role === 'admin') return true;
  return String(u.cc || '').toUpperCase().indexOf(POPS_CC) !== -1
      || String(u.ccRaw || '').toUpperCase().indexOf(POPS_CC) !== -1;
}

/* ═══════════ PHÂN LOẠI ĐIỆN THOẠI / SIM ═══════════ */

/** Bỏ dấu tiếng Việt + viết hoa + gom khoảng trắng: 'Điện thoại' -> 'DIEN THOAI' */
function popsNorm_(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

/** Phân loại 1 mã hàng theo ĐÚNG TÊN Sub-Category: 'SIM' | 'PHONE' | '' */
function popsDeviceType_(cat, sub) {
  const s = popsNorm_(sub);
  if (!s) return '';
  if (POPS_SIM_SUBS.indexOf(s) !== -1)   return 'SIM';
  if (POPS_PHONE_SUBS.indexOf(s) !== -1) return 'PHONE';
  return '';
}

/* ═══════════ API CHÍNH ═══════════ */

/**
 * [API] Toàn bộ user trong sheet Team kèm số liệu nhập/tồn.
 *
 * Đọc mỗi sheet ĐÚNG 1 LẦN: PendingRequests · Database · Team.
 *
 * Ý NGHĨA CÁC CON SỐ
 *   reqQty        SL đã request nhập — tổng Quantity mọi yêu cầu Import
 *                 của user đó trong PendingRequests (mọi trạng thái)
 *   approvedQty   phần đã được duyệt trong số trên
 *   itemsImported SỐ MÃ HÀNG khác nhau user đó đã nhập vào kho (Database)
 *   itemsHeld     SỐ MÃ HÀNG user đó đã nhập mà HIỆN CÒN TỒN > 0
 *                 Ví dụ: nhập mã 1,2,3,4; mã 3 đã xuất hết -> itemsHeld = 3.
 *   phoneQty      SL ĐIỆN THOẠI còn tồn trong các mã user đó đã nhập, không có = 0
 *   simQty        SL SIM còn tồn trong các mã user đó đã nhập, không có = 0
 *
 * GHÉP USER VỚI GIAO DỊCH: Database.PIC (cột F) so với Team.Username
 * (cột B), không phân biệt hoa/thường.
 */
function popsGetUsers() {
  try {
    const me = popsAuth_();

    if (!popsIsAllowed_(me)) {
      log_(me, 'DENIED_POPS_PAGE', 'thử mở trang quản lý POPS');
      return { ok: false, denied: true,
               message: 'Trang này chỉ dành cho thành viên team POPS (Cost Center ' +
                        POPS_CC + '). Tài khoản của bạn: ' + me.email +
                        ' · Cost Center: ' + (me.cc || '(trống)') + '.' };
    }

    /* ══ ĐỌC 1: PendingRequests -> yêu cầu NHẬP theo email ══ */
    const reqStat = {};

    popsRows_(SH_PENDING, PENDING_COLS).forEach(function (r) {
      if (String(r[P.TYPE] || '').trim() !== 'Import') return;

      const em = String(r[P.USER_EMAIL] || '').trim().toLowerCase();
      if (!em) return;

      if (!reqStat[em]) {
        reqStat[em] = { qty: 0, approvedQty: 0, count: 0, pending: 0, rejected: 0 };
      }

      const qty = Number(r[P.QUANTITY]) || 0;
      const st  = String(r[P.STATUS] || '').trim().toUpperCase();

      reqStat[em].count++;
      reqStat[em].qty += qty;
      if (st === 'APPROVED') reqStat[em].approvedQty += qty;
      else if (st === 'PENDING') reqStat[em].pending++;
      else if (st === 'REJECTED') reqStat[em].rejected++;
    });

    /* ══ ĐỌC 2: Database ══
       stockBy : tồn theo 'CC|CODE'  (cộng Import, trừ Export)
       typeBy  : loại của mã theo Category + Sub-Category ('PHONE' | 'SIM' | '')
       impBy   : { picLower: { 'CC|CODE': tổng SL người đó đã nhập } }
       Tồn là tồn của MÃ HÀNG trong Cost Center, không tách theo người nhập. */
    const stockBy = {};
    const typeBy  = {};
    const impBy   = {};

    readAllRows_().forEach(function (r) {
      const code = String(r[C.CODE] || '').trim();
      if (!code) return;

      const key   = String(r[C.CC] || '').trim().toUpperCase() + '|' + code;
      const qty   = Number(r[C.QTY]) || 0;
      const isImp = String(r[C.TYPE] || '').trim() === 'Import';

      if (stockBy[key] === undefined) stockBy[key] = 0;
      stockBy[key] += isImp ? qty : -qty;

      if (typeBy[key] === undefined) typeBy[key] = popsDeviceType_(r[C.CAT], r[C.SUB]);

      if (!isImp) return;                       // chỉ gán mã cho người NHẬP

      const pic = String(r[C.PIC] || '').trim().toLowerCase();
      if (!pic) return;
      if (!impBy[pic]) impBy[pic] = {};
      impBy[pic][key] = (impBy[pic][key] || 0) + qty;
    });

    /* ══ ĐỌC 3: Team -> dựng bảng ══ */
    const map  = deptMapCached_();
    const rows = [];

    popsRows_(SH_TEAM, 4).forEach(function (r) {
      const email = String(r[TEAM_COLS.EMAIL] || '').trim().toLowerCase();
      if (!email) return;

      const cc = resolveCc_(String(r[TEAM_COLS.CC] || '').trim(), map);
      const username = String(r[TEAM_COLS.USERNAME] || email.split('@')[0]).trim();

      const codes = impBy[username.toLowerCase()] || {};
      let itemsImported = 0, itemsHeld = 0, impQty = 0, heldQty = 0;
      let phoneQty = 0, simQty = 0;

      Object.keys(codes).forEach(function (k) {
        itemsImported++;
        impQty += codes[k];

        const st = stockBy[k] || 0;
        if (st > 0) {
          itemsHeld++;
          heldQty += st;
          if (typeBy[k] === 'PHONE') phoneQty += st;
          else if (typeBy[k] === 'SIM') simQty += st;
        }
      });

      const s = reqStat[email] || { qty:0, approvedQty:0, count:0, pending:0, rejected:0 };

      rows.push({
        email: email,
        username: username,
        cc: cc,
        department: map[cc] || '(chưa map)',
        role: String(r[TEAM_COLS.ROLE] || 'member').trim().toLowerCase(),
        isSelf: email === me.email,
        reqQty: s.qty,                  // SL đã request nhập
        approvedQty: s.approvedQty,     // trong đó đã duyệt
        reqCount: s.count,              // số yêu cầu
        reqPending: s.pending,          // đang chờ duyệt
        itemsImported: itemsImported,   // số mặt hàng đã nhập
        itemsHeld: itemsHeld,           // SỐ MẶT HÀNG CÒN TỒN
        impQty: impQty,                 // tổng SL thực nhập vào kho
        heldQty: heldQty,               // tổng SL còn tồn của các mã đó
        phoneQty: phoneQty,             // SL điện thoại còn tồn, không có thì 0
        simQty: simQty                  // SL SIM còn tồn, không có thì 0
      });
    });

    rows.sort(function (a, b) {
      if (b.itemsHeld !== a.itemsHeld) return b.itemsHeld - a.itemsHeld;
      return a.username.localeCompare(b.username, 'vi');
    });

    /* ══ Tổng hợp ══ */
    const sum = { users: rows.length, withStock: 0, itemsHeld: 0,
                  reqQty: 0, pending: 0, phoneQty: 0, simQty: 0 };
    rows.forEach(function (r) {
      if (r.itemsHeld > 0) sum.withStock++;
      sum.itemsHeld += r.itemsHeld;
      sum.reqQty    += r.reqQty;
      sum.pending   += r.reqPending;
      sum.phoneQty  += r.phoneQty;
      sum.simQty    += r.simQty;
    });

    log_(me, 'POPS_PAGE_VIEW', rows.length + ' user');

    return {
      ok: true,
      me: { email: me.email, username: me.username, cc: me.cc,
            department: me.department, role: me.role },
      rows: rows,
      summary: sum,
      homeUrl: popsBaseUrl_(),          // nút quay về SEC WH
      generatedAt: Utilities.formatDate(new Date(),
        sheetTz_(), 'dd/MM/yyyy HH:mm')
    };
  } catch (e) {
    return { ok: false, message: e.message };
  }
}

/** Link tới trang POPS và về lại SEC WH (cùng một web app, khác tham số page). Rỗng nếu chưa triển khai web app. */
function popsBaseUrl_() {
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}
function popsPageUrl_() { const b = popsBaseUrl_(); return b ? b + '?page=pops' : ''; }

/**
 * [API] Trang chủ hỏi: có hiện mục POPS trên menu không, và link là gì.
 * KHÔNG ghi AuditLog — hàm này chạy mỗi lần tải trang.
 */
function popsNavInfo() {
  try {
    const me = popsAuth_();
    if (!popsIsAllowed_(me)) return { ok: true, allowed: false };

    let base = '';
    try { base = ScriptApp.getService().getUrl() || ''; } catch (e) {}

    return { ok: true, allowed: true, url: base ? base + '?page=pops' : '' };
  } catch (e) {
    // Chưa có trong sheet Team -> coi như không có quyền, không báo lỗi ra menu
    return { ok: false, allowed: false, message: e.message };
  }
}

/* ═══════════ DEV TOOL ═══════════ */

/** [DEV TOOL] Kiểm tra nhanh trong IDE, không cần mở web. */
function popsHealthCheck() {
  requireAdmin_();   // [QUYỀN] hàm công khai: ai có link web app cũng gọi được qua google.script.run
  const res = popsGetUsers();
  const out = ['=== ' + POPS_TITLE + ' ==='];

  if (!res.ok) {
    out.push('✗ ' + res.message);
  } else {
    const s = res.summary;
    out.push('✔ Bạn: ' + res.me.email + ' · CC ' + res.me.cc + ' · ' + res.me.role);
    out.push('✔ ' + s.users + ' user · ' + s.withStock + ' user còn giữ hàng · ' +
             s.itemsHeld + ' mặt hàng còn tồn');
    out.push('✔ Điện thoại còn tồn: ' + s.phoneQty + ' · SIM còn tồn: ' + s.simQty);
    out.push('--- 10 dòng đầu ---');
    res.rows.slice(0, 10).forEach(function (r) {
      out.push('  ' + r.username + ' (' + r.cc + '): request ' + r.reqQty +
               ' · đã nhập ' + r.itemsImported + ' mã · còn tồn ' + r.itemsHeld +
               ' mã · ĐT ' + r.phoneQty + ' · SIM ' + r.simQty);
    });
  }

  Logger.log(out.join('\n'));
  return out.join('\n');
}

/**
 * [DEV TOOL] Liệt kê các cặp Category › Sub-Category được xếp vào
 * Điện thoại / SIM, kèm số mã hàng của mỗi cặp.
 * Cặp nào bị sót -> thêm từ khoá vào POPS_PHONE_KEYS / POPS_SIM_KEYS.
 */
function popsListDevices() {
  requireAdmin_();   // [QUYỀN] hàm công khai: ai có link web app cũng gọi được qua google.script.run
  const pairs = {};                           // 'Cat › Sub' -> { type, codes }
  const seen  = {};

  readAllRows_().forEach(function (r) {
    const code = String(r[C.CODE] || '').trim();
    if (!code || seen[code]) return;
    seen[code] = 1;

    const label = String(r[C.CAT] || '').trim() + ' › ' + String(r[C.SUB] || '').trim();
    if (!pairs[label]) pairs[label] = { type: popsDeviceType_(r[C.CAT], r[C.SUB]), codes: 0 };
    pairs[label].codes++;
  });

  const out = { PHONE: [], SIM: [], NONE: [] };
  Object.keys(pairs).sort().forEach(function (k) {
    const p = pairs[k];
    out[p.type || 'NONE'].push('  ' + k + '  (' + p.codes + ' mã)');
  });

  const msg = [
    '=== ĐIỆN THOẠI ===', out.PHONE.join('\n') || '  (không có)', '',
    '=== SIM ===',        out.SIM.join('\n')   || '  (không có)', '',
    '=== KHÔNG TÍNH (' + out.NONE.length + ' cặp) ===', out.NONE.join('\n')
  ].join('\n');

  Logger.log(msg);
  return msg;
}
