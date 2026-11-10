/* ══════════════════════════════════════════════════════════════════════
   AdminMail.gs — EMAIL BÁO ADMIN KHI STAFF GỬI YÊU CẦU NHẬP / XUẤT MỚI
   ══════════════════════════════════════════════════════════════════════
   QUY TẮC
     · CHỈ admin đã tự tick "Nhận email khi có yêu cầu mới" (trang Quản lý) mới nhận mail.
       Mặc định TẮT: chưa tick thì không ai bị gửi.
     · Lựa chọn lưu ở cột E của sheet Team (TEAM_COLS.NOTIFY). Mỗi admin chỉ đổi được của chính mình.
     · Người nhận phải còn là admin tại thời điểm gửi (hạ quyền / xoá user thì thôi nhận).
     · Gửi mail KHÔNG BAO GIỜ làm hỏng việc gửi yêu cầu: lỗi chỉ ghi AuditLog.
   ══════════════════════════════════════════════════════════════════════ */

/** Escape HTML cho nội dung do người dùng nhập, trước khi đưa vào thân email. */
function mailEsc_(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mailIsOn_(v) { return v === true || String(v).trim().toLowerCase() === 'true'; }

/** Dòng Team của 1 email: { row (số dòng sheet), values } hoặc null. */
function teamFindByEmail_(sh, email) {
  const last = sh.getLastRow();
  if (last < 2) return null;
  const values = sh.getRange(2, 1, last - 1, TEAM_COLS.NOTIFY + 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][TEAM_COLS.EMAIL] || '').trim().toLowerCase() === email) return { row: i + 2, values: values[i] };
  }
  return null;
}

/** [API — ADMIN] Admin đang đăng nhập có bật nhận mail không. */
function getMyMailPref() {
  try {
    const me = requireAdmin_();
    const f = teamFindByEmail_(sheet_(SH_TEAM), me.email);
    return { ok: true, on: !!f && mailIsOn_(f.values[TEAM_COLS.NOTIFY]), email: me.email, mailEnabled: MAIL_ENABLED };
  } catch (e) { return { ok: false, message: e.message }; }
}

/** [API — ADMIN] Bật / tắt nhận mail cho CHÍNH MÌNH (không có tham số email: không đổi hộ người khác được). */
function setMyMailPref(on) {
  try {
    const me = requireAdmin_();
    return withLock_(function () {
      const sh = sheet_(SH_TEAM);
      const f = teamFindByEmail_(sh, me.email);
      if (!f) throw new Error('Không tìm thấy tài khoản của bạn trong danh sách người dùng.');

      if (String(sh.getRange(1, TEAM_COLS.NOTIFY + 1).getValue() || '').trim() !== TEAM_NOTIFY_HEADER) {
        sh.getRange(1, TEAM_COLS.NOTIFY + 1).setValue(TEAM_NOTIFY_HEADER);
      }
      const flag = on === true || on === 'true';
      sh.getRange(f.row, TEAM_COLS.NOTIFY + 1).setValue(flag);
      log_(me, flag ? 'MAIL_PREF_ON' : 'MAIL_PREF_OFF', me.email);

      return { ok: true, on: flag, message: flag
        ? 'Đã bật. Bạn sẽ nhận email tại ' + me.email + ' khi có yêu cầu mới.'
        : 'Đã tắt. Bạn sẽ không nhận email khi có yêu cầu mới.' };
    });
  } catch (e) { return { ok: false, message: e.message }; }
}

/** Email các admin đã tick nhận thư (và vẫn là admin). */
function adminMailRecipients_() {
  const sh = sheet_(SH_TEAM);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const out = [];
  sh.getRange(2, 1, last - 1, TEAM_COLS.NOTIFY + 1).getValues().forEach(function (r) {
    const email = String(r[TEAM_COLS.EMAIL] || '').trim().toLowerCase();
    if (!email || email.indexOf('@') === -1) return;
    if (String(r[TEAM_COLS.ROLE] || '').trim().toLowerCase() !== 'admin') return;
    if (mailIsOn_(r[TEAM_COLS.NOTIFY]) && out.indexOf(email) === -1) out.push(email);
  });
  return out;
}

/**
 * Gửi mail báo NGƯỜI DÙNG MỚI vừa đăng ký tới các admin đã bật nhận mail (cùng tuỳ chọn với yêu cầu mới).
 * Gọi SAU KHI đã nhả khoá và ghi xong dòng Team. Lỗi chỉ ghi AuditLog, không làm hỏng việc đăng ký.
 * d = { username, email, cc, dept, team }
 * @return số mail đã gửi
 */
