/* ══════════════════════════════════════════════════════════════════════
   RequestEdits.gs — STAFF SỬA / XOÁ YÊU CẦU CỦA MÌNH KHI CHƯA ĐƯỢC DUYỆT
   ══════════════════════════════════════════════════════════════════════
   QUY TẮC
     · Chỉ người gửi mới sửa / xoá được yêu cầu của chính mình.
     · Chỉ khi yêu cầu còn PENDING. Admin đã duyệt hoặc từ chối thì KHÔNG sửa / xoá được nữa.
     · Các trường sinh ra Asset Code (Loại, Danh mục, Phân nhóm, Tên, Biến thể, Event, ĐVT)
       KHÔNG sửa được — giống form Sửa ở trang Lịch sử.

   AN TOÀN KHI ADMIN ĐANG DUYỆT CÙNG LÚC
     Sửa / xoá và duyệt đều chạy trong withLock_ và đều đọc lại trạng thái BÊN TRONG khoá.
     Chỉ có 2 kết cục:
       · sửa / xoá trước -> admin duyệt bản đã sửa, hoặc không còn phiếu để duyệt
       · duyệt trước     -> sửa / xoá bị từ chối vì phiếu không còn PENDING
   Dùng lại: auth_, pendingSheet_, findPendingRow_, withLock_, toIso_, toVn_, isoToDate_, isoValid_,
             boxCountOk_, stockOf_, locations_, appendNotification_, log_, P, PENDING_COLS.
   ══════════════════════════════════════════════════════════════════════ */

const RE_LABEL = {
  date: 'Ngày', qty: 'Số lượng', box: 'Số thùng', loc: 'Địa điểm',
  poNo: 'PO No', invoiceNo: 'Số hoá đơn', supplier: 'Nhà cung cấp', price: 'Giá mua'
};

/** Trạng thái đã xử lý -> câu giải thích cho người dùng. */
function reDoneText_(status) {
  return status === 'APPROVED' ? 'duyệt' : (status === 'REJECTED' ? 'từ chối' : 'xử lý');
}

/** Đọc 1 yêu cầu và kiểm: đúng người gửi + còn PENDING. Gọi BÊN TRONG withLock_ khi ghi. */
function reqEditLoad_(u, requestId) {
  const id = String(requestId || '').trim();
  if (!id) throw new Error('Thiếu mã yêu cầu.');

  const sh = pendingSheet_();
  const f = findPendingRow_(sh, id);
  if (!f) throw new Error('Không tìm thấy yêu cầu ' + id + '.');

  const r = f.values;

  if (String(r[P.USER_EMAIL] || '').trim().toLowerCase() !== u.email) {
    log_(u, 'DENIED_REQ_EDIT', 'thử sửa/xoá yêu cầu của người khác ' + id);
    throw new Error('Bạn chỉ sửa hoặc xoá được yêu cầu do chính mình gửi.');
  }

  const status = String(r[P.STATUS] || '').trim().toUpperCase();
  if (status !== 'PENDING') {
    throw new Error('Yêu cầu ' + id + ' đã được ' + reDoneText_(status) + ', không sửa hoặc xoá được nữa.');
  }

  return { sh: sh, rowIndex: f.rowIndex, row: f.values };
}

/** Tồn hiện tại của mã hàng trong phiếu Xuất (trần số lượng được sửa). Phiếu Nhập trả null. */
function reqEditMaxQty_(r) {
  if (String(r[P.TYPE] || '').trim() !== 'Export') return null;

  const code = String(r[P.ASSET_CODE] || '').trim();
  if (!code) return 0;

  return Number(stockOf_(code).stock) || 0;
}

