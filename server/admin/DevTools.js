/* ═══════════ NHÓM 18: DEV TOOL ═══════════ */

/** [DEV TOOL — CHẠY 1 LẦN SAU KHI DÁN CODE] Ghi header cho MỌI sheet hệ thống. */
function setupAllSheets() {
  requireAdmin_();   // [QUYỀN] hàm công khai: ai có link web app cũng gọi được qua google.script.run
  const out = [];

  const db = sheet_(SH_DB);
  if (db.getMaxColumns() < DB_COLS) db.insertColumnsAfter(db.getMaxColumns(), DB_COLS - db.getMaxColumns());

  const head = db.getRange(1, 1, 1, DB_COLS);
  head.setValues([HEADERS])
    .setBackground('#ffffff').setFontColor('#000000')
    .setFontWeight('bold').setFontSize(10)
    .setVerticalAlignment('middle').setWrap(true);
  head.setBorder(null, null, true, null, null, null,
    '#000000', SpreadsheetApp.BorderStyle.SOLID);
  db.setFrozenRows(1);
  out.push('✔ Database: ' + DB_COLS + ' cột (U = Bin Location)');

  out.push('✔ Notification: ' + NOTI_COLS + ' cột · ' + (notiSheet_().getLastRow() - 1) + ' dòng');
  out.push('✔ PendingRequests: ' + PENDING_COLS + ' cột · ' + (pendingSheet_().getLastRow() - 1) + ' dòng');
  out.push('✔ BoxDetail: ' + BOX_COLS + ' cột · ' + (boxSheet_().getLastRow() - 1) + ' thùng');
  out.push('✔ BoxMove: ' + BOXMOVE_COLS + ' cột · ' + (boxMoveSheet_().getLastRow() - 1) + ' lần xuất');

  // [TEAM] Tiêu đề cột C sheet Department
  const dept = sheet_(SH_DEPT);
  if (!String(dept.getRange(1, 3).getValue() || '').trim()) {
    dept.getRange(1, 3).setValue('Team Code').setFontWeight('bold');
    out.push('✔ Department: đã thêm tiêu đề cột C "Team Code"');
  }

  const msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/** [DEV TOOL] Chuyển MỌI sheet sang định dạng trung tính, bỏ nền xanh. */
function formatAllSheetsPlain(clearBody) {
  requireAdmin_();   // [QUYỀN] hàm công khai: ai có link web app cũng gọi được qua google.script.run
  const wipeBody = (clearBody !== false);

  const targets = [SH_DB, SH_CAT, SH_DEPT, SH_LOC, SH_TEAM, SH_LOG,
                   SH_NOTI, SH_PENDING, SH_BOX, SH_BOXMOVE];
  const out = [];

  targets.forEach(function (name) {
    const sh = ss_().getSheetByName(name);
    if (!sh) { out.push('— ' + name + ': không có sheet này'); return; }

    const lastCol = Math.max(sh.getLastColumn(), 1);
    const lastRow = Math.max(sh.getLastRow(), 1);

    const head = sh.getRange(1, 1, 1, lastCol);
    head.setBackground('#ffffff').setFontColor('#000000')
      .setFontWeight('bold').setFontSize(10)
      .setVerticalAlignment('middle').setWrap(true);
    head.setBorder(null, null, true, null, null, null,
      '#000000', SpreadsheetApp.BorderStyle.SOLID);
    sh.setFrozenRows(1);

    if (wipeBody && lastRow > 1) {
      sh.getRange(2, 1, lastRow - 1, lastCol)
        .setBackground(null).setFontColor('#000000').setFontWeight('normal');
    }

    let nBand = 0;
    sh.getBandings().forEach(function (b) { b.remove(); nBand++; });

    out.push('✔ ' + name + ': ' + lastCol + ' cột · ' + (lastRow - 1) + ' dòng' +
             (nBand ? ' · xoá ' + nBand + ' banding' : ''));
  });

  const msg = 'ĐÃ CHUYỂN SANG ĐỊNH DẠNG TRUNG TÍNH\n' + out.join('\n');
  Logger.log(msg);
  return msg;
}

function findNegativeStock() {
  requireAdmin_();   // [QUYỀN] hàm công khai: ai có link web app cũng gọi được qua google.script.run
  const map = {};

  readAllRows_().forEach(function (r, i) {
    const code = String(r[C.CODE] || '').trim();
    if (!code) return;
    if (!map[code]) map[code] = { imp: 0, exp: 0, rows: [] };
    const q = Number(r[C.QTY]) || 0;
    if (String(r[C.TYPE]).trim() === 'Import') map[code].imp += q;
    else { map[code].exp += q; map[code].rows.push(i + 2); }
  });

  const bad = [];
  Object.keys(map).forEach(function (code) {
    const m = map[code], stock = m.imp - m.exp;
    if (stock < 0) {
      bad.push('✗ ' + code + ' | nhập ' + m.imp + ' · xuất ' + m.exp +
               ' · tồn ' + stock + ' | dòng Export: ' + m.rows.join(', '));
    }
  });

  const out = bad.length ? 'Phát hiện ' + bad.length + ' mã tồn âm:\n' + bad.join('\n')
                         : '✔ Không có mã nào tồn âm.';
  Logger.log(out);
  return out;
}


/** [DEV TOOL] Lệch giữa tồn Database và tổng Remaining của thùng. */
function auditBoxVsStock() {
  requireAdmin_();   // [QUYỀN] hàm công khai: ai có link web app cũng gọi được qua google.script.run
  const stock = {}, box = {};

  readAllRows_().forEach(function (r) {
    const c = String(r[C.CODE] || '').trim();
    if (!c) return;
    if (!stock[c]) stock[c] = 0;
    const q = Number(r[C.QTY]) || 0;
    stock[c] += (String(r[C.TYPE]).trim() === 'Import' ? q : -q);
  });

  boxRows_().forEach(function (r) {
    const c = String(r[B.CODE] || '').trim();
    if (!c) return;
    box[c] = (box[c] || 0) + (Number(r[B.REMAINING]) || 0);
  });

  const out = [];
  Object.keys(box).forEach(function (c) {
    if (stock[c] !== box[c]) {
      out.push('  ' + c + ' | tồn DB ' + stock[c] + ' · tổng thùng ' + box[c] +
               ' · lệch ' + (stock[c] - box[c]));
    }
  });

  const msg = out.length
    ? 'Có ' + out.length + ' mã lệch giữa tồn kho và chi tiết thùng:\n' + out.join('\n') +
      '\n\n⚠ Lệch là BÌNH THƯỜNG với hàng nhập TRƯỚC khi có tính năng thùng.'
    : '✔ Tồn kho và chi tiết thùng khớp nhau ở mọi mã có thùng.';

  Logger.log(msg);
  return msg;
}

/** [DEV TOOL] Liệt kê mọi truy cập BỊ TỪ CHỐI trong N ngày gần nhất. */
function auditDeniedAccess(days) {
  requireAdmin_();   // [QUYỀN] hàm công khai: ai có link web app cũng gọi được qua google.script.run
  const sh = sheet_(SH_LOG);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return 'AuditLog trống.';

  const since = new Date(Date.now() - (Number(days) || 7) * 86400000);
  const tz = ss_().getSpreadsheetTimeZone();
  const v = sh.getRange(2, 1, lastRow - 1, 6).getValues();
  const out = [];

  v.forEach(function (r) {
    if (String(r[2] || '').indexOf('DENIED') !== 0) return;
    if (r[0] instanceof Date && r[0] < since) return;

    out.push(Utilities.formatDate(r[0], tz, 'dd/MM HH:mm') +
             ' | ' + r[1] + ' (' + r[4] + ') | ' + r[2] + ' | ' + r[5]);
  });

  const res = out.length
    ? '⚠ Phát hiện ' + out.length + ' lần truy cập bị từ chối:\n' + out.join('\n')
    : '✔ Không có truy cập bị từ chối trong ' + (days || 7) + ' ngày qua.';

  Logger.log(res);
  return res;
}

function checkMailQuota() {
  requireAdmin_();   // [QUYỀN] hàm công khai: ai có link web app cũng gọi được qua google.script.run
  const out = 'Còn ' + MailApp.getRemainingDailyQuota() + ' email hôm nay · MAIL_ENABLED = ' +
              MAIL_ENABLED + ' · URL: ' + (webAppUrl_() || '(chưa deploy)');
  Logger.log(out);
  return out;
}

/**
 * [DEV TOOL] Kiểm tra toàn bộ cấu hình. CHẠY SAU KHI DÁN CODE.
 * Mọi dòng phải ✔ và "Số admin" phải ≥ 1.
 */
function healthCheck() {
  requireAdmin_();   // [QUYỀN] hàm công khai: ai có link web app cũng gọi được qua google.script.run
  const out = ['=== ' + APP_NAME + ' ==='];

  [SH_DB, SH_CAT, SH_DEPT, SH_LOC, SH_TEAM, SH_LOG,
   SH_NOTI, SH_PENDING, SH_BOX, SH_BOXMOVE].forEach(function (n) {
    const sh = ss_().getSheetByName(n);
    out.push((sh ? '✔' : '✗') + ' ' + n + (sh ? ' — ' + sh.getLastRow() + ' dòng' : ' — THIẾU'));
  });

  const cat = categoryTree_();
  out.push('Category: ' + cat.categories.length + ' nhóm · Location: ' + locations_().length + ' địa điểm');

  const dbU = String(sheet_(SH_DB).getRange(1, C.BIN + 1).getValue()).trim();
  out.push((dbU === 'Bin Location' ? '✔' : '✗') + ' Database cột U: "' + dbU +
           '"' + (dbU === 'Bin Location' ? '' : ' — CHẠY setupAllSheets()'));

  const boxB = String(boxSheet_().getRange(1, B.BOX_CODE + 1).getValue()).trim();
  out.push((boxB === 'Box Code' ? '✔' : '✗') + ' BoxDetail cột B: "' + boxB + '"');

  const trig = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === 'onSheetEdit';
  }).length;
  out.push((trig ? '✔' : '✗') + ' Trigger onSheetEdit: ' +
           (trig ? 'đã cài' : 'CHƯA CÀI — chạy installEditTrigger()'));

  /* ── [TEAM] Cost Center -> Team Code ── */
  const deptHead = String(sheet_(SH_DEPT).getRange(1, 3).getValue() || '').trim();
  out.push((deptHead ? '✔' : '⚠') + ' Department cột C: "' + deptHead + '"' +
           (deptHead ? '' : ' — chưa có Team Code, mỗi CC tự là 1 team (chạy setupAllSheets())'));

  out.push('--- Team Code ← Cost Center ---');
  const tm = teamMap_();
  const byTeam = {};
  Object.keys(tm).forEach(function (cc) {
    if (!byTeam[tm[cc]]) byTeam[tm[cc]] = [];
    byTeam[tm[cc]].push(cc);
  });
  Object.keys(byTeam).sort().forEach(function (t) {
    out.push('  ' + t + ' ← ' + byTeam[t].join(', ') +
             (byTeam[t].length > 1 ? '   (dùng chung tồn kho)' : ''));
  });

  /* ── User ── */
  out.push('--- Map user -> Department -> Team ---');
  const team = sheet_(SH_TEAM).getDataRange().getValues();
  const map = deptMap_();
  let admins = 0, pending = 0;

  for (let i = 1; i < team.length; i++) {
    const raw = String(team[i][2] || '').trim();
    const full = resolveCc_(raw, map);
    const role = String(team[i][3] || '').trim().toLowerCase();
    if (role === 'admin') admins++;
    if (role === 'pending') pending++;
    out.push('  ' + team[i][0] + ' (' + role + '): ' + raw + ' → ' + full +
             ' → ' + (map[full] || 'KHÔNG MAP ĐƯỢC') + ' → team ' + (tm[full] || full));
  }

  out.push((admins > 0 ? '✔' : '✗') + ' Số admin: ' + admins + (admins === 0 ? ' — NGUY HIỂM!' : ''));
  out.push((pending ? '⚠' : '✔') + ' User chờ duyệt: ' + pending);

  Logger.log(out.join('\n'));
  return out.join('\n');
}

