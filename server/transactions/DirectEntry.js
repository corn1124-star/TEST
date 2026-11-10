/* ═══════════ NHÓM 13: NHẬP/XUẤT/SỬA TRỰC TIẾP (CHỈ ADMIN) ═══════════ */

function importEntry(data) {
  try {
    const user = requireAdmin_();

    let cat = String(data.cat || '').trim(), sub = String(data.sub || '').trim();
    let name = String(data.name || '').trim(), event = String(data.event || '').trim();
    let unit = String(data.unit || '').trim();
    const loc = String(data.loc || '').trim();
    const date = String(data.date || '').trim();

    /* Nhập thêm vào SKU CÓ SẴN: lấy thông tin từ danh mục (admin được chọn mọi SKU, kể cả ngừng sử dụng). */
    const pick = String(data.code || '').trim();
    let pickRec = null;                       // mặt hàng đã có: định danh cố định, không cho đổi
    if (pick) {
      pickRec = skuRows_().index.byCode[pick];
      if (!pickRec) throw new Error('Không tìm thấy SKU ' + pick + '.');
      cat = pickRec.cat; sub = pickRec.sub; name = pickRec.name; event = pickRec.event || 'N/A'; unit = pickRec.unit || unit;
    }
    const qty = Number(data.qty), boxCount = Number(data.boxCount) || 0;

    if (!date) throw new Error('Vui lòng chọn ngày nhập.');
    if (!isoValid_(date)) throw new Error('Ngày nhập không hợp lệ.');
    if (!cat) throw new Error('Vui lòng chọn nhóm hàng.');
    if (!sub) throw new Error('Vui lòng chọn phân nhóm.');
    if (!name) throw new Error('Vui lòng nhập tên hàng.');
    if (!event) throw new Error('Vui lòng nhập event.');
    if (!loc) throw new Error('Vui lòng chọn địa điểm.');
    requireKnownLoc_(loc);
    if (!pickRec) requireKnownCat_(cat, sub);
    if (UNITS.indexOf(unit) === -1) throw new Error('Đơn vị phải là Each, Box hoặc Bag.');
    if (!qty || qty <= 0) throw new Error('Số lượng phải lớn hơn 0.');
    if (qty !== Math.floor(qty)) throw new Error('Số lượng phải là số nguyên.');
    if (boxCount < 0) throw new Error('Số thùng không được âm.');
    if (!user.cc) throw new Error('Tài khoản chưa có Cost Centre trong sheet Team.');

    let variant = pickRec ? pickRec.variant : String(data.variant || '').trim();
    if (pickRec) { /* biến thể đã cố định theo mặt hàng đã có */ }
    else if (needsVariant_(sub)) {
      if (!variant) throw new Error('Phân nhóm "' + sub + '" bắt buộc nhập biến thể.');
      if (variant.length > 60) throw new Error('Biến thể quá dài (tối đa 60 ký tự).');
    } else variant = '';

    const poNo = String(data.poNo || '').trim(), invoiceNo = String(data.invoiceNo || '').trim();
    const supplier = String(data.supplier || '').trim(), purchasePrice = Number(data.purchasePrice);

    if (!poNo) throw new Error('Vui lòng nhập PO No.');
    if (!invoiceNo) throw new Error('Vui lòng nhập số hoá đơn.');
    if (!supplier) throw new Error('Vui lòng nhập nhà cung cấp.');
    if (!purchasePrice || purchasePrice <= 0) throw new Error('Giá mua phải lớn hơn 0.');

    /* boxList = số lượng TỪNG thùng. Tổng PHẢI khớp qty. */
    const boxList = (data.boxList || []).map(function (x) { return Number(x) || 0; })
                                        .filter(function (x) { return x > 0; });

    if (boxList.length) {
      const sum = boxList.reduce(function (a, b) { return a + b; }, 0);
      if (sum !== qty) {
        throw new Error('Tổng số lượng các thùng (' + sum + ') không khớp số lượng nhập ('
                        + qty + '). Vui lòng kiểm tra lại bảng chi tiết thùng.');
      }
      if (boxList.length !== boxCount) {
        throw new Error('Số dòng thùng (' + boxList.length + ') không khớp Số thùng ('
                        + boxCount + ').');
      }
    }

    const out = withLock_(function () {
      /* Bộ phận (mặc định bộ phận của admin) và PIC (email) lấy từ form; chỉ dùng khi SKU còn MỚI. */
      const sk = pickRec ? { sku: pickRec.sku, existing: true }
        : resolveSku_(String(data.team || '').trim().toUpperCase() || user.teamCode, cat, sub, name, variant, event,
            { pic: data.pic, unit: unit, createdBy: user.email });
      if (sk.unit) unit = sk.unit;                // SKU đã có: đơn vị theo SKU (resolveSku_ đã chặn đơn vị khác)
      const prev = findBaseByCode_(sk.sku);       // giữ bin cũ nếu mã đã có

      const sh = sheet_(SH_DB);
      const txRow = appendTx_(sh, {
        code: sk.sku, type: 'Import', dept: user.department, cc: user.cc, pic: user.username,
        cat: cat, sub: sub, name: name, qty: qty, unit: unit, date: date, loc: loc,
        event: event, variant: variant, poNo: poNo, invoiceNo: invoiceNo,
        supplier: supplier, purchasePrice: purchasePrice, boxCount: boxCount,
        bin: prev ? prev.bin : ''
      });

      let nBox;
      try { nBox = appendBoxes_(sk.sku, user.cc, txRow, date, loc, boxList); }
      catch (err) {
        undoTx_(sh, txRow);   // không để lại dòng nhập thiếu chi tiết thùng
        throw new Error('Nhập kho không thành công, đã hoàn tác: ' + err.message);
      }

      log_(user, 'IMPORT', sk.sku + ' | +' + qty + ' ' + unit +
           ' | ' + boxCount + ' thùng' + (nBox ? ' (chi tiết ' + nBox + ')' : '') + ' | ' + loc);

      return { code: sk.sku, reused: sk.existing, nBox: nBox };
    });

    return { ok: true, code: out.code, assetCode: out.code, reused: out.reused,
      message: 'Đã nhập kho ' + qty + ' ' + unit + (boxCount ? ' (' + boxCount + ' thùng)' : '')
             + ' — Asset Code: ' + out.code + (out.reused ? ' (dùng lại mã cũ)' : ' (mã mới)') };
  } catch (e) { return { ok: false, message: e.message }; }
}

