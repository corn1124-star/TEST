/* ═══════════ NHÓM 15: QUẢN LÝ NGƯỜI DÙNG (CHỈ ADMIN) ═══════════ */

function getUsers() {
  try {
    const admin = requireAdmin_();

    const sh = sheet_(SH_TEAM);
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return { ok: true, rows: [] };

    const values = sh.getRange(2, 1, lastRow - 1, 4).getValues();
    const map = deptMapCached_();

    const rows = values.map(function (r, i) {
      const email = String(r[TEAM_COLS.EMAIL] || '').trim();
      const ccRaw = String(r[TEAM_COLS.CC] || '').trim();
      const ccFull = resolveCc_(ccRaw, map);
      return {
        rowIndex: i + 2, email: email,
        username: String(r[TEAM_COLS.USERNAME] || '').trim(), cc: ccRaw,
        teamCode: teamOfCc_(ccFull),                                       // [TEAM]
        department: map[ccFull] || '(chưa map)',
        role: String(r[TEAM_COLS.ROLE] || 'member').trim().toLowerCase(),
        isSelf: email.toLowerCase() === admin.email
      };
    }).filter(function (r) { return r.email; });

    return { ok: true, rows: rows };
  } catch (e) { return { ok: false, message: e.message }; }
}

/** Đếm admin còn lại nếu loại trừ excludeRow — chặn xoá/hạ quyền admin cuối. Đếm theo email DUY NHẤT, bỏ dòng email rỗng, role phải đúng 'admin'. */
function countAdmins_(values, excludeRow) {
  const seen = {};
  values.forEach(function (r, i) {
    if (excludeRow != null && i + 2 === excludeRow) return;
    const em = String(r[TEAM_COLS.EMAIL] || '').trim().toLowerCase();
    if (em && String(r[TEAM_COLS.ROLE] || '').trim().toLowerCase() === 'admin') seen[em] = true;
  });
  return Object.keys(seen).length;
}

/** [TEAM] CC phải có trong sheet Department — gõ sai sẽ bị resolveCc_ đoán sang team khác. */
function requireKnownCc_(cc) {
  const map = deptMapCached_();
  const full = resolveCc_(cc, map);
  if (map[full] === undefined) {
    throw new Error('Cost Centre "' + cc + '" không có trong sheet Department.');
  }
  return full;
}

/**
 * Username đã có người khác dùng chưa (không phân biệt hoa thường). `rows` = các dòng sheet Team từ dòng 2.
 * Cột PIC của Database và các báo cáo nhận ra người qua username, nên hai người trùng tên sẽ bị gộp làm một.
 * exceptRow: số dòng sheet của chính người đang được sửa (bỏ qua dòng đó).
 */
function usernameTaken_(rows, username, exceptRow) {
  const want = String(username).trim().toLowerCase();
  return rows.some(function (r, i) {
    return i + 2 !== exceptRow && String(r[TEAM_COLS.USERNAME] || '').trim().toLowerCase() === want;
  });
}

function usernameTakenError_(username) {
  return new Error('Tên "' + username + '" đã có người dùng. Hãy thêm họ hoặc chữ lót để phân biệt (vd "' + username + ' Nguyen").');
}

function addUser(data) {
  try {
    const admin = requireAdmin_();

    const email = String(data.email || '').trim().toLowerCase();
    const username = String(data.username || '').trim();
    const cc = String(data.cc || '').trim();
    const role = String(data.role || 'member').trim().toLowerCase();

    if (!email || email.indexOf('@') === -1) throw new Error('Email không hợp lệ.');
    if (!username) throw new Error('Vui lòng nhập tên đăng nhập.');
    if (!cc) throw new Error('Vui lòng nhập Cost Centre.');
    if (role !== 'admin' && role !== 'member') throw new Error('Vai trò không hợp lệ.');

    const ccFull = requireKnownCc_(cc);                                    // [TEAM]

    return withLock_(function () {
      const sh = sheet_(SH_TEAM);
      const lastRow = sh.getLastRow();
      const values = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, 4).getValues() : [];

      const dup = values.some(function (r) {
        return String(r[TEAM_COLS.EMAIL] || '').trim().toLowerCase() === email;
      });
      if (dup) throw new Error('Email ' + email + ' đã tồn tại trong hệ thống.');
      if (usernameTaken_(values, username)) throw usernameTakenError_(username);

      sh.appendRow([cell_(email, true), cell_(username), ccFull, role]);
      log_(admin, 'USER_ADD', email + ' | ' + role + ' | CC=' + ccFull);
      clearAuthCache(email);
      return { ok: true, message: 'Đã thêm người dùng ' + email + '.' };
    });
  } catch (e) { return { ok: false, message: e.message }; }
}

/** Số dòng có thể đã dời nếu admin khác vừa xóa/duyệt người dùng: email giao diện gửi kèm phải khớp dòng hiện tại. BẮT BUỘC có email: thiếu = coi như đã cũ. */
function userRowStale_(target, expectEmail) {
  if (expectEmail === undefined || expectEmail === null || String(expectEmail).trim() === '') return true;
  return String(target[TEAM_COLS.EMAIL] || '').trim().toLowerCase() !== String(expectEmail).trim().toLowerCase();
}
const USER_STALE_MSG = 'Danh sách người dùng đã thay đổi (có admin khác vừa thao tác). Hãy tải lại danh sách rồi thao tác lại.';

