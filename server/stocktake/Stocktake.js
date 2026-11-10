/* ══════════════════════════════════════════════════════════════════════
   Stocktake.gs — KIỂM KÊ: ĐẾM THỰC TẾ SO VỚI HỆ THỐNG
   ══════════════════════════════════════════════════════════════════════
   LUỒNG
     1. Tạo đợt  -> chụp tồn hệ thống, liệt kê mã theo vị trí kệ.
     2. Đếm thực tế (ngoài kho, trên giấy/Excel), rồi NHẬP số vào hệ thống.
        Hệ thống so ngay:  KHỚP (đủ) · DƯ · THIẾU.
     3. Người đếm XÁC NHẬN: hiệu chỉnh tồn kho theo số đếm (cả đợt hoặc chọn dòng),
        hoặc KHÔNG hiệu chỉnh (chỉ lưu kết quả để báo cáo).

   CHÊNH LỆCH = SỐ ĐẾM - TỒN HỆ THỐNG TẠI LÚC NHẬP SỐ ĐẾM (SYS_AT_COUNT)
   Hàng vẫn nhập/xuất trong lúc đếm nên không so với snapshot lúc tạo đợt. Điều chỉnh
   = chênh lệch đó, cộng vào tồn HIỆN TẠI: giao dịch xảy ra sau lúc đếm được giữ nguyên.

   GHI ĐIỀU CHỈNH
     Dư  -> dòng Import · Thiếu -> dòng Export  (Type chỉ có 2 giá trị này vì stockOf_()
     coi mọi Type khác Import là xuất). Nhận biết: PO No = 'KK:<mã đợt>', Supplier = 'Kiểm kê'.
     Thiếu trừ thùng theo FIFO; dư tạo 1 thùng mới nếu mã đó đang quản lý theo thùng.

   TỐC ĐỘ: dòng của mỗi đợt nằm liền nhau, đợt lưu ROW_START/ROW_COUNT nên chỉ đọc đúng
   khối đó, không quét cả sheet. Đợt đã đóng lưu sẵn tổng hợp (SUMMARY) -> danh sách
   đợt không đọc dòng chi tiết.

   Chỉ ADMIN. Dùng lại: requireAdmin_, withLock_, ensureSheet_, readAllRows_, rowToTx_,
   appendTxBatch_, consumeFifo_, appendBoxes_, boxRows_, boxSheet_, teamOfCc_, log_, sheetTz_.
   ══════════════════════════════════════════════════════════════════════ */

const SH_STK = 'Stocktake', SH_STKLINE = 'StocktakeLine';

/* Stocktake: 15 cột (A-O) — mỗi đợt 1 dòng */
const STK = {
  ID:0, NAME:1, STATUS:2, TEAM:3, CAT:4, LOC:5, CREATED_BY:6, CREATED_AT:7,
  CLOSED_BY:8, CLOSED_AT:9, NOTE:10, DECISION:11, SUMMARY:12, ROW_START:13, ROW_COUNT:14
};
const STK_COLS = 15;
const STK_HEADERS = ['Stocktake ID','Name','Status','Team','Category','Location','Created By',
  'Created At','Closed By','Closed At','Note','Decision','Summary','Row Start','Row Count'];

/* StocktakeLine: 17 cột (A-Q) — mỗi mã hàng của 1 đợt 1 dòng */
const SL = {
  SESSION:0, CODE:1, NAME:2, UNIT:3, CC:4, BIN:5, LOC:6, PRICE:7, SYS_SNAP:8,
  COUNTED:9, SYS_AT_COUNT:10, COUNTED_BY:11, COUNTED_AT:12, STATUS:13, NOTE:14,
  ADJ_QTY:15, ADJ_TX_ROW:16
};
const SL_COLS = 17;
const SL_HEADERS = ['Stocktake ID','Asset Code','Name','Unit','Cost Center','Bin','Location',
  'Unit Price','System Qty (snapshot)','Counted Qty','System Qty (at count)','Counted By',
  'Counted At','Status','Note','Adjusted Qty','Adjust Tx Row'];

/* Đợt:  COUNTING -> CLOSED | CANCELLED
   Dòng: PENDING (chưa nhập) · COUNTED (đã nhập) · ADJUSTED (đã hiệu chỉnh) · KEPT (lệch nhưng giữ sổ sách)
   Decision của đợt: MATCHED (không lệch) · ADJUSTED (hiệu chỉnh hết) · PARTIAL · KEPT (không hiệu chỉnh) */
const STK_MAX_LINES = 3000;
const STK_LIST_LIMIT = 30;

