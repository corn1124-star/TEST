/* ═══════════ NHÓM 2: NGÀY ═══════════ */

function pad2_(n) { return ('0' + n).slice(-2); }

/* Múi giờ của Spreadsheet, lấy 1 lần. getSpreadsheetTimeZone() là lời gọi dịch vụ — gọi theo từng dòng
   (hàng nghìn dòng mỗi lần tải trang) là nguyên nhân chính làm trang vào chậm. */
let _sheetTz = null, _tzNative = null;

function sheetTz_() {
  if (_sheetTz === null) _sheetTz = ss_().getSpreadsheetTimeZone();
  return _sheetTz;
}

/** true khi múi giờ script = múi giờ Sheet: dùng getter của Date, không gọi dịch vụ. */
function tzNative_() {
  if (_tzNative === null) _tzNative = (Session.getScriptTimeZone() === sheetTz_());
  return _tzNative;
}

function toIso_(v) {
  if (!v) return '';
  if (v instanceof Date) {
    if (tzNative_()) return v.getFullYear() + '-' + pad2_(v.getMonth() + 1) + '-' + pad2_(v.getDate());
    return Utilities.formatDate(v, sheetTz_(), 'yyyy-MM-dd');
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + pad2_(m[2]) + '-' + pad2_(m[1]);
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad2_(m[2]) + '-' + pad2_(m[3]);
  return s;
}

function toVn_(iso) {
  if (!iso || String(iso).indexOf('-') === -1) return String(iso || '');
  const p = String(iso).split('-');
  return p[2] + '/' + p[1] + '/' + p[0];
}

/** 'yyyy-MM-dd' có phải ngày thật không (chặn 2026-13-45 bị Date tự cuộn sang ngày khác). */
function isoValid_(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}

function isoToDate_(iso) {
  const p = String(iso).split('-');
  if (p.length !== 3) throw new Error('Ngày không hợp lệ: ' + iso);
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

