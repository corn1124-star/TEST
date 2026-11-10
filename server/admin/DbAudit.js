/* ═══════════ KIỂM TRA DỮ LIỆU TRƯỚC KHI THIẾT KẾ LẠI DATABASE (Pha 0) ═══════════
   Chỉ ĐỌC: không ghi, không tạo sheet. Chạy tay trong editor: auditBeforeRedesign(), đọc kết quả ở Executions > Logs.
   Mục đích: tìm lỗi SẴN CÓ trong dữ liệu cũ để không chép sang mô hình mới (xem DB-REDESIGN.md).
   Phần tính nằm ở dbAuditRun_() (hàm thuần, có kiểm tra trong selfTest); auditBeforeRedesign() chỉ đọc sheet rồi gọi nó. */

const DBA_MAX_EXAMPLES = 8;

/**
 * @param d { ledger, boxes, moves, photos, stkLines, pending, sku:{code->{name,variant,cat,sub,event,unit}}, locs[], units[], toIso(fn) }
 *          Mỗi mảng là các dòng giá trị (không gồm dòng tiêu đề). Số dòng sheet của ledger[i] là i + 2.
 * @return [{ id, level:'ERROR'|'WARN'|'INFO', title, count, examples[] }]
 */
function dbAuditRun_(d) {
  const res = [];
  function add(id, level, title, items) {
    res.push({ id: id, level: level, title: title, count: items.length, examples: items.slice(0, DBA_MAX_EXAMPLES) });
  }
  const s = function (v) { return String(v === null || v === undefined ? '' : v).trim(); };
  const rowOf = function (i) { return 'dòng ' + (i + 2); };

  /* ── Sổ cái (Database) ── */
  const badType = [], badQty = [], badDate = [], noCode = [], unknownSku = [], badLoc = [], badUnit = [], noImportInfo = [];
  const noSeen = {}, dupNo = [], drift = {}, skuDiff = [];
  const byCode = {}, byCodeLoc = {};

  d.ledger.forEach(function (r, i) {
    const code = s(r[C.CODE]), type = s(r[C.TYPE]), qty = Number(r[C.QTY]), loc = s(r[C.LOC]), unit = s(r[C.UNIT]);
    if (!code && !type && !r[C.QTY]) return;                                   // dòng trống hẳn

    if (type !== 'Import' && type !== 'Export') badType.push(rowOf(i) + ': "' + type + '"');
    if (!(qty > 0) || qty !== Math.floor(qty)) badQty.push(rowOf(i) + ': ' + code + ' qty=' + s(r[C.QTY]));
    const iso = d.toIso(r[C.DATE]);
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) badDate.push(rowOf(i) + ': ' + code + ' ngày=' + s(r[C.DATE]));
    if (!code) { noCode.push(rowOf(i)); return; }
    if (!d.sku[code]) unknownSku.push(rowOf(i) + ': ' + code);
    if (d.locs.indexOf(loc) === -1) badLoc.push(rowOf(i) + ': ' + code + ' địa điểm="' + loc + '"');
    if (d.units.indexOf(unit) === -1) badUnit.push(rowOf(i) + ': ' + code + ' đơn vị="' + unit + '"');

    const no = s(r[C.NO]);
    if (!no || isNaN(Number(no))) badType.push(rowOf(i) + ': cột No không phải số ("' + no + '")');
    else if (noSeen[no]) dupNo.push('No ' + no + ' ở ' + rowOf(noSeen[no] - 2) + ' và ' + rowOf(i));
    else noSeen[no] = i + 2;

    /* tồn theo mã và theo (mã, địa điểm) */
    const sign = type === 'Import' ? 1 : -1;
    byCode[code] = (byCode[code] || 0) + sign * (qty || 0);
    const k = code + ' @ ' + loc;
    byCodeLoc[k] = (byCodeLoc[k] || 0) + sign * (qty || 0);

    /* thuộc tính của mã có lệch giữa các dòng không */
    const sig = [s(r[C.NAME]), s(r[C.VARIANT]), s(r[C.CAT]), s(r[C.SUB]), s(r[C.EVENT]), unit].join(' | ');
    (drift[code] = drift[code] || {})[sig] = (drift[code][sig] || 0) + 1;

    const sk = d.sku[code];
    if (sk) {
      const ledgerSig = [s(r[C.NAME]), s(r[C.VARIANT]), s(r[C.CAT]), s(r[C.SUB]), s(r[C.EVENT]), unit].join(' | ');
      const skuSig = [sk.name, sk.variant, sk.cat, sk.sub, sk.event, sk.unit].join(' | ');
      if (ledgerSig !== skuSig) skuDiff.push(rowOf(i) + ': ' + code + ' sổ cái [' + ledgerSig + '] ≠ SKU [' + skuSig + ']');
    }

    if (type === 'Import' && (!s(r[C.PO_NO]) || !s(r[C.INVOICE_NO]) || !s(r[C.SUPPLIER]) || !(Number(r[C.PURCHASE_PRICE]) > 0))) {
      noImportInfo.push(rowOf(i) + ': ' + code);
    }
  });

  const driftItems = Object.keys(drift).filter(function (c) { return Object.keys(drift[c]).length > 1; })
    .map(function (c) { return c + ': ' + Object.keys(drift[c]).length + ' bộ thuộc tính khác nhau'; });
  const negCode = Object.keys(byCode).filter(function (c) { return byCode[c] < 0; })
    .map(function (c) { return c + ': tồn ' + byCode[c]; });
  const negLoc = Object.keys(byCodeLoc).filter(function (k) { return byCodeLoc[k] < 0; })
    .map(function (k) { return k + ': tồn ' + byCodeLoc[k]; });

  add('L1', 'ERROR', 'Sổ cái: loại giao dịch hoặc cột No không hợp lệ', badType);
  add('L2', 'ERROR', 'Sổ cái: số lượng không phải số nguyên dương', badQty);
  add('L3', 'ERROR', 'Sổ cái: ngày trống hoặc sai định dạng', badDate);
  add('L4', 'ERROR', 'Sổ cái: dòng không có mã hàng', noCode);
  add('L5', 'ERROR', 'Sổ cái: mã hàng không có trong sheet SKU', unknownSku);
  add('L6', 'ERROR', 'Sổ cái: địa điểm ngoài danh mục Location', badLoc);
  add('L7', 'WARN', 'Sổ cái: đơn vị ngoài Each/Box/Bag', badUnit);
  add('L8', 'ERROR', 'Sổ cái: trùng số No', dupNo);
  add('L9', 'WARN', 'Sổ cái: cùng một mã nhưng tên/nhóm/đơn vị khác nhau giữa các dòng', driftItems);
  add('L10', 'WARN', 'Sổ cái: thuộc tính lệch so với sheet SKU', skuDiff);
  add('L11', 'ERROR', 'Tồn ÂM theo mã', negCode);
  add('L12', 'ERROR', 'Tồn ÂM theo (mã, địa điểm): ảnh hưởng trực tiếp tồn kho theo địa điểm', negLoc);
  add('L13', 'INFO', 'Dòng nhập thiếu PO / hoá đơn / nhà cung cấp / giá', noImportInfo);

  /* ── Thùng (BoxDetail) và lần lấy thùng (BoxMove) ── */
  const ledgerAt = function (row) { return d.ledger[Number(row) - 2]; };     // row = số dòng sheet
  const badBoxRef = [], badBoxQty = [], badBoxLeft = [], boxIds = {}, movedByBox = {};
  d.moves.forEach(function (m) { const id = s(m[BM.BOX_ID]); movedByBox[id] = (movedByBox[id] || 0) + (Number(m[BM.QTY]) || 0); });

  d.boxes.forEach(function (b, i) {
    const id = s(b[B.ID]), code = s(b[B.CODE]);
    if (!id && !code) return;
    boxIds[id] = true;
    const t = ledgerAt(b[B.TX_ROW]);
    if (!t || s(t[C.TYPE]) !== 'Import' || s(t[C.CODE]) !== code) {
      badBoxRef.push('BoxDetail ' + rowOf(i) + ': ' + id + ' trỏ dòng ' + s(b[B.TX_ROW]) + ' ' +
        (!t ? '(ngoài phạm vi)' : '(là ' + s(t[C.TYPE]) + ' ' + s(t[C.CODE]) + ', cần Import ' + code + ')'));
    }
    const qin = Number(b[B.QTY_IN]), left = Number(b[B.REMAINING]);
    if (!(qin > 0) || left < 0 || left > qin) badBoxQty.push('BoxDetail ' + rowOf(i) + ': ' + id + ' nhập ' + s(b[B.QTY_IN]) + ' còn ' + s(b[B.REMAINING]));
    else if (left !== qin - (movedByBox[id] || 0)) {
      badBoxLeft.push('BoxDetail ' + rowOf(i) + ': ' + id + ' còn ' + left + ' nhưng nhập ' + qin + ' − đã lấy ' + (movedByBox[id] || 0) + ' = ' + (qin - (movedByBox[id] || 0)));
    }
  });

  const badMoveBox = [], badMoveRef = [];
  d.moves.forEach(function (m, i) {
    const id = s(m[BM.BOX_ID]);
    if (!id && !s(m[BM.CODE])) return;
    if (!boxIds[id]) badMoveBox.push('BoxMove ' + rowOf(i) + ': Box ID "' + id + '" không có trong BoxDetail');
    const t = ledgerAt(m[BM.TX_ROW]);
    if (!t || s(t[C.TYPE]) !== 'Export' || s(t[C.CODE]) !== s(m[BM.CODE])) {
      badMoveRef.push('BoxMove ' + rowOf(i) + ': trỏ dòng ' + s(m[BM.TX_ROW]) + ' ' +
        (!t ? '(ngoài phạm vi)' : '(là ' + s(t[C.TYPE]) + ' ' + s(t[C.CODE]) + ', cần Export ' + s(m[BM.CODE]) + ')'));
    }
  });

  const boxSum = {};
  d.boxes.forEach(function (b) { const c = s(b[B.CODE]); if (c) boxSum[c] = (boxSum[c] || 0) + (Number(b[B.REMAINING]) || 0); });
  const boxVsStock = Object.keys(boxSum).filter(function (c) { return (byCode[c] || 0) !== boxSum[c]; })
    .map(function (c) { return c + ': tồn sổ cái ' + (byCode[c] || 0) + ' · tổng thùng ' + boxSum[c]; });

  add('B1', 'ERROR', 'BoxDetail: tham chiếu số dòng sổ cái sai (không phải dòng Import của đúng mã)', badBoxRef);
  add('B2', 'ERROR', 'BoxDetail: số lượng nhập/còn lại không hợp lệ', badBoxQty);
  add('B3', 'ERROR', 'BoxDetail: "còn lại" khác (nhập − tổng đã lấy trong BoxMove)', badBoxLeft);
  add('B4', 'ERROR', 'BoxMove: Box ID không có trong BoxDetail', badMoveBox);
  add('B5', 'ERROR', 'BoxMove: tham chiếu số dòng sổ cái sai (không phải dòng Export của đúng mã)', badMoveRef);
  add('B6', 'INFO', 'Mã có thùng nhưng tồn sổ cái khác tổng thùng (bình thường với hàng nhập trước khi có tính năng thùng)', boxVsStock);

  /* ── Ảnh, kiểm kê, yêu cầu ── */
  const badPhoto = [];
  d.photos.forEach(function (p, i) {
    if (!s(p[PH.TX_ROW]) || (p[PH.DELETED] === true || /^(true|1|yes)$/i.test(s(p[PH.DELETED])))) return;
    const t = ledgerAt(p[PH.TX_ROW]);
    if (!t || (s(p[PH.CODE]) && s(t[C.CODE]) !== s(p[PH.CODE]))) badPhoto.push('Photos ' + rowOf(i) + ': trỏ dòng ' + s(p[PH.TX_ROW]) + ' ' + (!t ? '(ngoài phạm vi)' : '(mã ' + s(t[C.CODE]) + ' ≠ ' + s(p[PH.CODE]) + ')'));
  });
  const badStk = [];
  d.stkLines.forEach(function (l, i) {
    if (!s(l[SL.ADJ_TX_ROW])) return;
    const t = ledgerAt(l[SL.ADJ_TX_ROW]);
    if (!t || s(t[C.CODE]) !== s(l[SL.CODE])) badStk.push('StocktakeLine ' + rowOf(i) + ': trỏ dòng ' + s(l[SL.ADJ_TX_ROW]) + (!t ? ' (ngoài phạm vi)' : ' (mã ' + s(t[C.CODE]) + ' ≠ ' + s(l[SL.CODE]) + ')'));
  });
  const badReq = [];
  d.pending.forEach(function (p, i) {
    const st = s(p[P.STATUS]).toUpperCase();
    if (['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].indexOf(st) === -1) badReq.push('PendingRequests ' + rowOf(i) + ': trạng thái "' + st + '"');
    else if (st === 'APPROVED' && s(p[P.ASSET_CODE]) && !d.sku[s(p[P.ASSET_CODE])]) badReq.push('PendingRequests ' + rowOf(i) + ': đã duyệt, mã ' + s(p[P.ASSET_CODE]) + ' không có trong SKU');
  });

  add('O1', 'ERROR', 'Photos: tham chiếu số dòng sổ cái sai', badPhoto);
  add('O2', 'ERROR', 'StocktakeLine: dòng điều chỉnh trỏ sai sổ cái', badStk);
  add('O3', 'WARN', 'PendingRequests: trạng thái lạ hoặc mã đã duyệt không có trong SKU', badReq);

  return res;
}

/** Ghép kết quả thành văn bản dễ đọc. */
function dbAuditFormat_(res, counts) {
  const icon = { ERROR: '✗', WARN: '⚠', INFO: 'ℹ' };
  const bad = res.filter(function (x) { return x.count > 0 && x.level !== 'INFO'; });
  const out = ['=== KIỂM TRA DỮ LIỆU TRƯỚC KHI THIẾT KẾ LẠI ===',
    'Số dòng: ' + Object.keys(counts).map(function (k) { return k + ' ' + counts[k]; }).join(' · '), ''];
  res.forEach(function (x) {
    out.push((x.count ? icon[x.level] : '✔') + ' ' + x.id + ' ' + x.title + (x.count ? ' — ' + x.count : ''));
    x.examples.forEach(function (e) { out.push('      ' + e); });
    if (x.count > x.examples.length) out.push('      … và ' + (x.count - x.examples.length) + ' mục nữa');
  });
  out.push('', bad.length
    ? 'Có ' + bad.length + ' nhóm cần xử lý (' + bad.filter(function (x) { return x.level === 'ERROR'; }).length + ' lỗi, ' +
      bad.filter(function (x) { return x.level === 'WARN'; }).length + ' cảnh báo). Chưa sửa gì trong dữ liệu.'
    : '✔ Không phát hiện lỗi. Có thể sang Pha 1.');
  return out.join('\n');
}

/** [DEV TOOL] Pha 0. Chỉ đọc. Chạy trong editor rồi xem Executions > Logs. */
function auditBeforeRedesign() {
  requireAdmin_();   // [QUYỀN] hàm công khai: ai có link web app cũng gọi được qua google.script.run

  /* Đọc sheet không tạo mới nếu thiếu (khác boxSheet_() / ensureSheet_()) */
  const rowsOf = function (name, cols) {
    const sh = ss_().getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return [];
    return sh.getRange(2, 1, sh.getLastRow() - 1, Math.min(cols, sh.getMaxColumns())).getValues();
  };

  const sku = {};
  skuRows_().list.forEach(function (x) { sku[x.sku] = x; });

  const data = {
    ledger: rowsOf(SH_DB, DB_COLS), boxes: rowsOf(SH_BOX, BOX_COLS), moves: rowsOf(SH_BOXMOVE, BOXMOVE_COLS),
    photos: rowsOf(PH_SHEET, PH_COLS), stkLines: rowsOf(SH_STKLINE, SL_COLS), pending: rowsOf(SH_PENDING, PENDING_COLS),
    sku: sku, locs: locations_(), units: UNITS, toIso: toIso_
  };
  const counts = { Database: data.ledger.length, BoxDetail: data.boxes.length, BoxMove: data.moves.length,
    Photos: data.photos.length, StocktakeLine: data.stkLines.length, PendingRequests: data.pending.length, SKU: Object.keys(sku).length };

  const text = dbAuditFormat_(dbAuditRun_(data), counts);
  Logger.log(text);
  return text;
}

/* ═══════════ BÁO CÁO CHI TIẾT ĐỂ QUYẾT ĐỊNH QUY TẮC MIGRATE (Pha 0, phần 2) ═══════════
   Chạy sau auditBeforeRedesign(). Cũng chỉ đọc. Trả lời: địa điểm, đơn vị và mã thực tế đang dùng những giá trị nào,
   những dòng không có ngày nằm ở đâu, tồn âm theo địa điểm có phải do nhầm địa điểm không, và tham chiếu số dòng
   của thùng bị lệch bao nhiêu (nếu lệch đều một khoảng thì sửa được hàng loạt). */

/** Rút gọn danh sách số thành các khoảng: [2,3,4,9] -> "2-4, 9". */
function dbaRanges_(nums) {
  const out = []; let a = null, b = null;
  nums.forEach(function (n) {
    if (a === null) { a = b = n; }
    else if (n === b + 1) { b = n; }
    else { out.push(a === b ? String(a) : a + '-' + b); a = b = n; }
  });
  if (a !== null) out.push(a === b ? String(a) : a + '-' + b);
  return out.join(', ');
}

function dbAuditDetail_(d) {
  const s = function (v) { return String(v === null || v === undefined ? '' : v).trim(); };
  const out = [];
  const push = function (arr) { arr.forEach(function (x) { out.push(x); }); };
  const tally = function (arr) { const m = {}; arr.forEach(function (x) { m[x] = (m[x] || 0) + 1; }); return m; };
  const listTally = function (m) {
    return Object.keys(m).sort(function (x, y) { return m[y] - m[x]; })
      .map(function (k) { return '      ' + (k === '' ? '(trống)' : '"' + k + '"') + ' × ' + m[k]; });
  };

  const rows = d.ledger.map(function (r, i) { return { row: i + 2, r: r, code: s(r[C.CODE]), type: s(r[C.TYPE]), qty: Number(r[C.QTY]) || 0, loc: s(r[C.LOC]) }; })
    .filter(function (x) { return x.code; });

  /* S1-S3: giá trị đang dùng */
  out.push('S1 Địa điểm trong sổ cái (sheet Location đang có: ' + (d.locs.length ? d.locs.map(function (l) { return '"' + l + '"'; }).join(', ') : '(trống)') + ')');
  push(listTally(tally(rows.map(function (x) { return x.loc; }))));
  out.push('S2 Đơn vị trong sổ cái');
  push(listTally(tally(rows.map(function (x) { return s(x.r[C.UNIT]); }))));

  const codes = {};
  rows.forEach(function (x) { codes[x.code] = 1; });
  const fmt = function (c) { return /-GIV-|--/.test(c) ? 'dạng mới (có -GIV- hoặc --)' : /^[A-Za-z0-9]+_/.test(c) ? 'dạng cũ TEAM_...' : 'dạng khác'; };
  out.push('S3 Mã hàng: ' + Object.keys(codes).length + ' mã khác nhau, theo dạng');
  push(listTally(tally(Object.keys(codes).map(fmt))));
  out.push('S3b Cost Center trong sổ cái');
  push(listTally(tally(rows.map(function (x) { return s(x.r[C.CC]); }))));

  /* S4: dòng không có ngày */
  const noDate = rows.filter(function (x) { const iso = d.toIso(x.r[C.DATE]); return !iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso); });
  out.push('S4 Dòng không có ngày: ' + noDate.length + ', ở dòng sheet: ' + (dbaRanges_(noDate.map(function (x) { return x.row; })) || '(không có)'));
  if (noDate.length) {
    const ty = tally(noDate.map(function (x) { return x.type; }));
    out.push('      theo loại: ' + Object.keys(ty).map(function (k) { return k + ' ' + ty[k]; }).join(' · '));
  }

  /* S5: tồn âm theo (mã, địa điểm) và chỗ dư của cùng mã */
  const bal = {};
  rows.forEach(function (x) {
    const sg = x.type === 'Import' ? 1 : -1;
    bal[x.code] = bal[x.code] || {};
    bal[x.code][x.loc] = (bal[x.code][x.loc] || 0) + sg * x.qty;
  });
  const s5 = [];
  Object.keys(bal).forEach(function (c) {
    Object.keys(bal[c]).forEach(function (l) {
      if (bal[c][l] >= 0) return;
      const surplus = Object.keys(bal[c]).filter(function (o) { return o !== l && bal[c][o] > 0; })
        .map(function (o) { return '+' + bal[c][o] + ' ở "' + o + '"'; });
      s5.push((surplus.length ? 'CÓ BÙ ' : 'KHÔNG BÙ ') + c + ' @ "' + l + '": ' + bal[c][l] + (surplus.length ? '  | dư cùng mã: ' + surplus.join('; ') : ''));
    });
  });
  const withSurplus = s5.filter(function (x) { return x.indexOf('CÓ BÙ') === 0; }).length;
  out.push('S5 Tồn âm theo (mã, địa điểm): ' + s5.length + ' cặp; ' + withSurplus + ' cặp có chỗ dư cùng mã (nhiều khả năng nhầm địa điểm), ' + (s5.length - withSurplus) + ' cặp không có');
  s5.sort().slice(0, 20).forEach(function (x) { out.push('      ' + x); });
  if (s5.length > 20) out.push('      … và ' + (s5.length - 20) + ' cặp nữa');

  /* S6: sửa tham chiếu số dòng của thùng / lần lấy thùng bằng cách khớp (mã, loại, tổng số lượng) */
  function suggest(items, want, qtyOf, codeOf, refOf, label) {
    const group = {};
    items.forEach(function (it) { const k = codeOf(it) + '#' + refOf(it); group[k] = (group[k] || 0) + qtyOf(it); });
    const res = { unique: 0, ambiguous: 0, none: 0, ok: 0, offsets: {}, ex: [] }, picks = [];
    Object.keys(group).forEach(function (k) {
      const p = k.lastIndexOf('#'), code = k.slice(0, p), cur = Number(k.slice(p + 1)), tot = group[k];
      const t = d.ledger[cur - 2];
      if (t && s(t[C.TYPE]) === want && s(t[C.CODE]) === code) { res.ok++; return; }
      const cand = rows.filter(function (x) { return x.code === code && x.type === want && x.qty === tot; });
      const any = rows.filter(function (x) { return x.code === code && x.type === want; });
      if (cand.length === 1) {
        res.unique++; picks.push(cand[0].row);
        const off = cand[0].row - cur;
        res.offsets[off] = (res.offsets[off] || 0) + 1;
        if (res.ex.length < 6) res.ex.push(label + ' ' + code + ' trỏ dòng ' + cur + ' → dòng ' + cand[0].row + ' (lệch ' + (off > 0 ? '+' : '') + off + ')');
      } else if (cand.length > 1) {
        res.ambiguous++;
      } else {
        res.none++;
        if (res.ex.length < 6) res.ex.push(label + ' ' + code + ' trỏ dòng ' + cur + ': ' + (any.length ? 'có ' + any.length + ' dòng ' + want + ' của mã nhưng không dòng nào có số lượng ' + tot : 'mã không có dòng ' + want));
      }
    });
    /* hai nhóm cùng nhắm một dòng sổ cái thì ít nhất một nhóm sai: coi cả hai là mơ hồ */
    const claims = {}; picks.forEach(function (r) { claims[r] = (claims[r] || 0) + 1; });
    picks.forEach(function (r) { if (claims[r] > 1) { res.unique--; res.ambiguous++; } });
    return res;
  }
  const sb = suggest(d.boxes, 'Import', function (b) { return Number(b[B.QTY_IN]) || 0; }, function (b) { return s(b[B.CODE]); }, function (b) { return s(b[B.TX_ROW]); }, 'BoxDetail');
  const sm = suggest(d.moves, 'Export', function (m) { return Number(m[BM.QTY]) || 0; }, function (m) { return s(m[BM.CODE]); }, function (m) { return s(m[BM.TX_ROW]); }, 'BoxMove');
  [['S6a BoxDetail', sb], ['S6b BoxMove', sm]].forEach(function (p) {
    const r = p[1];
    out.push(p[0] + ' (theo nhóm mã + dòng trỏ tới): đúng sẵn ' + r.ok + ' · sửa chắc chắn ' + r.unique + ' · mơ hồ ' + r.ambiguous + ' · không tìm thấy ' + r.none);
    const offs = Object.keys(r.offsets).sort(function (x, y) { return r.offsets[y] - r.offsets[x]; }).slice(0, 5);
    if (offs.length) out.push('      độ lệch số dòng phổ biến: ' + offs.map(function (o) { return (Number(o) > 0 ? '+' : '') + o + ' × ' + r.offsets[o]; }).join(' · '));
    r.ex.forEach(function (e) { out.push('      ' + e); });
  });
  return out.join('\n');
}

/** [DEV TOOL] Pha 0, phần 2. Chỉ đọc. Chạy trong editor rồi gửi Logs. */
function auditBeforeRedesignDetail() {
  requireAdmin_();   // [QUYỀN] hàm công khai: ai có link web app cũng gọi được qua google.script.run
  const rowsOf = function (name, cols) {
    const sh = ss_().getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return [];
    return sh.getRange(2, 1, sh.getLastRow() - 1, Math.min(cols, sh.getMaxColumns())).getValues();
  };
  const text = '=== CHI TIẾT ĐỂ QUYẾT ĐỊNH QUY TẮC MIGRATE ===\n' + dbAuditDetail_({
    ledger: rowsOf(SH_DB, DB_COLS), boxes: rowsOf(SH_BOX, BOX_COLS), moves: rowsOf(SH_BOXMOVE, BOXMOVE_COLS),
    locs: locations_(), toIso: toIso_
  });
  Logger.log(text);
  return text;
}
