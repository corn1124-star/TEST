/* ═══════════ NHÓM 5: ĐỌC GIAO DỊCH ═══════════ */

/* Memo trong 1 execution: một request thường quét Database 3-6 lần (tìm mã, tính tồn
   trước/sau khi ghi...). Mỗi lần quét là 1 lệnh đọc cả sheet.
   QUY TẮC: mọi chỗ GHI vào sheet Database phải gọi dbChanged_() ngay sau khi ghi
   (dbChanged_ = dbDirty_ + làm hết hiệu lực cache dữ liệu tổng hợp, xem Cache.gs).
   Không được sửa mảng trả về — đó là bản dùng chung. */
let _rowsMemo = null;

function dbDirty_() { _rowsMemo = null; }

function readAllRows_() {
  if (_rowsMemo) return _rowsMemo;

  const sh = sheet_(SH_DB);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const cols = Math.min(DB_COLS, sh.getMaxColumns());
  const rows = sh.getRange(2, 1, lastRow - 1, cols).getValues();
  if (cols < DB_COLS) rows.forEach(function (r) { while (r.length < DB_COLS) r.push(''); });
  _rowsMemo = rows;
  return rows;
}

function rowToTx_(r, rowIndex) {
  return {
    rowIndex: rowIndex || null,
    no: r[C.NO], code: String(r[C.CODE] || '').trim(), type: String(r[C.TYPE] || '').trim(),
    dept: String(r[C.DEPT] || '').trim(), cc: String(r[C.CC] || '').trim(),
    pic: String(r[C.PIC] || '').trim(), cat: String(r[C.CAT] || '').trim(),
    sub: String(r[C.SUB] || '').trim(), name: String(r[C.NAME] || '').trim(),
    qty: Number(r[C.QTY]) || 0, unit: String(r[C.UNIT] || '').trim(),
    date: toIso_(r[C.DATE]), loc: String(r[C.LOC] || '').trim(),
    event: String(r[C.EVENT] || '').trim(), variant: String(r[C.VARIANT] || '').trim(),
    poNo: String(r[C.PO_NO] || '').trim(), invoiceNo: String(r[C.INVOICE_NO] || '').trim(),
    supplier: String(r[C.SUPPLIER] || '').trim(),
    purchasePrice: Number(r[C.PURCHASE_PRICE]) || 0,
    boxCount: Number(r[C.BOX]) || 0,
    bin: String(r[C.BIN] || '').trim().toUpperCase()
  };
}

/* ═══════════ DỮ LIỆU TỔNG HỢP CHO GIAO DIỆN ═══════════
   Trước đây server gửi TỪNG DÒNG giao dịch xuống trình duyệt và trình duyệt tự cộng dồn.
   Sổ cái càng lớn thì trang càng chậm (đọc, đóng gói, truyền, tính lại). Nay server cộng dồn
   MỘT lần và chỉ gửi kết quả: tồn từng mã + vài số tổng quan. Lịch sử chi tiết tải khi cần
   (getTransactions, getItemDetail). */

const HOME_DAYS = 30;            // số ngày của biểu đồ nhập/xuất ở Tổng quan
const LEAN_TTL  = 600;           // 10 phút; mọi lần ghi làm cache hết hiệu lực ngay (DATA_EPOCH)

function leanKey_(user) {
  /* Quyền xem theo từng người (PIC) + team, và đổi khi danh mục SKU đổi. Có teamCode để chuyển người sang team khác
     là khoá đổi ngay, không cho xem tồn của team cũ thêm tới LEAN_TTL. */
  return 'lean_' + APP_VERSION + '_' + APP_BUILD_ID + '_' + dataEpoch_() + '_' +
         (user.role === 'admin' ? 'ALL' : user.email + '_' + user.teamCode) + '_' + skuEpoch_();
}

