/* ══════════════════════════════════════════════════════════════════════
   Access.gs — AI ĐƯỢC THẤY HÀNG NÀO (một nơi duy nhất)
   ══════════════════════════════════════════════════════════════════════
   ADMIN : thấy tất cả.
   STAFF : chỉ thấy SKU (sheet "SKU") mà
             · thuộc bộ phận (Team Code) của mình, hoặc
             · mình là PIC.
   Mã không có trong danh mục SKU -> staff KHÔNG thấy; admin vẫn thấy.
   Mọi chỗ lọc dữ liệu theo người dùng PHẢI dùng 3 hàm ở đây, không tự so sánh team/CC.
   ══════════════════════════════════════════════════════════════════════ */

/** user có được thấy mã `code` không. */
function codeVisible_(user, code) {
  if (user.role === 'admin') return true;

  const s = skuRows_().index.byCode[String(code || '').trim()];
  return !!s && (s.team === user.teamCode || (!!s.pic && s.pic === user.email));
}

/** Dòng của sheet Database (mảng) có được thấy không. */
function rowVisible_(user, r) {
  return codeVisible_(user, r[C.CODE]);
}

/** Dòng của sheet BoxDetail (mảng) có được thấy không. */
function boxVisible_(user, b) {
  return codeVisible_(user, b[B.CODE]);
}
