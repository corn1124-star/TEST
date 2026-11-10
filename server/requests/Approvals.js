/* ═══════════ NHÓM 12: PHÊ DUYỆT (CHỈ ADMIN) ═══════════ */

function getPendingRequests() {
  try {
    requireAdmin_();

    const sh = pendingSheet_();
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return { ok: true, rows: [] };

    const tz = ss_().getSpreadsheetTimeZone();
    const values = sh.getRange(2, 1, lastRow - 1, PENDING_COLS).getValues();
    const rows = [];

    values.forEach(function (r) {
      if (String(r[P.STATUS] || '').trim().toUpperCase() !== 'PENDING') return;

      rows.push({
        requestId: String(r[P.ID] || ''),
        submittedAt: r[P.SUBMITTED_AT] instanceof Date
          ? Utilities.formatDate(r[P.SUBMITTED_AT], tz, 'dd/MM HH:mm') : String(r[P.SUBMITTED_AT] || ''),
        transactionDate: toVn_(toIso_(r[P.TRANSACTION_DATE])),
        user: String(r[P.USER] || ''), cc: String(r[P.CC] || ''),
        team: teamOfCc_(r[P.CC]),                                         // [TEAM]
        type: String(r[P.TYPE] || ''),
        category: String(r[P.CATEGORY] || ''), subCategory: String(r[P.SUB_CATEGORY] || ''),
        name: String(r[P.NAME] || ''), variant: String(r[P.VARIANT] || ''),
        event: String(r[P.EVENT] || ''),
        quantity: String(r[P.QUANTITY] || ''), unit: String(r[P.UNIT] || ''),
        boxCount: String(r[P.BOX] || '0'),
        location: String(r[P.LOCATION] || ''), assetCode: String(r[P.ASSET_CODE] || ''),
        poNo: String(r[P.PO_NO] || ''), invoiceNo: String(r[P.INVOICE_NO] || ''),
        supplier: String(r[P.SUPPLIER] || ''), purchasePrice: String(r[P.PURCHASE_PRICE] || '')
      });
    });

    rows.reverse();
    return { ok: true, rows: rows };
  } catch (e) { return { ok: false, message: e.message }; }
}

function findPendingRow_(sh, requestId) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return null;

  const values = sh.getRange(2, 1, lastRow - 1, PENDING_COLS).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][P.ID] || '') === String(requestId)) {
      return { rowIndex: i + 2, values: values[i] };
    }
  }
  return null;
}

/**
 * [API — ADMIN] Approve: ghi Database + chi tiết thùng + thông báo cho staff.
 * [LỚP 4] Export kiểm tra lại tồn kho TẠI THỜI ĐIỂM APPROVE, có rollback.
 * Dòng mới ghi CC THẬT của người gửi; tồn và thùng tính theo SKU.
 */
