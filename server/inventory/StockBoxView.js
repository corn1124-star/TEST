/* ══════════════════════════════════════════════════════════════════════
   StockBox.gs — CHI TIẾT THÙNG CHO BẢNG STOCK ON HAND
   ══════════════════════════════════════════════════════════════════════
   Chỉ ĐỌC sheet BoxDetail. Không ghi gì.
   Dùng lại từ Code.gs: auth_, ss_, boxVisible_, SH_BOX, B, BOX_COLS, toIso_, toVn_.

   PHẠM VI: admin xem mọi team; staff CHỈ team của mình (mọi Cost Center
   cùng Team Code ở cột C sheet Department).
   ══════════════════════════════════════════════════════════════════════ */

/** Đọc thẳng BoxDetail (không qua ensureSheet_ để không tạo sheet ngoài ý muốn). */
function sbRows_() {
  const sh = ss_().getSheetByName(SH_BOX);
  if (!sh) return [];
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, BOX_COLS).getValues();
}

/** [TEAM] Dòng thùng có thuộc phạm vi của user không. */
function sbInScope_(u, r) {
  return boxVisible_(u, r);
}

/**
 * [API] Mã nào có chi tiết thùng -> { code: số thùng }.
 * Gọi 1 lần khi mở trang Inventory để biết dòng nào cần nút ▸.
 */
function getBoxIndex() {
  try {
    const u = auth_();
    const index = {};

    sbRows_().forEach(function (r) {
      const code = String(r[B.CODE] || '').trim();
      if (!code || !sbInScope_(u, r)) return;
      index[code] = (index[code] || 0) + 1;
    });

    return { ok: true, index: index };
  } catch (e) { return { ok: false, message: e.message }; }
}

/** [API] Chi tiết từng thùng của 1 mã: Thùng · Nhập · Đã xuất · Còn lại. */
function getBoxBreakdown(code) {
  try {
    const u = auth_();
    const target = String(code || '').trim();
    if (!target) throw new Error('Thiếu Asset Code.');

    const rows = [];

    sbRows_().forEach(function (r) {
      if (String(r[B.CODE] || '').trim() !== target) return;
      if (!sbInScope_(u, r)) return;

      const qtyIn = Number(r[B.QTY_IN]) || 0;
      const left  = Number(r[B.REMAINING]) || 0;

      rows.push({
        boxNo:   Number(r[B.BOX_NO]) || 0,
        boxCode: String(r[B.BOX_CODE] || '').trim(),
        dateVn:  toVn_(toIso_(r[B.DATE])),
        qtyIn:   qtyIn,
        out:     qtyIn - left,
        left:    left
      });
    });

    rows.sort(function (a, b) { return a.boxNo - b.boxNo; });
    return { ok: true, rows: rows };
  } catch (e) { return { ok: false, message: e.message }; }
}

/** [DEV TOOL] Chạy trong IDE để kiểm tra server trước khi mở web. */
function stockBoxHealthCheck() {
  requireAdmin_();   // [QUYỀN] hàm công khai: ai có link web app cũng gọi được qua google.script.run
  const idx = getBoxIndex();
  const out = ['=== Chi tiết thùng ==='];

  if (!idx.ok) {
    out.push('✗ ' + idx.message);
  } else {
    const codes = Object.keys(idx.index);
    out.push('✔ ' + codes.length + ' mã có chi tiết thùng trong phạm vi team của bạn');

    codes.slice(0, 5).forEach(function (c) {
      const d = getBoxBreakdown(c);
      const left = (d.rows || []).reduce(function (s, b) { return s + b.left; }, 0);
      out.push('  ' + c + ' — ' + idx.index[c] + ' thùng · còn ' + left);
    });

    if (!codes.length) out.push('⚠ Sheet BoxDetail chưa có dòng nào → không mã nào có nút ▸');
  }

  Logger.log(out.join('\n'));
  return out.join('\n');
}
