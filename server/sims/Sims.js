/* ══════════════════════════════════════════════════════════════════════
   Sims.gs — DANH SÁCH SIM ĐIỆN THOẠI (tách khỏi hàng hoá trong kho)
   ══════════════════════════════════════════════════════════════════════
   SIM không có số lượng và không nhập/xuất như hàng: mỗi SIM là MỘT dòng, tạo khi có yêu cầu.
   Mỗi dòng cho biết: số điện thoại · người đang giữ · người liên hệ · ai điền · khi nào.

   QUYỀN: team POPS (Cost Center chứa 'POPPSV') và admin được xem + thêm + sửa + xoá.
          Người khác không gọi được API nào ở đây (kiểm ở simAccess_, không chỉ ở giao diện).
   XOÁ  : xoá mềm (cột Deleted), khôi phục được. Số điện thoại là duy nhất trong các dòng chưa xoá.
   SHEET "Sim" tự tạo khi ghi lần đầu.
   ══════════════════════════════════════════════════════════════════════ */

const SH_SIM = 'Sim';
const SIM = { ID:0, PHONE:1, HOLDER_NAME:2, HOLDER_EMAIL:3, CONTACT_NAME:4, CONTACT_EMAIL:5, NOTE:6,
              CREATED_AT:7, CREATED_BY:8, UPDATED_AT:9, UPDATED_BY:10,
              DELETED:11, DELETED_AT:12, DELETED_BY:13, SOURCE:14, LEGACY_CODE:15 };
const SIM_COLS = 16;
const SIM_HEADERS = ['SIM ID','Phone','Holder Name','Holder Email','Contact Name','Contact Email','Note',
  'Created At','Created By','Updated At','Updated By','Deleted','Deleted At','Deleted By','Source','Legacy Code'];

/* ═══════════ QUYỀN ═══════════ */

/** Chỉ POPS + admin. Throw nếu không đủ quyền. */
function simAccess_() {
  const u = auth_();
  if (!popsIsAllowed_(u)) {
    log_(u, 'DENIED_SIM_API', 'thử gọi API SIM');
    throw new Error('Trang SIM chỉ dành cho team POPS và quản trị viên.');
  }
  return u;
}

/* ═══════════ CHUẨN HOÁ ═══════════ */

/** Số điện thoại VN -> 10 chữ số bắt đầu bằng 0. Trả '' nếu không hợp lệ.
    Sheet hay làm mất số 0 đầu (902343108), và có người gõ +84 / khoảng trắng / dấu chấm. */
function simNormPhone_(raw) {
  let d = String(raw == null ? '' : raw).replace(/\D+/g, '');
  if (/^84\d{9}$/.test(d)) d = '0' + d.slice(2);
  else if (/^\d{9}$/.test(d)) d = '0' + d;
  return /^0\d{9}$/.test(d) ? d : '';
}

function simId_() { return 'SIM-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase(); }

function simFmtTime_(v) {
  return v instanceof Date ? Utilities.formatDate(v, sheetTz_(), 'dd/MM/yyyy HH:mm') : String(v || '');
}

/** Tên hiển thị của một email: username trong sheet Team, không có thì phần trước @. */
function simWhoName_(email, people) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return '';
  for (let i = 0; i < people.length; i++) if (people[i].email === e) return people[i].username || e.split('@')[0];
  return e.split('@')[0];
}

/**
 * Chữ người dùng gõ/chọn ở ô "Người giữ / Người liên hệ" -> { name, email }.
 * Có email trong chữ (chọn từ gợi ý "tên (email)") hoặc tên khớp ĐÚNG một người trong Team -> dùng người đó.
 * Không khớp -> người ngoài danh sách, lưu tên gõ tay, không có email.
 */
function simResolvePerson_(text, people) {
  const s = String(text || '').trim();
  if (!s) return { name: '', email: '' };

  const m = /[^\s()<>]+@[^\s()<>]+/.exec(s);
  if (m) {
    const em = m[0].toLowerCase();
    const p = people.filter(function (x) { return x.email === em; })[0];
    if (!p) throw new Error('"' + em + '" không phải người dùng đã được duyệt trong sheet Team. Gõ tên thay vì email nếu là người ngoài danh sách.');
    return { name: p.username || em.split('@')[0], email: p.email };
  }
  const low = s.toLowerCase();
  const hit = people.filter(function (x) { return String(x.username || '').toLowerCase() === low; });
  if (hit.length === 1) return { name: hit[0].username, email: hit[0].email };
  return { name: s.slice(0, 80), email: '' };
}

/* ═══════════ ĐỌC / GHI SHEET ═══════════ */

