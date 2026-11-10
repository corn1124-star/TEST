/* ══════════════════════════════════════════════════════════════════════
   Photo.gs — ẢNH HÀNG HOÁ CHO FORM NHẬP KHO & FORM SỬA
   ══════════════════════════════════════════════════════════════════════
   Ảnh gốc  -> Google Drive:  <root> / <ngày tải> / <Asset Code>
   Metadata -> sheet 'Photos' (tự tạo, KHÔNG đụng Database)

   BA QUYẾT ĐỊNH THIẾT KẾ:

   1. Thumbnail base64 nằm ở CỘT CUỐI (P). Mọi truy vấn không cần ảnh chỉ
      đọc A:O -> không kéo theo hàng MB base64 vô ích.

   2. KHÔNG dùng withLock_ của Code.gs. Lock đó là script lock dùng chung
      toàn app; nếu tải ảnh giữ nó thì người khác không nhập/xuất kho được.
      appendRow đã đủ an toàn, và sai lệch nhỏ ở bộ đếm 8 ảnh là vô hại.

   3. Lúc Staff tải ảnh, Asset Code CHƯA tồn tại (mã chỉ sinh khi Admin
      duyệt). Ảnh vào folder '_Cho duyet' rồi được chuyển tự động.

   Dùng lại từ Code.gs: ss_(), sheet_(), auth_(), log_(), SH_PENDING,
   P, PENDING_COLS. Mọi tên đều có tiền tố photo/PH_ nên không trùng.
   ══════════════════════════════════════════════════════════════════════ */

const PH_SHEET = 'Photos';

/* Photos: 16 cột (A-P) — THUMB để cuối, xem lý do ở đầu file */
const PH = {
  ID:0, REF_TYPE:1, REF_KEY:2, CODE:3, CC:4, TX_ROW:5, ITEM_NAME:6,
  FILE_ID:7, URL:8, FILE_NAME:9, SIZE:10, FOLDER:11,
  BY:12, AT:13, DELETED:14, THUMB:15
};
const PH_COLS      = 16;
const PH_META_COLS = 15;          // A:O — không gồm cột thumbnail

const PH_HEADERS = ['Photo ID','Ref Type','Ref Key','Asset Code','Cost Center',
  'Tx Row','Item Name','Drive File ID','Drive URL','File Name','Size (bytes)',
  'Drive Folder','Uploaded By','Uploaded At','Deleted','Thumbnail (base64)'];

const PH_FOLDER_NAME = 'Grab Inventory Photos';
const PH_FOLDER_PROP = 'photo_folder_id_v1';
const PH_PENDING     = '_Cho duyet';     // folder tạm khi chưa có Asset Code

const PH_MAX_PER_ITEM = 8;               // số ảnh tối đa cho 1 mã hàng
const PH_MAX_BYTES    = 4 * 1024 * 1024; // chặn ảnh quá lớn (client đã thu nhỏ)
const PH_MAX_THUMB    = 40000;           // ô Sheet giới hạn 50k ký tự
const PH_FOLDER_TTL   = 21600;           // cache ID folder 6 tiếng

/* ═══════════ SHEET ═══════════ */

