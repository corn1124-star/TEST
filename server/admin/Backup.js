/* ══════════════════════════════════════════════════════════════════════
   Backup.gs — SAO LƯU CẢ FILE SHEET VÀO DRIVE
   ══════════════════════════════════════════════════════════════════════
   backupNow()            tạo 1 bản sao "SEC WH backup <ngày giờ>" trong thư mục Drive "SEC WH Backups",
                          rồi chuyển vào thùng rác các bản cũ vượt quá BK_KEEP.
   backupAuto()           chạy theo lịch: tự sao lưu MỖI 3 THÁNG (lịch kiểm tra ngày 1 hằng tháng, chỉ sao lưu khi đã
                          đủ BK_EVERY_DAYS ngày kể từ bản tự động trước).
   installBackupTrigger() đặt lịch tự động (chạy một lần; thay luôn lịch "mỗi ngày" cũ nếu còn).
   removeBackupTrigger()  gỡ lịch tự động (cả lịch cũ).

   AN TOÀN
     · Chỉ đụng file nằm TRONG thư mục sao lưu và có tên bắt đầu bằng BK_PREFIX.
     · "Xoá" = chuyển vào thùng rác Drive (khôi phục được trong 30 ngày), không xoá vĩnh viễn.
     · Không bao giờ sửa file Sheet gốc.
   Bản sao có đủ mọi sheet (Database, BoxDetail, …) nên mở lên là dùng được ngay.
   Giới hạn: copy file rất lớn có thể mất vài chục giây.
   ══════════════════════════════════════════════════════════════════════ */

const BK_FOLDER_NAME = 'SEC WH Backups';
const BK_FOLDER_PROP = 'BK_FOLDER_ID';
const BK_AUTO_OFF    = 'BK_AUTO_OFF';    // admin đã chủ động tắt lịch tự động -> trang không tự bật lại
const BK_PREFIX      = 'SEC WH backup ';
const BK_KEEP        = 14;               // số bản giữ lại (mỗi 3 tháng một bản tự động => khoảng 3,5 năm lịch sử)
const BK_HOUR        = 2;                // giờ chạy tự động
const BK_EVERY_DAYS  = 85;               // "3 tháng": đủ ngần này ngày kể từ bản tự động trước thì sao lưu (85 vì tháng chỉ 28-31 ngày, lịch kiểm tra hằng tháng)
const BK_AUTO_TAG    = 'auto';           // ghi chú gắn vào file để phân biệt bản tự động với bản sao lưu tay

/** Thư mục sao lưu: dùng ID đã lưu; mất thì tìm theo tên; không có thì tạo mới (create=false: trả null). */
function bkFolder_(create) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(BK_FOLDER_PROP);

  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {}
  }

  const found = DriveApp.getFoldersByName(BK_FOLDER_NAME);
  if (!found.hasNext() && create === false) return null;
  const folder = found.hasNext() ? found.next() : DriveApp.createFolder(BK_FOLDER_NAME);
  props.setProperty(BK_FOLDER_PROP, folder.getId());
  return folder;
}

/** Các file sao lưu trong thư mục, mới nhất trước. Chỉ file có đúng tiền tố BK_PREFIX. */
function bkFiles_(folder) {
  const mine = [];
  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (String(f.getName()).indexOf(BK_PREFIX) === 0) mine.push(f);
  }
  mine.sort(function (a, b) { return b.getDateCreated().getTime() - a.getDateCreated().getTime(); });
  return mine;
}

/** Chuyển vào thùng rác các bản sao cũ, giữ BK_KEEP bản mới nhất. @return số bản đã dọn */
function bkPrune_(folder) {
  const mine = bkFiles_(folder);

  let trashed = 0;
  for (let i = BK_KEEP; i < mine.length; i++) { mine[i].setTrashed(true); trashed++; }
  return trashed;
}

