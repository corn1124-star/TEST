/* ═══════════ NHÓM 8: CHI TIẾT THÙNG ═══════════
   BoxDetail giữ TRẠNG THÁI (còn bao nhiêu), BoxMove giữ LỊCH SỬ (đã lấy khi nào).
   FIFO: xuất trừ hết thùng số nhỏ trước — consumeFifo_() tự phân bổ. */

function boxRows_() {
  const sh = boxSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  return sh.getRange(2, 1, lastRow - 1, BOX_COLS).getValues();
}

/** Tổng số hàng các thùng của mã còn ghi là CÒN. */
function boxRemainingOf_(code) {
  let sum = 0;
  boxRows_().forEach(function (r) { if (String(r[B.CODE] || '').trim() === code) sum += Number(r[B.REMAINING]) || 0; });
  return sum;
}

/** Số hàng các thùng ghi còn NHIỀU HƠN tồn kho của mã (phần "ma", luôn ≥ 0). Sổ cái mới là chuẩn nên phần này phải bằng 0. */
function boxExcess_(code, stock) { return Math.max(0, boxRemainingOf_(code) - stock); }

/** Số thùng kế tiếp của 1 Asset Code. Đánh số LIÊN TỤC theo mã, KHÔNG reset theo lần nhập. */
function nextBoxNo_(code) {
  let max = 0;
  boxRows_().forEach(function (r) {
    if (String(r[B.CODE] || '').trim() !== code) return;
    const n = Number(r[B.BOX_NO]) || 0;
    if (n > max) max = n;
  });
  return max + 1;
}

/**
 * Ghi chi tiết thùng cho NHIỀU lần nhập cùng lúc: đọc BoxDetail 1 lần, ghi 1 lần.
 * items = [{ code, cc, txRow, date, loc, boxes:[số lượng từng thùng], note?, saved? }]. Số thùng đánh LIÊN TỤC theo mã.
 * saved (tùy chọn, khôi phục giao dịch đã xóa) = mảng song song với boxes: [{ boxNo, loc, note }]. Thùng nào có boxNo chưa bị
 * thùng khác của cùng mã dùng thì GIỮ đúng số đó (nhãn đã dán không đổi), cùng địa điểm / ghi chú đã lưu; đã bị dùng thì đánh số mới.
 * [TEAM] Ghi CC THẬT của người nhập, không ghi team code.
 * @return số thùng đã ghi
 */
function appendBoxesBatch_(items) {
  const clean = function (boxes) {
    return (boxes || []).map(function (x) { return Number(x) || 0; }).filter(function (x) { return x > 0; });
  };
  const todo = (items || []).filter(function (it) { return clean(it.boxes).length; });
  if (!todo.length) return 0;

  const maxNo = {};                                            // số thùng lớn nhất hiện có theo mã
  const usedNo = {};                                           // các số thùng đã có theo mã (để giữ lại số cũ khi khôi phục)
  boxRows_().forEach(function (r) {
    const code = String(r[B.CODE] || '').trim(), n = Number(r[B.BOX_NO]) || 0;
    if (n > (maxNo[code] || 0)) maxNo[code] = n;
    (usedNo[code] = usedNo[code] || {})[n] = true;
  });

  const rows = [];
  todo.forEach(function (it) {
    const when = it.date ? isoToDate_(it.date) : '';           // ngày trống (giao dịch cũ không có ngày) thì để trống, không ném lỗi
    const used = usedNo[it.code] = usedNo[it.code] || {};
    (it.boxes || []).map(function (x, i) { return { qty: Number(x) || 0, s: it.saved && it.saved[i] }; })
      .filter(function (x) { return x.qty > 0; })
      .forEach(function (x) {
        const keep = x.s && Number(x.s.boxNo) > 0 && !used[Number(x.s.boxNo)];
        const no = keep ? Number(x.s.boxNo) : (maxNo[it.code] || 0) + 1;
        used[no] = true;
        if (no > (maxNo[it.code] || 0)) maxNo[it.code] = no;
        rows.push([
          Utilities.getUuid().substring(0, 8).toUpperCase(),   // Box ID nội bộ
          boxCodeOf_(it.code, no),                             // Box Code in trên nhãn
          it.code, it.cc, it.txRow, when, no, x.qty, x.qty,
          cell_(keep && x.s.loc ? x.s.loc : it.loc), keep && x.s.note !== undefined ? cell_(String(x.s.note || '')) : (it.note || '')
        ]);
      });
  });

  const sh = boxSheet_();
  const start = sh.getLastRow() + 1;
  sh.getRange(start, 1, rows.length, BOX_COLS).setValues(rows);
  sh.getRange(start, B.DATE + 1, rows.length, 1).setNumberFormat('dd/mm/yyyy');
  dbChanged_();   // dbChanged_ của appendTx_ chạy TRƯỚC khi có thùng: bump lại để cache tổng hợp (boxLeft) không giữ số thùng cũ
  return rows.length;
}