/* ═══════════ NHÓM A: HẠ TẦNG ═══════════ */

let _stkChecked = false;

function stkSheet_() {
  const sh = ensureSheet_(SH_STK, STK_HEADERS, STK_COLS);
  const lines = ensureSheet_(SH_STKLINE, SL_HEADERS, SL_COLS);
  if (!_stkChecked) {
    if (sh.getRange(1, STK.DECISION + 1).getValue() !== STK_HEADERS[STK.DECISION] ||
        lines.getRange(1, SL.NOTE + 1).getValue() !== SL_HEADERS[SL.NOTE]) {
      throw new Error('Sheet "Stocktake" / "StocktakeLine" đang dùng cấu trúc cũ. ' +
                      'Đổi tên hoặc xoá hai sheet này rồi tải lại — hệ thống sẽ tạo lại.');
    }
    _stkChecked = true;
  }
  return sh;
}

function stkLineSheet_() { stkSheet_(); return ensureSheet_(SH_STKLINE, SL_HEADERS, SL_COLS); }

function stkTs_(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, sheetTz_(), 'yyyy-MM-dd HH:mm');
  return String(v);
}

function stkNum_(v) { return v === '' || v === null || v === undefined ? null : Number(v); }

function stkReadSessions_() {
  const sh = stkSheet_();
  const last = sh.getLastRow();
  return { sh: sh, values: last < 2 ? [] : sh.getRange(2, 1, last - 1, STK_COLS).getValues() };
}

function stkFindSession_(id) {
  const s = stkReadSessions_();
  for (let i = 0; i < s.values.length; i++) {
    if (String(s.values[i][STK.ID]) === id) return { sh: s.sh, rowIndex: i + 2, v: s.values[i] };
  }
  throw new Error('Không tìm thấy đợt kiểm kê ' + id + '.');
}

/**
 * Dòng chi tiết của 1 đợt. Đọc đúng khối [ROW_START, ROW_COUNT]; nếu khối không còn đúng
 * (ai đó chèn/xoá dòng trong Sheet) thì quét cả sheet.
 * @return { sh, base (số dòng Sheet của values[0]), values, idx (chỉ số dòng thuộc đợt) }
 */
function stkLines_(sessV) {
  const sh = stkLineSheet_();
  const id = String(sessV[STK.ID]);
  const start = Number(sessV[STK.ROW_START]) || 0, count = Number(sessV[STK.ROW_COUNT]) || 0;

  if (start >= 2 && count > 0 && start + count - 1 <= sh.getLastRow()) {
    const values = sh.getRange(start, 1, count, SL_COLS).getValues();
    if (String(values[0][SL.SESSION]) === id && String(values[count - 1][SL.SESSION]) === id) {
      return { sh: sh, base: start, values: values, idx: values.map(function (r, i) { return i; }) };
    }
  }

  const last = sh.getLastRow();
  const all = last < 2 ? [] : sh.getRange(2, 1, last - 1, SL_COLS).getValues();
  const idx = [];
  all.forEach(function (r, i) { if (String(r[SL.SESSION]) === id) idx.push(i); });
  return { sh: sh, base: 2, values: all, idx: idx };
}

/** Ghi lại các cột c0..c1 của những dòng đã sửa bằng 1 lệnh setValues. */
function stkWriteCols_(L, idxs, c0, c1) {
  if (!idxs.length) return;
  let lo = idxs[0], hi = idxs[0];
  idxs.forEach(function (i) { if (i < lo) lo = i; if (i > hi) hi = i; });
  const block = [];
  for (let i = lo; i <= hi; i++) block.push(cellsRow_(L.values[i].slice(c0, c1 + 1), []));
  L.sh.getRange(L.base + lo, c0 + 1, block.length, c1 - c0 + 1).setValues(block);
}

function stkSetSession_(sess, patch) {
  Object.keys(patch).forEach(function (k) { sess.v[STK[k]] = patch[k]; });
  sess.sh.getRange(sess.rowIndex, 1, 1, STK_COLS).setValues([cellsRow_(sess.v, [])]);
}

function stkNewId_(sessions) {
  const prefix = 'KK-' + Utilities.formatDate(new Date(), sheetTz_(), 'yyyyMMdd') + '-';
  let max = 0;
  sessions.forEach(function (r) {
    const id = String(r[STK.ID]);
    if (id.indexOf(prefix) === 0) max = Math.max(max, parseInt(id.slice(prefix.length), 10) || 0);
  });
  return prefix + ('0' + (max + 1)).slice(-2);
}