/** Bản TỰ ĐỘNG gần nhất trong thư mục (nhận biết qua ghi chú của file), hoặc null. Bản sao lưu tay không tính. */
function bkLastAuto_(folder) {
  const mine = bkFiles_(folder);
  for (let i = 0; i < mine.length; i++) {
    try { if (mine[i].getDescription() === BK_AUTO_TAG) return mine[i]; } catch (e) {}
  }
  return null;
}

/** Sao chép file Sheet vào thư mục sao lưu rồi dọn bản cũ. auto=true: đánh dấu là bản tự động. */
function bkCopy_(auto) {
  const folder = bkFolder_(true);
  const stamp = Utilities.formatDate(new Date(), sheetTz_(), 'yyyy-MM-dd HHmm');
  const copy = DriveApp.getFileById(SS_ID).makeCopy(BK_PREFIX + stamp, folder);
  if (auto) { try { copy.setDescription(BK_AUTO_TAG); } catch (e) {} }
  const trashed = bkPrune_(folder);

  const msg = 'Đã sao lưu' + (auto ? ' (tự động)' : '') + ': ' + copy.getName() + (trashed ? ' · dọn ' + trashed + ' bản cũ' : '');
  Logger.log(msg + '\n' + copy.getUrl());
  try { log_({ email: 'system', cc: '', role: 'system' }, auto ? 'BACKUP_AUTO' : 'BACKUP', copy.getName()); } catch (e) {}
  return { name: copy.getName(), url: copy.getUrl(), trashed: trashed, folder: folder.getUrl(), auto: !!auto };
}

/** Tạo bản sao lưu ngay (nút "Sao lưu ngay"). */
function backupNow(e) {
  // Không tin event từ client (google.script.run gửi được object tuỳ ý). Bộ hẹn giờ chạy không có người dùng
  // đang đăng nhập (email rỗng); mọi lời gọi có email (nút, google.script.run, editor) phải là admin.
  // Lịch cũ "mỗi ngày" vẫn gọi backupNow từ bộ hẹn giờ: chuyển sang nhịp 3 tháng, không sao lưu hằng ngày nữa
  if (!Session.getActiveUser().getEmail()) return backupAuto();
  requireAdmin_();
  return bkCopy_(false);
}

/**
 * Chạy theo lịch: ngày 1 hằng tháng lúc BK_HOUR giờ. Chỉ sao lưu thật khi đã qua BK_EVERY_DAYS ngày kể từ bản TỰ ĐỘNG
 * gần nhất (hoặc chưa có bản tự động nào) => khoảng 3 tháng một lần. Apps Script không có lịch "mỗi 3 tháng" nên
 * dùng lịch hằng tháng + kiểm tra này. Sao lưu tay không làm lệch nhịp.
 */
function backupAuto() {
  if (Session.getActiveUser().getEmail()) requireAdmin_();   // gọi tay phải là admin; bộ hẹn giờ (email rỗng) thì chạy
  const last = bkLastAuto_(bkFolder_(true));
  if (last) {
    const ageDays = (Date.now() - last.getDateCreated().getTime()) / 86400000;
    if (ageDays < BK_EVERY_DAYS) return { skipped: true, ageDays: Math.floor(ageDays), message: 'Chưa đủ 3 tháng kể từ bản tự động gần nhất.' };
  }
  return bkCopy_(true);
}

/** Đặt lịch tự động (kiểm tra ngày 1 hằng tháng, sao lưu mỗi 3 tháng). Chạy lại an toàn (không tạo trùng). */
function installBackupTrigger() {
  requireAdmin_();   // [QUYỀN] hàm công khai: ai có link web app cũng gọi được qua google.script.run
  removeBackupTrigger();
  ScriptApp.newTrigger('backupAuto').timeBased().onMonthDay(1).atHour(BK_HOUR).create();
  PropertiesService.getScriptProperties().deleteProperty(BK_AUTO_OFF);
  return 'Đã đặt sao lưu tự động mỗi 3 tháng (kiểm tra vào ngày 1 hằng tháng lúc ' + BK_HOUR + ':00, múi giờ của dự án).';
}