/** Sheet Photos — tự tạo kèm tiêu đề nếu chưa có. */
function photoSheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(PH_SHEET);

  if (!sh) {
    sh = ss.insertSheet(PH_SHEET);
    sh.getRange(1, 1, 1, PH_COLS).setValues([PH_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.hideSheet();        // sheet kỹ thuật — chuột phải tab > Unhide nếu cần xem
  }
  return sh;
}

/** Đọc A:O — KHÔNG gồm base64. Dùng cho mọi truy vấn không cần ảnh. */
function photoMetaRows_() {
  const sh = photoSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const n = Math.min(PH_META_COLS, sh.getMaxColumns());
  const rows = sh.getRange(2, 1, lastRow - 1, n).getValues();
  if (n < PH_COLS) rows.forEach(function (r) { while (r.length < PH_COLS) r.push(''); });
  return rows;
}

/** Đọc cột thumbnail cho ĐÚNG khoảng dòng cần — tránh quét cả sheet. */
function photoThumbs_(minRow, maxRow) {
  if (!minRow || maxRow < minRow) return {};

  const v = photoSheet_().getRange(minRow, PH.THUMB + 1, maxRow - minRow + 1, 1).getValues();
  const out = {};
  for (let i = 0; i < v.length; i++) out[minRow + i] = String(v[i][0] || '');
  return out;
}

/* ═══════════ FOLDER DRIVE ═══════════ */

/** Folder gốc. ID cache vào ScriptProperties nên chỉ tìm/tạo 1 lần. */
function photoFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(PH_FOLDER_PROP);

  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) {}
  }

  const it = DriveApp.getFoldersByName(PH_FOLDER_NAME);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(PH_FOLDER_NAME);
  props.setProperty(PH_FOLDER_PROP, folder.getId());
  return folder;
}

