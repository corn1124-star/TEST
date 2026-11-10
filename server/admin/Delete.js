/* ══════════════════════════════════════════════════════════════════════
   Delete.gs — QUYỀN XÓA CỦA ADMIN
   ══════════════════════════════════════════════════════════════════════
   NGUYÊN TẮC: "tạo được thì xóa được", nhưng không bao giờ làm hỏng số liệu.

   SỔ CÁI (giao dịch nhập/xuất)  -> XÓA MỀM
     · Dòng bị xóa được CHUYỂN sang sheet "Database_Deleted" kèm người xóa, giờ xóa, lý do,
       chi tiết thùng và lần lấy thùng liên quan. Khôi phục được (restoreTransaction).
     · CHẶN nếu xóa làm tồn kho ÂM, hoặc thùng của lần nhập đã bị lấy hàng.
     · Xóa lần XUẤT: hoàn lại số còn lại của thùng đã bị trừ.
     · Số dòng Sheet thay đổi nên tham chiếu số dòng ở BoxDetail, BoxMove, Photos, StocktakeLine được dời theo.
   YÊU CẦU CỦA STAFF, ĐỢT KIỂM KÊ, ẢNH, BẢN SAO LƯU, NGƯỜI DÙNG -> XÓA HẲN
     (sau khi xác nhận ở giao diện; hành động ghi vào AuditLog).
   Chỉ ADMIN. Lý do bắt buộc với giao dịch.
   ══════════════════════════════════════════════════════════════════════ */

const SH_DB_DELETED = 'Database_Deleted';
const DEL_LEAD = ['Deleted At', 'Deleted By', 'Reason'];
const DEL_TAIL = ['Boxes (JSON)', 'Moves (JSON)'];
const DEL_LEAD_N = DEL_LEAD.length;

function delSheet_() {
  const headers = DEL_LEAD.concat(HEADERS).concat(DEL_TAIL);
  return ensureSheet_(SH_DB_DELETED, headers, headers.length);
}

/** Dời mọi tham chiếu "số dòng Database" lớn hơn R xuống 1 sau khi xóa dòng R. */
function delShiftRefs_(R) {
  [[SH_BOX, B.TX_ROW + 1], [SH_BOXMOVE, BM.TX_ROW + 1], [PH_SHEET, PH.TX_ROW + 1], [SH_STKLINE, SL.ADJ_TX_ROW + 1]]
    .forEach(function (t) {
      const sh = ss_().getSheetByName(t[0]);
      if (!sh || sh.getLastRow() < 2) return;
      const rng = sh.getRange(2, t[1], sh.getLastRow() - 1, 1);
      const vals = rng.getValues();
      let changed = false;
      vals.forEach(function (r) {
        const n = Number(r[0]);
        if (r[0] !== '' && isFinite(n) && n > R) { r[0] = n - 1; changed = true; }
        else if (r[0] !== '' && isFinite(n) && n === R) { r[0] = ''; changed = true; }   // còn trỏ vào dòng đã xóa (vd ảnh): gỡ liên kết, không để trỏ sang giao dịch khác
      });
      if (changed) rng.setValues(vals);
    });
}

/** Dòng của sheet `sh` (cột col, 1-based) có giá trị == R. @return [{ rowIndex, values }] theo thứ tự tăng dần */
function delFindByRef_(sh, cols, col, R) {
  const out = [];
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, cols).getValues().forEach(function (v, i) {
    if (Number(v[col]) === R && v[col] !== '') out.push({ rowIndex: i + 2, values: v });
  });
  return out;
}

/**
 * [API — ADMIN] Xóa mềm 1 giao dịch.
 * @param rowIndex số dòng trong sheet Database (cũng là tx.rowIndex ở Lịch sử)
 */
/**
 * Số dòng chỉ đúng tại thời điểm giao diện tải: người khác xóa/thêm dòng thì các dòng dưới bị dời.
 * `expect` = { code, no } do giao diện gửi kèm; không khớp dòng hiện tại thì dừng, không thao tác nhầm giao dịch khác.
 * Không truyền expect (gọi từ script/test) thì bỏ qua kiểm tra.
 */