/** [API] Thông tin đầy đủ của 1 yêu cầu để mở form sửa. */
function reqEditGet(requestId) {
  try {
    const u = auth_();
    const r = reqEditLoad_(u, requestId).row;

    return {
      ok: true,
      req: {
        requestId: String(r[P.ID] || ''),
        type: String(r[P.TYPE] || '').trim(),
        date: toIso_(r[P.TRANSACTION_DATE]),
        category: String(r[P.CATEGORY] || ''),
        sub: String(r[P.SUB_CATEGORY] || ''),
        name: String(r[P.NAME] || ''),
        variant: String(r[P.VARIANT] || ''),
        event: String(r[P.EVENT] || ''),
        unit: String(r[P.UNIT] || ''),
        requester: String(r[P.USER] || ''),
        assetCode: String(r[P.ASSET_CODE] || ''),
        qty: Number(r[P.QUANTITY]) || 0,
        boxCount: Number(r[P.BOX]) || 0,
        loc: String(r[P.LOCATION] || ''),
        poNo: String(r[P.PO_NO] || ''),
        invoiceNo: String(r[P.INVOICE_NO] || ''),
        supplier: String(r[P.SUPPLIER] || ''),
        price: Number(r[P.PURCHASE_PRICE]) || 0,
        maxQty: reqEditMaxQty_(r)
      }
    };
  } catch (e) { return { ok: false, message: e.message }; }
}

/**
 * [API] Lưu thay đổi.
 * data = { date, qty, loc } + phiếu Nhập { boxCount, poNo, invoiceNo, supplier, price }
 */
function reqEditSave(requestId, data) {
  try {
    const u = auth_();
    data = data || {};

    return withLock_(function () {
      const x = reqEditLoad_(u, requestId);           // đọc lại TRONG khoá
      const r = x.row.slice();
      const type = String(r[P.TYPE] || '').trim();
      const id = String(r[P.ID] || '').trim();
      const imp = type === 'Import';
      const changes = [];

      /** Ghi giá trị mới vào bản sao dòng và ghi nhận thay đổi (nếu có) để báo admin. */
      function put(col, key, val, show) {
        const a = key === 'date' ? toIso_(r[col]) : String(r[col] == null ? '' : r[col]).trim();
        const b = String(val == null ? '' : val).trim();
        if (a === b) return;
        changes.push(RE_LABEL[key] + ' ' + (show ? show(a) : (a || '—')) + ' → ' + (show ? show(b) : (b || '—')));
        r[col] = key === 'date' ? isoToDate_(b) : val;
      }

      /* ── Trường chung ── */
      const date = String(data.date || '').trim();
      if (!isoValid_(date)) throw new Error('Ngày giao dịch không hợp lệ.');

      const qty = Number(data.qty);
      if (!qty || qty <= 0) throw new Error('Số lượng phải lớn hơn 0.');
      if (qty !== Math.floor(qty)) throw new Error('Số lượng phải là số nguyên.');

      const loc = String(data.loc || '').trim();
      if (!loc) throw new Error('Vui lòng chọn địa điểm.');
      if (loc !== String(r[P.LOCATION] || '').trim()) requireKnownLoc_(loc);

      if (!imp) {
        const max = reqEditMaxQty_(r);
        if (qty > max) throw new Error('Vượt tồn kho, chỉ còn ' + max + ' ' + String(r[P.UNIT] || '') + '.');
      }

      put(P.TRANSACTION_DATE, 'date', date, toVn_);
      put(P.QUANTITY, 'qty', qty);
      put(P.LOCATION, 'loc', loc);

      /* ── Riêng phiếu Nhập — cùng quy tắc với lúc gửi phiếu ── */
      if (imp) {
        const box = Number(data.boxCount);
        if (!boxCountOk_(box, qty)) throw new Error('Số thùng phải là số nguyên từ 0 đến ' + Math.min(qty, MAX_BOXES) + '.');

        const poNo = String(data.poNo || '').trim();
        const invoiceNo = String(data.invoiceNo || '').trim();
        const supplier = String(data.supplier || '').trim();
        const price = Number(data.price);

        if (!poNo) throw new Error('Vui lòng nhập PO No.');
        if (!invoiceNo) throw new Error('Vui lòng nhập số hoá đơn.');
        if (!supplier) throw new Error('Vui lòng nhập nhà cung cấp.');
        if (!price || price <= 0) throw new Error('Vui lòng nhập giá nhập (lớn hơn 0).');

        put(P.BOX, 'box', box);
        put(P.PO_NO, 'poNo', poNo);
        put(P.INVOICE_NO, 'invoiceNo', invoiceNo);
        put(P.SUPPLIER, 'supplier', supplier);
        put(P.PURCHASE_PRICE, 'price', price);
      }

      if (!changes.length) return { ok: true, changed: 0, message: 'Không có thông tin nào thay đổi.' };

      /* ── Ghi 1 lần cả dòng ── */
      x.sh.getRange(x.rowIndex, 1, 1, PENDING_COLS).setValues([cellsRow_(r, [P.PO_NO, P.INVOICE_NO])]);
      x.sh.getRange(x.rowIndex, P.TRANSACTION_DATE + 1).setNumberFormat('dd/mm/yyyy');
      x.sh.getRange(x.rowIndex, P.PURCHASE_PRICE + 1).setNumberFormat('#,##0');

      const nameFull = String(r[P.NAME] || '') + (r[P.VARIANT] ? ' · ' + r[P.VARIANT] : '');

      appendNotification_({
        user: u.username, cc: u.cc, type: type, name: nameFull,
        quantity: qty + ' ' + String(r[P.UNIT] || ''), location: loc, date: date,
        message: u.username + ' (' + u.cc + ') đã SỬA yêu cầu [' + id + '] — ' + changes.join(' · '),
        recipientEmail: ''                            // '' = gửi cho admin
      });

      log_(u, 'REQUEST_EDIT', id + ' | ' + changes.join(' · '));

      return { ok: true, changed: changes.length,
               message: 'Đã cập nhật yêu cầu ' + id + ' (' + changes.length +
                        ' thay đổi). Quản trị viên đã được thông báo.' };
    });
  } catch (e) { return { ok: false, message: e.message }; }
}