/**
 * Tồn hệ thống của TẤT CẢ mã trong 1 lần quét Database.
 * @return { code: { stock, base, bin, loc, price } }
 *   base = dòng giao dịch đầu tiên của mã; bin/loc/price lấy từ dòng mới nhất.
 */
function stkStockMap_() {
  const m = {};

  readAllRows_().forEach(function (r, i) {
    const code = String(r[C.CODE] || '').trim();
    if (!code) return;

    let x = m[code];
    if (!x) {
      x = m[code] = { imp: 0, exp: 0, stock: 0, base: rowToTx_(r, i + 2),
                      bin: '', binNo: -1, loc: '', locNo: -1, price: 0, priceNo: -1 };
    }

    const q = Number(r[C.QTY]) || 0;
    const no = Number(r[C.NO]) || 0;
    const isImp = String(r[C.TYPE] || '').trim() === 'Import';

    if (isImp) x.imp += q; else x.exp += q;

    const bin = String(r[C.BIN] || '').trim().toUpperCase();
    if (bin && no >= x.binNo) { x.bin = bin; x.binNo = no; }

    if (isImp) {
      const loc = String(r[C.LOC] || '').trim();
      if (loc && no >= x.locNo) { x.loc = loc; x.locNo = no; }
      const price = Number(r[C.PURCHASE_PRICE]) || 0;
      if (price > 0 && no >= x.priceNo) { x.price = price; x.priceNo = no; }
    }
  });

  Object.keys(m).forEach(function (k) { m[k].stock = m[k].imp - m[k].exp; });
  return m;
}

/* ═══════════ NHÓM B: ĐỌC / TỔNG HỢP ═══════════ */

/** Dòng Sheet -> object. result: MATCH (khớp) · OVER (dư) · SHORT (thiếu) · null (chưa nhập). */
function stkLineObj_(v) {
  const counted = stkNum_(v[SL.COUNTED]);
  const sysAt = counted === null ? null : (Number(v[SL.SYS_AT_COUNT]) || 0);
  const price = Number(v[SL.PRICE]) || 0;
  const variance = counted === null ? null : counted - sysAt;

  return {
    code: String(v[SL.CODE]), name: String(v[SL.NAME]), unit: String(v[SL.UNIT]),
    cc: String(v[SL.CC]), bin: String(v[SL.BIN]), loc: String(v[SL.LOC]), price: price,
    sys: Number(v[SL.SYS_SNAP]) || 0,
    counted: counted, sysAtCount: sysAt, variance: variance,
    valueVar: variance === null ? null : variance * price,
    result: variance === null ? null : (variance === 0 ? 'MATCH' : variance > 0 ? 'OVER' : 'SHORT'),
    countedBy: String(v[SL.COUNTED_BY] || ''), countedAt: stkTs_(v[SL.COUNTED_AT]),
    status: String(v[SL.STATUS]), note: String(v[SL.NOTE] || ''),
    adjQty: stkNum_(v[SL.ADJ_QTY]), adjTxRow: stkNum_(v[SL.ADJ_TX_ROW])
  };
}

function stkSummary_(objs) {
  const s = { total: objs.length, counted: 0, pending: 0, matched: 0, over: 0, short: 0,
              netQty: 0, netValue: 0, overValue: 0, shortValue: 0, accuracy: null,
              adjusted: 0, kept: 0 };

  objs.forEach(function (l) {
    if (l.status === 'ADJUSTED') s.adjusted++;
    if (l.status === 'KEPT') s.kept++;
    if (l.counted === null) { s.pending++; return; }

    s.counted++;
    if (l.result === 'MATCH') s.matched++;
    else if (l.result === 'OVER') { s.over++;  s.overValue  += l.valueVar; }
    else                          { s.short++; s.shortValue += l.valueVar; }

    s.netQty += l.variance;
    s.netValue += l.valueVar;
  });

  if (s.counted) s.accuracy = Math.round(s.matched / s.counted * 1000) / 10;
  return s;
}

function stkSessionObj_(v) {
  let summary = null;
  try { if (v[STK.SUMMARY]) summary = JSON.parse(v[STK.SUMMARY]); } catch (e) {}

  return {
    id: String(v[STK.ID]), name: String(v[STK.NAME]), status: String(v[STK.STATUS]),
    team: String(v[STK.TEAM]), cat: String(v[STK.CAT]), loc: String(v[STK.LOC]),
    createdBy: String(v[STK.CREATED_BY]), createdAt: stkTs_(v[STK.CREATED_AT]),
    closedBy: String(v[STK.CLOSED_BY] || ''), closedAt: stkTs_(v[STK.CLOSED_AT]),
    note: String(v[STK.NOTE] || ''), decision: String(v[STK.DECISION] || ''), summary: summary
  };
}