function txRowStale_(old, expect) {
  if (!expect) return false;
  if (String(expect.code || '').trim() !== String(old[C.CODE] || '').trim()) return true;
  return expect.no !== undefined && expect.no !== null && expect.no !== '' && Number(expect.no) !== Number(old[C.NO]);
}
const TX_STALE_MSG = 'Dữ liệu đã thay đổi (có người vừa sửa/xóa giao dịch khác). Hãy tải lại trang rồi thao tác lại.';

function deleteTransaction(rowIndex, reason, expect) {
  try {
    const u = requireAdmin_();
    const R = Number(rowIndex);
    if (!R || R < 2) throw new Error('Dòng không hợp lệ.');
    const why = String(reason || '').trim();
    if (why.length < 3) throw new Error('Vui lòng nhập lý do xóa (ít nhất 3 ký tự).');

    return withLock_(function () {
      const db = sheet_(SH_DB);
      if (R > db.getLastRow()) throw new Error(expect ? TX_STALE_MSG : 'Dòng ' + R + ' không tồn tại.');   // có expect = đến từ giao diện: dòng đã dời vì người khác xóa

      const old = db.getRange(R, 1, 1, DB_COLS).getValues()[0];
      if (txRowStale_(old, expect)) throw new Error(TX_STALE_MSG);
      const code = String(old[C.CODE] || '').trim();
      const type = String(old[C.TYPE] || '').trim();
      const qty = Number(old[C.QTY]) || 0;
      if (!code) throw new Error('Dòng này không có Asset Code.');

      const boxSh = boxSheet_(), mvSh = boxMoveSheet_();
      const boxes = type === 'Import' ? delFindByRef_(boxSh, BOX_COLS, B.TX_ROW, R) : [];
      const moves = type !== 'Import' ? delFindByRef_(mvSh, BOXMOVE_COLS, BM.TX_ROW, R) : [];

      /* ── kiểm tra: chặn nếu làm hỏng số liệu ── */
      if (type === 'Import') {
        const now = stockOf_(code).stock;
        if (now - qty < 0) {
          throw new Error('Không xóa được: mã ' + code + ' hiện còn ' + now + ', xóa lần nhập ' + qty +
            ' này sẽ làm tồn âm (' + (now - qty) + '). Xóa hoặc sửa các giao dịch xuất của mã này trước.');
        }
        boxes.forEach(function (b) {
          if ((Number(b.values[B.REMAINING]) || 0) !== (Number(b.values[B.QTY_IN]) || 0)) {
            throw new Error('Không xóa được: thùng ' + b.values[B.BOX_CODE] + ' của lần nhập này đã bị lấy hàng.');
          }
        });
        /* Xóa lần nhập KHÔNG có thùng khi mã còn thùng khác: tồn kho giảm nhưng thùng vẫn ghi còn như cũ -> thùng "ma".
           Chỉ chặn nếu việc xóa làm phần thùng vượt tồn kho TĂNG thêm (dữ liệu đã lệch từ trước thì không chặn oan). */
        const remGone = boxes.reduce(function (s, b) { return s + (Number(b.values[B.REMAINING]) || 0); }, 0);
        const remAfter = boxRemainingOf_(code) - remGone;
        if (Math.max(0, remAfter - (now - qty)) > boxExcess_(code, now)) {
          throw new Error('Không xóa được: sau khi xóa, tồn kho của ' + code + ' còn ' + (now - qty) + ' nhưng các thùng khác vẫn ghi còn ' + remAfter +
            '. Hãy xuất hoặc điều chỉnh số hàng trong các thùng đó trước.');
        }
      }

      /* ── lưu kho lưu trữ (xóa mềm) ── */
      const archived = [new Date(), u.email, why].concat(old).concat([
        JSON.stringify(boxes.map(function (b) {
          return { qtyIn: Number(b.values[B.QTY_IN]) || 0, loc: String(b.values[B.LOC] || ''), boxNo: Number(b.values[B.BOX_NO]) || 0, note: String(b.values[B.NOTE] || '') };
        })),
        JSON.stringify(moves.map(function (m) {
          return { qty: Number(m.values[BM.QTY]) || 0, boxNo: Number(m.values[BM.BOX_NO]) || 0 };
        }))
      ]);
      const ar = delSheet_();
      ar.getRange(ar.getLastRow() + 1, 1, 1, archived.length)
        .setValues([cellsRow_(archived, [DEL_LEAD_N + C.PO_NO, DEL_LEAD_N + C.INVOICE_NO])]);

      /* ── hoàn tác ảnh hưởng lên thùng ── */
      if (moves.length) {                                   // xóa lần XUẤT: trả hàng về thùng
        const allBoxes = boxSh.getLastRow() < 2 ? [] : boxSh.getRange(2, 1, boxSh.getLastRow() - 1, BOX_COLS).getValues();
        moves.forEach(function (m) {
          const bi = allBoxes.findIndex(function (b) { return String(b[B.ID]) === String(m.values[BM.BOX_ID]); });
          if (bi < 0) return;
          const back = Math.min((Number(allBoxes[bi][B.REMAINING]) || 0) + (Number(m.values[BM.QTY]) || 0), Number(allBoxes[bi][B.QTY_IN]) || 0);
          boxSh.getRange(bi + 2, B.REMAINING + 1).setValue(back);
          allBoxes[bi][B.REMAINING] = back;
        });
        moves.slice().reverse().forEach(function (m) { mvSh.deleteRow(m.rowIndex); });
      }
      boxes.slice().reverse().forEach(function (b) { boxSh.deleteRow(b.rowIndex); });

      /* ── dòng điều chỉnh do kiểm kê: gỡ liên kết để đợt kiểm kê vẫn xóa được ── */
      const sl = ss_().getSheetByName(SH_STKLINE);
      if (sl && sl.getLastRow() >= 2) {
        const lv = sl.getRange(2, 1, sl.getLastRow() - 1, SL_COLS).getValues();
        lv.forEach(function (v, i) {
          if (Number(v[SL.ADJ_TX_ROW]) === R && v[SL.ADJ_TX_ROW] !== '') {
            sl.getRange(i + 2, SL.STATUS + 1, 1, SL.ADJ_TX_ROW - SL.STATUS + 1).setValues([['KEPT', v[SL.NOTE], '', '']]);
          }
        });
      }

      /* ── xóa dòng và dời tham chiếu ── */
      db.deleteRow(R);
      // Dời tham chiếu NGAY sau khi xóa dòng; dbChanged_ (ghi Script Property) lỗi cũng không được bỏ qua bước này,
      // nếu không thùng / lần xuất / ảnh bên dưới dòng R sẽ trỏ lệch sang giao dịch khác.
      try { delShiftRefs_(R); } finally { dbChanged_(); }

      log_(u, 'TX_DELETE', code + ' | ' + type + ' ' + qty + ' | dòng ' + R + ' | lý do: ' + why);
      return { ok: true, message: 'Đã xóa giao dịch ' + type + ' ' + qty + ' của ' + code + '. Có thể khôi phục ở mục "Đã xóa".' };
    });
  } catch (e) { return { ok: false, message: e.message }; }
}