/** Bỏ ký tự Drive không nhận, gói gọn độ dài để làm tên folder. */
function photoSafeName_(s) {
  let x = String(s || '').trim();
  if (!x) return '';
  x = x.replace(/[\/\\:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  return x.length > 100 ? x.substring(0, 100).trim() : x;
}

/** Lấy/tạo folder con theo tên, cache ID 6 tiếng để không hỏi Drive mỗi lần. */
function photoChildFolder_(parent, name) {
  const key = 'phf_' + parent.getId() + '_' + name;
  const cache = CacheService.getScriptCache();

  try {
    const id = cache.get(key);
    if (id) return DriveApp.getFolderById(id);
  } catch (e) {}

  const it = parent.getFoldersByName(name);
  const f = it.hasNext() ? it.next() : parent.createFolder(name);

  try { cache.put(key, f.getId(), PH_FOLDER_TTL); } catch (e) {}
  return f;
}

/** Tên folder ngày. ★ Đổi 'dd-MM-yyyy' -> 'yyyy-MM-dd' nếu muốn Drive sắp đúng thứ tự. */
function photoDayName_(when) {
  const d = (when instanceof Date) ? when : new Date();
  return Utilities.formatDate(d, ss_().getSpreadsheetTimeZone(), 'dd-MM-yyyy');
}

/**
 * Đường dẫn lưu ảnh: <root> / <ngày> / <Asset Code>
 *   Grab Inventory Photos / 22-09-2026 / BAG-CLO-2026-0042
 * Chưa có mã -> <ngày> / _Cho duyet, sẽ được chuyển khi mã được sinh.
 */
function photoCodeFolder_(code, when) {
  const day  = photoDayName_(when);
  const name = photoSafeName_(code) || PH_PENDING;

  const dayFolder = photoChildFolder_(photoFolder_(), day);
  return { folder: photoChildFolder_(dayFolder, name), path: day + ' / ' + name };
}

/** Chuyển 1 file sang folder khác. Lỗi không throw — ảnh vẫn xem được. */
function photoMoveFile_(fileId, folder) {
  try { DriveApp.getFileById(String(fileId)).moveTo(folder); return true; }
  catch (e) { return false; }
}

/**
 * Đưa các dòng ảnh về đúng folder <ngày tải> / <Asset Code>.
 * @param hits mảng { row, rowIndex } từ photoFind_
 * @return số file đã chuyển
 */
function photoRelocate_(hits, code) {
  const cd = photoSafeName_(code);
  if (!cd) return 0;

  const sh = photoSheet_();
  let n = 0;

  (hits || []).forEach(function (h) {
    const dest = photoCodeFolder_(cd, h.row[PH.AT]);   // giữ nguyên folder NGÀY TẢI
    if (String(h.row[PH.FOLDER] || '').trim() === dest.path) return;

    if (photoMoveFile_(h.row[PH.FILE_ID], dest.folder)) {
      try {
        sh.getRange(h.rowIndex, PH.FOLDER + 1).setValue(dest.path);
        h.row[PH.FOLDER] = dest.path;
      } catch (e) {}
      n++;
    }
  });

  return n;
}

/* ═══════════ TIỆN ÍCH ═══════════ */

function photoNewId_() {
  return 'IMG-' + Utilities.formatDate(new Date(),
    ss_().getSpreadsheetTimeZone(), 'yyMMdd-HHmmss') + '-' +
    Math.random().toString(36).slice(2, 6).toUpperCase();
}

function photoFmtAt_(v) {
  return v instanceof Date
    ? Utilities.formatDate(v, ss_().getSpreadsheetTimeZone(), 'dd/MM/yyyy HH:mm')
    : String(v || '');
}

/** Lọc dòng ảnh còn hiệu lực. kind: 'DRAFT' | 'REQUEST' | 'TX' | 'CODE' */
function photoFind_(kind, key, code, metaRows) {
  const out = [];
  const k  = String(key || '').trim();
  const cd = String(code || '').trim();

  (metaRows || photoMetaRows_()).forEach(function (r, i) {   // metaRows: truyền vào khi tra nhiều lần để chỉ đọc sheet 1 lần
    if (String(r[PH.DELETED] || '').trim()) return;

    const rt = String(r[PH.REF_TYPE] || '').trim().toUpperCase();
    const rk = String(r[PH.REF_KEY] || '').trim();
    const rc = String(r[PH.CODE] || '').trim();

    const hit = (kind === 'CODE')
      ? (cd && (rc === cd || rk === cd))
      : (rt === kind && rk === k);

    if (hit) out.push({ row: r, rowIndex: i + 2 });
  });

  return out;
}

/** Đọc thumbnail (base64, nặng) chỉ ở các đoạn dòng có ảnh cần lấy; hai dòng cách nhau ≤ PH_RUN_GAP thì gộp một lần đọc. */
const PH_RUN_GAP = 3;

function photoThumbsOf_(hits) {
  const rows = hits.map(function (h) { return h.rowIndex; }).sort(function (a, b) { return a - b; });
  const thumbs = {};
  let start = rows[0], prev = rows[0];

  for (let i = 1; i <= rows.length; i++) {
    if (i < rows.length && rows[i] - prev <= PH_RUN_GAP) { prev = rows[i]; continue; }
    Object.assign(thumbs, photoThumbs_(start, prev));
    start = prev = rows[i];
  }
  return thumbs;
}

/** Gắn thumbnail cho danh sách hits. */
function photoToObjs_(hits, me) {
  if (!hits.length) return [];

  const thumbs = photoThumbsOf_(hits);

  return hits.map(function (h) {
    const r = h.row;
    return {
      rowIndex: h.rowIndex,
      photoId: String(r[PH.ID] || ''),
      refType: String(r[PH.REF_TYPE] || ''),
      refKey: String(r[PH.REF_KEY] || ''),
      code: String(r[PH.CODE] || ''),
      itemName: String(r[PH.ITEM_NAME] || ''),
      fileId: String(r[PH.FILE_ID] || ''),
      url: String(r[PH.URL] || ''),
      fileName: String(r[PH.FILE_NAME] || ''),
      folder: String(r[PH.FOLDER] || ''),
      size: Number(r[PH.SIZE]) || 0,
      thumb: thumbs[h.rowIndex] || '',
      by: String(r[PH.BY] || ''),
      at: photoFmtAt_(r[PH.AT]),
      canDelete: !!me && (me.role === 'admin' ||
                          String(r[PH.BY] || '').toLowerCase() === me.email)
    };
  });
}

/* ═══════════ API: TẢI ẢNH LÊN ═══════════ */

/**
 * [API] Lưu 1 ảnh.
 *
 * p = { refType, refKey, code, cc, txRow, itemName, name, mime, data, thumb }
 *   refType 'DRAFT'   refKey = khoá tạm (form Nhập chưa gửi)
 *           'REQUEST' refKey = Request ID
 *           'TX'      refKey = Asset Code
 *   data  = base64 KHÔNG kèm tiền tố 'data:image/...;base64,'
 *   thumb = dataURL thumbnail nhỏ, lưu thẳng vào Sheet để xem nhanh
 */
function photoSave(p) {
  try {
    const me = auth_();
    p = p || {};

    const refType = String(p.refType || 'DRAFT').trim().toUpperCase();
    const refKey  = String(p.refKey || '').trim();
    if (!refKey) throw new Error('Thiếu khoá tham chiếu của ảnh.');

    // Ảnh gắn vào mã hàng: người gửi phải thấy được mã đó, nếu không có thể làm đầy giới hạn ảnh của team khác.
    // Kiểm cả DRAFT/REQUEST khi client gửi kèm code, vì code đó sẽ quyết định ảnh hiện ở mã nào (photoList kind 'code').
    if (refType === 'TX' || refType === 'CODE' || String(p.code || '').trim()) {
      const target = String(p.code || refKey).trim();
      const hit = readAllRows_().filter(function (r) { return String(r[C.CODE] || '').trim() === target; })[0];
      if (!codeVisible_(me, target)) {
        log_(me, 'DENIED_PHOTO', 'thử gắn ảnh vào mã ngoài phạm vi: ' + target);
        if (!hit) throw new Error('Không tìm thấy mã ' + target + ' để đính kèm ảnh.');
        throw new Error('Bạn không có quyền đính kèm ảnh cho mã ' + target + '.');
      }
    }

    const b64 = String(p.data || '').replace(/^data:[^,]*,/, '');
    if (!b64) throw new Error('Không có dữ liệu ảnh.');

    const mime = String(p.mime || 'image/jpeg').trim();
    if (mime.indexOf('image/') !== 0) throw new Error('Chỉ nhận tệp ảnh.');

    const approxBytes = Math.floor(b64.length * 3 / 4);   // base64 dài hơn ~4/3
    if (approxBytes > PH_MAX_BYTES) {
      throw new Error('Ảnh quá lớn (' + Math.round(approxBytes / 1048576) +
                      ' MB). Giới hạn ' + Math.round(PH_MAX_BYTES / 1048576) + ' MB.');
    }

    let thumb = String(p.thumb || '');
    if (thumb.length > PH_MAX_THUMB) thumb = '';   // quá dài thì bỏ, ảnh vẫn trên Drive
    // Chỉ nhận data URL ảnh thật — client chèn thẳng vào <img src>, chuỗi lạ có thể chạy script
    if (thumb && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(thumb)) thumb = '';

    const code = String(p.code || '').trim();
    if (photoFind_(refType, refKey, code).length >= PH_MAX_PER_ITEM) {
      throw new Error('Mỗi mục chỉ đính kèm tối đa ' + PH_MAX_PER_ITEM + ' ảnh.');
    }

    const photoId = photoNewId_();
    const ext = mime === 'image/png' ? '.png' : (mime === 'image/webp' ? '.webp' : '.jpg');
    const fileName = photoId + ext;

    const now  = new Date();
    const dest = photoCodeFolder_(code, now);

    const blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, fileName);
    const file = dest.folder.createFile(blob);

    // Cho người trong domain xem khi bấm "Mở ảnh gốc". Lỗi cũng không sao:
    // app vẫn hiện thumbnail đọc từ Sheet.
    try {
      file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {}

    const url = 'https://drive.google.com/file/d/' + file.getId() + '/view';

    // KHÔNG dùng withLock_ — xem lý do ở đầu file
    photoSheet_().appendRow([
      photoId, refType, cell_(refKey), cell_(code), cell_(String(p.cc || me.cc)),
      Number(p.txRow) || '', cell_(String(p.itemName || '')),
      file.getId(), url, fileName, approxBytes, dest.path,
      me.email, now, '', thumb
    ]);

    log_(me, 'PHOTO_UPLOAD', refType + ' ' + refKey + ' -> ' + dest.path);

    return { ok: true, photo: {
      photoId: photoId, refType: refType, refKey: refKey, code: code,
      itemName: String(p.itemName || ''), fileId: file.getId(), url: url,
      fileName: fileName, folder: dest.path, size: approxBytes, thumb: thumb,
      by: me.email, at: photoFmtAt_(now), canDelete: true
    }};
  } catch (e) { return { ok: false, message: e.message }; }
}

/* ═══════════ API: TRA CỨU ═══════════ */

/** Các Request ID đã được duyệt thành Asset Code này. */
function photoReqIdsOfCode_(code) {
  const out = [];
  const cd = String(code || '').trim();
  if (!cd) return out;

  const sh = sheet_(SH_PENDING);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return out;

  // Chỉ đọc 2 cột Asset Code + Request ID, không quét cả 26 cột
  const ids   = sh.getRange(2, P.ID + 1, lastRow - 1, 1).getValues();
  const codes = sh.getRange(2, P.ASSET_CODE + 1, lastRow - 1, 1).getValues();

  for (let i = 0; i < codes.length; i++) {
    if (String(codes[i][0] || '').trim() !== cd) continue;
    const id = String(ids[i][0] || '').trim();
    if (id && out.indexOf(id) === -1) out.push(id);
  }
  return out;
}

/**
 * [API] Ảnh của 1 mục.
 *   kind 'draft'   key = khoá tạm
 *        'request' key = Request ID
 *        'code'    key = Asset Code — gộp cả ảnh gửi kèm yêu cầu đã duyệt
 *                  thành mã đó, tự ghi mã vào dòng ảnh và CHUYỂN FILE
 *                  từ _Cho duyet sang folder mã.
 */
function photoList(kind, key) {
  try {
    const me = auth_();
    const k = String(kind || 'code').trim().toLowerCase();
    const v = String(key || '').trim();
    if (!v) return { ok: true, rows: [] };

    let hits;

    if (k === 'draft') {
      // Ảnh nháp là của riêng người tạo
      hits = photoFind_('DRAFT', v, '').filter(function (h) {
        return String(h.row[PH.BY] || '').toLowerCase() === me.email;
      });

    } else if (k === 'request') {
      hits = photoFind_('REQUEST', v, '');

    } else {
      hits = photoFind_('CODE', '', v);

      // Ảnh còn gắn Request ID -> tìm request đã duyệt thành mã này
      const reqIds = photoReqIdsOfCode_(v);
      if (reqIds.length) {
        const seen = {};
        hits.forEach(function (h) { seen[h.rowIndex] = 1; });
        const fresh = [];
        const metaRows = photoMetaRows_();   // đọc sheet Ảnh 1 lần cho mọi request, không đọc lại theo từng request

        reqIds.forEach(function (rid) {
          photoFind_('REQUEST', rid, '', metaRows).forEach(function (h) {
            if (seen[h.rowIndex]) return;
            seen[h.rowIndex] = 1;
            hits.push(h);
            fresh.push(h);
            try {   // ghi mã để lần sau tra thẳng
              photoSheet_().getRange(h.rowIndex, PH.CODE + 1).setValue(v);
              h.row[PH.CODE] = v;
            } catch (e) {}
          });
        });

        if (fresh.length) photoRelocate_(fresh, v);   // chuyển khỏi _Cho duyet
      }
    }

    // Staff chỉ xem ảnh của mình hoặc của SKU được phép xem
    if (me.role !== 'admin') {
      hits = hits.filter(function (h) {
        if (String(h.row[PH.BY] || '').toLowerCase() === me.email) return true;      // ảnh do chính mình tải
        const code = String(h.row[PH.CODE] || '').trim();
        return !!code && codeVisible_(me, code);
      });
    }

    const rows = photoToObjs_(hits, me);
    rows.sort(function (a, b) { return a.photoId < b.photoId ? -1 : 1; });

    return { ok: true, rows: rows };
  } catch (e) { return { ok: false, message: e.message }; }
}

/* ═══════════ API: GẮN ẢNH NHÁP & XOÁ ═══════════ */

/**
 * [API] Chuyển ảnh nháp sang mục thật sau khi gửi yêu cầu / ghi nhập kho.
 * info = { refType, refKey, code, cc, txRow }
 * Có code -> chuyển luôn file sang folder mã.
 */
function photoAttach(tempId, info) {
  try {
    const me = auth_();
    const tmp = String(tempId || '').trim();
    if (!tmp) return { ok: true, moved: 0 };

    info = info || {};
    const refType = String(info.refType || 'REQUEST').trim().toUpperCase();
    const refKey  = String(info.refKey || '').trim();
    const code    = String(info.code || '').trim();
    if (!refKey) throw new Error('Thiếu khoá đích để gắn ảnh.');

    // Đích gắn phải nằm trong phạm vi người gọi: mã phải thấy được; yêu cầu phải là của chính mình (admin không giới hạn)
    const target = code || ((refType === 'TX' || refType === 'CODE') ? refKey : '');
    if (target && !codeVisible_(me, target)) {
      log_(me, 'DENIED_PHOTO', 'thử gắn ảnh nháp vào mã ngoài phạm vi: ' + target);
      throw new Error('Bạn không có quyền đính kèm ảnh cho mã ' + target + '.');
    }
    if (refType === 'REQUEST' && me.role !== 'admin' && photoReqOwner_(refKey) !== me.email) {
      log_(me, 'DENIED_PHOTO', 'thử gắn ảnh nháp vào yêu cầu của người khác: ' + refKey);
      throw new Error('Bạn chỉ được đính kèm ảnh vào yêu cầu của chính mình.');
    }

    const sh = photoSheet_();
    const mine = photoFind_('DRAFT', tmp, '').filter(function (h) {
      return String(h.row[PH.BY] || '').toLowerCase() === me.email;
    });

    mine.forEach(function (h) {
      sh.getRange(h.rowIndex, PH.REF_TYPE + 1, 1, 3)
        .setValues([[refType, cell_(refKey), cell_(code)]]);
      h.row[PH.REF_TYPE] = refType;
      h.row[PH.REF_KEY]  = refKey;
      h.row[PH.CODE]     = code;

      if (info.cc)    sh.getRange(h.rowIndex, PH.CC + 1).setValue(cell_(String(info.cc)));
      if (info.txRow) sh.getRange(h.rowIndex, PH.TX_ROW + 1).setValue(Number(info.txRow));
    });

    const relocated = code ? photoRelocate_(mine, code) : 0;

    if (mine.length) {
      log_(me, 'PHOTO_ATTACH', tmp + ' -> ' + refType + ' ' + refKey +
           ' | ' + mine.length + ' ảnh' + (relocated ? ' · chuyển ' + relocated : ''));
    }
    return { ok: true, moved: mine.length, relocated: relocated };
  } catch (e) { return { ok: false, message: e.message }; }
}

/** Email (chữ thường) của người gửi yêu cầu `rid`; '' nếu không có. Chỉ đọc 2 cột. */
function photoReqOwner_(rid) {
  const id = String(rid || '').trim();
  if (!id) return '';

  const sh = sheet_(SH_PENDING);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return '';

  const ids = sh.getRange(2, P.ID + 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || '').trim() !== id) continue;
    return String(sh.getRange(i + 2, P.USER_EMAIL + 1).getValue() || '').trim().toLowerCase();
  }
  return '';
}