/**
 * [API] Xoá hẳn 1 yêu cầu đang chờ duyệt.
 *
 * Xoá dòng thay vì đổi trạng thái 'CANCELLED': reqBadge() ở giao diện coi mọi trạng thái lạ là
 * "Chờ duyệt", nên phiếu huỷ sẽ hiện sai. Toàn bộ nội dung phiếu được ghi vào AuditLog trước khi
 * xoá để vẫn truy vết được.
 */
function reqDelete(requestId) {
  try {
    const u = auth_();

    return withLock_(function () {
      const x = reqEditLoad_(u, requestId);           // đọc lại TRONG khoá
      const r = x.row;

      const id = String(r[P.ID] || '').trim();
      const type = String(r[P.TYPE] || '').trim();
      const qty = Number(r[P.QUANTITY]) || 0;
      const unit = String(r[P.UNIT] || '');
      const loc = String(r[P.LOCATION] || '');
      const date = toIso_(r[P.TRANSACTION_DATE]);
      const nameFull = String(r[P.NAME] || '') + (r[P.VARIANT] ? ' · ' + r[P.VARIANT] : '');

      // Ghi log TRƯỚC khi xoá — đây là bản lưu duy nhất của phiếu
      log_(u, 'REQUEST_DELETE', id + ' | ' + type + ' | ' + nameFull + ' | ' + qty + ' ' + unit +
           ' | ' + loc + ' | ' + toVn_(date) + ' | PO ' + String(r[P.PO_NO] || '—') +
           ' | INV ' + String(r[P.INVOICE_NO] || '—') + ' | ' + String(r[P.SUPPLIER] || '—') +
           ' | ' + (Number(r[P.PURCHASE_PRICE]) || 0));

      x.sh.deleteRow(x.rowIndex);

      // Ảnh gửi kèm (nếu đã cài Photos.gs): đánh dấu xoá + chuyển file vào Thùng rác
      let nPhoto = 0;
      if (typeof photoFind_ === 'function') {
        try {
          const ps = photoSheet_();
          photoFind_('REQUEST', id, '').forEach(function (h) {
            ps.getRange(h.rowIndex, PH.DELETED + 1).setValue('Y · xoá theo yêu cầu · ' + u.email);
            try { DriveApp.getFileById(String(h.row[PH.FILE_ID])).setTrashed(true); } catch (e) {}
            nPhoto++;
          });
        } catch (e) {}
      }

      appendNotification_({
        user: u.username, cc: u.cc, type: type, name: nameFull,
        quantity: qty + ' ' + unit, location: loc, date: date,
        message: u.username + ' (' + u.cc + ') đã XOÁ yêu cầu [' + id + '] — ' +
                 nameFull + ' · ' + qty + ' ' + unit,
        recipientEmail: ''
      });

      return { ok: true, message: 'Đã xoá yêu cầu ' + id + (nPhoto ? ' (kèm ' + nPhoto + ' ảnh).' : '.') };
    });
  } catch (e) { return { ok: false, message: e.message }; }
}