function simSheet_() { return ensureSheet_(SH_SIM, SIM_HEADERS, SIM_COLS); }

/** Ô số điện thoại phải là dạng chữ, nếu không Sheet bỏ số 0 đầu. Gọi TRƯỚC khi ghi vào hàng row..row+n-1. */
function simTextPhone_(sh, row, n) { sh.getRange(row, SIM.PHONE + 1, n, 1).setNumberFormat('@'); }

function simRows_() {
  const sh = ss_().getSheetByName(SH_SIM);
  if (!sh || sh.getLastRow() < 2) return [];
  const n = Math.min(SIM_COLS, sh.getMaxColumns());
  const v = sh.getRange(2, 1, sh.getLastRow() - 1, n).getValues();
  const out = [];
  v.forEach(function (r, i) {
    while (r.length < SIM_COLS) r.push('');
    const id = String(r[SIM.ID] || '').trim();
    if (!id) return;
    const del = r[SIM.DELETED] === true || /^(true|yes|y|1)$/i.test(String(r[SIM.DELETED]));
    out.push({
      id: id, row: i + 2,
      phone: simNormPhone_(r[SIM.PHONE]) || String(r[SIM.PHONE] || '').trim(),
      holderName: String(r[SIM.HOLDER_NAME] || '').trim(), holderEmail: String(r[SIM.HOLDER_EMAIL] || '').trim().toLowerCase(),
      contactName: String(r[SIM.CONTACT_NAME] || '').trim(), contactEmail: String(r[SIM.CONTACT_EMAIL] || '').trim().toLowerCase(),
      note: String(r[SIM.NOTE] || ''),
      createdAt: simFmtTime_(r[SIM.CREATED_AT]), createdBy: String(r[SIM.CREATED_BY] || '').trim().toLowerCase(),
      updatedAt: simFmtTime_(r[SIM.UPDATED_AT]), updatedBy: String(r[SIM.UPDATED_BY] || '').trim().toLowerCase(),
      createdTs: r[SIM.CREATED_AT] instanceof Date ? r[SIM.CREATED_AT].getTime() : 0,
      deleted: del, deletedAt: simFmtTime_(r[SIM.DELETED_AT]), deletedBy: String(r[SIM.DELETED_BY] || '').trim().toLowerCase(),
      source: String(r[SIM.SOURCE] || ''), legacyCode: String(r[SIM.LEGACY_CODE] || '')
    });
  });
  return out;
}

/** Số điện thoại đã có ở dòng CHƯA xoá (trừ dòng exceptId đang sửa). */
function simFindPhone_(rows, phone, exceptId) {
  return rows.filter(function (r) { return !r.deleted && r.phone === phone && r.id !== exceptId; })[0] || null;
}

/* ═══════════ API ═══════════ */

/** [API — POPS/ADMIN] Toàn bộ SIM (cả đã xoá, để giao diện lọc) + danh sách người để gợi ý. */
function simList() {
  try {
    const u = simAccess_();
    const people = skuPeople_();
    const rows = simRows_().map(function (r) {
      r.createdByName = simWhoName_(r.createdBy, people);
      r.updatedByName = simWhoName_(r.updatedBy, people);
      r.deletedByName = simWhoName_(r.deletedBy, people);
      return r;
    });
    return { ok: true, rows: rows, isAdmin: u.role === 'admin',
             people: people.map(function (p) { return { email: p.email, username: p.username }; }) };
  } catch (e) { return { ok: false, message: e.message }; }
}

/**
 * [API — POPS/ADMIN] Thêm (id rỗng) hoặc sửa một SIM.
 * data: { id, phone, holder, contact, note } — holder/contact là chữ gõ hoặc chọn (xem simResolvePerson_).
 */