/** [API — ADMIN] Dữ liệu cho form tạo đợt. */
function stocktakeMeta() {
  try {
    requireAdmin_();
    const teams = {};
    const tm = teamMapCached_();
    Object.keys(tm).forEach(function (cc) { if (tm[cc]) teams[tm[cc]] = true; });
    const boot = getBootstrapCached_();
    return { ok: true, teams: Object.keys(teams).sort(), categories: boot.categories, locations: boot.locations };
  } catch (e) { return { ok: false, message: e.message }; }
}

/** [API — ADMIN] Các đợt gần nhất, mới nhất trước. Chỉ đợt đang đếm mới đọc dòng chi tiết. */
function stocktakeList() {
  try {
    requireAdmin_();
    const rows = stkReadSessions_().values.slice(-STK_LIST_LIMIT).reverse();

    const out = rows.map(function (v) {
      const so = stkSessionObj_(v);
      if (so.status === 'COUNTING') {
        const L = stkLines_(v);
        so.summary = stkSummary_(L.idx.map(function (i) { return stkLineObj_(L.values[i]); }));
      }
      return so;
    });
    return { ok: true, sessions: out };
  } catch (e) { return { ok: false, message: e.message }; }
}

/** [API — ADMIN] Chi tiết 1 đợt. Đang đếm: kèm cờ `moved` (hàng đã nhập/xuất sau lúc đếm). */
function stocktakeGet(id) {
  try {
    requireAdmin_();
    const sess = stkFindSession_(String(id || '').trim());
    const so = stkSessionObj_(sess.v);
    const L = stkLines_(sess.v);
    const lines = L.idx.map(function (i) { return stkLineObj_(L.values[i]); });

    if (so.status === 'COUNTING') {
      const cur = stkStockMap_();
      lines.forEach(function (l) {
        if (l.counted === null) return;
        l.now = cur[l.code] ? cur[l.code].stock : 0;
        l.moved = l.now !== l.sysAtCount;
      });
    }

    so.summary = stkSummary_(lines);
    return { ok: true, session: so, lines: lines };
  } catch (e) { return { ok: false, message: e.message }; }
}

/* ═══════════ NHÓM C: TẠO ĐỢT ═══════════ */

/**
 * [API — ADMIN] Tạo đợt và chụp tồn hệ thống.
 * @param opts { name, team ('ALL' | team code), cat, loc, note }
 * Một mã chỉ nằm trong MỘT đợt đang đếm — hai đợt cùng đếm 1 mã sẽ điều chỉnh chồng nhau.
 */
