/* ═══════════ NHÓM 10: NOTIFICATION ═══════════ */

/** recipientEmail = '' -> hiện cho ADMIN; = email -> CHỈ user đó. */
function appendNotification_(d) {
  try {
    const sh = notiSheet_();
    sh.appendRow([new Date(), d.date ? isoToDate_(d.date) : new Date(), cell_(d.user || ''),
      d.cc || '', d.type || '', cell_(d.name || ''), d.quantity || '', cell_(d.location || ''),
      cell_(d.message || ''), false, String(d.recipientEmail || '').trim().toLowerCase()]);

    const row = sh.getLastRow();
    sh.getRange(row, N.TS + 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
    sh.getRange(row, N.TIME + 1).setNumberFormat('dd/mm/yyyy');
    sh.getRange(row, N.READ + 1).insertCheckboxes().setValue(false);
  } catch (e) {   // lỗi ghi noti không chặn nghiệp vụ chính, nhưng phải để lại vết
    log_({ email: 'system', cc: '', role: 'system' }, 'NOTI_FAILED', String(d && d.recipientEmail || 'admin') + ' | ' + e.message);
  }
}

/** [LỚP 3] Ai được xem thông báo nào. */
function notiVisible_(recipient, user) {
  const r = String(recipient || '').trim().toLowerCase();
  return user.role === 'admin' ? (r === '') : (r === user.email);
}

function getNotifications(onlyUnread, limit) {
  try {
    const user = auth_();
    const sh = notiSheet_();
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return { ok: true, rows: [], unread: 0, total: 0 };

    /* Lấy n dòng CUỐI mà user này được thấy (lọc theo người nhận trước), để thông báo của mình
       không rơi khỏi cửa sổ vì thông báo của người khác nằm xen kẽ. */
    const n = Math.min(Number(limit) || 200, lastRow - 1);
    const rec = sh.getRange(2, N.RECIPIENT + 1, lastRow - 1, 1).getValues();
    let seen = 0, start = lastRow + 1;
    for (let k = rec.length - 1; k >= 0 && seen < n; k--) {
      if (notiVisible_(rec[k][0], user)) { seen++; start = k + 2; }
    }
    if (!seen) return { ok: true, rows: [], unread: 0, total: 0 };

    const tz = ss_().getSpreadsheetTimeZone();
    const values = sh.getRange(start, 1, lastRow - start + 1, NOTI_COLS).getValues();
    const rows = [];
    let unread = 0, total = 0;

    for (let i = 0; i < values.length; i++) {
      const r = values[i];
      if (!String(r[N.MSG] || '').trim()) continue;
      if (!notiVisible_(r[N.RECIPIENT], user)) continue;

      total++;
      const isRead = (r[N.READ] === true);
      if (!isRead) unread++;
      if (onlyUnread && isRead) continue;

      rows.push({
        rowIndex: start + i,
        ts: r[N.TS] instanceof Date
              ? Utilities.formatDate(r[N.TS], tz, 'dd/MM HH:mm') : String(r[N.TS] || ''),
        time: toVn_(toIso_(r[N.TIME])), user: String(r[N.USER] || ''), cc: String(r[N.CC] || ''),
        type: String(r[N.TYPE] || ''), name: String(r[N.NAME] || ''), qty: String(r[N.QTY] || ''),
        loc: String(r[N.LOC] || ''), msg: String(r[N.MSG] || ''), read: isRead
      });
    }

    rows.reverse();
    return { ok: true, rows: rows, unread: unread, total: total };
  } catch (e) { return { ok: false, message: e.message }; }
}

/** [API] Đếm chưa đọc. Chỉ đọc 2 cột J:K -> nhẹ nhất cho polling. */
function getUnreadCount() {
  try {
    const user = auth_();
    const sh = notiSheet_();
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return { ok: true, unread: 0, pending: 0 };

    const values = sh.getRange(2, N.READ + 1, lastRow - 1, 2).getValues();
    let unread = 0;
    values.forEach(function (r) { if (r[0] !== true && notiVisible_(r[1], user)) unread++; });

    return { ok: true, unread: unread, pending: countPending_(user) };
  } catch (e) { return { ok: false, message: e.message }; }
}

function markNotificationRead(rowIndex) {
  try {
    const user = auth_();
    const row = Number(rowIndex);
    if (!row || row < 2) throw new Error('Dòng không hợp lệ.');

    return withLock_(function () {
      const sh = notiSheet_();
      if (row > sh.getLastRow()) throw new Error('Dòng ' + row + ' không tồn tại.');

      if (!notiVisible_(sh.getRange(row, N.RECIPIENT + 1).getValue(), user)) {
        log_(user, 'DENIED_SCOPE', 'thử đánh dấu thông báo dòng ' + row);
        throw new Error('Bạn không có quyền đánh dấu thông báo này.');
      }

      sh.getRange(row, N.READ + 1).setValue(true);
      return { ok: true, rowIndex: row };
    });
  } catch (e) { return { ok: false, message: e.message }; }
}

function markAllNotificationsRead() {
  try {
    const user = auth_();

    return withLock_(function () {
      const sh = notiSheet_();
      const lastRow = sh.getLastRow();
      if (lastRow < 2) return { ok: true, marked: 0 };

      // Chỉ ghi lại cột Read: ghi lại cả dòng sẽ biến tin nhắn "=..." đã lưu dạng chữ thành công thức
      const range = sh.getRange(2, 1, lastRow - 1, NOTI_COLS);
      const values = range.getValues();
      const flags = [];
      let marked = 0;

      for (let i = 0; i < values.length; i++) {
        if (notiVisible_(values[i][N.RECIPIENT], user) && values[i][N.READ] !== true) {
          flags.push([true]); marked++;
        } else flags.push([values[i][N.READ]]);
      }

      if (marked) sh.getRange(2, N.READ + 1, flags.length, 1).setValues(flags);
      return { ok: true, marked: marked };
    });
  } catch (e) { return { ok: false, message: e.message }; }
}

