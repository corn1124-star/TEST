/* ═══════════ MIGRATE SANG MÔ HÌNH CHIỀU: CHẠY THỬ (Pha 1, bước 1) ═══════════
   Quy tắc R1-R8 ở DB-REDESIGN.md mục 8. File này CHỈ TÍNH TRONG BỘ NHỚ và in báo cáo: không ghi, không tạo sheet.
   Chạy tay trong editor: migrateDryRun(), rồi xem Executions > Logs. Phần ghi thật sẽ viết sau khi bạn duyệt báo cáo.
   dbmBuild_() là hàm thuần (có kiểm tra trong selfTest); migrateDryRun() chỉ đọc sheet rồi gọi nó. */

const DBM_UNIT_MAP = { Each: 'Piece' };            // R5: chuẩn hóa đơn vị
const DBM_MAX_DATE_GAP = 180;                      // R4: hai dòng có ngày quanh khối thiếu ngày cách nhau quá số ngày này thì để "Không xác định"

/** "Loại - Thành phố - Tên" -> thuộc tính của dim_location. Ví dụ "Hub - Binh Dinh" không có thành phố riêng. */
function dbmParseLocation_(code) {
  const p = String(code).split(' - ');
  return {
    site_type: p[0],
    city: p.length >= 3 ? p[1] : '',
    site_name: p.length >= 3 ? p.slice(2).join(' - ') : (p.slice(1).join(' - ') || p[0]),
    holds_stock: p[0] === 'Warehouse'
  };
}

/**
 * @param d { ledger, boxes, moves, locs[], teamOf(cc), deptOf(cc), toIso(v) }  (mỗi mảng là các dòng giá trị, không gồm tiêu đề)
 * @return { dim_location, dim_team, dim_item, fact_movement, fact_stock_balance, fact_box, fact_box_move, review, stats }
 */
