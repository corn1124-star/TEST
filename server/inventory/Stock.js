/* ═══════════ NHÓM 7: TỒN KHO & GHI DỮ LIỆU ═══════════ */

/** Tồn của 1 mã SKU = mọi dòng mang SKU đó (SKU thuộc đúng 1 bộ phận nên không cần lọc theo CC). */
function stockOf_(code) {
  let imp = 0, exp = 0;

  readAllRows_().forEach(function (r) {
    if (String(r[C.CODE] || '').trim() !== code) return;
    const q = Number(r[C.QTY]) || 0;
    if (String(r[C.TYPE]).trim() === 'Import') imp += q; else exp += q;
  });

  return { imp: imp, exp: exp, stock: imp - exp };
}

function nextNo_(sh) {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return 1;

  let max = 0;
  readAllRows_().forEach(function (r) {            // dùng memo, không đọc lại cột No
    const n = parseInt(r[C.NO], 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return max + 1;
}

/**
 * Ghi NHIỀU dòng giao dịch bằng 1 lệnh setValues (appendTx_ lặp N lần = N lần đọc + ghi).
 * @return mảng số dòng Sheet của từng giao dịch, cùng thứ tự với list.
 */
function appendTxBatch_(sh, list) {
  if (!list.length) return [];

  const first = nextNo_(sh);
  const rows = list.map(function (o, i) { return txCells_(first + i, o); });

  const start = sh.getLastRow() + 1;
  sh.getRange(start, 1, rows.length, DB_COLS).setValues(rows);
  sh.getRange(start, C.DATE + 1, rows.length, 1).setNumberFormat('dd/mm/yyyy');
  sh.getRange(start, C.PURCHASE_PRICE + 1, rows.length, 1).setNumberFormat('#,##0');
  dbChanged_();

  return rows.map(function (r, i) { return start + i; });
}

/** Một dòng sheet Database (21 cột) từ giao dịch `o`; chuỗi người dùng nhập đi qua cell_. */
function txCells_(no, o) {
  return [
    no, o.code, o.type, o.dept, o.cc, cell_(o.pic), cell_(o.cat), cell_(o.sub), cell_(o.name),
    o.qty, o.unit, (o.keepEmptyDate && !o.date ? '' : isoToDate_(o.date)), cell_(o.loc), cell_(o.event), cell_(o.variant || ''),
    cell_(o.poNo || '', true), cell_(o.invoiceNo || '', true), cell_(o.supplier || ''),
    Number(o.purchasePrice) || 0, Number(o.boxCount) || 0, cell_(o.bin || '')
  ];
}

function appendTx_(sh, o) {
  const no = nextNo_(sh);
  sh.appendRow(txCells_(no, o));

  dbChanged_();

  const last = sh.getLastRow();
  sh.getRange(last, C.DATE + 1).setNumberFormat('dd/mm/yyyy');
  sh.getRange(last, C.PURCHASE_PRICE + 1).setNumberFormat('#,##0');
  return last;
}

/**
 * Gỡ dòng giao dịch vừa ghi (và thùng gắn với nó) khi bước sau lỗi, để bấm lại không ghi hai lần.
 * Gọi TRONG khoá, ngay sau appendTx_: dòng `row` phải là dòng cuối nên xóa không làm dời dòng nào.
 */
function undoTx_(sh, row) {
  try {
    const bs = boxSheet_(), bv = boxRows_();
    for (let i = bv.length - 1; i >= 0; i--) if (Number(bv[i][B.TX_ROW]) === row) bs.deleteRow(i + 2);
  } catch (e) {}
  try { sh.deleteRow(row); dbChanged_(); SpreadsheetApp.flush(); } catch (e) {}
}