function stocktakeCreate(opts) {
  try {
    const u = requireAdmin_();
    opts = opts || {};

    const team = String(opts.team || 'ALL').trim().toUpperCase();
    const cat = String(opts.cat || '').trim();
    const loc = String(opts.loc || '').trim();
    const note = String(opts.note || '').trim();
    const name = String(opts.name || '').trim() ||
      ('Kiểm kê ' + Utilities.formatDate(new Date(), sheetTz_(), 'dd/MM/yyyy'));

    const out = withLock_(function () {
      const map = stkStockMap_();
      const items = [];

      Object.keys(map).forEach(function (code) {
        const x = map[code];
        if (x.stock === 0) return;                       // tồn âm vẫn đưa vào để đếm
        if (team !== 'ALL' && teamOfCode_(code, x.base.cc) !== team) return;
        if (cat && x.base.cat !== cat) return;
        if (loc && x.loc !== loc) return;
        items.push({ code: code, x: x });
      });

      if (!items.length) throw new Error('Không có mã hàng nào khớp phạm vi đã chọn.');
      if (items.length > STK_MAX_LINES) {
        throw new Error('Phạm vi có ' + items.length + ' mã, vượt giới hạn ' + STK_MAX_LINES +
                        '. Hãy thu hẹp theo team, nhóm hàng hoặc địa điểm.');
      }

      const sessions = stkReadSessions_();
      const lineSheet = stkLineSheet_();

      const busy = {};
      sessions.values.forEach(function (r) {
        if (String(r[STK.STATUS]) !== 'COUNTING') return;
        const L = stkLines_(r);
        L.idx.forEach(function (i) { busy[String(L.values[i][SL.CODE])] = String(r[STK.ID]); });
      });

      const clash = items.filter(function (it) { return busy[it.code]; });
      if (clash.length) {
        throw new Error(clash.length + ' mã đang nằm trong đợt kiểm kê khác chưa đóng (vd ' +
          clash[0].code + ' ở ' + busy[clash[0].code] + '). Xác nhận hoặc huỷ đợt đó trước.');
      }

      // Sắp theo vị trí kệ (không có bin xếp cuối) rồi theo mã -> đi một lượt qua kho
      items.sort(function (a, b) {
        const ab = a.x.bin || '\uffff', bb = b.x.bin || '\uffff';
        return ab < bb ? -1 : ab > bb ? 1 : (a.code < b.code ? -1 : 1);
      });

      const id = stkNewId_(sessions.values);
      const rows = items.map(function (it) {
        const b = it.x.base;
        return [id, it.code, cell_(b.name + (b.variant ? ' · ' + b.variant : '')), b.unit, b.cc,
                it.x.bin, it.x.loc || b.loc, it.x.price || b.purchasePrice || 0,
                it.x.stock, '', '', '', '', 'PENDING', '', '', ''];
      });

      const start = lineSheet.getLastRow() + 1;
      lineSheet.getRange(start, 1, rows.length, SL_COLS).setValues(rows);

      sessions.sh.getRange(sessions.sh.getLastRow() + 1, 1, 1, STK_COLS).setValues([[
        id, cell_(name), 'COUNTING', team, cat, loc, u.email, new Date(), '', '', cell_(note), '', '', start, rows.length
      ]]);

      log_(u, 'STK_CREATE', id + ' | ' + rows.length + ' mã | team ' + team +
           (cat ? ' | ' + cat : '') + (loc ? ' | ' + loc : ''));
      return { id: id, items: rows.length };
    });

    return { ok: true, id: out.id, items: out.items,
             message: 'Đã tạo đợt ' + out.id + ' với ' + out.items + ' mã hàng.' };
  } catch (e) { return { ok: false, message: e.message }; }
}

/* ═══════════ NHÓM D: NHẬP SỐ ĐẾM ═══════════ */

/**
 * [API — ADMIN] Lưu số đếm của nhiều dòng trong 1 lần gọi.
 * @param entries [{ code, qty, note }]  qty = '' hoặc null -> bỏ số đếm (về PENDING)
 * Mỗi dòng ghi lại tồn hệ thống TẠI LÚC NHẬP để tính chênh lệch.
 */
function stocktakeSaveCounts(id, entries) {
  try {
    const u = requireAdmin_();
    const sid = String(id || '').trim();
    if (!entries || !entries.length) throw new Error('Không có số đếm nào để lưu.');

    const res = withLock_(function () {
      const sess = stkFindSession_(sid);
      if (String(sess.v[STK.STATUS]) !== 'COUNTING') throw new Error('Đợt ' + sid + ' đã đóng, không sửa số đếm được.');

      const L = stkLines_(sess.v);
      const byCode = {};
      L.idx.forEach(function (i) { byCode[String(L.values[i][SL.CODE])] = i; });

      const map = stkStockMap_();
      const now = new Date();
      const touched = [];

      entries.forEach(function (e) {
        const code = String(e.code || '').trim();
        const i = byCode[code];
        if (i === undefined) throw new Error('Mã ' + code + ' không thuộc đợt ' + sid + '.');

        const v = L.values[i];
        const qs = e.qty === null || e.qty === undefined ? '' : String(e.qty).trim();   // chuỗi toàn khoảng trắng = rỗng
        const blank = qs === '';

        if (blank) {
          v[SL.COUNTED] = ''; v[SL.SYS_AT_COUNT] = ''; v[SL.COUNTED_BY] = ''; v[SL.COUNTED_AT] = '';
          v[SL.STATUS] = 'PENDING';
        } else {
          const q = Number(qs);
          if (!isFinite(q) || q < 0 || q !== Math.floor(q)) {
            throw new Error('Số đếm của ' + code + ' phải là số nguyên không âm.');
          }
          /* Số đếm không đổi (chỉ sửa ghi chú / dán lại số cũ): giữ nguyên tồn lúc đếm, người đếm, giờ đếm —
             ghi lại sẽ dời mốc so sánh sang tồn hiện tại và biến động sau lúc đếm thành chênh lệch ma. */
          const same = String(v[SL.STATUS]) === 'COUNTED' && stkNum_(v[SL.COUNTED]) === q;
          if (!same) {
            v[SL.COUNTED] = q;
            v[SL.SYS_AT_COUNT] = map[code] ? map[code].stock : 0;
            v[SL.COUNTED_BY] = u.username;
            v[SL.COUNTED_AT] = now;
            v[SL.STATUS] = 'COUNTED';
          }
        }

        if (e.note !== undefined) v[SL.NOTE] = String(e.note || '').trim();
        touched.push(i);
      });

      stkWriteCols_(L, touched, SL.COUNTED, SL.NOTE);
      return { saved: touched.length };
    });

    return { ok: true, saved: res.saved, message: 'Đã lưu ' + res.saved + ' dòng.' };
  } catch (e) { return { ok: false, message: e.message }; }
}