function dbmBuild_(d) {
  const s = function (v) { return String(v === null || v === undefined ? '' : v).trim(); };
  const m = {
    dim_location: [{ location_key: 0, location_code: 'Không xác định', site_type: '', city: '', site_name: 'Không xác định', holds_stock: false, source: 'hệ thống' }],
    dim_team: [{ team_key: 0, cost_centre: 'Không xác định', team_code: '', department: '' }],
    dim_item: [], fact_movement: [], fact_stock_balance: [], fact_box: [], fact_box_move: [],
    review: { reclassified: [], negative: [], dateEstimated: [], badRows: [], locNotInSheet: [], boxRelink: [], moveRelink: [] },
    stats: {}
  };

  /* ── chiều địa điểm: toàn bộ sheet Location, thêm giá trị lạ gặp trong sổ cái ── */
  const locKey = {};
  function addLoc(code, source) {
    const p = dbmParseLocation_(code);
    const row = { location_key: m.dim_location.length, location_code: code, site_type: p.site_type, city: p.city, site_name: p.site_name, holds_stock: p.holds_stock, source: source };
    m.dim_location.push(row);
    locKey[code] = row.location_key;
    return row.location_key;
  }
  d.locs.forEach(function (l) { if (l && locKey[l] === undefined) addLoc(l, 'sheet Location'); });
  function locOf(code) {
    if (!code) return 0;
    if (locKey[code] !== undefined) return locKey[code];
    m.review.locNotInSheet.push(code);
    return addLoc(code, 'chỉ có trong sổ cái');
  }
  const locName = function (k) { return m.dim_location[k].location_code; };

  /* ── chiều bộ phận theo Cost Center ── */
  const teamKey = {};
  function teamOfCc(cc) {
    if (!cc) return 0;
    if (teamKey[cc] === undefined) {
      teamKey[cc] = m.dim_team.length;
      m.dim_team.push({ team_key: teamKey[cc], cost_centre: cc, team_code: d.teamOf(cc), department: d.deptOf(cc) });
    }
    return teamKey[cc];
  }

  /* ── số No: giữ nguyên làm tx_no nếu là số và không trùng ── */
  let maxNo = 0; const usedNo = {};
  d.ledger.forEach(function (r) { const n = Number(s(r[C.NO])); if (isFinite(n) && n > maxNo) maxNo = n; });

  /* ── quét sổ cái theo thứ tự dòng ── */
  const itemByCode = {}, bal = {}, inTot = {}, outTot = {}, lastIn = {}, lastOut = {}, oldTotals = {}, rowToTx = {}, ledgerAt = {};
  const units = {};
  const rawIso = d.ledger.map(function (r) { const v = d.toIso(r[C.DATE]); return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; });
  const prevOf = [], nextOf = []; let lastSeen = '', nextSeen = '';
  rawIso.forEach(function (v, i) { if (v) lastSeen = v; prevOf[i] = lastSeen; });
  for (let i = rawIso.length - 1; i >= 0; i--) { if (rawIso[i]) nextSeen = rawIso[i]; nextOf[i] = nextSeen; }
  const dayNum = function (iso) { return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000; };

  d.ledger.forEach(function (r, i) {
    const code = s(r[C.CODE]), type = s(r[C.TYPE]), qty = Number(r[C.QTY]), row = i + 2;
    if (!code && !type && !r[C.QTY]) return;
    if (!code || (type !== 'Import' && type !== 'Export') || !(qty > 0)) { m.review.badRows.push('dòng ' + row + ': mã "' + code + '" loại "' + type + '" số lượng ' + s(r[C.QTY])); return; }

    /* R4: ngày thiếu lấy ngày dòng có ngày liền trước; nếu dòng có ngày liền trước và liền sau cách nhau quá DBM_MAX_DATE_GAP ngày thì để Không xác định */
    let iso = rawIso[i];
    const estimated = !iso;
    if (estimated) {
      const p = prevOf[i], n = nextOf[i];
      iso = (p && n && Math.abs(dayNum(n) - dayNum(p)) > DBM_MAX_DATE_GAP) ? '' : (p || n);
      m.review.dateEstimated.push({ row: row, date: iso });
    }

    if (!itemByCode[code]) {
      const rawUnit = s(r[C.UNIT]), unit = DBM_UNIT_MAP[rawUnit] || rawUnit;
      units[rawUnit + ' → ' + unit] = (units[rawUnit + ' → ' + unit] || 0) + 1;
      itemByCode[code] = {
        item_key: m.dim_item.length + 1, sku: code, name: s(r[C.NAME]), variant: s(r[C.VARIANT]), category: s(r[C.CAT]), sub_category: s(r[C.SUB]),
        event: s(r[C.EVENT]), unit: unit, team_key: teamOfCc(s(r[C.CC])), pic_email: '', active: true, valid_from: iso, valid_to: '9999-12-31', is_current: true,
        code_format: /-GIV-|--/.test(code) ? 'mới' : (/^[A-Za-z0-9]+_/.test(code) ? 'cũ TEAM_' : 'khác')
      };
      m.dim_item.push(itemByCode[code]);
    }
    const item = itemByCode[code];

    /* R3: địa điểm trống = Không xác định (key 0) */
    const recorded = s(r[C.LOC]);
    const recKey = locOf(recorded);
    const sign = type === 'Import' ? 1 : -1;
    bal[code] = bal[code] || {}; inTot[code] = inTot[code] || {}; outTot[code] = outTot[code] || {}; lastIn[code] = lastIn[code] || {}; lastOut[code] = lastOut[code] || {};
    oldTotals[code] = (oldTotals[code] || 0) + sign * qty;

    /* R2: dòng xuất. Đủ hàng tại nơi ghi thì đó là nơi giữ hàng; không thì tìm nơi khác của cùng mã còn đủ, nơi ghi trở thành nơi nhận */
    let holder = recKey, dest = 0, inferred = false;
    if (sign < 0 && (bal[code][recKey] || 0) < qty) {
      let best = null;
      Object.keys(bal[code]).forEach(function (k) {
        k = Number(k);
        if (k !== recKey && bal[code][k] >= qty && (best === null || bal[code][k] > bal[code][best])) best = k;
      });
      if (best !== null) {
        holder = best; dest = recKey; inferred = true;
        m.review.reclassified.push({ row: row, code: code, qty: qty, recorded: recorded || '(trống)', holder: locName(best) });
      }
    }
    bal[code][holder] = (bal[code][holder] || 0) + sign * qty;
    (sign > 0 ? inTot : outTot)[code][holder] = ((sign > 0 ? inTot : outTot)[code][holder] || 0) + qty;
    (sign > 0 ? lastIn : lastOut)[code][holder] = iso;

    let tx = Number(s(r[C.NO]));
    if (!isFinite(tx) || tx <= 0 || usedNo[tx]) tx = ++maxNo;
    usedNo[tx] = true;
    rowToTx[row] = tx;
    ledgerAt[row] = { type: type, code: code, qty: qty, date: iso };

    m.fact_movement.push({
      tx_no: tx, legacy_row: row, date_key: iso ? Number(iso.replace(/-/g, '')) : 0, item_key: item.item_key, location_key: holder, destination_key: dest,
      team_key: teamOfCc(s(r[C.CC])), movement_type: sign > 0 ? 'IN' : 'OUT', qty: qty, unit_cost: Number(r[C.PURCHASE_PRICE]) || null,
      box_count: Number(r[C.BOX]) || 0, bin: s(r[C.BIN]).toUpperCase(), po_no: s(r[C.PO_NO]), invoice_no: s(r[C.INVOICE_NO]), supplier: s(r[C.SUPPLIER]),
      date_estimated: estimated, location_inferred: inferred, status: 'ACTIVE'
    });
  });

  /* ── liên kết thùng (R7): khớp (mã, loại, tổng số lượng), loại bỏ mục nhắm trùng một dòng ── */
  function relink(items, want, qtyOf, codeOf, refOf, dateOf) {
    const groups = {};
    items.forEach(function (it) {
      const k = codeOf(it) + '#' + refOf(it);
      groups[k] = groups[k] || { code: codeOf(it), ref: Number(refOf(it)), qty: 0, dates: {} };
      groups[k].qty += qtyOf(it);
      const dt = dateOf(it); if (dt) groups[k].dates[dt] = 1;
    });
    const rowsOfCode = function (code) {
      return Object.keys(ledgerAt).filter(function (r) { return ledgerAt[r].code === code && ledgerAt[r].type === want; });
    };
    const claims = {}, decision = {};
    Object.keys(groups).forEach(function (k) {
      const g = groups[k], t = ledgerAt[g.ref];
      if (t && t.type === want && t.code === g.code) { decision[k] = { status: 'đúng sẵn', row: g.ref }; claims[g.ref] = (claims[g.ref] || 0) + 1; return; }
      const same = rowsOfCode(g.code);
      let cand = same.filter(function (r) { return ledgerAt[r].qty === g.qty; }), how = 'sửa';
      if (cand.length > 1) {                                               // nhiều dòng cùng số lượng: dùng ngày để phân biệt
        const byDate = cand.filter(function (r) { return g.dates[ledgerAt[r].date]; });
        if (byDate.length === 1) { cand = byDate; how = 'sửa (theo ngày)'; }
      } else if (!cand.length && want === 'Export') {                      // xuất cả hàng không có thùng: dòng xuất có thể lớn hơn tổng thùng
        const byDate = same.filter(function (r) { return ledgerAt[r].qty >= g.qty && g.dates[ledgerAt[r].date]; });
        if (byDate.length === 1) { cand = byDate; how = 'sửa (theo ngày, dòng xuất lớn hơn)'; }
      }
      if (cand.length === 1) { decision[k] = { status: how, row: Number(cand[0]) }; claims[cand[0]] = (claims[cand[0]] || 0) + 1; }
      else {
        const opts = same.slice(0, 5).map(function (r) { return 'dòng ' + r + ' (SL ' + ledgerAt[r].qty + ', ' + ledgerAt[r].date + ')'; }).join('; ');
        decision[k] = { status: cand.length > 1 ? 'mơ hồ' : 'không tìm thấy', row: null, options: opts, dates: Object.keys(g.dates).join(', ') };
      }
    });
    Object.keys(decision).forEach(function (k) {
      if (decision[k].status.indexOf('sửa') === 0 && claims[decision[k].row] > 1) decision[k] = { status: 'mơ hồ', row: null, options: 'nhiều nhóm cùng nhắm dòng ' + decision[k].row + '; các dòng của mã: ' + rowsOfCode(groups[k].code).slice(0, 5).map(function (r) { return r + ' (SL ' + ledgerAt[r].qty + ', ' + ledgerAt[r].date + ')'; }).join('; '), dates: Object.keys(groups[k].dates).join(', ') };
    });
    return { groups: groups, decision: decision };
  }

  const bx = relink(d.boxes, 'Import', function (b) { return Number(b[B.QTY_IN]) || 0; }, function (b) { return s(b[B.CODE]); }, function (b) { return s(b[B.TX_ROW]); }, function (b) { return d.toIso(b[B.DATE]); });
  d.boxes.forEach(function (b) {
    const code = s(b[B.CODE]); if (!code && !s(b[B.ID])) return;
    const dec = bx.decision[code + '#' + s(b[B.TX_ROW])];
    const item = itemByCode[code];
    m.fact_box.push({
      box_id: s(b[B.ID]), item_key: item ? item.item_key : 0, location_key: locOf(s(b[B.LOC])), in_tx_no: dec && dec.row ? rowToTx[dec.row] : null,
      box_no: Number(b[B.BOX_NO]) || 0, qty_in: Number(b[B.QTY_IN]) || 0, qty_left: Number(b[B.REMAINING]) || 0, note: s(b[B.NOTE]), relink: dec ? dec.status : 'không tìm thấy'
    });
  });
  Object.keys(bx.decision).forEach(function (k) {
    const g = bx.groups[k], dd = bx.decision[k];
    if (dd.status === 'mơ hồ' || dd.status === 'không tìm thấy') m.review.boxRelink.push('BoxDetail ' + g.code + ' trỏ dòng ' + g.ref + ' (tổng ' + g.qty + ', ngày nhập ' + (dd.dates || '?') + '): ' + dd.status + (dd.options ? ' | các dòng Import của mã: ' + dd.options : ''));
  });

  const mv = relink(d.moves, 'Export', function (x) { return Number(x[BM.QTY]) || 0; }, function (x) { return s(x[BM.CODE]); }, function (x) { return s(x[BM.TX_ROW]); }, function (x) { return d.toIso(x[BM.DATE]); });
  d.moves.forEach(function (x, i) {
    const code = s(x[BM.CODE]); if (!code && !s(x[BM.BOX_ID])) return;
    const dec = mv.decision[code + '#' + s(x[BM.TX_ROW])];
    const item = itemByCode[code];
    m.fact_box_move.push({
      move_id: 'MV' + (i + 2), box_id: s(x[BM.BOX_ID]), item_key: item ? item.item_key : 0, out_tx_no: dec && dec.row ? rowToTx[dec.row] : null,
      qty: Number(x[BM.QTY]) || 0, relink: dec ? dec.status : 'không tìm thấy'
    });
  });
  Object.keys(mv.decision).forEach(function (k) {
    const g = mv.groups[k], dd = mv.decision[k];
    if (dd.status === 'mơ hồ' || dd.status === 'không tìm thấy') m.review.moveRelink.push('BoxMove ' + g.code + ' trỏ dòng ' + g.ref + ' (tổng ' + g.qty + ', ngày xuất ' + (dd.dates || '?') + '): ' + dd.status + (dd.options ? ' | các dòng Export của mã: ' + dd.options : ''));
  });

  /* ── tồn kho theo (mã, địa điểm) ── */
  const boxesLeft = {};
  m.fact_box.forEach(function (b) { if (b.qty_left > 0) { const k = b.item_key + '|' + b.location_key; boxesLeft[k] = (boxesLeft[k] || 0) + 1; } });
  Object.keys(bal).forEach(function (code) {
    Object.keys(bal[code]).forEach(function (k) {
      const it = itemByCode[code];
      m.fact_stock_balance.push({
        item_key: it.item_key, sku: code, location_key: Number(k), qty_on_hand: bal[code][k], qty_in_total: inTot[code][k] || 0, qty_out_total: outTot[code][k] || 0,
        boxes_left: boxesLeft[it.item_key + '|' + k] || 0, last_in: lastIn[code][k] || '', last_out: lastOut[code][k] || ''
      });
      if (bal[code][k] < 0) m.review.negative.push(code + ' @ ' + locName(Number(k)) + ': ' + bal[code][k]);
    });
  });

  /* ── đối soát: tổng theo mã mới = tổng theo mã cũ ── */
  const newTotals = {};
  m.fact_stock_balance.forEach(function (b) { newTotals[b.sku] = (newTotals[b.sku] || 0) + b.qty_on_hand; });
  const mismatch = Object.keys(oldTotals).filter(function (c) { return (newTotals[c] || 0) !== oldTotals[c]; });
  m.stats = {
    oldTotals: oldTotals, units: units, rowsIn: d.ledger.filter(function (r) { return s(r[C.CODE]) || s(r[C.TYPE]) || r[C.QTY]; }).length,
    skuTotalMismatch: mismatch, unknownLocStock: m.fact_stock_balance.filter(function (b) { return b.location_key === 0; }).reduce(function (a, b) { return a + b.qty_on_hand; }, 0)
  };
  return m;
}

