/* ═══════════ NHÓM 16: EMAIL ═══════════
   Gửi email KHÔNG BAO GIỜ chặn nghiệp vụ chính — lỗi chỉ ghi AuditLog. */

const MAIL_ENABLED = true;   // đặt false để tắt toàn bộ email khi test

function webAppUrl_() {
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}

function sendMail_(to, subject, htmlBody, actor) {
  if (!MAIL_ENABLED) return false;

  const email = String(to || '').trim();
  if (!email || email.indexOf('@') === -1) return false;

  try {
    MailApp.sendEmail({ to: email, subject: subject, htmlBody: htmlBody, name: APP_NAME });
    if (actor) log_(actor, 'MAIL_SENT', email + ' | ' + subject);
    return true;
  } catch (e) {
    if (actor) log_(actor, 'MAIL_FAILED', email + ' | ' + e.message);
    return false;
  }
}

function mailRow_(label, value) {
  return '<tr>' +
    '<td style="padding:7px 0;border-bottom:1px solid #eef2f6;color:#6b7480;width:130px">' + label + '</td>' +
    '<td style="padding:7px 0;border-bottom:1px solid #eef2f6;font-weight:600">' + (value || '—') + '</td></tr>';
}

function mailTemplate_(title, bodyHtml, accent) {
  const color = accent || '#343b45';
  const url = webAppUrl_();

  return '<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;' +
      'border:1px solid #e5e8ed;border-radius:10px;overflow:hidden">' +
      '<div style="background:' + color + ';padding:18px 22px">' +
        '<div style="color:#fff;font-size:16px;font-weight:600">' + title + '</div>' +
        '<div style="color:rgba(255,255,255,.85);font-size:12px;margin-top:3px">' + APP_NAME + '</div>' +
      '</div>' +
      '<div style="padding:22px;color:#1a1f26;font-size:14px;line-height:1.6">' + bodyHtml + '</div>' +
      '<div style="padding:14px 22px;background:#f7f8fa;border-top:1px solid #e5e8ed;' +
        'color:#6b7480;font-size:11.5px;line-height:1.5">' +
        (url ? 'Ứng dụng: <a href="' + url + '" style="color:#343b45">' + url + '</a><br>' : '') +
        'Email tự động từ ' + APP_NAME + '. Vui lòng không trả lời email này.' +
      '</div></div>';
}

function mailBodyUserDeleted_(u, adminName, reason) {
  return mailTemplate_('Quyền truy cập đã bị thu hồi',
    '<p>Xin chào <b>' + mailEsc_(u.username) + '</b>,</p>' +
    '<p>Tài khoản của bạn đã được <b>xoá khỏi hệ thống ' + APP_NAME +
    '</b> bởi quản trị viên <b>' + mailEsc_(adminName) + '</b>. ' +
    'Từ thời điểm này bạn sẽ không còn truy cập được ứng dụng.</p>' +
    '<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">' +
      mailRow_('Email', mailEsc_(u.email)) +
      mailRow_('Tên đăng nhập', mailEsc_(u.username)) +
      mailRow_('Cost Centre', mailEsc_(u.cc)) +
      mailRow_('Vai trò', u.role === 'admin' ? 'Quản trị viên' : 'Nhân viên') +
      mailRow_('Thời điểm xoá', u.deletedAt) +
      mailRow_('Thực hiện bởi', mailEsc_(adminName)) +
    '</table>' +
    (reason
      ? '<div style="padding:11px 14px;background:#fdeeee;border-radius:8px;color:#c62828;' +
        'font-size:13px;margin-bottom:14px"><b>Lý do:</b> ' + mailEsc_(reason) + '</div>' : '') +
    '<p style="color:#6b7480;font-size:12.5px">Nếu bạn cho rằng đây là sai sót, ' +
    'vui lòng liên hệ quản trị viên để được cấp lại quyền.</p>',
    '#c62828');
}