/**
 * Ghi chi tiết thùng cho 1 lần NHẬP kho.
 * @param boxes mảng số lượng từng thùng, vd [50, 50, 30]. Rỗng -> không ghi gì.
 * @param saved (tùy chọn) [{ boxNo, loc, note }] song song với boxes — dùng khi khôi phục, xem appendBoxesBatch_.
 */
function appendBoxes_(code, cc, txRow, date, loc, boxes, saved) {
  return appendBoxesBatch_([{ code: code, cc: cc, txRow: txRow, date: date, loc: loc, boxes: boxes, saved: saved }]);
}

/**
 * Trừ FIFO cho NHIỀU lệnh xuất cùng lúc: đọc BoxDetail 1 lần, ghi cột "còn lại" 1 lần, ghi BoxMove 1 lần
 * (kiểm kê hàng nghìn mã không được gọi sheet theo từng mã — script bị cắt ở 6 phút).
 * reqs = [{ code, qty, date, pic, txRow }], các lệnh được áp dụng LẦN LƯỢT (lệnh sau thấy kết quả lệnh trước).
 * KHÔNG throw khi thùng không đủ: tồn kho ở Database là nguồn chân lý.
 * Thùng của SKU nào là của SKU đó (không lọc theo CC).
 * @return mảng phân bổ cho từng lệnh: [[{ boxNo, boxCode, qty, left }...], ...]
 */