/** [API — ADMIN] Các giao dịch đã xóa mềm, mới nhất trước. */
function listDeletedTransactions(limit) {
  try {
    requireAdmin_();
    const sh = ss_().getSheetByName(SH_DB_DELETED);
    if (!sh || sh.getLastRow() < 2) return { ok: true, rows: [] };

    const width = DEL_LEAD_N + DB_COLS + DEL_TAIL.length;
    const first = Math.max(2, sh.getLastRow() - (Number(limit) || 100) + 1);
    const vals = sh.getRange(first, 1, sh.getLastRow() - first + 1, width).getValues();

    const rows = vals.map(function (v, i) {
      const tx = rowToTx_(v.slice(DEL_LEAD_N, DEL_LEAD_N + DB_COLS), 0);
      let nb = 0; try { nb = JSON.parse(v[DEL_LEAD_N + DB_COLS] || '[]').length; } catch (e) {}
      return { archiveRow: first + i, deletedAt: stkTs_(v[0]), deletedBy: String(v[1]), reason: String(v[2]),
               code: tx.code, name: tx.name, variant: tx.variant, type: tx.type, qty: tx.qty, unit: tx.unit,
               date: tx.date, loc: tx.loc, cc: tx.cc, boxes: nb };
    }).reverse();
    return { ok: true, rows: rows };
  } catch (e) { return { ok: false, message: e.message }; }
}