function exportEntry(data) {
  try {
    const user = requireAdmin_();

    const code = String(data.code || '').trim(), loc = String(data.loc || '').trim();
    const date = String(data.date || '').trim();
    const qty = Number(data.qty);

    if (!code) throw new Error('Chưa chọn mặt hàng để xuất.');
    if (!date) throw new Error('Vui lòng chọn ngày xuất.');
    if (!isoValid_(date)) throw new Error('Ngày xuất không hợp lệ.');
    if (!loc) throw new Error('Vui lòng chọn địa điểm xuất đến.');
    requireKnownLoc_(loc);
    if (!qty || qty <= 0) throw new Error('Số lượng phải lớn hơn 0.');
    if (qty !== Math.floor(qty)) throw new Error('Số lượng phải là số nguyên.');

    const result = withLock_(function () {
      const base = findBaseByCode_(code);
      if (!base) throw new Error('Không tìm thấy Asset Code ' + code + '.');

      const before = stockOf_(code);
      if (before.stock <= 0) throw new Error('Mặt hàng ' + code + ' đã hết hàng.');
      if (qty > before.stock) throw new Error('Vượt tồn kho: chỉ còn ' + before.stock + ' ' + base.unit + '.');

      const sh = sheet_(SH_DB);
      const rowIndex = appendTx_(sh, {
        code: code, type: 'Export', dept: base.dept, cc: base.cc, pic: user.username,
        cat: base.cat, sub: base.sub, name: base.name, qty: qty, unit: base.unit,
        date: date, loc: loc, event: base.event, variant: base.variant,
        poNo: base.poNo, invoiceNo: base.invoiceNo, supplier: base.supplier,
        purchasePrice: base.purchasePrice, boxCount: 0, bin: base.bin
      });

      SpreadsheetApp.flush();
      const after = stockOf_(code);

      if (after.stock < 0) {
        undoTx_(sh, rowIndex);
        log_(user, 'EXPORT_ROLLBACK', code + ' | yêu cầu ' + qty);
        throw new Error('Có giao dịch khác vừa xảy ra. Tồn thực tế chỉ còn '
          + (after.stock + qty) + ' ' + base.unit + '. Bấm tải lại và thử lại.');
      }

      // Trừ FIFO vào các thùng của SKU — thùng số nhỏ trước; lỗi thì gỡ dòng xuất để tồn và thùng không lệch nhau
      let alloc;
      try { alloc = consumeFifo_(code, qty, date, user.username, rowIndex); }
      catch (err) {
        undoTx_(sh, rowIndex);
        throw new Error('Xuất kho không thành công, đã hoàn tác: ' + err.message);
      }

      log_(user, 'EXPORT', code + ' | -' + qty + ' ' + base.unit + ' | tồn sau: ' + after.stock);
      return { code: code, left: after.stock, unit: base.unit, alloc: alloc };
    });

    const boxTxt = (result.alloc && result.alloc.length)
      ? ' · Lấy từ: ' + result.alloc.map(function (a) {
          return 'Thùng ' + a.boxNo + ' (' + a.qty + ')';
        }).join(', ')
      : '';

    return { ok: true, code: result.code, left: result.left, alloc: result.alloc,
             message: 'Đã xuất ' + qty + ' ' + result.unit + ' của ' + result.code
                    + ' → ' + loc + '. Tồn còn lại: ' + result.left + boxTxt };
  } catch (e) { return { ok: false, message: e.message }; }
}

