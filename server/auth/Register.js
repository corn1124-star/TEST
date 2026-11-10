/* ══════════════════════════════════════════════════════════════════════
   Register.gs — USER MỚI TỰ ĐĂNG KÝ + ADMIN DUYỆT
   ══════════════════════════════════════════════════════════════════════
   Luồng: chưa có trong Team -> form đăng ký -> ghi Team với role 'pending'
          -> auth_() chặn MỌI API -> admin duyệt -> 'member' -> dùng được.
   Email lấy từ Session, KHÔNG nhận từ client -> không đăng ký hộ người khác.
   ══════════════════════════════════════════════════════════════════════ */

/** Danh sách team cho dropdown: [{ name, cc, team }] từ sheet Department. */
function regDepartments_() {
  const sh = sheet_(SH_DEPT);
  const last = sh.getLastRow();
  if (last < 2) return [];

  const cols = Math.min(3, sh.getMaxColumns());
  const v = sh.getRange(2, 1, last - 1, cols).getValues();
  const out = [];

  v.forEach(function (r) {
    const cc = String(r[1] || '').trim().toUpperCase();
    if (!cc) return;
    const team = (cols >= 3 ? String(r[2] || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : '') || cc;
    out.push({ name: String(r[0] || '').trim() || cc, cc: cc, team: team });
  });

  out.sort(function (a, b) { return a.name.localeCompare(b.name, 'vi'); });
  return out;
}

/** [API] Trạng thái tài khoản: register | pending | active. */
function getRegisterInfo() {
  try {
    const u = authLookup_();
    const url = webAppUrl_();

    if (u.notFound) {
      return { ok: true, status: 'register', email: u.email,
               departments: regDepartments_(), url: url };
    }
    if (u.role === 'pending') {
      return { ok: true, status: 'pending', email: u.email, username: u.username,
               cc: u.cc, teamCode: u.teamCode, department: u.department, url: url };
    }
    return { ok: true, status: 'active', url: url };
  } catch (e) { return { ok: false, message: e.message }; }
}

/** [API] Tự đăng ký. data = { username, cc } */
function registerSelf(data) {
  try {
    data = data || {};
    const u = authLookup_();
    if (!u.notFound) {
      throw new Error(u.role === 'pending'
        ? 'Bạn đã đăng ký, đang chờ quản trị viên duyệt.'
        : 'Tài khoản đã có trong hệ thống. Hãy tải lại trang.');
    }

    const username = String(data.username || '').trim();
    if (!username) throw new Error('Vui lòng nhập tên của bạn.');
    if (username.length > 60) throw new Error('Tên quá dài (tối đa 60 ký tự).');

    const cc = String(data.cc || '').trim().toUpperCase();
    const dept = regDepartments_().filter(function (d) { return d.cc === cc; })[0];
    if (!dept) throw new Error('Vui lòng chọn team trong danh sách.');

    const actor = { email: u.email, cc: dept.cc, role: 'pending' };

    withLock_(function () {
      const sh = sheet_(SH_TEAM);
      const last = sh.getLastRow();
      const rows = last > 1 ? sh.getRange(2, 1, last - 1, 4).getValues() : [];
      const dup = rows.some(function (r) {
        return String(r[TEAM_COLS.EMAIL] || '').trim().toLowerCase() === u.email;
      });
      if (dup) throw new Error('Email đã có trong hệ thống. Hãy tải lại trang.');
      if (usernameTaken_(rows, username)) throw usernameTakenError_(username);

      sh.appendRow([u.email, cell_(username), dept.cc, 'pending']);

      appendNotification_({
        user: username, cc: dept.cc,
        message: username + ' (' + u.email + ') đăng ký tài khoản mới · ' + dept.name +
                 ' · ' + dept.cc + ' · team ' + dept.team + ' — vào trang Quản trị để duyệt.',
        recipientEmail: ''          // '' = gửi cho admin
      });

      log_(actor, 'USER_REGISTER', u.email + ' | ' + dept.cc + ' | team ' + dept.team);
    });

    clearAuthCacheFor_(u.email);
    notifyAdminsNewUser_({ username: username, email: u.email, cc: dept.cc, dept: dept.name, team: dept.team });   // email admin đã bật nhận thư; lỗi không chặn đăng ký
    return { ok: true, message: 'Đã gửi đăng ký. Vui lòng chờ quản trị viên duyệt.' };
  } catch (e) { return { ok: false, message: e.message }; }
}

/** [API — ADMIN] User đang chờ duyệt. */
function getPendingUsers() {
  try {
    requireAdmin_();

    const sh = sheet_(SH_TEAM);
    const last = sh.getLastRow();
    if (last < 2) return { ok: true, rows: [] };

    const v = sh.getRange(2, 1, last - 1, 4).getValues();
    const map = deptMapCached_();
    const rows = [];

    v.forEach(function (r, i) {
      if (String(r[TEAM_COLS.ROLE] || '').trim().toLowerCase() !== 'pending') return;
      const cc = resolveCc_(String(r[TEAM_COLS.CC] || '').trim(), map);
      rows.push({
        rowIndex: i + 2,
        email: String(r[TEAM_COLS.EMAIL] || '').trim().toLowerCase(),
        username: String(r[TEAM_COLS.USERNAME] || '').trim(),
        cc: cc, department: map[cc] || '(chưa map)', teamCode: teamOfCc_(cc)
      });
    });

    return { ok: true, rows: rows };
  } catch (e) { return { ok: false, message: e.message }; }
}

/** Đọc lại dòng trong lock + đối chiếu email -> chống duyệt nhầm khi danh sách vừa thay đổi. */
function regPendingRow_(sh, rowIndex, email) {
  const row = Number(rowIndex);
  if (!row || row < 2 || row > sh.getLastRow()) throw new Error('Dòng không hợp lệ.');

  const r = sh.getRange(row, 1, 1, 4).getValues()[0];
  const em = String(r[TEAM_COLS.EMAIL] || '').trim().toLowerCase();

  if (em !== String(email || '').trim().toLowerCase()) {
    throw new Error('Danh sách vừa thay đổi. Tải lại rồi thử lại.');
  }
  if (String(r[TEAM_COLS.ROLE] || '').trim().toLowerCase() !== 'pending') {
    throw new Error('Tài khoản này đã được xử lý.');
  }

  return { row: row, email: em, username: String(r[TEAM_COLS.USERNAME] || '').trim(),
           cc: String(r[TEAM_COLS.CC] || '').trim() };
}

/** [API — ADMIN] Duyệt: pending -> member + email báo cho user. */
function approveUser(rowIndex, email) {
  try {
    const admin = requireAdmin_();

    const u = withLock_(function () {
      const sh = sheet_(SH_TEAM);
      const x = regPendingRow_(sh, rowIndex, email);
      sh.getRange(x.row, TEAM_COLS.ROLE + 1).setValue('member');
      log_(admin, 'USER_APPROVE', x.email + ' | CC=' + x.cc + ' | team ' + teamOfCc_(x.cc));
      clearAuthCache(x.email);
      return x;
    });

    const url = webAppUrl_();
    const mailed = sendMail_(u.email,
      '[' + APP_NAME + '] Tài khoản của bạn đã được duyệt',
      mailTemplate_('Tài khoản đã được duyệt',
        '<p>Xin chào <b>' + mailEsc_(u.username) + '</b>,</p>' +
        '<p>Quản trị viên <b>' + mailEsc_(admin.username) + '</b> đã duyệt tài khoản của bạn. ' +
        'Bạn có thể bắt đầu sử dụng ứng dụng.</p>' +
        '<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">' +
          mailRow_('Email', mailEsc_(u.email)) +
          mailRow_('Cost Centre', mailEsc_(u.cc)) +
          mailRow_('Team', mailEsc_(teamOfCc_(u.cc))) +
        '</table>' +
        (url ? '<p><a href="' + url + '" style="display:inline-block;padding:10px 18px;' +
               'background:#00b14f;color:#fff;border-radius:8px;text-decoration:none;' +
               'font-weight:600">Mở ứng dụng</a></p>' : ''),
        '#00b14f'),
      admin);

    return { ok: true, message: 'Đã duyệt ' + u.email + (mailed ? '. Đã gửi email.' : '.') };
  } catch (e) { return { ok: false, message: e.message }; }
}

/** [API — ADMIN] Từ chối: xoá dòng + email báo lý do. */
function rejectUser(rowIndex, email, reason) {
  try {
    const admin = requireAdmin_();
    const why = String(reason || '').trim();

    const u = withLock_(function () {
      const sh = sheet_(SH_TEAM);
      const x = regPendingRow_(sh, rowIndex, email);
      sh.deleteRow(x.row);
      log_(admin, 'USER_REJECT', x.email + (why ? ' | lý do: ' + why : ''));
      clearAuthCache(x.email);
      return x;
    });

    sendMail_(u.email,
      '[' + APP_NAME + '] Đăng ký tài khoản chưa được chấp nhận',
      mailTemplate_('Đăng ký chưa được chấp nhận',
        '<p>Xin chào <b>' + mailEsc_(u.username) + '</b>,</p>' +
        '<p>Yêu cầu đăng ký của bạn chưa được quản trị viên chấp nhận.</p>' +
        (why ? '<div style="padding:11px 14px;background:#fdeeee;border-radius:8px;' +
               'color:#c62828;font-size:13px"><b>Lý do:</b> ' + mailEsc_(why) + '</div>' : '') +
        '<p style="color:#6b7480;font-size:12.5px">Bạn có thể mở lại ứng dụng và đăng ký lại ' +
        'với thông tin đúng.</p>',
        '#c62828'),
      admin);

    return { ok: true, message: 'Đã từ chối ' + u.email + '.' };
  } catch (e) { return { ok: false, message: e.message }; }
}