/** [API — ADMIN] Khôi phục 1 giao dịch đã xóa mềm: ghi lại như giao dịch mới (số thứ tự mới). */
function restoreTransaction(archiveRow, expect) {
  try {
    const u = requireAdmin_();
    const A = Number(archiveRow);

    return withLock_(function () {
      const ar = delSheet_();
      if (!A || A < 2 || A > ar.getLastRow()) throw new Error('Không tìm thấy bản ghi đã xóa.');

      const width = DEL_LEAD_N + DB_COLS + DEL_TAIL.length;
      const v = ar.getRange(A, 1, 1, width).getValues()[0];
      const o = rowToTx_(v.slice(DEL_LEAD_N, DEL_LEAD_N + DB_COLS), 0);
      if (expect && (String(expect.code || '').trim() !== o.code || String(expect.deletedAt || '') !== stkTs_(v[0]))) {
        throw new Error('Danh sách "Đã xóa" đã thay đổi (có người vừa khôi phục/xóa). Hãy tải lại rồi thao tác lại.');
      }
      const boxList = JSON.parse(v[DEL_LEAD_N + DB_COLS] || '[]');

      if (o.type !== 'Import') {
        const st = stockOf_(o.code).stock;
        if (st < o.qty) throw new Error('Không khôi phục được: tồn hiện tại của ' + o.code + ' là ' + st + ', không đủ cho lần xuất ' + o.qty + '.');
      }

      const db = sheet_(SH_DB);
      const row = appendTx_(db, {
        code: o.code, type: o.type, dept: o.dept, cc: o.cc, pic: o.pic, cat: o.cat, sub: o.sub, name: o.name,
        qty: o.qty, unit: o.unit, date: o.date, loc: o.loc, event: o.event, variant: o.variant, poNo: o.poNo,
        invoiceNo: o.invoiceNo, supplier: o.supplier, purchasePrice: o.purchasePrice, boxCount: o.boxCount, bin: o.bin,
        keepEmptyDate: true   // dòng gốc không có ngày (dữ liệu cũ): ghi ô ngày trống như bản gốc, không báo "Ngày không hợp lệ"
      });

      try {
        if (o.type === 'Import') {
          /* Giữ đúng số thùng / địa điểm / ghi chú đã lưu (nhãn thùng đã dán không đổi); số đã bị thùng khác dùng thì đánh số mới. */
          if (boxList.length) appendBoxes_(o.code, o.cc, row, o.date, o.loc, boxList.map(function (b) { return b.qtyIn; }),
            boxList.map(function (b) { return { boxNo: Number(b.boxNo) || 0, loc: b.loc, note: b.note }; }));
        } else {
          consumeFifo_(o.code, o.qty, o.date, o.pic, row);
        }
      } catch (err) {
        undoTx_(db, row);   // bản lưu trữ vẫn còn nguyên, bấm khôi phục lại được
        throw new Error('Khôi phục không thành công, đã hoàn tác: ' + err.message);
      }

      ar.deleteRow(A);
      log_(u, 'TX_RESTORE', o.code + ' | ' + o.type + ' ' + o.qty + ' | dòng mới ' + row);
      return { ok: true, message: 'Đã khôi phục ' + o.type + ' ' + o.qty + ' của ' + o.code + '.' };
    });
  } catch (e) { return { ok: false, message: e.message }; }
}

/* ═══════════ YÊU CẦU CỦA STAFF ═══════════ */