/** Báo cáo dễ đọc cho người duyệt. */
function dbmReport_(m) {
  const out = ['=== MIGRATE CHẠY THỬ (không ghi gì vào Sheet) ==='], st = m.stats, rv = m.review;
  const cap = function (arr, n, fmt) { arr.slice(0, n).forEach(function (x) { out.push('      ' + fmt(x)); }); if (arr.length > n) out.push('      … và ' + (arr.length - n) + ' mục nữa'); };
  out.push('Sẽ tạo: dim_item ' + m.dim_item.length + ' · dim_location ' + m.dim_location.length + ' · dim_team ' + m.dim_team.length +
    ' · fact_movement ' + m.fact_movement.length + ' (từ ' + st.rowsIn + ' dòng sổ cái) · fact_stock_balance ' + m.fact_stock_balance.length +
    ' · fact_box ' + m.fact_box.length + ' · fact_box_move ' + m.fact_box_move.length, '');

  out.push((st.skuTotalMismatch.length ? '✗' : '✔') + ' ĐỐI SOÁT: tổng tồn theo mã mới ' + (st.skuTotalMismatch.length ? 'LỆCH ở ' + st.skuTotalMismatch.length + ' mã: ' + st.skuTotalMismatch.slice(0, 8).join(', ') : 'bằng tổng tồn theo mã cũ ở cả ' + m.dim_item.length + ' mã'));
  out.push((rv.negative.length ? '⚠' : '✔') + ' Tồn âm theo (mã, địa điểm) sau khi phân loại lại: ' + rv.negative.length);
  cap(rv.negative, 10, function (x) { return x; });
  out.push((rv.badRows.length ? '✗' : '✔') + ' Dòng sổ cái bị bỏ qua (thiếu mã, loại lạ, số lượng ≤ 0): ' + rv.badRows.length);
  cap(rv.badRows, 8, function (x) { return x; });

  out.push('', 'R2 Dòng xuất bị phân loại lại (nơi ghi → nơi nhận, nơi giữ hàng suy ra): ' + rv.reclassified.length);
  cap(rv.reclassified, 15, function (x) { return 'dòng ' + x.row + ': ' + x.code + ' × ' + x.qty + ' | ghi "' + x.recorded + '" → nơi nhận; lấy từ "' + x.holder + '"'; });
  const holders = {}; rv.reclassified.forEach(function (x) { holders[x.holder] = (holders[x.holder] || 0) + 1; });
  Object.keys(holders).forEach(function (h) { out.push('      nơi giữ hàng được suy ra: "' + h + '" × ' + holders[h]); });

  out.push('', 'R3 Tồn đang nằm ở "Không xác định": ' + st.unknownLocStock + ' đơn vị trên ' + m.fact_stock_balance.filter(function (b) { return b.location_key === 0 && b.qty_on_hand !== 0; }).length + ' mã');
  out.push('R4 Dòng bị ước lượng ngày: ' + rv.dateEstimated.length + ', dòng sheet ' + (dbaRanges_(rv.dateEstimated.map(function (x) { return x.row; })) || '(không có)'));
  const iso = function (k) { k = String(k); return k.length === 8 ? k.slice(0, 4) + '-' + k.slice(4, 6) + '-' + k.slice(6) : ''; };
  const dn = function (x) { return Date.UTC(+x.slice(0, 4), +x.slice(5, 7) - 1, +x.slice(8, 10)) / 86400000; };
  const mv = m.fact_movement.slice().sort(function (x, y) { return x.legacy_row - y.legacy_row; });
  for (let i = 0; i < mv.length; i++) {
    if (!mv[i].date_estimated) continue;
    let j = i; while (j + 1 < mv.length && mv[j + 1].date_estimated) j++;
    const before = i > 0 ? iso(mv[i - 1].date_key) : '', after = j + 1 < mv.length ? iso(mv[j + 1].date_key) : '';
    const gap = before && after ? Math.round(dn(after) - dn(before)) : null;
    out.push('      dòng ' + mv[i].legacy_row + (j > i ? '-' + mv[j].legacy_row : '') + ' (' + (j - i + 1) + ' dòng): dòng có ngày liền trước ' + (before || '(không có)') +
      ', liền sau ' + (after || '(không có)') + (gap !== null ? ', cách ' + gap + ' ngày' : '') + ' → ' + (mv[i].date_key ? 'gán ' + iso(mv[i].date_key) : 'để KHÔNG XÁC ĐỊNH (cách quá ' + DBM_MAX_DATE_GAP + ' ngày)'));
    i = j;
  }
  out.push('R5 Đơn vị: ' + Object.keys(st.units).map(function (k) { return k + ' (' + st.units[k] + ' mã)'; }).join(' · '));
  out.push('   Địa điểm chỉ có trong sổ cái, thêm vào dim_location: ' + (rv.locNotInSheet.length ? rv.locNotInSheet.map(function (x) { return '"' + x + '"'; }).join('; ') : '(không có)'));

  const bs = {}; m.fact_box.forEach(function (b) { bs[b.relink] = (bs[b.relink] || 0) + 1; });
  const ms = {}; m.fact_box_move.forEach(function (b) { ms[b.relink] = (ms[b.relink] || 0) + 1; });
  out.push('', 'R7 Thùng (theo từng thùng): ' + Object.keys(bs).map(function (k) { return k + ' ' + bs[k]; }).join(' · '));
  out.push('   Lần lấy thùng: ' + Object.keys(ms).map(function (k) { return k + ' ' + ms[k]; }).join(' · '));
  out.push('   Cần rà soát tay: ' + (rv.boxRelink.length + rv.moveRelink.length) + ' nhóm');
  cap(rv.boxRelink.concat(rv.moveRelink), 12, function (x) { return x; });

  const ok = !st.skuTotalMismatch.length && !rv.badRows.length;
  out.push('', ok ? '✔ Tổng tồn theo mã đối soát đạt' + (rv.negative.length ? ', nhưng còn ' + rv.negative.length + ' cặp tồn âm theo địa điểm cần xem' : '') + '. Chờ bạn duyệt các mục trên rồi tôi mới viết phần ghi thật.' : '✗ Đối soát chưa đạt: chưa thể ghi thật.');
  return out.join('\n');
}