function approvePendingRequest(requestId, note) {
  try {
    const admin = requireAdmin_();

    const result = withLock_(function () {
      const shPending = pendingSheet_();
      const found = findPendingRow_(shPending, requestId);
      if (!found) throw new Error('Không tìm thấy yêu cầu ' + requestId);

      const req = found.values;
      if (String(req[P.STATUS] || '').toUpperCase() !== 'PENDING') {
        throw new Error('Yêu cầu này đã được xử lý trước đó.');
      }

      const type = String(req[P.TYPE] || '').trim();
      const cc = String(req[P.CC] || '').trim();
      const quantity = Number(req[P.QUANTITY]) || 0;
      const date = toIso_(req[P.TRANSACTION_DATE]);
      const location = String(req[P.LOCATION] || '').trim();
      const boxCount = Number(req[P.BOX]) || 0;

      // Kiểm tra TRƯỚC khi ghi bất cứ thứ gì: dữ liệu xấu thì từ chối, không để lại dòng Database dở dang
      if (!isoValid_(date)) throw new Error('Không thể duyệt: ngày giao dịch của yêu cầu không hợp lệ (' + date + '). Hãy từ chối yêu cầu này.');
      if (type === 'Import' && !boxCountOk_(boxCount, quantity)) {
        throw new Error('Không thể duyệt: số thùng (' + boxCount + ') không hợp lệ. Hãy từ chối yêu cầu này.');
      }

      let assetCode = String(req[P.ASSET_CODE] || '').trim();
      let txPayload;

      if (type === 'Import') {
        /* Yêu cầu nhập vào SKU có sẵn thì dùng luôn SKU đó; ngược lại cấp/dùng lại SKU theo 6 yếu tố,
           bộ phận = bộ phận của người gửi, PIC = chính người gửi. */
        const picked = String(req[P.ASSET_CODE] || '').trim();
        assetCode = (picked && skuRows_().index.byCode[picked]) ? picked
          : resolveSku_(teamOfCc_(cc), req[P.CATEGORY], req[P.SUB_CATEGORY], req[P.NAME], req[P.VARIANT], req[P.EVENT],
              { pic: String(req[P.USER_EMAIL] || '').toLowerCase(),
                unit: String(req[P.UNIT] || ''), createdBy: admin.email }).sku;

        const prev = findBaseByCode_(assetCode);   // giữ bin cũ nếu mã đã có

        txPayload = {
          code: assetCode, type: 'Import', dept: String(req[P.DEPARTMENT] || ''), cc: cc,
          pic: String(req[P.USER] || ''), cat: String(req[P.CATEGORY] || ''),
          sub: String(req[P.SUB_CATEGORY] || ''), name: String(req[P.NAME] || ''),
          qty: quantity, unit: String(req[P.UNIT] || ''), date: date, loc: location,
          event: String(req[P.EVENT] || ''), variant: String(req[P.VARIANT] || ''),
          poNo: String(req[P.PO_NO] || ''), invoiceNo: String(req[P.INVOICE_NO] || ''),
          supplier: String(req[P.SUPPLIER] || ''),
          purchasePrice: Number(req[P.PURCHASE_PRICE]) || 0, boxCount: boxCount,
          bin: prev ? prev.bin : ''
        };
      } else {
        const base = findBaseByCode_(assetCode);
        if (!base) throw new Error('Không tìm thấy tài sản gốc để xuất.');

        const stock = stockOf_(assetCode);
        if (stock.stock <= 0) {
          throw new Error('Không thể duyệt: tài sản đã hết hàng (tồn = ' + stock.stock + ').');
        }
        if (quantity > stock.stock) {
          throw new Error('Không thể duyệt: tồn kho chỉ còn ' + stock.stock + ' ' + base.unit + '.');
        }

        txPayload = {
          code: assetCode, type: 'Export', dept: String(req[P.DEPARTMENT] || ''), cc: cc,
          pic: String(req[P.USER] || ''), cat: base.cat, sub: base.sub, name: base.name,
          qty: quantity, unit: base.unit, date: date, loc: location, event: base.event,
          variant: base.variant, poNo: base.poNo, invoiceNo: base.invoiceNo,
          supplier: base.supplier, purchasePrice: base.purchasePrice, boxCount: 0,
          bin: base.bin
        };
      }

      const shDb = sheet_(SH_DB);
      const dbRow = appendTx_(shDb, txPayload);

      // [LỚP 4] Kiểm tra lại sau khi ghi -> rollback nếu tồn âm
      if (type === 'Export') {
        SpreadsheetApp.flush();
        if (stockOf_(assetCode).stock < 0) {
          undoTx_(shDb, dbRow);
          log_(admin, 'APPROVE_ROLLBACK', requestId + ' | ' + assetCode);
          throw new Error('Có giao dịch khác vừa làm thay đổi tồn kho. Vui lòng duyệt lại.');
        }
      }

      /* Yêu cầu của staff chỉ có TỔNG số thùng -> CHIA ĐỀU khi duyệt,
         thùng cuối nhận phần dư. */
      let alloc = null;

      /* Từ đây đến khi đánh dấu APPROVED phải "được cả hoặc không gì": nếu một bước lỗi thì gỡ dòng Database
         vừa ghi, để yêu cầu vẫn PENDING mà không bị nhập/xuất hai lần khi bấm duyệt lại. */
      try {
        if (type === 'Import' && boxCount > 0) {
          const per = Math.floor(quantity / boxCount);
          const list = [];
          for (let i = 0; i < boxCount; i++) list.push(per);
          list[boxCount - 1] += (quantity - per * boxCount);

          appendBoxes_(assetCode, cc, dbRow, date, location, list);
        } else if (type === 'Export') {
          alloc = consumeFifo_(assetCode, quantity, date, String(req[P.USER] || ''), dbRow);
        }

        shPending.getRange(found.rowIndex, P.ASSET_CODE + 1).setValue(assetCode);
        shPending.getRange(found.rowIndex, P.STATUS + 1, 1, 4)
          .setValues([['APPROVED', admin.email, new Date(), cell_(String(note || 'Approved'))]]);
      } catch (err) {
        undoTx_(shDb, dbRow);   // gỡ dòng Database và các thùng đã kịp ghi
        log_(admin, 'APPROVE_ROLLBACK', requestId + ' | ' + assetCode + ' | ' + err.message);
        throw new Error('Duyệt không thành công, đã hoàn tác: ' + err.message);
      }

      appendNotification_({
        user: admin.username, cc: cc, type: type,
        name: txPayload.name + (txPayload.variant ? ' · ' + txPayload.variant : ''),
        quantity: quantity + ' ' + txPayload.unit, location: location, date: date,
        message: 'Yêu cầu [' + requestId + '] của bạn đã được DUYỆT bởi '
          + admin.username + '. Asset Code: ' + assetCode,
        recipientEmail: String(req[P.USER_EMAIL] || '').toLowerCase()
      });

      log_(admin, 'REQUEST_APPROVED', requestId + ' | ' + assetCode);
      return { assetCode: assetCode, alloc: alloc };
    });

    const boxTxt = (result.alloc && result.alloc.length)
      ? ' · Lấy từ: ' + result.alloc.map(function (a) {
          return 'Thùng ' + a.boxNo + ' (' + a.qty + ')';
        }).join(', ')
      : '';

    return { ok: true, alloc: result.alloc,
             message: 'Đã duyệt ' + requestId + '. Asset Code: ' + result.assetCode + boxTxt };
  } catch (e) { return { ok: false, message: e.message }; }
}