/** [API — ADMIN] Các yêu cầu đã xử lý (đã duyệt / từ chối), mới nhất trước. */
function getProcessedRequests(limit) {
  try {
    requireAdmin_();
    const sh = pendingSheet_();
    if (sh.getLastRow() < 2) return { ok: true, rows: [] };

    const out = [];
    sh.getRange(2, 1, sh.getLastRow() - 1, PENDING_COLS).getValues().forEach(function (r) {
      const st = String(r[P.STATUS] || '').trim().toUpperCase();
      if (!st || st === 'PENDING') return;
      out.push({ requestId: String(r[P.ID]), status: st, user: String(r[P.USER]), cc: String(r[P.CC]), type: String(r[P.TYPE]),
                 name: String(r[P.NAME]) + (r[P.VARIANT] ? ' · ' + r[P.VARIANT] : ''), quantity: Number(r[P.QUANTITY]) || 0,
                 unit: String(r[P.UNIT]), decisionBy: String(r[P.DECISION_BY] || ''), note: String(r[P.DECISION_NOTE] || '') });
    });
    out.reverse();
    return { ok: true, rows: out.slice(0, Number(limit) || 100) };
  } catch (e) { return { ok: false, message: e.message }; }
}

/** [API — ADMIN] Xóa hẳn 1 yêu cầu ĐANG CHỜ hoặc ĐÃ TỪ CHỐI (yêu cầu đã duyệt đã ghi sổ cái: không xóa). Nội dung được ghi vào AuditLog trước khi xóa; người gửi được báo kèm lý do; ảnh gửi kèm vào Thùng rác. */
function adminDeleteRequest(requestId, reason) {
  try {
    const u = requireAdmin_();

    return withLock_(function () {
      const sh = pendingSheet_();
      const found = findPendingRow_(sh, requestId);
      if (!found) throw new Error('Không tìm thấy yêu cầu ' + requestId + '.');

      const r = found.values;
      if (String(r[P.STATUS] || '').trim().toUpperCase() === 'APPROVED') {
        throw new Error('Yêu cầu ' + requestId + ' đã được duyệt và ghi vào sổ cái, không xóa được. Muốn hủy hãy xóa giao dịch tương ứng ở Lịch sử.');
      }
      const why = String(reason || '').trim() || 'Quản trị viên xóa yêu cầu';
      log_(u, 'REQUEST_DELETE', requestId + ' | ' + r[P.STATUS] + ' | ' + r[P.TYPE] + ' ' + r[P.QUANTITY] + ' ' + r[P.UNIT] +
           ' | ' + r[P.NAME] + ' | của ' + r[P.USER_EMAIL] + ' | lý do: ' + why);
      sh.deleteRow(found.rowIndex);

      // Ảnh gửi kèm (nếu đã cài Photos.gs): đánh dấu xóa + chuyển file vào Thùng rác — giống staff tự xóa (reqDelete)
      let nPhoto = 0;
      if (typeof photoFind_ === 'function') {
        try {
          const ps = photoSheet_();
          photoFind_('REQUEST', String(r[P.ID] || '').trim(), '').forEach(function (h) {
            ps.getRange(h.rowIndex, PH.DELETED + 1).setValue('Y · admin xóa yêu cầu · ' + u.email);
            try { DriveApp.getFileById(String(h.row[PH.FILE_ID])).setTrashed(true); } catch (e) {}
            nPhoto++;
          });
        } catch (e) {}
      }

      // Báo người gửi: yêu cầu của họ biến mất khỏi "Yêu cầu của tôi" nên phải nói rõ vì sao
      appendNotification_({
        user: u.username, cc: String(r[P.CC] || ''), type: String(r[P.TYPE] || ''),
        name: String(r[P.NAME] || '') + (r[P.VARIANT] ? ' · ' + r[P.VARIANT] : ''),
        quantity: String(r[P.QUANTITY] || '') + ' ' + String(r[P.UNIT] || ''),
        location: String(r[P.LOCATION] || ''), date: toIso_(r[P.TRANSACTION_DATE]),
        message: 'Yêu cầu [' + requestId + '] của bạn đã bị quản trị viên ' + u.username + ' XÓA. Lý do: ' + why,
        recipientEmail: String(r[P.USER_EMAIL] || '').toLowerCase()
      });

      return { ok: true, message: 'Đã xóa yêu cầu ' + requestId + (nPhoto ? ' (kèm ' + nPhoto + ' ảnh).' : '.') };
    });
  } catch (e) { return { ok: false, message: e.message }; }
}