/** [DEV TOOL] Pha 1, bước 1. Chỉ đọc + tính trong bộ nhớ. Chạy trong editor rồi gửi Logs. */
function migrateDryRun() {
  requireAdmin_();   // [QUYỀN] hàm công khai: ai có link web app cũng gọi được qua google.script.run
  const text = dbmReport_(dbmBuild_(dbmReadInput_()));
  Logger.log(text);
  return text;
}

/* ═══════════ GHI THẬT (Pha 1, bước 2) ═══════════
   migrateWrite(): tạo các sheet dim_* / fact_* / meta MỚI từ mô hình đã chạy thử. KHÔNG sửa, KHÔNG xóa sheet cũ.
   · Dừng nếu đối soát tổng tồn lệch, có dòng sổ cái bị bỏ qua, hoặc đã có sheet mới chứa dữ liệu (dùng migrateReset()).
   · Ghi xong đọc lại chính các sheet mới và đối soát lần nữa.
   migrateReset(): xóa CHỈ các sheet do migrate tạo (tên trong DBM_SPEC và "meta"). App chưa đọc các sheet này nên xóa là an toàn. */

const DBM_SPEC = {
  dim_date: ['date_key', 'date', 'year', 'quarter', 'month', 'week_iso', 'day_of_week', 'is_weekend'],
  dim_location: ['location_key', 'location_code', 'site_type', 'city', 'site_name', 'holds_stock', 'source'],
  dim_team: ['team_key', 'cost_centre', 'team_code', 'department'],
  dim_item: ['item_key', 'sku', 'name', 'variant', 'category', 'sub_category', 'event', 'unit', 'team_key', 'pic_email', 'active', 'valid_from', 'valid_to', 'is_current', 'code_format'],
  dim_movement_type: ['movement_type_key', 'code', 'direction', 'label_vi', 'label_en'],
  fact_movement: ['tx_no', 'date_key', 'item_key', 'location_key', 'destination_key', 'bin', 'team_key', 'movement_type_key', 'qty', 'unit_cost', 'box_count',
    'po_no', 'invoice_no', 'supplier', 'date_estimated', 'location_inferred', 'legacy_row', 'status', 'void_at', 'void_by', 'void_reason', 'created_at', 'created_by'],
  fact_stock_balance: ['item_key', 'sku', 'location_key', 'qty_on_hand', 'qty_in_total', 'qty_out_total', 'boxes_left', 'last_in', 'last_out'],
  fact_box: ['box_id', 'item_key', 'location_key', 'in_tx_no', 'box_no', 'qty_in', 'qty_left', 'note', 'relink'],
  fact_box_move: ['move_id', 'box_id', 'item_key', 'out_tx_no', 'qty', 'relink'],
  meta: ['key', 'value']
};
/* cột luôn giữ dạng chữ (mã, ngày dạng ISO, PO...) để Sheet không đổi "0012" thành số hay "2026-10-01" thành ngày */
const DBM_TEXT = {
  dim_location: ['location_code', 'site_type', 'city', 'site_name', 'source'], dim_team: ['cost_centre', 'team_code', 'department'],
  dim_item: ['sku', 'name', 'variant', 'category', 'sub_category', 'event', 'unit', 'pic_email', 'valid_from', 'valid_to', 'code_format'],
  dim_movement_type: ['code', 'label_vi', 'label_en'],
  fact_movement: ['bin', 'po_no', 'invoice_no', 'supplier', 'status'], fact_stock_balance: ['sku', 'last_in', 'last_out'],
  fact_box: ['box_id', 'note', 'relink'], fact_box_move: ['move_id', 'box_id', 'relink'], meta: ['key', 'value']
};
const DBM_TYPES = [
  { movement_type_key: 1, code: 'IN', direction: 1, label_vi: 'Nhập kho', label_en: 'Receive' },
  { movement_type_key: 2, code: 'OUT', direction: -1, label_vi: 'Xuất kho', label_en: 'Issue' },
  { movement_type_key: 3, code: 'ADJ_IN', direction: 1, label_vi: 'Điều chỉnh tăng', label_en: 'Adjustment in' },
  { movement_type_key: 4, code: 'ADJ_OUT', direction: -1, label_vi: 'Điều chỉnh giảm', label_en: 'Adjustment out' },
  { movement_type_key: 5, code: 'TRANSFER_IN', direction: 1, label_vi: 'Chuyển kho (nhận)', label_en: 'Transfer in' },
  { movement_type_key: 6, code: 'TRANSFER_OUT', direction: -1, label_vi: 'Chuyển kho (đi)', label_en: 'Transfer out' }
];