/** [API] Xoá ảnh — chỉ người tải lên hoặc admin. Xoá mềm + file vào Thùng rác. */
function photoDelete(photoId) {
  try {
    const me = auth_();
    const id = String(photoId || '').trim();
    if (!id) throw new Error('Thiếu mã ảnh.');

    const sh = photoSheet_();
    const rows = photoMetaRows_();

    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][PH.ID] || '').trim() !== id) continue;
      if (String(rows[i][PH.DELETED] || '').trim()) return { ok: true, message: 'Ảnh đã xoá.' };

      const owner = String(rows[i][PH.BY] || '').toLowerCase();
      if (me.role !== 'admin' && owner !== me.email) {
        log_(me, 'DENIED_PHOTO_DELETE', id);
        throw new Error('Chỉ người tải lên hoặc quản trị viên được xoá ảnh này.');
      }

      sh.getRange(i + 2, PH.DELETED + 1).setValue('Y · ' + me.email + ' · ' + new Date());
      try { DriveApp.getFileById(String(rows[i][PH.FILE_ID])).setTrashed(true); } catch (e) {}

      log_(me, 'PHOTO_DELETE', id);
      return { ok: true, message: 'Đã xoá ảnh.' };
    }

    throw new Error('Không tìm thấy ảnh ' + id);
  } catch (e) { return { ok: false, message: e.message }; }
}