function notifyAdminsNewUser_(d) {
  const actor = { email: 'system', cc: '', role: 'system' };
  try {
    const to = adminMailRecipients_();
    if (!to.length) return 0;

    let quota = to.length;
    try { quota = MailApp.getRemainingDailyQuota(); } catch (e) {}
    if (quota < to.length) { log_(actor, 'MAIL_SKIPPED', 'hết hạn mức email trong ngày (' + quota + ')'); return 0; }

    const url = webAppUrl_();
    const subject = '[' + APP_NAME + '] Người dùng mới chờ duyệt — ' + d.username;
    const body = mailTemplate_('Có người dùng mới đăng ký, chờ bạn duyệt',
      '<p><b>' + mailEsc_(d.username) + '</b> vừa đăng ký tài khoản và đang chờ quản trị viên duyệt.</p>' +
      '<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">' +
        mailRow_('Tên', mailEsc_(d.username)) +
        mailRow_('Email', mailEsc_(d.email)) +
        mailRow_('Cost Centre', mailEsc_(d.cc)) +
        mailRow_('Bộ phận', mailEsc_(d.dept)) +
        mailRow_('Team', mailEsc_(d.team)) +
      '</table>' +
      (url ? '<p><a href="' + url + '" style="display:inline-block;padding:10px 18px;' +
             'background:#00873b;color:#fcfefd;border-radius:8px;text-decoration:none;' +
             'font-weight:600">Mở trang duyệt</a></p>' : '') +
      '<p style="color:#6b7480;font-size:12.5px">Vào <b>Quản lý</b> &gt; <b>Duyệt &amp; Người dùng</b> để duyệt hoặc từ chối. ' +
      'Bạn nhận email này vì đã bật "Nhận email khi có yêu cầu mới hoặc người đăng ký mới"; tắt lại ở trang Quản lý bất cứ lúc nào.</p>',
      '#00b14f');

    let sent = 0;
    to.forEach(function (email) { if (sendMail_(email, subject, body, actor)) sent++; });
    return sent;
  } catch (e) {
    log_(actor, 'MAIL_FAILED', 'notifyAdminsNewUser_: ' + e.message);
    return 0;
  }
}

/**
 * Gửi mail báo yêu cầu mới tới các admin đã bật. Gọi SAU KHI đã nhả khoá và ghi xong yêu cầu.
 * d = { requestId, type, user, cc, team, name, assetCode, quantity, unit, boxCount, location, date }
 * @return số mail đã gửi
 */
function notifyAdminsNewRequest_(d) {
  const actor = { email: 'system', cc: '', role: 'system' };
  try {
    const to = adminMailRecipients_();
    if (!to.length) return 0;

    let quota = to.length;
    try { quota = MailApp.getRemainingDailyQuota(); } catch (e) {}
    if (quota < to.length) { log_(actor, 'MAIL_SKIPPED', 'hết hạn mức email trong ngày (' + quota + ')'); return 0; }

    const isImport = d.type === 'Import';
    const typeVn = isImport ? 'nhập kho' : 'xuất kho';
    const subject = '[' + APP_NAME + '] Yêu cầu ' + typeVn + ' mới — ' + d.name;
    const body = mailTemplate_('Có yêu cầu ' + typeVn + ' mới chờ duyệt',
      '<p><b>' + mailEsc_(d.user) + '</b> (' + mailEsc_(d.cc) + ') vừa gửi một yêu cầu <b>' + typeVn + '</b> đang chờ bạn duyệt.</p>' +
      '<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">' +
        mailRow_('Mã yêu cầu', mailEsc_(d.requestId)) +
        mailRow_('Loại', isImport ? 'Nhập kho' : 'Xuất kho') +
        mailRow_('Mặt hàng', mailEsc_(d.name)) +
        (d.assetCode ? mailRow_('Asset Code', mailEsc_(d.assetCode)) : '') +
        mailRow_('Số lượng', mailEsc_(d.quantity + ' ' + d.unit)) +
        (d.boxCount ? mailRow_('Số thùng', mailEsc_(d.boxCount)) : '') +
        mailRow_('Địa điểm', mailEsc_(d.location)) +
        mailRow_('Ngày giao dịch', mailEsc_(toVn_(d.date))) +
        mailRow_('Người gửi', mailEsc_(d.user + ' · ' + d.cc + ' · team ' + d.team)) +
      '</table>' +
      '<p style="color:#6b7480;font-size:12.5px">Vào trang <b>Quản lý</b> để duyệt hoặc từ chối. ' +
      'Bạn nhận email này vì đã bật "Nhận email khi có yêu cầu mới"; tắt lại ở trang Quản lý bất cứ lúc nào.</p>',
      '#00813d');

    let sent = 0;
    to.forEach(function (email) { if (sendMail_(email, subject, body, actor)) sent++; });
    return sent;
  } catch (e) {
    log_(actor, 'MAIL_FAILED', 'notifyAdminsNewRequest_: ' + e.message);
    return 0;
  }
}