/** [API — ADMIN] Huỷ đợt (chưa ghi điều chỉnh nào). */
function stocktakeCancel(id, reason) {
  try {
    const u = requireAdmin_();
    const sid = String(id || '').trim();

    withLock_(function () {
      const sess = stkFindSession_(sid);
      if (String(sess.v[STK.STATUS]) !== 'COUNTING') throw new Error('Đợt đã đóng, không huỷ được.');
      stkSetSession_(sess, { STATUS: 'CANCELLED', CLOSED_BY: u.email, CLOSED_AT: new Date(),
                             NOTE: String(sess.v[STK.NOTE] || '') + (reason ? ' [Huỷ: ' + reason + ']' : '') });
      log_(u, 'STK_CANCEL', sid + ' | ' + (reason || ''));
    });

    return { ok: true, message: 'Đã huỷ đợt ' + sid + '.' };
  } catch (e) { return { ok: false, message: e.message }; }
}

/* ═══════════ NHÓM E: XÁC NHẬN & GHI ĐIỀU CHỈNH ═══════════ */

/**
 * [API — ADMIN] Người đếm xác nhận kết quả và quyết định có hiệu chỉnh hay không.
 * @param opts { adjust: 'ALL' | 'NONE' | [asset codes], allowPartial, note }
 *   Chỉ các dòng LỆCH mới cần quyết định. Dòng khớp không có gì để hiệu chỉnh.
 *   Dòng lệch được chọn -> ADJUSTED; không được chọn -> KEPT (giữ sổ sách, vẫn nằm trong báo cáo).
 * Kiểm tra TOÀN BỘ trước khi ghi — lỗi ở bất kỳ dòng nào thì không ghi gì cả.
 */