function consumeFifoBatch_(reqs) {
  const out = (reqs || []).map(function () { return []; });
  const sh = boxSheet_();
  const lastRow = sh.getLastRow();
  if (!out.length || lastRow < 2) return out;

  const vals = sh.getRange(2, 1, lastRow - 1, BOX_COLS).getValues();

  const rowsOf = {};                                           // chỉ số dòng (trong vals) của các thùng theo mã
  vals.forEach(function (r, i) {
    const code = String(r[B.CODE] || '').trim();
    (rowsOf[code] = rowsOf[code] || []).push(i);
  });

  const moves = [], stamp = new Date();
  const before = vals.map(function (r) { return [r[B.REMAINING]]; });   // để trả "còn lại" về như cũ nếu ghi BoxMove lỗi
  let first = -1, last = -1;                                   // đoạn dòng BoxDetail bị đổi -> ghi 1 lần

  reqs.forEach(function (q, k) {
    let need = Number(q.qty) || 0;
    if (need <= 0) return;

    const pool = (rowsOf[q.code] || []).filter(function (i) {
      return (Number(vals[i][B.REMAINING]) || 0) > 0;
    }).sort(function (a, b) { return (Number(vals[a][B.BOX_NO]) || 0) - (Number(vals[b][B.BOX_NO]) || 0); });

    let when = null;
    pool.forEach(function (i) {
      if (need <= 0) return;
      const r = vals[i], left = Number(r[B.REMAINING]) || 0, take = Math.min(left, need);
      need -= take;
      when = when || (q.date ? isoToDate_(q.date) : '');
      r[B.REMAINING] = left - take;
      first = first < 0 ? i : Math.min(first, i);              // pool xếp theo số thùng, không nhất thiết theo số dòng
      last = Math.max(last, i);

      out[k].push({ boxNo: Number(r[B.BOX_NO]) || 0, boxCode: String(r[B.BOX_CODE] || ''), qty: take, left: left - take });
      moves.push([stamp, q.code, String(r[B.ID] || ''), Number(r[B.BOX_NO]) || 0, take, when, cell_(q.pic), q.txRow || '']);
    });
  });

  if (first >= 0) {
    const span = vals.slice(first, last + 1).map(function (r) { return [r[B.REMAINING]]; });
    sh.getRange(first + 2, B.REMAINING + 1, span.length, 1).setValues(span);
  }
  if (moves.length) {
    try {
      const mv = boxMoveSheet_();
      mv.getRange(mv.getLastRow() + 1, 1, moves.length, BOXMOVE_COLS).setValues(moves);
    } catch (err) {
      /* Ghi lịch sử lấy thùng lỗi: trả cột "còn lại" về như cũ, nếu không thùng bị trừ mà không có BoxMove và người gọi (undoTx_) không hoàn lại được. */
      try { sh.getRange(first + 2, B.REMAINING + 1, last - first + 1, 1).setValues(before.slice(first, last + 1)); } catch (ig) {}
      dbChanged_();
      throw err;
    }
  }
  if (first >= 0) dbChanged_();   // dbChanged_ của appendTx_ chạy TRƯỚC khi trừ thùng: bump lại để cache không giữ số thùng cũ
  return out;
}

/**
 * Trừ số lượng xuất vào các thùng theo FIFO — thùng số NHỎ trước. (1 lệnh; xem consumeFifoBatch_)
 */
function consumeFifo_(code, qty, date, pic, txRow) {
  return consumeFifoBatch_([{ code: code, qty: qty, date: date, pic: pic, txRow: txRow }])[0];
}
/**
 * [API — ADMIN] CHI TIẾT 1 MẶT HÀNG — lịch sử giao dịch + tổng hợp tồn + chi tiết thùng.
 */