function simSave(data) {
  try {
    const u = simAccess_();
    data = data || {};
    const id = String(data.id || '').trim();

    const phone = simNormPhone_(data.phone);
    if (!phone) throw new Error('Số điện thoại không hợp lệ: cần 10 chữ số bắt đầu bằng 0 (hoặc +84).');

    const people = skuPeople_();
    const holder = simResolvePerson_(data.holder, people);
    const contact = simResolvePerson_(data.contact, people);
    if (!holder.name && !contact.name) throw new Error('Cần điền ít nhất một người: đang giữ hoặc liên hệ.');
    const note = String(data.note || '').trim().slice(0, 300);

    return withLock_(function () {
      const rows = simRows_();
      const dup = simFindPhone_(rows, phone, id);
      if (dup) throw new Error('Số ' + phone + ' đã có trong danh sách' + (dup.holderName ? ' (đang giữ: ' + dup.holderName + ')' : '') + '.');

      const sh = simSheet_();
      const now = new Date();

      if (!id) {
        const nid = simId_();
        const at = sh.getLastRow() + 1;
        simTextPhone_(sh, at, 1);
        sh.getRange(at, 1, 1, SIM_COLS).setValues([[
          nid, phone, cell_(holder.name), holder.email, cell_(contact.name), contact.email, cell_(note),
          now, u.email, '', '', false, '', '', '', ''
        ]]);
        log_(u, 'SIM_CREATE', phone + ' | giữ ' + (holder.name || '-') + ' | liên hệ ' + (contact.name || '-'));
        return { ok: true, id: nid, message: 'Đã thêm SIM ' + phone + '.' };
      }

      const cur = rows.filter(function (r) { return r.id === id; })[0];
      if (!cur) throw new Error('Không tìm thấy SIM này (có thể đã bị xoá hẳn khỏi sheet).');
      if (cur.deleted) throw new Error('SIM này đã xoá. Hãy khôi phục trước khi sửa.');

      simTextPhone_(sh, cur.row, 1);
      sh.getRange(cur.row, SIM.PHONE + 1, 1, 6).setValues([[
        phone, cell_(holder.name), holder.email, cell_(contact.name), contact.email, cell_(note)
      ]]);
      sh.getRange(cur.row, SIM.UPDATED_AT + 1, 1, 2).setValues([[now, u.email]]);
      log_(u, 'SIM_UPDATE', cur.phone + (cur.phone !== phone ? '->' + phone : '') + ' | giữ ' + (cur.holderName || '-') + '->' + (holder.name || '-') +
           ' | liên hệ ' + (cur.contactName || '-') + '->' + (contact.name || '-'));
      return { ok: true, id: id, message: 'Đã cập nhật SIM ' + phone + '.' };
    });
  } catch (e) { return { ok: false, message: e.message }; }
}

/** [API — POPS/ADMIN] Xoá mềm. */
function simDelete(id) {
  try {
    const u = simAccess_();
    return withLock_(function () {
      const cur = simRows_().filter(function (r) { return r.id === String(id || '').trim(); })[0];
      if (!cur) throw new Error('Không tìm thấy SIM này.');
      if (cur.deleted) return { ok: true, message: 'SIM ' + cur.phone + ' đã được xoá trước đó.' };
      simSheet_().getRange(cur.row, SIM.DELETED + 1, 1, 3).setValues([[true, new Date(), u.email]]);
      log_(u, 'SIM_DELETE', cur.phone + ' | giữ ' + (cur.holderName || '-'));
      return { ok: true, message: 'Đã xoá SIM ' + cur.phone + '. Có thể khôi phục.' };
    });
  } catch (e) { return { ok: false, message: e.message }; }
}

/** [API — POPS/ADMIN] Khôi phục SIM đã xoá (không khôi phục được nếu số đó đã có dòng khác). */
function simRestore(id) {
  try {
    const u = simAccess_();
    return withLock_(function () {
      const rows = simRows_();
      const cur = rows.filter(function (r) { return r.id === String(id || '').trim(); })[0];
      if (!cur) throw new Error('Không tìm thấy SIM này.');
      if (!cur.deleted) return { ok: true, message: 'SIM ' + cur.phone + ' đang dùng.' };
      const dup = simFindPhone_(rows, cur.phone, cur.id);
      if (dup) throw new Error('Số ' + cur.phone + ' đã có dòng khác đang dùng; không khôi phục được.');
      simSheet_().getRange(cur.row, SIM.DELETED + 1, 1, 3).setValues([[false, '', '']]);
      log_(u, 'SIM_RESTORE', cur.phone);
      return { ok: true, message: 'Đã khôi phục SIM ' + cur.phone + '.' };
    });
  } catch (e) { return { ok: false, message: e.message }; }
}

/* ═══════════ DỌN SIM KHỎI TỒN KHO CŨ (admin, một lần) ═══════════
   SIM đã được nhập sang sheet Sim (cột Source = 'Database'). Hàm này XÓA MỀM các dòng SIM trong Database
   bằng đúng cơ chế xóa của admin (deleteTransaction): chuyển sang Database_Deleted, khôi phục được ở mục "Đã xóa",
   thùng / ảnh / tham chiếu số dòng được dời theo.

   AN TOÀN
     · Mã còn tồn (nhập − xuất > 0) mà số điện thoại CHƯA có ở sheet Sim -> bỏ qua và báo (chưa nhập thì chưa được xóa).
     · Mã đã xuất hết (tồn <= 0) -> xóa, vì khi nhập đã chủ ý bỏ qua.
     · Xóa lần XUẤT trước, lần NHẬP sau; mỗi lần đọc lại sổ cái vì xóa một dòng làm các dòng dưới bị dời.
     · Chạy theo đợt (hết giờ thì dừng); chạy lại để làm tiếp. Chạy lại khi đã xong thì không làm gì.
   Cách dùng: Apps Script editor -> chọn simPurgeStockPreview (xem trước) rồi simPurgeStockRun (xóa); kết quả ở Execution log.
   Xong việc thì xóa phần này khỏi code. */