function bkHasTrigger_() {
  return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'backupAuto'; });
}

/* ═══════════ API CHO GIAO DIỆN (CHỈ ADMIN) ═══════════ */

/**
 * [API — ADMIN] Tình trạng sao lưu. ensureAuto=true: nếu chưa có lịch tự động thì đặt luôn
 * (chạy bằng quyền của admin đang mở trang; nếu thiếu quyền thì trả autoError, không làm hỏng trang).
 */
function backupStatus(ensureAuto) {
  try {
    requireAdmin_();
    let auto = bkHasTrigger_(), autoError = '';
    // Admin đã chủ động tắt thì không tự bật lại mỗi lần mở trang
    if (ensureAuto && !auto && !PropertiesService.getScriptProperties().getProperty(BK_AUTO_OFF)) {
      try { installBackupTrigger(); auto = true; } catch (e) { autoError = String(e.message || e); }
    }

    const folder = bkFolder_(false);
    const files = folder ? bkFiles_(folder) : [];
    const tz = sheetTz_();

    return {
      ok: true, auto: auto, autoError: autoError, hour: BK_HOUR, keep: BK_KEEP, everyMonths: 3,
      staleAfterHours: (BK_EVERY_DAYS + 15) * 24,    // quá hạn này mà chưa có bản mới => cảnh báo lịch có thể hỏng
      folderUrl: folder ? folder.getUrl() : '', total: files.length,
      items: files.slice(0, BK_KEEP).map(function (f) {
        return { id: f.getId(), name: f.getName(), url: f.getUrl(), at: Utilities.formatDate(f.getDateCreated(), tz, 'yyyy-MM-dd HH:mm'),
                 ageHours: Math.round((Date.now() - f.getDateCreated().getTime()) / 36000) / 100 };
      })
    };
  } catch (e) { return { ok: false, message: e.message }; }
}

/** [API — ADMIN] Sao lưu ngay. */
function backupRunNow() {
  try {
    requireAdmin_();
    const r = backupNow();
    return { ok: true, name: r.name, url: r.url, trashed: r.trashed, message: 'Đã tạo bản sao lưu ' + r.name + '.' };
  } catch (e) { return { ok: false, message: e.message }; }
}

/** [API — ADMIN] Xóa 1 bản sao lưu (vào thùng rác Drive). Chỉ file nằm trong thư mục sao lưu và đúng tiền tố. */
function backupDelete(fileId) {
  try {
    const u = requireAdmin_();
    const folder = bkFolder_(false);
    if (!folder) throw new Error('Chưa có thư mục sao lưu.');

    const f = bkFiles_(folder).filter(function (x) { return x.getId() === String(fileId); })[0];
    if (!f) throw new Error('Không tìm thấy bản sao lưu này trong thư mục sao lưu.');

    const name = f.getName();
    f.setTrashed(true);
    log_(u, 'BACKUP_DELETE', name);
    return { ok: true, message: 'Đã xóa bản sao lưu ' + name + ' (vào thùng rác Drive).' };
  } catch (e) { return { ok: false, message: e.message }; }
}

/** [API — ADMIN] Bật / tắt sao lưu tự động hằng ngày. */
function backupSetAuto(on) {
  try {
    requireAdmin_();
    const message = on ? installBackupTrigger() : removeBackupTrigger();
    return { ok: true, auto: !!on, message: message };
  } catch (e) { return { ok: false, message: e.message }; }
}

function removeBackupTrigger() {
  requireAdmin_();   // [QUYỀN] hàm công khai: ai có link web app cũng gọi được qua google.script.run
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const fn = t.getHandlerFunction();
    if (fn === 'backupAuto' || fn === 'backupNow') { ScriptApp.deleteTrigger(t); n++; }   // backupNow = lịch "mỗi ngày" cũ
  });
  PropertiesService.getScriptProperties().setProperty(BK_AUTO_OFF, '1');
  return 'Đã gỡ ' + n + ' lịch sao lưu.';
}