function updateUser(rowIndex, data, expectEmail) {
  try {
    const admin = requireAdmin_();

    const row = Number(rowIndex);
    if (!row || row < 2) throw new Error('Dòng không hợp lệ.');

    const username = String(data.username || '').trim();
    const cc = String(data.cc || '').trim();
    const role = String(data.role || 'member').trim().toLowerCase();

    if (!username) throw new Error('Vui lòng nhập tên đăng nhập.');
    if (!cc) throw new Error('Vui lòng nhập Cost Centre.');
    if (role !== 'admin' && role !== 'member') throw new Error('Vai trò không hợp lệ.');

    const ccFull = requireKnownCc_(cc);                                    // [TEAM]

    return withLock_(function () {
      const sh = sheet_(SH_TEAM);
      const lastRow = sh.getLastRow();
      if (row > lastRow) throw new Error(expectEmail ? USER_STALE_MSG : 'Dòng ' + row + ' không tồn tại.');

      const values = sh.getRange(2, 1, lastRow - 1, 4).getValues();
      const target = values[row - 2];
      if (userRowStale_(target, expectEmail)) throw new Error(USER_STALE_MSG);
      const tEmail = String(target[TEAM_COLS.EMAIL] || '').trim().toLowerCase();
      const tOldRole = String(target[TEAM_COLS.ROLE] || '').trim().toLowerCase();
      // Người chờ duyệt phải qua Duyệt / Từ chối: sửa ở đây sẽ biến họ thành member mà không có email duyệt
      if (tOldRole === 'pending') throw new Error('Người này đang chờ duyệt đăng ký. Hãy Duyệt hoặc Từ chối ở mục đăng ký chờ duyệt.');

      if (tEmail === admin.email && tOldRole === 'admin' && role !== 'admin') {
        throw new Error('Không thể tự hạ quyền quản trị của chính tài khoản đang đăng nhập.');
      }
      if (tOldRole === 'admin' && role !== 'admin' && countAdmins_(values, row) === 0) {
        throw new Error('Không thể hạ quyền — đây là quản trị viên cuối cùng.');
      }

      const renamed = username.toLowerCase() !== String(target[TEAM_COLS.USERNAME] || '').trim().toLowerCase();
      if (renamed && usernameTaken_(values, username, row)) throw usernameTakenError_(username);   // chỉ khi đổi tên: người đang trùng sẵn vẫn đổi được vai trò

      sh.getRange(row, 2, 1, 3).setValues([[cell_(username), ccFull, role]]);
      log_(admin, 'USER_UPDATE', tEmail + ' | role=' + role + ' | CC=' + ccFull);
      clearAuthCache(tEmail);
      return { ok: true, message: 'Đã cập nhật người dùng ' + tEmail + '.' };
    });
  } catch (e) { return { ok: false, message: e.message }; }
}

/**
 * [API — ADMIN] Xoá user + GỬI EMAIL thông báo.
 * Gửi mail SAU KHI nhả lock (MailApp mất 0.5-2s).
 */
function deleteUser(rowIndex, reason, expectEmail) {
  try {
    const admin = requireAdmin_();

    const row = Number(rowIndex);
    if (!row || row < 2) throw new Error('Dòng không hợp lệ.');

    const why = String(reason || '').trim();

    const deleted = withLock_(function () {
      const sh = sheet_(SH_TEAM);
      const lastRow = sh.getLastRow();
      if (row > lastRow) throw new Error(expectEmail ? USER_STALE_MSG : 'Dòng ' + row + ' không tồn tại.');

      const values = sh.getRange(2, 1, lastRow - 1, 4).getValues();
      const target = values[row - 2];
      if (userRowStale_(target, expectEmail)) throw new Error(USER_STALE_MSG);

      const info = {
        email: String(target[TEAM_COLS.EMAIL] || '').trim().toLowerCase(),
        username: String(target[TEAM_COLS.USERNAME] || '').trim(),
        cc: String(target[TEAM_COLS.CC] || '').trim(),
        role: String(target[TEAM_COLS.ROLE] || 'member').trim().toLowerCase(),
        deletedAt: Utilities.formatDate(new Date(), ss_().getSpreadsheetTimeZone(), 'dd/MM/yyyy HH:mm')
      };

      if (info.email === admin.email) {
        throw new Error('Không thể tự xoá chính tài khoản đang đăng nhập.');
      }
      if (info.role === 'admin' && countAdmins_(values, row) === 0) {
        throw new Error('Không thể xoá — đây là quản trị viên cuối cùng.');
      }

      sh.deleteRow(row);
      log_(admin, 'USER_DELETE', info.email + (why ? ' | lý do: ' + why : ''));
      clearAuthCache(info.email);
      return info;
    });

    const mailed = sendMail_(
      deleted.email,
      '[' + APP_NAME + '] Quyền truy cập của bạn đã bị thu hồi',
      mailBodyUserDeleted_(deleted, admin.username, why),
      admin
    );

    return {
      ok: true, mailed: mailed, email: deleted.email,
      message: 'Đã xoá ' + deleted.email +
               (mailed ? '. Đã gửi email thông báo.' : '. Không gửi được email (xem AuditLog).')
    };
  } catch (e) { return { ok: false, message: e.message }; }
}