/* ═══════════ DEV TOOL ═══════════ */

/** [DEV TOOL] Tạo sheet + folder và kiểm tra cấu hình. CHẠY ĐẦU TIÊN. */
function photoHealthCheck() {
  requireAdmin_();   // [QUYỀN] hàm công khai: ai có link web app cũng gọi được qua google.script.run
  const out = ['=== Ảnh hàng hoá ==='];

  try {
    const sh = photoSheet_();
    out.push('✔ Sheet ' + PH_SHEET + ' — ' + Math.max(sh.getLastRow() - 1, 0) + ' dòng');

    const head = sh.getRange(1, 1, 1, PH_COLS).getValues()[0];
    const okHead = String(head[PH.THUMB] || '').trim() === PH_HEADERS[PH.THUMB];
    if (!okHead) {
      sh.getRange(1, 1, 1, PH_COLS).setValues([PH_HEADERS]).setFontWeight('bold');
      out.push('✔ Đã ghi lại 16 tiêu đề cột');
    }

    const f = photoFolder_();
    out.push('✔ Folder Drive: ' + f.getName());
    out.push('   ' + f.getUrl());
    out.push('   Thư mục hôm nay: ' + photoDayName_());

    let live = 0, dead = 0, pending = 0;
    photoMetaRows_().forEach(function (r) {
      if (String(r[PH.DELETED] || '').trim()) { dead++; return; }
      live++;
      if (!String(r[PH.CODE] || '').trim()) pending++;
    });

    out.push('   còn hiệu lực: ' + live + ' · đã xoá: ' + dead);
    out.push((pending ? '⚠' : '✔') + ' Ảnh chưa có Asset Code: ' + pending +
             (pending ? ' — yêu cầu chưa duyệt, đang ở ' + PH_PENDING : ''));
  } catch (e) {
    out.push('✗ ' + e.message);
  }

  Logger.log(out.join('\n'));
  return out.join('\n');
}

/** [DEV TOOL] Đưa mọi ảnh về đúng folder <ngày> / <Asset Code>. Chỉ di chuyển, không xoá. */
function photoSyncFolders() {
  requireAdmin_();   // [QUYỀN] hàm công khai: ai có link web app cũng gọi được qua google.script.run
  const out = ['=== Dọn folder ảnh theo Asset Code ==='];
  const byCode = {};
  let noCode = 0;

  photoMetaRows_().forEach(function (r, i) {
    if (String(r[PH.DELETED] || '').trim()) return;

    const code = String(r[PH.CODE] || '').trim();
    if (!code) { noCode++; return; }

    if (!byCode[code]) byCode[code] = [];
    byCode[code].push({ row: r, rowIndex: i + 2 });
  });

  let moved = 0;
  Object.keys(byCode).forEach(function (c) { moved += photoRelocate_(byCode[c], c); });

  out.push('✔ ' + Object.keys(byCode).length + ' mã hàng · đã chuyển ' + moved + ' file');
  out.push((noCode ? '⚠' : '✔') + ' Ảnh chưa có Asset Code: ' + noCode);

  Logger.log(out.join('\n'));
  return out.join('\n');
}