/**
 * [API — ADMIN] Sửa 1 giao dịch trong Database.
 * CHO SỬA: Date · Location · Quantity · Số thùng · Bin · PO · Invoice · Supplier · Giá
 * [LỚP 4] Sau khi ghi: đọc lại tồn; âm thì HOÀN TÁC toàn bộ dòng.
 */
function editTransaction(rowIndex, data, expect) {
  try {
    const user = requireAdmin_();

    const row = Number(rowIndex);
    if (!row || row < 2) throw new Error('Dòng không hợp lệ.');

    const date = String(data.date || '').trim(), loc = String(data.loc || '').trim();
    const qty = Number(data.qty), boxCount = Number(data.boxCount) || 0;
    const poNo = String(data.poNo || '').trim(), invoiceNo = String(data.invoiceNo || '').trim();
    const supplier = String(data.supplier || '').trim(), purchasePrice = Number(data.purchasePrice) || 0;
    const bin = String(data.bin || '').trim().toUpperCase().replace(/[^A-Z0-9\-]/g, '');

    if (!date) throw new Error('Vui lòng chọn ngày.');
    if (!isoValid_(date)) throw new Error('Ngày giao dịch không hợp lệ.');
    if (!loc) throw new Error('Vui lòng chọn địa điểm.');
    if (!qty || qty <= 0) throw new Error('Số lượng phải lớn hơn 0.');
    if (qty !== Math.floor(qty)) throw new Error('Số lượng phải là số nguyên.');
    if (boxCount < 0) throw new Error('Số thùng không được âm.');

    return withLock_(function () {
      const sh = sheet_(SH_DB);
      if (row > sh.getLastRow()) throw new Error(expect ? TX_STALE_MSG : 'Dòng ' + row + ' không tồn tại.');

      const old = sh.getRange(row, 1, 1, DB_COLS).getValues()[0];
      if (txRowStale_(old, expect)) throw new Error(TX_STALE_MSG);
      const code = String(old[C.CODE] || '').trim();
      if (!code) throw new Error('Dòng này không có Asset Code.');
      // Chỉ kiểm tra khi đổi địa điểm: dòng cũ có thể mang địa điểm đã bị gỡ khỏi danh mục
      if (loc !== String(old[C.LOC] || '').trim()) requireKnownLoc_(loc);

      /* Dòng đã có chi tiết thùng -> KHÔNG cho đổi số lượng. */
      if (qty !== (Number(old[C.QTY]) || 0)) {
        let hasBox = false;
        boxRows_().forEach(function (r) { if (Number(r[B.TX_ROW]) === row) hasBox = true; });

        if (hasBox) {
          throw new Error('Dòng này đã có chi tiết thùng nên không đổi được số lượng. ' +
                          'Xoá các dòng tương ứng ở sheet BoxDetail trước khi sửa.');
        }
        /* Dòng XUẤT đã trừ vào thùng (BoxMove): đổi số lượng sẽ làm tổng thùng lệch sổ cái. */
        if (String(old[C.TYPE] || '').trim() === 'Export' &&
            delFindByRef_(boxMoveSheet_(), BOXMOVE_COLS, BM.TX_ROW, row).length) {
          throw new Error('Lần xuất này đã trừ vào thùng nên không đổi được số lượng. ' +
                          'Hãy xóa giao dịch (hàng được hoàn lại thùng) rồi nhập lại số lượng đúng.');
        }
      }

      const excessBefore = boxExcess_(code, stockOf_(code).stock);   // phần thùng vượt tồn kho TRƯỚC khi sửa

      sh.getRange(row, C.QTY + 1).setValue(qty);
      sh.getRange(row, C.DATE + 1).setValue(isoToDate_(date)).setNumberFormat('dd/mm/yyyy');
      sh.getRange(row, C.LOC + 1).setValue(cell_(loc));
      sh.getRange(row, C.PO_NO + 1, 1, 3).setValues([[cell_(poNo, true), cell_(invoiceNo, true), cell_(supplier)]]);
      sh.getRange(row, C.PURCHASE_PRICE + 1).setValue(purchasePrice).setNumberFormat('#,##0');
      sh.getRange(row, C.BOX + 1).setValue(boxCount);
      sh.getRange(row, C.BIN + 1).setValue(bin);
      dbChanged_();

      SpreadsheetApp.flush();
      const st = stockOf_(code);

      const excessAfter = boxExcess_(code, st.stock);
      if (st.stock < 0 || excessAfter > excessBefore) {
        sh.getRange(row, 1, 1, DB_COLS).setValues([cellsRow_(old, [C.PO_NO, C.INVOICE_NO])]);
        dbChanged_();
        SpreadsheetApp.flush();
        log_(user, 'EDIT_ROLLBACK', code + ' | dòng ' + row);
        throw new Error(st.stock < 0
          ? 'Không thể lưu: thay đổi làm tồn kho của ' + code + ' âm (' + st.stock + '). Đã hoàn tác.'
          : 'Không thể lưu: tồn kho của ' + code + ' sẽ còn ' + st.stock + ' nhưng các thùng vẫn ghi còn ' + boxRemainingOf_(code) +
            '. Hãy xuất hoặc điều chỉnh số hàng trong thùng trước. Đã hoàn tác.');
      }

      log_(user, 'EDIT_TX', code + ' | dòng ' + row + ' | SL ' + old[C.QTY] + '->' + qty +
           (bin ? ' | bin ' + bin : ''));

      return { ok: true, message: 'Đã cập nhật dòng ' + row + '. Tồn kho ' + code + ': ' + st.stock };
    });
  } catch (e) { return { ok: false, message: e.message }; }
}