/** Cộng dồn sổ cái trong phạm vi user. @return { stock[], filters{pics,ccs}, home{…}, scope } */
function computeLeanPayload_(user) {
  const isAdmin = user.role === 'admin';
  const map = {}, pics = {}, ccs = {};
  let txCount = 0, impTx = 0, expTx = 0;

  const days = [], dayIdx = {};
  for (let i = HOME_DAYS - 1; i >= 0; i--) {
    const iso = toIso_(new Date(Date.now() - i * 86400000));
    dayIdx[iso] = days.length;
    days.push({ d: iso, imp: 0, exp: 0 });
  }

  readAllRows_().forEach(function (r) {
    const code = String(r[C.CODE] || '').trim();
    if (!code) return;

    const cc = String(r[C.CC] || '').trim();
    if (!rowVisible_(user, r)) return;                                          // quyền xem: Access.gs

    const isImp = String(r[C.TYPE] || '').trim() === 'Import';
    const qty = Number(r[C.QTY]) || 0;
    const date = toIso_(r[C.DATE]);
    const loc = String(r[C.LOC] || '').trim();
    const no = Number(r[C.NO]) || 0;
    const bin = String(r[C.BIN] || '').trim().toUpperCase();

    let m = map[code];
    if (!m) {
      m = map[code] = {
        code: code, cat: String(r[C.CAT] || '').trim(), sub: String(r[C.SUB] || '').trim(),
        name: String(r[C.NAME] || '').trim(), variant: String(r[C.VARIANT] || '').trim(),
        event: String(r[C.EVENT] || '').trim(), unit: String(r[C.UNIT] || '').trim(),
        cc: cc, dept: String(r[C.DEPT] || '').trim(), bin: bin,
        imp: 0, exp: 0, boxImp: 0, boxLeft: 0, last: date, lastOut: '', locs: {}, binNo: -1
      };
    }

    if (isImp) {
      m.imp += qty;
      m.boxImp += Number(r[C.BOX]) || 0;
      m.locs[loc] = (m.locs[loc] || 0) + qty;
    } else {
      m.exp += qty;
      m.locs[loc] = (m.locs[loc] || 0) - qty;
      if (date > m.lastOut) m.lastOut = date;
    }

    if (date > m.last) m.last = date;
    if (bin && no >= m.binNo) { m.bin = bin; m.binNo = no; }                    // bin của dòng có No lớn nhất

    const pic = String(r[C.PIC] || '').trim();
    if (pic) pics[pic] = 1;
    if (cc) ccs[cc] = 1;

    txCount++;
    if (isImp) impTx++; else expTx++;

    const di = dayIdx[date];
    if (di !== undefined) { if (isImp) days[di].imp += qty; else days[di].exp += qty; }
  });

  /* Số thùng CÒN HÀNG của từng mã (chi tiết thùng đã ghi khi nhập) */
  boxRows_().forEach(function (b) {
    const code = String(b[B.CODE] || '').trim();
    if (!map[code] || (Number(b[B.REMAINING]) || 0) <= 0) return;
    if (!boxVisible_(user, b)) return;
    map[code].boxLeft++;
  });

  const stock = Object.keys(map).sort().map(function (k) {
    const m = map[k];
    m.stock = m.imp - m.exp;

    let best = -1, mainLoc = '—';
    Object.keys(m.locs).forEach(function (L) { if (m.locs[L] > best) { best = m.locs[L]; mainLoc = L; } });
    m.mainLoc = best > 0 ? mainLoc : '—';

    delete m.locs; delete m.binNo;
    return m;
  });

  return {
    stock: stock,
    filters: { pics: Object.keys(pics).sort(), ccs: Object.keys(ccs).sort() },
    home: { txCount: txCount, impTx: impTx, expTx: expTx, days: days },
    scope: isAdmin ? 'ALL' : user.teamCode                                      // [TEAM]
  };
}

/**
 * Dữ liệu tổng hợp cho user, có lưu đệm.
 * @param force true -> bỏ qua cache (nút "Tải lại").
 * @return { payload, cache: 'hit' | 'miss' | 'bypass' }
 */
function leanPayload_(user, force) {
  const key = leanKey_(user);
  if (!force) {
    const hit = cacheGetJson_(key);
    if (hit) return { payload: hit, cache: 'hit' };
  }
  const payload = computeLeanPayload_(user);
  cachePutJson_(key, payload, LEAN_TTL);
  return { payload: payload, cache: force ? 'bypass' : 'miss' };
}

/** [API] Nạp lại dữ liệu — nút "Tải lại" và sau mọi thao tác ghi. */
function getData() {
  try {
    const u = auth_();
    log_(u, 'VIEW', 'tải lại');
    return Object.assign({ ok: true }, leanPayload_(u, true).payload);
  } catch (e) { return { ok: false, message: e.message }; }
}

