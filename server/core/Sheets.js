/** Cache Spreadsheet/Sheet trong phạm vi 1 execution (không sống giữa các request). */
let _ssCache = null;
const _sheetCache = {};

function ss_() { if (!_ssCache) _ssCache = SpreadsheetApp.openById(SS_ID); return _ssCache; }

function sheet_(name) {
  if (_sheetCache[name]) return _sheetCache[name];
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Không tìm thấy sheet "' + name + '".');
  _sheetCache[name] = sh;
  return sh;
}

/**
 * Tạo sheet nếu chưa có, ghi header, freeze dòng 1.
 * ĐỊNH DẠNG TRUNG TÍNH: nền trắng · chữ đen đậm · viền dưới 1 nét.
 */
function ensureSheet_(name, headers, cols) {
  if (_sheetCache[name]) return _sheetCache[name];

  const ss = ss_();
  let sh = ss.getSheetByName(name);
  const isNew = !sh;
  if (isNew) sh = ss.insertSheet(name);

  if (sh.getMaxColumns() < cols) {
    sh.insertColumnsAfter(sh.getMaxColumns(), cols - sh.getMaxColumns());
  }

  if (isNew || sh.getRange(1, 1).getValue() !== headers[0]) {
    const head = sh.getRange(1, 1, 1, cols);
    head.setValues([headers])
      .setBackground('#ffffff').setFontColor('#000000')
      .setFontWeight('bold').setFontSize(10)
      .setVerticalAlignment('middle').setWrap(true);
    head.setBorder(null, null, true, null, null, null,
      '#000000', SpreadsheetApp.BorderStyle.SOLID);
    sh.setFrozenRows(1);
  }

  _sheetCache[name] = sh;
  return sh;
}

function notiSheet_()    { return ensureSheet_(SH_NOTI, NOTI_HEADERS, NOTI_COLS); }
function pendingSheet_() { return ensureSheet_(SH_PENDING, PENDING_HEADERS, PENDING_COLS); }
function boxSheet_()     { return ensureSheet_(SH_BOX, BOX_HEADERS, BOX_COLS); }
function boxMoveSheet_() { return ensureSheet_(SH_BOXMOVE, BOXMOVE_HEADERS, BOXMOVE_COLS); }

/**
 * Chuỗi người dùng nhập -> giá trị an toàn để ghi vào ô. Sheet tự hiểu "=..." là công thức (có thể đẩy dữ liệu ra ngoài)
 * và đổi "0012" / "1-2" thành số / ngày. Dấu ' đầu chuỗi ép ô giữ nguyên dạng chữ (đọc lại vẫn không có dấu ').
 * force = true cho mã luôn giữ dạng chữ (PO, số hoá đơn); mặc định chỉ chặn chuỗi mở đầu bằng = + - @.
 */
function cell_(v, force) {
  return typeof v === 'string' && v !== '' && (force || /^[=+\-@]/.test(v)) ? "'" + v : v;
}

/** cell_ cho cả một dòng đọc từ Sheet rồi ghi lại; textCols = chỉ số các cột luôn giữ dạng chữ. */
function cellsRow_(row, textCols) {
  return row.map(function (v, i) { return cell_(v, textCols.indexOf(i) !== -1); });
}

/** flush 2 lần bắt buộc: sau lấy lock để đọc dữ liệu mới, trước nhả lock để commit. */
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Hệ thống đang xử lý giao dịch khác. Thử lại sau vài giây.');
  try { SpreadsheetApp.flush(); dbDirty_(); return fn(); }   // dbDirty_: dữ liệu có thể đã đổi trong lúc chờ lock
  finally {
    try { SpreadsheetApp.flush(); } catch (ig) {}
    try { lock.releaseLock(); } catch (ig) {}
  }
}

