/* ═══════════ NHÓM 11: YÊU CẦU CỦA STAFF ═══════════ */

function createRequestId_() {
  const ts = Utilities.formatDate(new Date(), ss_().getSpreadsheetTimeZone(), 'yyyyMMdd-HHmmss');
  return 'REQ-' + ts + '-' + Utilities.getUuid().substring(0, 6).toUpperCase();
}

/**
 * [API — STAFF] Gửi yêu cầu Import/Export.
 * KHÔNG ghi Database — chỉ tạo dòng PENDING + thông báo cho admin.
 * [BẢO MẬT] CC/Department/PIC lấy từ auth_().
 * Xuất kho: được xuất SKU thuộc bộ phận của mình hoặc mình là PIC (codeVisible_).
 */
const MAX_BOXES = 1000;   // trần số thùng mỗi phiếu: vòng tạo thùng chạy trong khoá nên phải có giới hạn

/** Số thùng hợp lệ: nguyên, 0 ≤ n ≤ min(số lượng, MAX_BOXES). Dùng chung lúc gửi và lúc duyệt. */
function boxCountOk_(boxCount, quantity) {
  return Number.isInteger(boxCount) && boxCount >= 0 && boxCount <= quantity && boxCount <= MAX_BOXES;
}

function submitRequest(data) {
  try {
    const user = auth_();
    if (user.role === 'admin') throw new Error('Admin dùng chức năng nhập/xuất trực tiếp.');

    const type = String(data.type || '').trim();
    if (type !== 'Import' && type !== 'Export') throw new Error('Loại giao dịch không hợp lệ.');

    const date = String(data.date || '').trim();
    const quantity = Number(data.qty);
    const location = String(data.loc || '').trim();

    if (!date) throw new Error('Vui lòng chọn ngày.');
    if (!isoValid_(date)) throw new Error('Ngày giao dịch không hợp lệ.');
    if (!location) throw new Error('Vui lòng chọn địa điểm.');
    requireKnownLoc_(location);
    if (!quantity || quantity <= 0) throw new Error('Số lượng phải lớn hơn 0.');
    if (quantity !== Math.floor(quantity)) throw new Error('Số lượng phải là số nguyên.');

    let category, sub, name, variant, event, unit;
    let poNo = '', invoiceNo = '', supplier = '', purchasePrice = 0;
    let boxCount = 0, assetCode = '';

    if (type === 'Import') {
      category = String(data.cat || '').trim(); sub = String(data.sub || '').trim();
      name = String(data.name || '').trim(); variant = String(data.variant || '').trim();
      event = String(data.event || '').trim(); unit = String(data.unit || '').trim();
      boxCount = Number(data.boxCount) || 0;

      /* Nhập thêm vào SKU CÓ SẴN (PIC hoặc cùng bộ phận): lấy thông tin từ danh mục, không gõ lại. */
      const pick = String(data.code || '').trim();
      if (pick) {
        const sk = skuRows_().index.byCode[pick];
        if (!sk || !codeVisible_(user, pick)) throw new Error('SKU ' + pick + ' không thuộc bộ phận của bạn và bạn không phải PIC của SKU này.');
        if (!sk.active) throw new Error('SKU ' + pick + ' đã ngừng sử dụng.');
        category = sk.cat; sub = sk.sub; name = sk.name; variant = sk.variant; event = sk.event || 'N/A'; unit = sk.unit || unit;
        assetCode = sk.sku;
      }

      if (!category) throw new Error('Vui lòng chọn nhóm hàng.');
      if (!sub) throw new Error('Vui lòng chọn phân nhóm.');
      if (!pick) requireKnownCat_(category, sub);       // SKU có sẵn: nhóm hàng lấy từ danh mục SKU, không từ client
      if (!name) throw new Error('Vui lòng nhập tên hàng.');
      if (!event) throw new Error('Vui lòng nhập event.');
      if (UNITS.indexOf(unit) === -1) throw new Error('Đơn vị phải là Each, Box hoặc Bag.');
      if (boxCount < 0) throw new Error('Số thùng không được âm.');
      if (!boxCountOk_(boxCount, quantity)) throw new Error('Số thùng phải là số nguyên từ 0 đến ' + Math.min(quantity, MAX_BOXES) + '.');

      if (needsVariant_(sub) && !variant) {
        throw new Error('Phân nhóm "' + sub + '" bắt buộc nhập biến thể.');
      }
      if (!needsVariant_(sub)) variant = '';

      poNo = String(data.poNo || '').trim(); invoiceNo = String(data.invoiceNo || '').trim();
      supplier = String(data.supplier || '').trim(); purchasePrice = Number(data.purchasePrice);

      if (!poNo) throw new Error('Vui lòng nhập PO No.');
      if (!invoiceNo) throw new Error('Vui lòng nhập số hoá đơn.');
      if (!supplier) throw new Error('Vui lòng nhập nhà cung cấp.');
      if (!purchasePrice || purchasePrice <= 0) throw new Error('Vui lòng nhập giá nhập (lớn hơn 0).');

    } else {
      assetCode = String(data.code || '').trim();
      if (!assetCode) throw new Error('Chưa chọn Asset Code để xuất.');

      const base = findBaseByCode_(assetCode);
      if (!base || !codeVisible_(user, assetCode)) {
        throw new Error('SKU ' + assetCode + ' không thuộc bộ phận của bạn và bạn không phải PIC của SKU này.');
      }
      if (!skuRows_().index.byCode[assetCode].active) throw new Error('SKU ' + assetCode + ' đã ngừng sử dụng.');

      const stock = stockOf_(assetCode);
      if (stock.stock <= 0) throw new Error('Mặt hàng đã hết hàng.');
      if (quantity > stock.stock) {
        throw new Error('Vượt tồn kho: chỉ còn ' + stock.stock + ' ' + base.unit + '.');
      }

      category = base.cat; sub = base.sub; name = base.name; variant = base.variant;
      event = base.event; unit = base.unit; poNo = base.poNo; invoiceNo = base.invoiceNo;
      supplier = base.supplier; purchasePrice = base.purchasePrice;
    }

    const requestId = createRequestId_();

    withLock_(function () {
      const sh = pendingSheet_();

      sh.appendRow([requestId, new Date(), isoToDate_(date), user.email, cell_(user.username),
        user.cc, user.department, type, cell_(category), cell_(sub), cell_(name), cell_(variant), cell_(event),
        quantity, unit, cell_(location), assetCode, 'PENDING', '', '', '',
        cell_(poNo, true), cell_(invoiceNo, true), cell_(supplier), purchasePrice, boxCount]);

      const last = sh.getLastRow();
      sh.getRange(last, P.SUBMITTED_AT + 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
      sh.getRange(last, P.TRANSACTION_DATE + 1).setNumberFormat('dd/mm/yyyy');
      sh.getRange(last, P.PURCHASE_PRICE + 1).setNumberFormat('#,##0');

      const nameFull = name + (variant ? ' · ' + variant : '');
      const typeVn = (type === 'Import' ? 'nhập kho' : 'xuất kho');

      appendNotification_({
        user: user.username, cc: user.cc, type: type, name: nameFull,
        quantity: quantity + ' ' + unit, location: location, date: date,
        message: user.username + ' (' + user.cc + ' · ' + user.teamCode + ') yêu cầu ' + typeVn +
          ' — ' + quantity + ' ' + unit + (boxCount ? ' · ' + boxCount + ' thùng' : '') +
          ' · ' + nameFull + ' tại ' + location + ' · ' + toVn_(date) + ' [' + requestId + ']',
        recipientEmail: ''    // '' = gửi cho admin
      });

      log_(user, 'REQUEST_SUBMIT', requestId + ' | ' + type + ' | ' + nameFull);
    });

    // Sau khi đã ghi xong và nhả khoá: báo admin đã bật nhận mail (lỗi mail không làm hỏng yêu cầu)
    notifyAdminsNewRequest_({
      requestId: requestId, type: type, user: user.username, cc: user.cc, team: user.teamCode,
      name: name + (variant ? ' · ' + variant : ''), assetCode: assetCode, quantity: quantity, unit: unit,
      boxCount: boxCount, location: location, date: date
    });

    return { ok: true, requestId: requestId,
      message: 'Đã gửi yêu cầu. Mã: ' + requestId + '. Vui lòng chờ phê duyệt.' };
  } catch (e) { return { ok: false, message: e.message }; }
}

/**
 * [API — STAFF] Yêu cầu do CHÍNH user này gửi, mọi trạng thái.
 * Lọc theo USER_EMAIL -> staff không thấy request đồng nghiệp.
 */
function getMyRequests(limit) {
  try {
    const user = auth_();
    const sh = pendingSheet_();
    const lastRow = sh.getLastRow();

    if (lastRow < 2) {
      return { ok: true, rows: [], total: 0, summary: { pending:0, approved:0, rejected:0 } };
    }

    const tz = ss_().getSpreadsheetTimeZone();
    const values = sh.getRange(2, 1, lastRow - 1, PENDING_COLS).getValues();
    const rows = [];
    const summary = { pending: 0, approved: 0, rejected: 0 };

    values.forEach(function (r) {
      if (String(r[P.USER_EMAIL] || '').trim().toLowerCase() !== user.email) return;

      const status = String(r[P.STATUS] || '').trim().toUpperCase();
      if (status === 'PENDING') summary.pending++;
      else if (status === 'APPROVED') summary.approved++;
      else if (status === 'REJECTED') summary.rejected++;

      rows.push({
        requestId: String(r[P.ID] || ''),
        submittedAt: r[P.SUBMITTED_AT] instanceof Date
          ? Utilities.formatDate(r[P.SUBMITTED_AT], tz, 'dd/MM HH:mm') : String(r[P.SUBMITTED_AT] || ''),
        transactionDate: toVn_(toIso_(r[P.TRANSACTION_DATE])),
        type: String(r[P.TYPE] || ''),
        name: String(r[P.NAME] || ''), variant: String(r[P.VARIANT] || ''),
        quantity: String(r[P.QUANTITY] || ''), unit: String(r[P.UNIT] || ''),
        boxCount: String(r[P.BOX] || '0'),
        location: String(r[P.LOCATION] || ''), assetCode: String(r[P.ASSET_CODE] || ''),
        status: status,
        decisionBy: String(r[P.DECISION_BY] || ''),
        decisionTime: r[P.DECISION_TIME] instanceof Date
          ? Utilities.formatDate(r[P.DECISION_TIME], tz, 'dd/MM HH:mm') : String(r[P.DECISION_TIME] || ''),
        decisionNote: String(r[P.DECISION_NOTE] || '')
      });
    });

    rows.reverse();

    /* Giới hạn chỉ áp cho yêu cầu ĐÃ XỬ LÝ; yêu cầu PENDING luôn trả đủ để còn Sửa/Xóa và khớp số trên thẻ tổng hợp. */
    const lim = Number(limit) || 200;
    let done = 0;
    const out = rows.filter(function (r) { return r.status === 'PENDING' || ++done <= lim; });

    return { ok: true, rows: out, total: rows.length, summary: summary };
  } catch (e) { return { ok: false, message: e.message }; }
}