/** [API] 1 round-trip duy nhất cho lần tải trang đầu. */
function bootstrapAll() {
  try {
    const t0 = Date.now();
    const u = auth_();   // chưa đăng ký / chờ duyệt -> message đặc biệt, RegisterUI bắt
    const t1 = Date.now();
    const config = getBootstrapCached_();
    const t2 = Date.now();
    const lean = leanPayload_(u, false);
    const t3 = Date.now();
    const pending = countPending_(u);
    const t4 = Date.now();

    /* perf: ms từng bước. Xem ở Console trình duyệt ([perf]) hoặc Executions > Logs. */
    const perf = { authMs: t1 - t0, configMs: t2 - t1, dataMs: t3 - t2, pendingMs: t4 - t3,
                   totalMs: t4 - t0, items: lean.payload.stock.length, txRows: lean.payload.home.txCount,
                   cache: lean.cache, backend: DATA_BACKEND_ACTIVE, version: APP_VERSION };
    Logger.log('[perf] ' + JSON.stringify(perf));

    return {
      ok: true,
      session: { email: u.email, username: u.username, cc: u.cc, ccRaw: u.ccRaw,
                 teamCode: u.teamCode, department: u.department, role: u.role,
                 canSim: popsIsAllowed_(u),       // chỉ để hiện mục SIM; server kiểm lại ở simAccess_
                 popsUrl: popsIsAllowed_(u) ? popsPageUrl_() : '' },   // link nút POPS; trang POPS tự kiểm quyền lại
      config: config, data: lean.payload, pendingCount: pending,
      backend: DATA_BACKEND_ACTIVE, perf: perf
    };
  } catch (e) { return { ok: false, message: e.message }; }
}
/** Đếm yêu cầu PENDING trong phạm vi user. Admin: tất cả. Staff: của mình. */
function countPending_(u) {
  try {
    const sh = pendingSheet_();
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return 0;

    // Chạy ở MỖI lần tải trang: chỉ đọc 1-2 cột cần dùng, không đọc cả 26 cột của mọi yêu cầu từ trước tới nay
    const rows = lastRow - 1;
    const status = sh.getRange(2, P.STATUS + 1, rows, 1).getValues();
    const emails = u.role === 'admin' ? null : sh.getRange(2, P.USER_EMAIL + 1, rows, 1).getValues();
    let n = 0;

    status.forEach(function (r, i) {
      if (String(r[0] || '').trim().toUpperCase() !== 'PENDING') return;
      if (emails && String(emails[i][0] || '').trim().toLowerCase() !== u.email) return;
      n++;
    });

    return n;
  } catch (e) { return 0; }
}

/**
 * [API — ADMIN] Truy vấn giao dịch với filter (có giá, PO, nhà cung cấp nên chỉ admin).
 * @param filter {username, type, cat, from, to, keyword, limit}
 */
function getTransactions(filter) {
  try {
    requireAdmin_();
    const f = filter || {};
    const pic = String(f.username || '').trim().toLowerCase();

    const type = String(f.type || '').trim();
    const cat  = String(f.cat || '').trim();
    const from = String(f.from || '').trim();
    const to   = String(f.to || '').trim();
    const kw   = String(f.keyword || '').trim().toLowerCase();

    const rows = [];

    readAllRows_().forEach(function (r, i) {
      if (!String(r[C.CODE] || '').trim()) return;

      // ── Lọc tuỳ chọn từ giao diện ──
      if (pic && String(r[C.PIC] || '').trim().toLowerCase() !== pic) return;
      if (type && String(r[C.TYPE] || '').trim() !== type) return;
      if (cat && String(r[C.CAT] || '').trim() !== cat) return;

      if (kw) {
        const hay = [r[C.CODE], r[C.NAME], r[C.VARIANT], r[C.EVENT],
                     r[C.CAT], r[C.SUB], r[C.LOC], r[C.PIC],
                     r[C.PO_NO], r[C.INVOICE_NO], r[C.BIN]]
          .join(' ').toLowerCase();
        if (hay.indexOf(kw) === -1) return;
      }

      const d = toIso_(r[C.DATE]);
      if (from && d < from) return;
      if (to && d > to) return;

      rows.push(rowToTx_(r, i + 2));
    });

    rows.sort(function (a, b) { return Number(b.no) - Number(a.no); });

    let imp = 0, exp = 0, boxImp = 0;
    rows.forEach(function (r) {
      if (r.type === 'Import') { imp += r.qty; boxImp += r.boxCount; }
      else exp += r.qty;
    });

    const limit = Math.min(Number(f.limit) || 300, rows.length);

    return {
      ok: true,
      rows: rows.slice(0, limit), total: rows.length,
      scope: String(f.username || '').trim() || 'ALL',
      isAdmin: true,
      summary: { imp: imp, exp: exp, boxImp: boxImp }
    };
  } catch (e) { return { ok: false, message: e.message }; }
}

/** Dòng giao dịch ĐẦU TIÊN của 1 mã. */
function findBaseByCode_(code) {
  let result = null;
  readAllRows_().forEach(function (r, i) {
    if (result) return;
    if (String(r[C.CODE] || '').trim() !== code) return;
    result = rowToTx_(r, i + 2);
  });
  return result;
}