function stocktakeConfirm(id, opts) {
  try {
    const u = requireAdmin_();
    const sid = String(id || '').trim();
    opts = opts || {};

    const out = withLock_(function () {
      const sess = stkFindSession_(sid);
      if (String(sess.v[STK.STATUS]) !== 'COUNTING') throw new Error('Đợt này đã đóng.');

      // Lần xác nhận trước có thể đã ghi điều chỉnh rồi mới lỗi: ghi tiếp sẽ điều chỉnh tồn hai lần
      const tag = 'KK:' + sid;
      if (readAllRows_().some(function (r) { return String(r[C.PO_NO] || '').trim() === tag; })) {
        throw new Error('Sổ cái đã có dòng điều chỉnh "' + tag + '" (lần xác nhận trước có thể lỗi giữa chừng). ' +
                        'Kiểm tra Lịch sử và xóa các dòng đó trước khi xác nhận lại.');
      }

      const L = stkLines_(sess.v);
      const map = stkStockMap_();

      let counted = 0, pending = 0;
      const diff = [];                                  // dòng lệch

      L.idx.forEach(function (i) {
        const v = L.values[i];
        if (String(v[SL.STATUS]) !== 'COUNTED') { pending++; return; }
        counted++;
        const delta = (Number(v[SL.COUNTED]) || 0) - (Number(v[SL.SYS_AT_COUNT]) || 0);
        if (delta !== 0) diff.push({ i: i, code: String(v[SL.CODE]), delta: delta, x: map[String(v[SL.CODE])] });
      });

      if (!counted) throw new Error('Chưa nhập số đếm nào.');
      if (pending && !opts.allowPartial) {
        throw new Error('Còn ' + pending + ' mã chưa nhập số đếm. Nhập nốt hoặc chọn xác nhận một phần.');
      }

      /* Chọn dòng cần hiệu chỉnh */
      let chosen;
      if (opts.adjust === 'ALL') chosen = diff;
      else if (Array.isArray(opts.adjust)) {
        const set = {};
        opts.adjust.forEach(function (c) { set[String(c)] = true; });
        chosen = diff.filter(function (d) { return set[d.code]; });
      } else chosen = [];                               // 'NONE' hoặc không truyền

      /* Kiểm tra trước khi ghi */
      const bad = [];
      chosen.forEach(function (d) {
        if (!d.x) bad.push(d.code + ' (mã không còn trong Database)');
        else if (d.delta < 0 && d.x.stock + d.delta < 0) {
          bad.push(d.code + ' (tồn hiện tại ' + d.x.stock + ', cần trừ ' + (-d.delta) + ')');
        }
      });
      if (bad.length) {
        throw new Error('Điều chỉnh sẽ làm tồn âm: ' + bad.slice(0, 3).join('; ') +
                        '. Kiểm tra lại số đếm hoặc bỏ chọn dòng đó.');
      }

      /* Ghi điều chỉnh */
      if (chosen.length) {
        const today = Utilities.formatDate(new Date(), sheetTz_(), 'yyyy-MM-dd');
        const withBoxes = {};
        boxRows_().forEach(function (r) { withBoxes[String(r[B.CODE] || '').trim()] = true; });

        const txList = chosen.map(function (d) {
          const b = d.x.base, up = d.delta > 0;
          return {
            code: d.code, type: up ? 'Import' : 'Export', dept: b.dept, cc: b.cc, pic: u.username,
            cat: b.cat, sub: b.sub, name: b.name, qty: Math.abs(d.delta), unit: b.unit, date: today,
            loc: d.x.loc || b.loc, event: b.event, variant: b.variant,
            poNo: 'KK:' + sid, invoiceNo: 'KIEM-KE', supplier: 'Kiểm kê',
            purchasePrice: d.x.price || b.purchasePrice || 0,
            boxCount: (up && withBoxes[d.code]) ? 1 : 0, bin: d.x.bin
          };
        });

        const rowsAt = appendTxBatch_(sheet_(SH_DB), txList);

        /* Thùng: gom MỌI mã lệch thành 2 lô (trừ FIFO / thêm thùng) để đọc-ghi BoxDetail đúng một lần mỗi lô.
           Gọi từng mã một sẽ tốn số lần gọi sheet tỉ lệ với số mã -> đợt kiểm kê lớn vượt 6 phút của Apps Script. */
        const takes = [], gives = [];
        chosen.forEach(function (d, k) {
          const tx = txList[k];
          if (d.delta < 0) takes.push({ code: d.code, qty: -d.delta, date: today, pic: u.username, txRow: rowsAt[k] });
          else if (withBoxes[d.code]) gives.push({ code: d.code, cc: tx.cc, txRow: rowsAt[k], date: today, loc: tx.loc, boxes: [d.delta], note: 'Kiểm kê ' + sid });
          const v = L.values[d.i];
          v[SL.STATUS] = 'ADJUSTED'; v[SL.ADJ_QTY] = d.delta; v[SL.ADJ_TX_ROW] = rowsAt[k];
        });
        consumeFifoBatch_(takes);
        appendBoxesBatch_(gives);
      }

      const chosenIdx = {};
      chosen.forEach(function (d) { chosenIdx[d.i] = true; });
      diff.forEach(function (d) { if (!chosenIdx[d.i]) L.values[d.i][SL.STATUS] = 'KEPT'; });
      stkWriteCols_(L, diff.map(function (d) { return d.i; }), SL.STATUS, SL.ADJ_TX_ROW);

      /* Đóng đợt, lưu tổng hợp */
      const summary = stkSummary_(L.idx.map(function (i) { return stkLineObj_(L.values[i]); }));
      const decision = !diff.length ? 'MATCHED' : chosen.length === diff.length ? 'ADJUSTED'
                     : chosen.length ? 'PARTIAL' : 'KEPT';

      stkSetSession_(sess, {
        STATUS: 'CLOSED', CLOSED_BY: u.email, CLOSED_AT: new Date(), DECISION: decision,
        NOTE: String(sess.v[STK.NOTE] || '') + (opts.note ? ' [' + opts.note + ']' : ''),
        SUMMARY: JSON.stringify(summary)
      });

      log_(u, 'STK_CONFIRM', sid + ' | ' + decision + ' | lệch ' + diff.length + ' | điều chỉnh ' +
           chosen.length + ' | ròng ' + summary.netQty + ' | giá trị ' + summary.netValue);
      return { adjusted: chosen.length, kept: diff.length - chosen.length, decision: decision, summary: summary };
    });

    const msg = out.decision === 'MATCHED' ? 'Tất cả khớp, không cần hiệu chỉnh. Đã đóng đợt.'
              : out.adjusted ? 'Đã hiệu chỉnh ' + out.adjusted + ' mã' + (out.kept ? ', giữ nguyên ' + out.kept + ' mã' : '') + '. Đã đóng đợt.'
              : 'Không hiệu chỉnh. Đã lưu kết quả và đóng đợt.';
    return { ok: true, adjusted: out.adjusted, kept: out.kept, decision: out.decision, summary: out.summary, message: msg };
  } catch (e) { return { ok: false, message: e.message }; }
}