/** Tuần ISO dạng "2026-W43". */
function dbmIsoWeek_(dt) {
  const d = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const y = d.getUTCFullYear();
  return y + '-W' + ('0' + Math.ceil(((d - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7)).slice(-2);
}

/** dim_date cho 2020-2035 cộng dòng 0 "Không xác định". */
function dbmDateRows_() {
  const rows = [{ date_key: 0, date: '', year: '', quarter: '', month: '', week_iso: '', day_of_week: 'Không xác định', is_weekend: false }];
  const names = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
  for (let t = Date.UTC(2020, 0, 1); t <= Date.UTC(2035, 11, 31); t += 86400000) {
    const dt = new Date(t), y = dt.getUTCFullYear(), mo = dt.getUTCMonth() + 1, da = dt.getUTCDate(), wd = dt.getUTCDay();
    rows.push({
      date_key: y * 10000 + mo * 100 + da, date: new Date(y, mo - 1, da, 12), year: y, quarter: 'Q' + Math.ceil(mo / 3), month: mo,
      week_iso: dbmIsoWeek_(dt), day_of_week: names[wd], is_weekend: wd === 0 || wd === 6
    });
  }
  return rows;
}

/** Mô hình -> { tên sheet: [dòng] } đúng thứ tự cột của DBM_SPEC. */
function dbmTables_(m, meta) {
  const typeKey = { IN: 1, OUT: 2 };
  return {
    dim_date: dbmDateRows_(), dim_location: m.dim_location, dim_team: m.dim_team, dim_item: m.dim_item, dim_movement_type: DBM_TYPES,
    fact_movement: m.fact_movement.map(function (r) { return Object.assign({}, r, { movement_type_key: typeKey[r.movement_type], void_at: '', void_by: '', void_reason: '', created_at: '', created_by: '' }); }),
    fact_stock_balance: m.fact_stock_balance, fact_box: m.fact_box, fact_box_move: m.fact_box_move,
    meta: Object.keys(meta).map(function (k) { return { key: k, value: meta[k] }; })
  };
}

function dbmWriteSheet_(name, rows) {
  const cols = DBM_SPEC[name], text = DBM_TEXT[name] || [];
  const sh = ensureSheet_(name, cols, cols.length);
  if (rows.length) {
    const vals = rows.map(function (r) {
      return cols.map(function (c) { const v = r[c]; return v === null || v === undefined ? '' : cell_(v, text.indexOf(c) !== -1); });
    });
    sh.getRange(2, 1, vals.length, cols.length).setValues(vals);
  }
  return rows.length;
}

/** Đọc lại các sheet vừa ghi và đối soát với tổng tồn theo mã của sổ cái cũ. */
function dbmVerify_(m, written) {
  const read = function (name) {
    const sh = ss_().getSheetByName(name);
    return sh && sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, DBM_SPEC[name].length).getValues() : [];
  };
  const out = { counts: [], mismatch: [] };
  Object.keys(written).forEach(function (n) {
    const got = read(n).length;
    out.counts.push((got === written[n] ? '✔ ' : '✗ ') + n + ': ' + got + (got === written[n] ? '' : ' (cần ' + written[n] + ')'));
  });
  const skuOf = {}, ix = DBM_SPEC.dim_item;
  read('dim_item').forEach(function (r) { skuOf[r[ix.indexOf('item_key')]] = String(r[ix.indexOf('sku')]); });
  const dir = {}; DBM_TYPES.forEach(function (t) { dir[t.movement_type_key] = t.direction; });
  const fx = DBM_SPEC.fact_movement, sums = {};
  read('fact_movement').forEach(function (r) {
    const sku = skuOf[r[fx.indexOf('item_key')]];
    sums[sku] = (sums[sku] || 0) + dir[r[fx.indexOf('movement_type_key')]] * Number(r[fx.indexOf('qty')]);
  });
  Object.keys(m.stats.oldTotals).forEach(function (c) { if ((sums[c] || 0) !== m.stats.oldTotals[c]) out.mismatch.push(c); });
  const bx = DBM_SPEC.fact_stock_balance, balSum = {};
  read('fact_stock_balance').forEach(function (r) { const sku = String(r[bx.indexOf('sku')]); balSum[sku] = (balSum[sku] || 0) + Number(r[bx.indexOf('qty_on_hand')]); });
  Object.keys(m.stats.oldTotals).forEach(function (c) { if ((balSum[c] || 0) !== m.stats.oldTotals[c] && out.mismatch.indexOf(c) === -1) out.mismatch.push(c); });
  return out;
}

function dbmReadInput_() {
  const rowsOf = function (name, cols) {
    const sh = ss_().getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return [];
    return sh.getRange(2, 1, sh.getLastRow() - 1, Math.min(cols, sh.getMaxColumns())).getValues();
  };
  const tm = teamMap_(), dm = deptMap_();
  return {
    ledger: rowsOf(SH_DB, DB_COLS), boxes: rowsOf(SH_BOX, BOX_COLS), moves: rowsOf(SH_BOXMOVE, BOXMOVE_COLS),
    locs: locations_(), toIso: toIso_,
    teamOf: function (cc) { return tm[cc.toUpperCase()] || cc.toUpperCase(); },
    deptOf: function (cc) { return dm[cc.toUpperCase()] || ''; }
  };
}

/** [DEV TOOL] Pha 1, bước 2. Tạo sheet MỚI và ghi dữ liệu. Chạy sau khi đã duyệt báo cáo của migrateDryRun(). */
function migrateWrite() {
  const u = requireAdmin_();   // [QUYỀN] hàm công khai: ai có link web app cũng gọi được qua google.script.run
  return withLock_(function () {
    const m = dbmBuild_(dbmReadInput_());

    /* điều kiện dừng: không ghi gì nếu chưa an toàn */
    if (m.stats.skuTotalMismatch.length) throw new Error('Dừng: tổng tồn theo mã lệch ở ' + m.stats.skuTotalMismatch.length + ' mã. Chạy migrateDryRun() để xem.');
    if (m.review.badRows.length) throw new Error('Dừng: ' + m.review.badRows.length + ' dòng sổ cái bị bỏ qua. Chạy migrateDryRun() để xem.');
    const existing = Object.keys(DBM_SPEC).filter(function (n) { const sh = ss_().getSheetByName(n); return sh && sh.getLastRow() > 1; });
    if (existing.length) throw new Error('Dừng: đã có dữ liệu ở ' + existing.join(', ') + '. Nếu muốn làm lại, chạy migrateReset() trước.');

    const meta = { schema_version: 1, migrated_at: new Date().toISOString(), build_id: APP_BUILD_ID,
      next_tx_no: m.fact_movement.reduce(function (a, r) { return Math.max(a, r.tx_no); }, 0) + 1,
      source_rows_database: m.stats.rowsIn, source_rows_boxdetail: m.fact_box.length, source_rows_boxmove: m.fact_box_move.length };
    const tables = dbmTables_(m, meta), written = {};
    Object.keys(DBM_SPEC).forEach(function (n) { written[n] = dbmWriteSheet_(n, tables[n]); });
    SpreadsheetApp.flush();

    const v = dbmVerify_(m, written);
    log_(u, 'MIGRATE_WRITE', Object.keys(written).map(function (n) { return n + '=' + written[n]; }).join(' · ') + (v.mismatch.length ? ' · LỆCH ' + v.mismatch.length : ''));
    const text = ['=== ĐÃ GHI CÁC SHEET MỚI (sheet cũ không bị đụng tới) ===']
      .concat(v.counts)
      .concat(['', (v.mismatch.length ? '✗ ĐỌC LẠI: tổng tồn LỆCH ở ' + v.mismatch.length + ' mã: ' + v.mismatch.slice(0, 8).join(', ') + '. Chạy migrateReset() rồi báo tôi.'
        : '✔ ĐỌC LẠI TỪ CÁC SHEET MỚI: tổng tồn theo mã và theo (mã, địa điểm) bằng sổ cái cũ ở cả ' + Object.keys(m.stats.oldTotals).length + ' mã.'),
        'App vẫn đọc và ghi sheet cũ như trước. Các sheet mới chưa được app dùng.'])
      .join('\n');
    Logger.log(text);
    return text;
  });
}

/** [DEV TOOL] Xóa các sheet do migrateWrite() tạo (chỉ các tên trong DBM_SPEC). Không đụng sheet cũ. */
function migrateReset() {
  const u = requireAdmin_();   // [QUYỀN] hàm công khai: ai có link web app cũng gọi được qua google.script.run
  return withLock_(function () {
    const gone = [];
    Object.keys(DBM_SPEC).forEach(function (n) {
      const sh = ss_().getSheetByName(n);
      if (sh) { ss_().deleteSheet(sh); delete _sheetCache[n]; gone.push(n); }
    });
    log_(u, 'MIGRATE_RESET', gone.join(', '));
    const text = gone.length ? 'Đã xóa: ' + gone.join(', ') : 'Không có sheet mới nào để xóa.';
    Logger.log(text);
    return text;
  });
}
