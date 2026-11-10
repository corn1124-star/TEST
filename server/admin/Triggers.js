/* ═══════════ NHÓM 17: TRIGGER ═══════════
   Script standalone -> simple onEdit KHÔNG chạy. Phải cài INSTALLABLE trigger
   bằng installEditTrigger() (chạy tay 1 lần trong editor). */

/** [TRIGGER HANDLER] Sửa Team hoặc Department (kể cả cột Team Code) -> bump epoch. */
function onSheetEdit(e) {
  try {
    if (!e || !e.range) return;
    const name = e.range.getSheet().getName();

    if (name === SH_TEAM || name === SH_DEPT) { bumpAuthEpoch_(); return; }

    if (name === SH_DB || name === SH_BOX || name === SH_BOXMOVE) { dbChanged_(); return; }   // sửa tay sổ cái / thùng -> cache lean_ hết hiệu lực

    if (name === SH_SKU) { skuDirty_(); return; }       // đổi bộ phận / PIC trên Sheet -> quyền xem đổi ngay

    if (name === SH_CAT || name === SH_LOC) {
      CacheService.getScriptCache().remove(BOOTSTRAP_CACHE_KEY);
    }
  } catch (err) { /* trigger lỗi không làm hỏng việc sửa Sheet của user */ }
}

/** [TRIGGER HANDLER] Xóa / chèn dòng, cột, sheet (onChange). Sự kiện KHÔNG có e.range nên không biết sheet nào:
 *  bump cả epoch xác thực lẫn dữ liệu (chấp nhận bump thừa). Sửa ô thường do onSheetEdit lo. */
function onSheetChange(e) {
  try {
    /* hàm công khai (gọi được từ google.script.run): chỉ chạy với sự kiện thật của Google (có e.source là Spreadsheet) */
    if (!e || !e.source || typeof e.source.getId !== 'function') return;
    const ty = String(e.changeType || '');
    if (ty === 'EDIT' || ty === 'FORMAT') return;       // EDIT đã có onSheetEdit; FORMAT không đổi dữ liệu

    bumpAuthEpoch_();
    dbChanged_();
  } catch (err) { /* trigger lỗi không làm hỏng việc sửa Sheet của user */ }
}

function installEditTrigger() {
  requireAdmin_();   // [QUYỀN] hàm công khai: ai có link web app cũng gọi được qua google.script.run
  let removed = 0;

  ScriptApp.getProjectTriggers().forEach(function (t) {
    const h = t.getHandlerFunction();
    if (h === 'onSheetEdit' || h === 'onSheetChange') { ScriptApp.deleteTrigger(t); removed++; }
  });

  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(SS_ID).onEdit().create();
  ScriptApp.newTrigger('onSheetChange').forSpreadsheet(SS_ID).onChange().create();   // xóa / chèn dòng

  const out = 'Đã cài trigger onEdit' + (removed ? ' (xoá ' + removed + ' trigger cũ)' : '') +
              '. Sửa Role / Team Code / dữ liệu trực tiếp trên Sheet (kể cả xóa / chèn dòng) sẽ có hiệu lực ngay.';
  Logger.log(out);
  return out;
}

