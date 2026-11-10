/* ══════════════════════════════════════════════════════════════════════
   Reports.gs — BÁO CÁO CẦN SERVER TÍNH
   ══════════════════════════════════════════════════════════════════════
   Ba báo cáo của app:
     1. Nhập – Xuất – Tồn theo kỳ   ← file này (cần quét lịch sử theo ngày), tính cả CÁI lẫn THÙNG
     2. Tồn kho                     ← client, từ dữ liệu tồn đã tải (stock[], có boxLeft)
     3. Cảnh báo tồn                ← client, từ stock[] (có lastOut)
   Phạm vi dữ liệu như mọi API: admin xem tất cả; staff chỉ team của mình.
   ══════════════════════════════════════════════════════════════════════ */

const REPORT_MAX_ROWS = 5000;

/** Ngày hết hàng của từng thùng: ngày của lần lấy khiến tổng đã lấy chạm số lượng nhập; chưa hết thì ''. */
function rpBoxEmptyDates_() {
  const moves = {};
  const mv = boxMoveSheet_();
  if (mv.getLastRow() >= 2) {
    mv.getRange(2, 1, mv.getLastRow() - 1, BOXMOVE_COLS).getValues().forEach(function (r) {
      const id = String(r[BM.BOX_ID] || '');
      if (!id) return;
      (moves[id] = moves[id] || []).push({ date: toIso_(r[BM.DATE]), qty: Number(r[BM.QTY]) || 0 });
    });
  }
  Object.keys(moves).forEach(function (id) { moves[id].sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }); });
  return moves;
}

/**
 * [API] Nhập – Xuất – Tồn trong kỳ [from, to] (yyyy-mm-dd, gồm cả hai đầu), tính CẢ số cái lẫn số thùng.
 *   Cái:   Tồn đầu = nhập - xuất của mọi giao dịch TRƯỚC `from`; Tồn cuối = Tồn đầu + Nhập kỳ - Xuất kỳ
 *   Thùng: một thùng "còn" từ ngày nhập đến ngày HẾT hàng (lần lấy làm tổng đã lấy chạm số lượng nhập).
 *          Thùng đầu = đang còn trước `from`; Nhập = thùng nhập trong kỳ; Xuất = thùng hết hàng trong kỳ;
 *          Thùng cuối = đang còn sau `to`  (= đầu + nhập - xuất). Chỉ mã có chi tiết thùng mới có số thùng.
 * @param p { from, to, cat }
 */
function reportNxt(p) {
  try {
    const u = auth_();
    p = p || {};

    const iso = function (s) { const v = String(s || '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; };
    const today = toIso_(new Date());
    const to = iso(p.to) || today;
    const from = iso(p.from) || (to.slice(0, 8) + '01');
    if (from > to) throw new Error('"Từ ngày" phải trước hoặc bằng "Đến ngày".');
    const cat = String(p.cat || '').trim();

    const map = {};
    readAllRows_().forEach(function (r) {
      const code = String(r[C.CODE] || '').trim();
      if (!code) return;
      if (!rowVisible_(u, r)) return;                                           // quyền xem: Access.gs

      const date = toIso_(r[C.DATE]);
      if (!date || date > to) return;                                           // sau kỳ: bỏ qua hẳn

      const rowCat = String(r[C.CAT] || '').trim();
      if (cat && rowCat !== cat) return;

      const isImp = String(r[C.TYPE] || '').trim() === 'Import';
      const qty = Number(r[C.QTY]) || 0;

      let m = map[code];
      if (!m) {
        m = map[code] = { code: code, name: String(r[C.NAME] || '').trim(), variant: String(r[C.VARIANT] || '').trim(),
          cat: rowCat, sub: String(r[C.SUB] || '').trim(), unit: String(r[C.UNIT] || '').trim(),
          cc: String(r[C.CC] || '').trim(), opening: 0, imp: 0, exp: 0,
          boxOpening: 0, boxIn: 0, boxOut: 0 };
      }

      if (date < from) m.opening += isImp ? qty : -qty;
      else if (isImp) m.imp += qty;
      else m.exp += qty;
    });

    /* ── thùng ── */
    const moves = rpBoxEmptyDates_();
    boxRows_().forEach(function (b) {
      const m = map[String(b[B.CODE] || '').trim()];
      if (!m) return;                                                           // ngoài phạm vi / nhóm / sau kỳ
      if (!boxVisible_(u, b)) return;

      const imported = toIso_(b[B.DATE]);
      if (!imported || imported > to) return;
      const qtyIn = Number(b[B.QTY_IN]) || 0;

      let emptied = '';
      let acc = 0;
      (moves[String(b[B.ID] || '')] || []).forEach(function (mv) {
        acc += mv.qty;
        if (!emptied && acc >= qtyIn) emptied = mv.date;
      });
      if (!emptied && (Number(b[B.REMAINING]) || 0) <= 0) {
        const ms = moves[String(b[B.ID] || '')] || [];                            // dữ liệu lệch: lấy ngày lần cuối;
        emptied = ms.length ? ms[ms.length - 1].date : imported;                   // không có lần lấy nào -> coi như hết từ ngày nhập (khớp trang Kho)
      }

      if (imported < from && (!emptied || emptied >= from)) m.boxOpening++;
      if (imported >= from) m.boxIn++;
      if (emptied && emptied >= from && emptied <= to) m.boxOut++;
    });

    const rows = [];
    const tot = { opening: 0, imp: 0, exp: 0, closing: 0, boxOpening: 0, boxIn: 0, boxOut: 0, boxClosing: 0 };

    Object.keys(map).sort().forEach(function (k) {
      const m = map[k];
      if (!m.opening && !m.imp && !m.exp && !m.boxOpening && !m.boxIn && !m.boxOut) return;   // không phát sinh, không tồn đầu

      const closing = m.opening + m.imp - m.exp;
      const boxClosing = m.boxOpening + m.boxIn - m.boxOut;

      rows.push({ code: m.code, name: m.name, variant: m.variant, cat: m.cat, sub: m.sub, unit: m.unit, cc: m.cc,
                  opening: m.opening, imp: m.imp, exp: m.exp, closing: closing,
                  boxOpening: m.boxOpening, boxIn: m.boxIn, boxOut: m.boxOut, boxClosing: boxClosing });
      tot.opening += m.opening; tot.imp += m.imp; tot.exp += m.exp; tot.closing += closing;
      tot.boxOpening += m.boxOpening; tot.boxIn += m.boxIn; tot.boxOut += m.boxOut; tot.boxClosing += boxClosing;
    });

    return { ok: true, from: from, to: to, cat: cat, total: rows.length, truncated: rows.length > REPORT_MAX_ROWS,
             rows: rows.slice(0, REPORT_MAX_ROWS), totals: tot };
  } catch (e) { return { ok: false, message: e.message }; }
}