const SIM_PURGE_REASON = 'Chuyển SIM sang trang SIM riêng';
const SIM_PURGE_BUDGET_MS = 4 * 60 * 1000;      // dừng trước giới hạn 6 phút của Apps Script

/** Các dòng SIM trong Database cần xóa, theo thứ tự nên xóa (XUẤT trước, dòng dưới trước). */
function simPurgePlan_() {
  const sim = simRows_();
  const rows = readAllRows_();
  const net = {};
  const isSim = [];
  rows.forEach(function (r, i) {
    const code = String(r[C.CODE] || '').trim();
    if (!code || popsDeviceType_(r[C.CAT], r[C.SUB]) !== 'SIM') return;
    isSim.push(i);
    net[code] = (net[code] || 0) + (String(r[C.TYPE] || '').trim() === 'Import' ? 1 : -1) * (Number(r[C.QTY]) || 0);
  });

  const skipped = {};          // mã -> lý do
  const todo = [];
  isSim.forEach(function (i) {
    const r = rows[i], code = String(r[C.CODE]).trim();
    if (net[code] > 0) {
      const phone = simNormPhone_(r[C.NAME]) || simNormPhone_(code.split('_').pop());
      if (!phone || !simFindPhone_(sim, phone, '')) { skipped[code] = 'chưa có ở sheet Sim'; return; }
    }
    todo.push({ row: i + 2, no: r[C.NO], code: code, type: String(r[C.TYPE] || '').trim() });
  });
  todo.sort(function (a, b) {
    const ea = a.type === 'Import' ? 1 : 0, eb = b.type === 'Import' ? 1 : 0;
    return ea !== eb ? ea - eb : b.row - a.row;
  });
  return { todo: todo.filter(function (t) { return !skipped[t.code]; }), skipped: skipped, simRowsTotal: isSim.length };
}

function simPurgeSummary_(p) {
  const codes = {};
  p.todo.forEach(function (t) { codes[t.code] = 1; });
  return { simRowsInStock: p.simRowsTotal, toDeleteRows: p.todo.length, toDeleteCodes: Object.keys(codes).length,
           skipped: Object.keys(p.skipped).map(function (c) { return c + ' (' + p.skipped[c] + ')'; }) };
}

/** [ADMIN] Xem trước, chưa sửa gì. */
function simPurgeStockPreview() {
  requireAdmin_();
  const s = simPurgeSummary_(simPurgePlan_());
  Logger.log(JSON.stringify(s, null, 1));
  return s;
}

/** [ADMIN] Xóa mềm SIM khỏi Database. Chạy lại cho tới khi còn 0 dòng. */
function simPurgeStockRun() {
  const u = requireAdmin_();
  const t0 = Date.now();
  const failed = {};                     // 'code|type|no' -> thông báo lỗi; không thử lại trong lần chạy này
  let deleted = 0, timeUp = false;

  for (;;) {
    if (Date.now() - t0 > SIM_PURGE_BUDGET_MS) { timeUp = true; break; }
    dbDirty_();                          // đọc lại sổ cái: các dòng dưới dòng vừa xóa đã bị dời
    const next = simPurgePlan_().todo.filter(function (t) { return !failed[t.code + '|' + t.type + '|' + t.no]; })[0];
    if (!next) break;
    const res = deleteTransaction(next.row, SIM_PURGE_REASON, { code: next.code, no: next.no });
    if (res && res.ok) deleted++;
    else failed[next.code + '|' + next.type + '|' + next.no] = (res && res.message) || 'lỗi không rõ';
  }

  const left = simPurgeSummary_(simPurgePlan_());
  const out = { deleted: deleted, timeUp: timeUp, failed: failed, remainingRows: left.toDeleteRows, skipped: left.skipped };
  log_(u, 'SIM_PURGE_STOCK', 'đã xóa mềm ' + deleted + ' dòng SIM khỏi Database; còn ' + left.toDeleteRows + ', lỗi ' + Object.keys(failed).length);
  Logger.log(JSON.stringify(out, null, 1));
  return out;
}