function getItemDetail(code) {
  try {
    const u = requireAdmin_();        // chi tiết giao dịch của mã (giá, PO, nhà cung cấp) chỉ dành cho admin
    const target = String(code || '').trim();
    if (!target) throw new Error('Thiếu Asset Code.');

    /* ── PHẦN 1: lịch sử giao dịch ── */
    const rows = [];
    let imp = 0, exp = 0, boxImp = 0, value = 0;
    let meta = null;
    const locs = {}, pics = {}, bins = {};

    readAllRows_().forEach(function (r, i) {
      if (String(r[C.CODE] || '').trim() !== target) return;

      const tx = rowToTx_(r, i + 2);
      rows.push(tx);

      if (tx.type === 'Import') {
        imp += tx.qty; boxImp += tx.boxCount;
        value += tx.purchasePrice * tx.qty;
        locs[tx.loc] = (locs[tx.loc] || 0) + tx.qty;
      } else {
        exp += tx.qty;
        locs[tx.loc] = (locs[tx.loc] || 0) - tx.qty;
      }

      if (tx.pic) pics[tx.pic] = true;
      if (tx.bin) bins[tx.bin] = true;

      // Mô tả lấy từ dòng NHẬP đầu tiên — dòng gốc tạo mã
      if (!meta || (tx.type === 'Import' && meta.type !== 'Import')) {
        meta = {
          code: tx.code, cat: tx.cat, sub: tx.sub, name: tx.name,
          variant: tx.variant, event: tx.event, unit: tx.unit, cc: tx.cc,
          dept: tx.dept, type: tx.type, bin: tx.bin,
          poNo: tx.poNo, invoiceNo: tx.invoiceNo,
          supplier: tx.supplier, purchasePrice: tx.purchasePrice
        };
      }
    });

    if (!rows.length) {
      return { ok: false, message: 'Không tìm thấy giao dịch nào của mã ' + target + '.' };
    }

    rows.sort(function (a, b) { return Number(b.no) - Number(a.no); });

    let mainLoc = '—', best = -1;
    Object.keys(locs).forEach(function (L) {
      if (locs[L] > best) { best = locs[L]; mainLoc = L; }
    });

    /* ── PHẦN 2: chi tiết thùng ── */
    const boxes = [];
    let boxIn = 0, boxLeft = 0;

    boxRows_().forEach(function (r) {
      if (String(r[B.CODE] || '').trim() !== target) return;

      const qtyIn = Number(r[B.QTY_IN]) || 0;
      const left  = Number(r[B.REMAINING]) || 0;

      boxIn += qtyIn;
      boxLeft += left;

      boxes.push({
        boxId: String(r[B.ID] || ''),
        boxCode: String(r[B.BOX_CODE] || '').trim(),
        boxNo: Number(r[B.BOX_NO]) || 0,
        date: toIso_(r[B.DATE]), dateVn: toVn_(toIso_(r[B.DATE])),
        qtyIn: qtyIn, left: left, out: qtyIn - left,
        loc: String(r[B.LOC] || '').trim(),
        txRow: Number(r[B.TX_ROW]) || 0,
        moves: []
      });
    });

    boxes.sort(function (a, b) { return a.boxNo - b.boxNo; });

    // Lịch sử xuất, gắn vào từng thùng
    if (boxes.length) {
      const byId = {};
      boxes.forEach(function (b) { byId[b.boxId] = b; });

      const mv = boxMoveSheet_();
      const mvLast = mv.getLastRow();

      if (mvLast >= 2) {
        const tz = ss_().getSpreadsheetTimeZone();

        mv.getRange(2, 1, mvLast - 1, BOXMOVE_COLS).getValues().forEach(function (r) {
          if (String(r[BM.CODE] || '').trim() !== target) return;

          const b = byId[String(r[BM.BOX_ID] || '')];
          if (!b) return;

          b.moves.push({
            ts: r[BM.TS] instanceof Date
                  ? Utilities.formatDate(r[BM.TS], tz, 'dd/MM HH:mm') : String(r[BM.TS] || ''),
            qty: Number(r[BM.QTY]) || 0,
            date: toIso_(r[BM.DATE]),
            dateVn: toVn_(toIso_(r[BM.DATE])),
            pic: String(r[BM.PIC] || '').trim()
          });
        });
      }

      boxes.forEach(function (b) {
        b.moves.sort(function (x, y) { return x.date < y.date ? 1 : -1; });
      });
    }

    log_(u, 'ITEM_DETAIL', target + ' | ' + rows.length + ' GD · ' + boxes.length + ' thùng');

    return {
      ok: true,
      meta: meta,
      rows: rows,
      summary: {
        imp: imp, exp: exp, stock: imp - exp, boxImp: boxImp,
        value: value, txCount: rows.length,
        mainLoc: best > 0 ? mainLoc : '—',
        picList: Object.keys(pics).join(', '),
        binList: Object.keys(bins).join(', '),
        first: rows[rows.length - 1].date,
        last: rows[0].date
      },
      hasBoxes: boxes.length > 0,
      boxes: boxes,
      boxSummary: {
        boxCount: boxes.length,
        boxWithStock: boxes.filter(function (b) { return b.left > 0; }).length,
        totalIn: boxIn, totalLeft: boxLeft, totalOut: boxIn - boxLeft
      }
    };
  } catch (e) { return { ok: false, message: e.message }; }
}