function rejectPendingRequest(requestId, reason) {
  try {
    const admin = requireAdmin_();

    const why = String(reason || '').trim();
    if (!why) throw new Error('Vui lòng nhập lý do từ chối.');

    return withLock_(function () {
      const sh = pendingSheet_();
      const found = findPendingRow_(sh, requestId);
      if (!found) throw new Error('Không tìm thấy yêu cầu ' + requestId);

      const req = found.values;
      if (String(req[P.STATUS] || '').toUpperCase() !== 'PENDING') {
        throw new Error('Yêu cầu này đã được xử lý trước đó.');
      }

      sh.getRange(found.rowIndex, P.STATUS + 1, 1, 4)
        .setValues([['REJECTED', admin.email, new Date(), cell_(why)]]);

      appendNotification_({
        user: admin.username, cc: String(req[P.CC] || ''), type: String(req[P.TYPE] || ''),
        name: String(req[P.NAME] || '') + (req[P.VARIANT] ? ' · ' + req[P.VARIANT] : ''),
        quantity: String(req[P.QUANTITY] || '') + ' ' + String(req[P.UNIT] || ''),
        location: String(req[P.LOCATION] || ''), date: toIso_(req[P.TRANSACTION_DATE]),
        message: 'Yêu cầu [' + requestId + '] của bạn đã bị TỪ CHỐI bởi '
          + admin.username + '. Lý do: ' + why,
        recipientEmail: String(req[P.USER_EMAIL] || '').toLowerCase()
      });

      log_(admin, 'REQUEST_REJECTED', requestId + ' | ' + why);
      return { ok: true, message: 'Đã từ chối ' + requestId + '.' };
    });
  } catch (e) { return { ok: false, message: e.message }; }
}