/**
 * [API — ADMIN] Xóa hẳn 1 đợt kiểm kê (đang đếm, đã đóng hoặc đã huỷ) cùng các dòng của nó.
 * CHẶN nếu đợt đã ghi điều chỉnh vào sổ cái (còn dòng ADJUSTED): xóa dòng điều chỉnh ở Lịch sử trước,
 * khi đó dòng kiểm kê tự chuyển sang "giữ sổ sách" và đợt xóa được.
 */
function stocktakeDelete(id, reason) {
  try {
    const u = requireAdmin_();
    const sid = String(id || '').trim();

    withLock_(function () {
      const sess = stkFindSession_(sid);
      const L = stkLines_(sess.v);

      const adj = L.idx.filter(function (i) { return String(L.values[i][SL.STATUS]) === 'ADJUSTED'; }).length;
      if (adj) {
        throw new Error('Không xóa được: đợt này đã ghi ' + adj + ' dòng điều chỉnh vào sổ cái. ' +
                        'Hãy xóa các giao dịch điều chỉnh (PO "KK:' + sid + '") ở Lịch sử trước.');
      }

      // Xóa dòng chi tiết (từ dưới lên để số dòng không lệch), rồi dòng đợt
      const rows = L.idx.map(function (i) { return L.base + i; }).sort(function (a, b) { return b - a; });
      const first = rows.length ? rows[rows.length - 1] : 0;
      const contiguous = rows.length && rows[0] - first === rows.length - 1;
      if (contiguous) L.sh.deleteRows(first, rows.length);
      else rows.forEach(function (r) { L.sh.deleteRow(r); });

      const head = stkSheet_();
      head.deleteRow(sess.rowIndex);

      // Các đợt nằm sau: khối dòng của chúng dời lên rows.length dòng
      if (rows.length && head.getLastRow() >= 2) {
        const rng = head.getRange(2, STK.ROW_START + 1, head.getLastRow() - 1, 1);
        const vals = rng.getValues();
        vals.forEach(function (r) { if (Number(r[0]) > first) r[0] = Number(r[0]) - rows.length; });
        rng.setValues(vals);
      }

      log_(u, 'STK_DELETE', sid + ' | ' + sess.v[STK.STATUS] + ' | ' + rows.length + ' dòng' + (reason ? ' | lý do: ' + reason : ''));
    });

    return { ok: true, message: 'Đã xóa đợt ' + sid + '.' };
  } catch (e) { return { ok: false, message: e.message }; }
}

/* ═══════════ NHÓM F: KIỂM TRA SỨC KHOẺ ═══════════ */

/** Chạy tay: đợt đếm treo > 14 ngày; dòng ADJUSTED không khớp dòng trong Database. */
function stocktakeHealthCheck() {
  requireAdmin_();   // [QUYỀN] hàm công khai: ai có link web app cũng gọi được qua google.script.run
  const out = [];
  const sess = stkReadSessions_().values;
  const rows = readAllRows_();

  sess.forEach(function (r) {
    if (String(r[STK.STATUS]) === 'COUNTING') {
      const days = (Date.now() - new Date(r[STK.CREATED_AT]).getTime()) / 86400000;
      if (days > 14) out.push('Đợt ' + r[STK.ID] + ' đang đếm ' + Math.floor(days) + ' ngày.');
    }
    const L = stkLines_(r);
    L.idx.forEach(function (i) {
      const v = L.values[i];
      if (String(v[SL.STATUS]) !== 'ADJUSTED') return;
      const row = rows[Number(v[SL.ADJ_TX_ROW]) - 2];
      const ok = row && String(row[C.CODE]).trim() === String(v[SL.CODE]) &&
                 String(row[C.PO_NO]) === 'KK:' + v[SL.SESSION] &&
                 Number(row[C.QTY]) === Math.abs(Number(v[SL.ADJ_QTY]));
      if (!ok) out.push('Dòng điều chỉnh ' + v[SL.SESSION] + '/' + v[SL.CODE] + ' không khớp Database dòng ' + v[SL.ADJ_TX_ROW] + '.');
    });
  });

  Logger.log(out.length ? out.join('\n') : 'Kiểm kê: không phát hiện vấn đề.');
  return out;
}
