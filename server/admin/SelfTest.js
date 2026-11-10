/* ═══════════ TỰ KIỂM TRA LOGIC THUẦN ═══════════
   Chạy tay trong editor sau mỗi lần sửa mã: selfTest(). Chỉ gọi hàm thuần, KHÔNG đọc / ghi Sheet.
   Có ✗ thì hàm ném lỗi kèm danh sách, nên lỗi hiện ngay ở bảng Executions. */

function selfTest() {
  requireAdmin_();   // [QUYỀN] hàm công khai: ai có link web app cũng gọi được qua google.script.run
  const out = [];
  let failed = 0;

  function eq(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) failed++;
    out.push((ok ? '✔ ' : '✗ ') + name + (ok ? '' : ' — được ' + JSON.stringify(got) + ', cần ' + JSON.stringify(want)));
  }

  /* cell_: chặn công thức, giữ nguyên chữ thường, ép chữ cho mã */
  eq('cell_ chặn công thức =', cell_('=IMAGE("x")'), "'=IMAGE(\"x\")");
  eq('cell_ chặn + - @', [cell_('+84'), cell_('-A'), cell_('@a')], ["'+84", "'-A", "'@a"]);
  eq('cell_ giữ chữ thường', cell_('Áo thun'), 'Áo thun');
  eq('cell_ ép chữ cho mã', [cell_('0012', true), cell_('', true), cell_(5)], ["'0012", '', 5]);
  eq('cellsRow_', cellsRow_(['=x', '0012', 3], [1]), ["'=x", "'0012", 3]);

  /* username không trùng (không phân biệt hoa thường, bỏ qua dòng đang sửa) */
  const team = [['a@x', 'Minh', 'CC', 'member'], ['b@x', ' Lan ', 'CC', 'admin']];
  eq('usernameTaken_ trùng', [usernameTaken_(team, 'minh'), usernameTaken_(team, 'LAN')], [true, true]);
  eq('usernameTaken_ khác', usernameTaken_(team, 'Hoa'), false);
  eq('usernameTaken_ chính dòng đang sửa', [usernameTaken_(team, 'Minh', 2), usernameTaken_(team, 'Minh', 3)], [false, true]);

  /* số thùng, dòng cũ, ngày, mã thùng */
  eq('boxCountOk_', [boxCountOk_(0, 5), boxCountOk_(5, 5), boxCountOk_(6, 5), boxCountOk_(1.5, 5), boxCountOk_(-1, 5), boxCountOk_(1001, 5000)],
     [true, true, false, false, false, false]);
  eq('txRowStale_', [txRowStale_([], null), txRowStale_(['', 'A-1'], { code: 'A-1' }), txRowStale_(['', 'A-1'], { code: 'B-2' })],
     [false, false, true]);
  eq('isoValid_', [isoValid_('2026-02-28'), isoValid_('2026-02-30'), isoValid_('2026-13-01'), isoValid_('28/02/2026')], [true, false, false, false]);
  eq('boxCodeOf_', boxCodeOf_('GEA-0012', 3), 'GEA-0012.B03');
  eq('needsVariant_', [needsVariant_('Clothes'), needsVariant_('Gear')], [true, false]);

  /* dòng Database: đúng 21 cột, mã PO / hoá đơn giữ dạng chữ, công thức bị chặn */
  const row = txCells_(7, { code: 'A-1', type: 'Import', dept: 'D', cc: 'CC', pic: '=evil', cat: 'c', sub: 's', name: 'n', qty: 2,
    unit: 'Each', date: '2026-10-23', loc: 'L', event: 'e', poNo: '0012', invoiceNo: '01/10', supplier: '=x', purchasePrice: 5, boxCount: 1 });
  eq('txCells_ cột', row.length, DB_COLS);
  eq('txCells_ chặn công thức / giữ mã', [row[C.PIC], row[C.PO_NO], row[C.INVOICE_NO], row[C.SUPPLIER]], ["'=evil", "'0012", "'01/10", "'=x"]);

  /* cấp SKU: biến thể mới cùng sản phẩm, trùng đuôi mã -> thêm số; sản phẩm mới -> số kế tiếp */
  const idx = skuNewIndex_();
  skuIndexAdd_(idx, { sku: 'CLO-0001-SL', team: 'T', cat: 'Clothes', sub: 'Clothes', name: 'Polo', variant: 'Size L', event: 'Y26', productNo: 1 });
  eq('skuVarCode_', [skuVarCode_('M'), skuVarCode_('Size L'), skuVarCode_('Size XL')], ['M', 'SL', 'SXL']);
  eq('skuAllocate_ trùng đuôi', skuAllocate_(idx, 'T', 'Clothes', 'Clothes', 'Polo', 'Size Long', 'Y26').sku, 'CLO-0001-SL2');
  eq('skuAllocate_ đã có', skuAllocate_(idx, 'T', 'Clothes', 'Clothes', 'Polo', 'Size L', 'Y26').existing, true);
  eq('skuAllocate_ sản phẩm mới', skuAllocate_(idx, 'T', 'Clothes', 'Clothes', 'Cap', '', 'Y26').sku, 'CLO-0002');

  /* dbAuditRun_ (Pha 0): tồn âm theo mã và theo (mã, địa điểm), mã lạ, địa điểm lạ, thùng trỏ sai dòng sổ cái */
  const L = function (no, code, type, qty, loc) {
    const r = []; for (let i = 0; i < DB_COLS; i++) r.push('');
    r[C.NO] = no; r[C.CODE] = code; r[C.TYPE] = type; r[C.QTY] = qty; r[C.LOC] = loc; r[C.DATE] = '2026-10-01'; r[C.UNIT] = 'Each'; r[C.NAME] = 'n';
    return r;
  };
  const aud = dbAuditRun_({
    ledger: [L(1, 'A-1', 'Import', 10, 'Kho A'), L(2, 'A-1', 'Export', 15, 'Kho A'), L(3, 'B-2', 'Import', 5, 'Kho Z')],
    boxes: [['BX1', 'BX1', 'A-1', 'CC', 3, '', 1, 4, 4, 'Kho A', '']], moves: [], photos: [], stkLines: [], pending: [],
    sku: { 'A-1': { name: 'n', variant: '', cat: '', sub: '', event: '', unit: 'Each' } }, locs: ['Kho A'], units: ['Each'],
    toIso: function (v) { return v; }
  });
  const cnt = {}; aud.forEach(function (x) { cnt[x.id] = x.count; });
  eq('dbAuditRun_ tồn âm / mã lạ / địa điểm lạ', [cnt.L11, cnt.L12, cnt.L5, cnt.L6], [1, 1, 1, 1]);
  eq('dbAuditRun_ thùng trỏ sai dòng, dữ liệu sạch không báo', [cnt.B1, cnt.B3, cnt.L2, cnt.L8], [1, 0, 0, 0]);

  /* dbmBuild_ (Pha 1, chạy thử): R2 phân loại xuất, R3 địa điểm trống, R4 ngày thiếu, R5 đơn vị, R7 nối thùng, đối soát */
  const SEC = 'Warehouse - HCM - SEC', F15 = 'Main Office - HCM - F15';
  const M = function (no, code, type, qty, loc, date, unit) {
    const r = []; for (let i = 0; i < DB_COLS; i++) r.push('');
    r[C.NO] = no; r[C.CODE] = code; r[C.TYPE] = type; r[C.QTY] = qty; r[C.LOC] = loc; r[C.DATE] = date; r[C.UNIT] = unit; r[C.NAME] = 'n'; r[C.CC] = 'OPSGFB';
    return r;
  };
  const bxRow = ['BX1', 'BX1', 'A-1', 'CC', 99, '', 1, 10, 10, SEC, ''];
  const mig = dbmBuild_({
    ledger: [M(1, 'A-1', 'Import', 10, SEC, '2026-10-01', 'Each'), M(2, 'B-2', 'Import', 5, '', '', 'Pack'),
             M(3, 'A-1', 'Export', 4, F15, '2026-10-02', 'Each'), M(4, 'B-2', 'Export', 5, '', '2026-10-03', 'Pack')],
    boxes: [bxRow], moves: [], locs: [SEC], toIso: function (v) { return v; },
    teamOf: function (cc) { return 'OPS'; }, deptOf: function (cc) { return 'Operations'; }
  });
  const balA = mig.fact_stock_balance.filter(function (b) { return b.sku === 'A-1'; });
  const outRow = mig.fact_movement[2];
  eq('dbmBuild_ xuất tại nơi nhận: giữ hàng ở SEC, F15 là nơi nhận', [outRow.location_key, outRow.destination_key, outRow.location_inferred, mig.dim_location[outRow.destination_key].location_code], [1, 2, true, F15]);
  eq('dbmBuild_ tồn theo địa điểm và không âm', [balA.length, balA[0].qty_on_hand, mig.review.negative.length], [1, 6, 0]);
  eq('dbmBuild_ địa điểm trống -> 0, ngày thiếu lấy dòng trước, đơn vị đổi', [mig.fact_movement[1].location_key, mig.fact_movement[1].date_key, mig.fact_movement[1].date_estimated, mig.dim_item[0].unit], [0, 20261001, true, 'Piece']);
  eq('dbmBuild_ nối thùng về dòng Import đúng, đối soát khớp', [mig.fact_box[0].relink, mig.fact_box[0].in_tx_no, mig.stats.skuTotalMismatch.length, mig.review.badRows.length], ['sửa', 1, 0, 0]);

  /* dbmBuild_: hai dòng xuất cùng số lượng, lần lấy thùng phân biệt bằng ngày; dòng xuất lớn hơn tổng thùng */
  const mvRow = function (code, qty, date, ref) { return ['2026-10-03', code, 'BX1', 1, qty, date, 'p', ref]; };
  const mig2 = dbmBuild_({
    ledger: [M(1, 'A-1', 'Import', 20, SEC, '2026-10-01', 'Each'), M(2, 'A-1', 'Export', 5, SEC, '2026-10-02', 'Each'),
             M(3, 'A-1', 'Export', 5, SEC, '2026-10-03', 'Each'), M(4, 'A-1', 'Export', 8, SEC, '2026-10-04', 'Each')],
    boxes: [], moves: [mvRow('A-1', 5, '2026-10-03', 99), mvRow('A-1', 3, '2026-10-04', 98)], locs: [SEC], toIso: function (v) { return v; },
    teamOf: function () { return 'OPS'; }, deptOf: function () { return ''; }
  });
  eq('dbmBuild_ cùng số lượng: chọn theo ngày; dòng xuất lớn hơn tổng thùng',
     [mig2.fact_box_move[0].relink, mig2.fact_box_move[0].out_tx_no, mig2.fact_box_move[1].relink, mig2.fact_box_move[1].out_tx_no],
     ['sửa (theo ngày)', 3, 'sửa (theo ngày, dòng xuất lớn hơn)', 4]);

  /* dbmBuild_ R4: dòng thiếu ngày lấy ngày dòng trước; nếu dòng trước và dòng sau cách nhau quá 180 ngày thì để Không xác định (key 0) */
  const mig3 = dbmBuild_({
    ledger: [M(1, 'A-1', 'Import', 1, SEC, '2022-08-31', 'Each'), M(2, 'B-2', 'Import', 1, SEC, '', 'Each'), M(3, 'C-3', 'Import', 1, SEC, '2026-07-24', 'Each'),
             M(4, 'D-4', 'Import', 1, SEC, '', 'Each'), M(5, 'E-5', 'Import', 1, SEC, '2026-07-30', 'Each')],
    boxes: [], moves: [], locs: [SEC], toIso: function (v) { return v; }, teamOf: function () { return 'OPS'; }, deptOf: function () { return ''; }
  });
  eq('dbmBuild_ R4: cách quá 180 ngày -> không xác định; gần -> ngày dòng trước',
     [mig3.fact_movement[1].date_key, mig3.fact_movement[1].date_estimated, mig3.fact_movement[3].date_key, mig3.fact_movement[3].date_estimated], [0, true, 20260724, true]);

  const text = out.join('\n') + '\n' + (failed ? failed + ' LỖI' : 'Tất cả ' + out.length + ' kiểm tra đạt.');
  Logger.log(text);
  if (failed) throw new Error(text);
  return text;
}
