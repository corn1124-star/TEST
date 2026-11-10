/* ══════════════════════════════════════════════════════════════════════
   Sku.gs — DANH MỤC SKU: mã hàng, bộ phận sở hữu, người PIC
   ══════════════════════════════════════════════════════════════════════
   QUY TẮC MÃ SKU
       <CAT>-<NNNN>[-<VAR>]        vd  GEA-0012 · CLO-0007-M · CLO-0007-XL
     CAT  3 ký tự đầu của nhóm hàng (bỏ dấu, viết hoa)             GEAR -> GEA
     NNNN số thứ tự SẢN PHẨM trong nhóm (4 chữ số)                 GEA-0001, GEA-0002…
     VAR  mã biến thể (size, màu…), tối đa 4 ký tự                 M · XL · RED
   · MỖI BIẾN THỂ LÀ MỘT SKU RIÊNG (cùng số sản phẩm, khác đuôi) -> không gộp tồn kho.
   · Bộ phận (Team Code) và PIC KHÔNG nằm trong mã: chuyển hàng sang bộ phận khác hay đổi PIC
     không phải đổi mã, không phải dán lại nhãn.
   · Danh tính sản phẩm = (bộ phận, nhóm, phân nhóm, tên, biến thể, event). Trùng cả 6 yếu tố
     thì DÙNG LẠI SKU cũ; khác một yếu tố là SKU mới.

   BỘ PHẬN & PIC
     Mỗi SKU thuộc đúng MỘT bộ phận (Team Code) và có tối đa MỘT PIC (email).
     PIC là người muốn nhập/xuất SKU đó; việc DUYỆT vẫn do admin kho.
     Staff thấy SKU của bộ phận mình, và cả SKU mà mình là PIC (dù khác bộ phận).
     Chỉ ADMIN tạo/sửa danh mục.

   SHEET "SKU" tự tạo khi ghi lần đầu. Mã chưa có trong danh mục thì staff không thấy (xem Access.gs).
   ══════════════════════════════════════════════════════════════════════ */

const SH_SKU = 'SKU';
const SK = { SKU:0, NAME:1, VARIANT:2, CAT:3, SUB:4, EVENT:5, UNIT:6, TEAM:7, PIC:8, ACTIVE:9,
             LEGACY:10, PRODNO:11, CREATED_AT:12, CREATED_BY:13, NOTE:14 };
const SKU_COLS = 15;
const SKU_HEADERS = ['SKU','Name','Variant','Category','Sub-Category','Event','Unit','Team Code','PIC Email',
  'Active','Legacy Code','Product No','Created At','Created By','Note'];

const SKU_EPOCH_PROP = 'SKU_EPOCH';
const SKU_LEN_CAT = 3, SKU_LEN_VAR = 4, SKU_PRODNO_MAX = 9999;

let _skuMemo = null, _skuEpochMemo = null;

/* ═══════════ ĐỌC ═══════════ */

function skuKey_(parts) {
  return parts.map(function (x) { return noDiacritics_(x).toUpperCase().replace(/\s+/g, ' ').trim(); }).join('|');
}

function skuCatCode_(cat) { return alnum_(cat).slice(0, SKU_LEN_CAT) || 'GEN'; }

/** Mã biến thể: viết tắt kiểu acronym, tối đa 4 ký tự. 'Size XL' -> 'SXL', 'Red' -> 'R'; nên ưu tiên chữ cuối nếu là size. */
function skuVarCode_(variant) {
  const raw = String(variant || '').trim();
  if (!raw) return '';
  const compact = alnum_(raw);
  if (compact.length <= SKU_LEN_VAR) return compact;          // M, XL, RED, 42
  return acronym_(raw, SKU_LEN_VAR) || compact.slice(0, SKU_LEN_VAR);
}

/** Chỉ mục để dò trùng và cấp số nhanh (cũng dùng khi chuyển đổi hàng loạt). */
function skuNewIndex_() { return { byCode: {}, byFull: {}, byProd: {}, maxNo: {}, count: 0 }; }

function skuIndexAdd_(idx, s) {
  idx.byCode[s.sku] = s;
  idx.byFull[skuKey_([s.team, s.cat, s.sub, s.name, s.variant, s.event])] = s;
  const pk = skuKey_([s.team, s.cat, s.sub, s.name, s.event]);
  if (!idx.byProd[pk]) idx.byProd[pk] = s;
  const m = /^([A-Z0-9]+)-(\d+)(?:-|$)/.exec(s.sku);
  if (m) { const n = Number(m[2]); if (!idx.maxNo[m[1]] || n > idx.maxNo[m[1]]) idx.maxNo[m[1]] = n; }
  idx.count++;
}

function skuRows_() {
  if (_skuMemo) return _skuMemo;

  const idx = skuNewIndex_(), list = [];
  const sh = ss_().getSheetByName(SH_SKU);

  if (sh && sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, SKU_COLS).getValues().forEach(function (r, i) {
      const code = String(r[SK.SKU] || '').trim();
      if (!code) return;
      const act = r[SK.ACTIVE];
      const s = {
        sku: code, name: String(r[SK.NAME] || '').trim(), variant: String(r[SK.VARIANT] || '').trim(),
        cat: String(r[SK.CAT] || '').trim(), sub: String(r[SK.SUB] || '').trim(), event: String(r[SK.EVENT] || '').trim(),
        unit: String(r[SK.UNIT] || '').trim(), team: String(r[SK.TEAM] || '').trim().toUpperCase(),
        pic: String(r[SK.PIC] || '').trim().toLowerCase(),
        active: !(act === false || /^(false|no|n|0)$/i.test(String(act))),
        legacy: String(r[SK.LEGACY] || '').trim(), productNo: Number(r[SK.PRODNO]) || 0,
        createdAt: r[SK.CREATED_AT] instanceof Date ? Utilities.formatDate(r[SK.CREATED_AT], sheetTz_(), 'yyyy-MM-dd HH:mm') : String(r[SK.CREATED_AT] || ''),
        createdBy: String(r[SK.CREATED_BY] || ''), note: String(r[SK.NOTE] || ''), rowIndex: i + 2
      };
      list.push(s);
      skuIndexAdd_(idx, s);
    });
  }

  _skuMemo = { list: list, index: idx };
  return _skuMemo;
}

/** Xoá bộ nhớ đọc và làm mọi cache dữ liệu (lean) hết hiệu lực — vì quyền xem phụ thuộc danh mục. */
function skuDirty_() {
  _skuMemo = null;
  _skuEpochMemo = String(Date.now());
  PropertiesService.getScriptProperties().setProperty(SKU_EPOCH_PROP, _skuEpochMemo);
}

function skuEpoch_() {
  if (_skuEpochMemo !== null) return _skuEpochMemo;
  const p = PropertiesService.getScriptProperties();
  let e = p.getProperty(SKU_EPOCH_PROP);
  if (!e) { e = '0'; }
  _skuEpochMemo = e;
  return e;
}

/* ═══════════ CẤP MÃ ═══════════ */

/**
 * Quyết định SKU cho 1 sản phẩm (chưa ghi gì).
 * @return { sku, existing, productNo, record }
 */
function skuAllocate_(idx, team, cat, sub, name, variant, event) {
  team = String(team || '').trim().toUpperCase();

  const found = idx.byFull[skuKey_([team, cat, sub, name, variant, event])];
  if (found) return { sku: found.sku, existing: true, productNo: found.productNo, record: found };

  const catCode = skuCatCode_(cat);
  const sibling = idx.byProd[skuKey_([team, cat, sub, name, event])];      // cùng sản phẩm, khác biến thể
  let productNo = sibling && sibling.productNo ? sibling.productNo : (idx.maxNo[catCode] || 0) + 1;
  if (productNo > SKU_PRODNO_MAX) throw new Error('Nhóm "' + cat + '" đã dùng hết dãy số SKU (' + SKU_PRODNO_MAX + ' sản phẩm).');

  const base = catCode + '-' + ('0000' + productNo).slice(-4);
  let vcode = skuVarCode_(variant);
  let sku = vcode ? base + '-' + vcode : base;

  // Trùng mã nhưng khác sản phẩm/biến thể (vd 'Size L' và 'Size Long' cùng ra 'SL'): thêm số
  let n = 1;
  while (idx.byCode[sku]) {
    n++;
    if (!vcode && !sibling) { productNo++; sku = catCode + '-' + ('0000' + productNo).slice(-4); }
    else sku = base + '-' + (vcode || 'V') + n;
  }
  return { sku: sku, existing: false, productNo: productNo, record: null };
}

function skuAppend_(rec) {
  const sh = ensureSheet_(SH_SKU, SKU_HEADERS, SKU_COLS);
  const row = [rec.sku, cell_(rec.name), cell_(rec.variant || ''), cell_(rec.cat), cell_(rec.sub), cell_(rec.event || ''), rec.unit || '', rec.team,
               rec.pic || '', rec.active === false ? false : true, rec.legacy || '', rec.productNo || '',
               new Date(), rec.createdBy || '', rec.note || ''];
  sh.getRange(sh.getLastRow() + 1, 1, 1, SKU_COLS).setValues([row]);
  skuDirty_();
}

/**
 * Tìm hoặc tạo SKU cho 1 sản phẩm. Gọi TRONG withLock_ khi create = true.
 * @param ctx { create (mặc định true), pic (email), unit, createdBy, legacy }
 */
function resolveSku_(team, cat, sub, name, variant, event, ctx) {
  ctx = ctx || {};
  const a = skuAllocate_(skuRows_().index, team, cat, sub, name, variant, event);
  if (a.existing) {
    /* SKU đã có: không dùng lại SKU đã ngừng, và không ghi đơn vị khác đơn vị của SKU (tồn sẽ cộng lẫn đơn vị). */
    if (!a.record.active) throw new Error('SKU ' + a.sku + ' đã ngừng sử dụng; hãy bật lại ở trang SKU.');
    const u = String(ctx.unit || '').trim();
    if (u && a.record.unit && u !== a.record.unit) {
      throw new Error('SKU ' + a.sku + ' đang dùng đơn vị ' + a.record.unit + '; không thể nhập/xuất bằng đơn vị ' + u + '.');
    }
    a.unit = a.record.unit || u;
    return a;
  }
  if (ctx.create === false) return a;

  const t = String(team || '').trim().toUpperCase();
  if (!t) throw new Error('Thiếu bộ phận (Team Code) để tạo SKU mới.');

  skuAppend_({ sku: a.sku, name: name, variant: variant, cat: cat, sub: sub, event: event, unit: ctx.unit || '',
               team: t, pic: String(ctx.pic || '').trim().toLowerCase(), productNo: a.productNo,
               createdBy: ctx.createdBy || '', legacy: ctx.legacy || '' });
  return a;
}

/* ═══════════ API (ADMIN) ═══════════ */

function skuTeams_() {
  const set = {};
  const m = teamMapCached_();
  Object.keys(m).forEach(function (cc) { if (m[cc]) set[m[cc]] = true; });
  return Object.keys(set).sort();
}

/** Người dùng đã duyệt (admin + member) — để chọn PIC. */
function skuPeople_() {
  const sh = sheet_(SH_TEAM);
  if (sh.getLastRow() < 2) return [];
  const map = deptMapCached_();
  return sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().map(function (r) {
    const cc = resolveCc_(String(r[TEAM_COLS.CC] || '').trim(), map);
    return { email: String(r[TEAM_COLS.EMAIL] || '').trim().toLowerCase(), username: String(r[TEAM_COLS.USERNAME] || '').trim(),
             team: teamOfCc_(cc), role: String(r[TEAM_COLS.ROLE] || '').trim().toLowerCase() };
  }).filter(function (p) { return p.email && p.role !== 'pending'; });
}

/** [API — ADMIN] Dữ liệu cho form: bộ phận, người dùng, chế độ phạm vi. */
function skuMeta() {
  try {
    requireAdmin_();
    return { ok: true, teams: skuTeams_(), people: skuPeople_() };
  } catch (e) { return { ok: false, message: e.message }; }
}

/** [API — ADMIN] Toàn bộ danh mục SKU kèm tồn hiện tại. */
function skuList() {
  try {
    requireAdmin_();
    const stock = {};
    readAllRows_().forEach(function (r) {
      const code = String(r[C.CODE] || '').trim();
      if (!code) return;
      stock[code] = (stock[code] || 0) + (String(r[C.TYPE] || '').trim() === 'Import' ? 1 : -1) * (Number(r[C.QTY]) || 0);
    });
    const rows = skuRows_().list.map(function (s) {
      return Object.assign({}, s, { stock: stock[s.sku] || 0 });
    });
    return { ok: true, rows: rows };
  } catch (e) { return { ok: false, message: e.message }; }
}

function skuValidateOwner_(team, pic) {
  const t = String(team || '').trim().toUpperCase();
  if (!t || skuTeams_().indexOf(t) === -1) throw new Error('Bộ phận "' + team + '" không có trong sheet Department (cột Team Code).');
  const p = String(pic || '').trim().toLowerCase();
  if (p && !skuPeople_().some(function (x) { return x.email === p; })) {
    throw new Error('PIC "' + pic + '" không phải người dùng đã được duyệt trong sheet Team.');
  }
  return { team: t, pic: p };
}

/** [API — ADMIN] Tạo SKU mới (hoặc trả SKU đã có nếu trùng 6 yếu tố). */
function skuCreate(data) {
  try {
    const u = requireAdmin_();
    data = data || {};
    const cat = String(data.cat || '').trim(), sub = String(data.sub || '').trim();
    const name = String(data.name || '').trim(), event = String(data.event || '').trim() || 'N/A';   // như nhập kho: không event = 'N/A'
    const unit = String(data.unit || '').trim();
    let variant = String(data.variant || '').trim();

    if (!cat || !sub || !name) throw new Error('Cần nhóm hàng, phân nhóm và tên hàng.');
    if (UNITS.indexOf(unit) === -1) throw new Error('Đơn vị phải là Each, Box hoặc Bag.');
    requireKnownCat_(cat, sub);
    if (needsVariant_(sub)) { if (!variant) throw new Error('Phân nhóm "' + sub + '" bắt buộc nhập biến thể.'); }
    else variant = '';
    const own = skuValidateOwner_(data.team, data.pic);

    return withLock_(function () {
      const r = resolveSku_(own.team, cat, sub, name, variant, event, { pic: own.pic, unit: unit, createdBy: u.email });
      log_(u, 'SKU_CREATE', r.sku + ' | ' + own.team + (own.pic ? ' | PIC ' + own.pic : '') + (r.existing ? ' | đã có' : ''));
      return { ok: true, sku: r.sku, existing: r.existing,
               message: r.existing ? 'SKU đã có: ' + r.sku + '.' : 'Đã tạo SKU ' + r.sku + '.' };
    });
  } catch (e) { return { ok: false, message: e.message }; }
}

/** [API — ADMIN] Sửa bộ phận, PIC, trạng thái, ghi chú. Tên/biến thể/nhóm KHÔNG đổi được (đó là danh tính của SKU). */
function skuUpdate(sku, patch) {
  try {
    const u = requireAdmin_();
    patch = patch || {};
    const code = String(sku || '').trim();

    return withLock_(function () {
      const cur = skuRows_().index.byCode[code];
      if (!cur) throw new Error('Không tìm thấy SKU ' + code + '.');

      const team = patch.team !== undefined ? patch.team : cur.team;
      const pic = patch.pic !== undefined ? patch.pic : cur.pic;
      /* Chỉ kiểm tra phần ĐỔI: team/PIC cũ đã không còn hợp lệ (team bị gỡ khỏi Department, PIC bị xoá) vẫn cho ngừng SKU / sửa ghi chú. */
      const own = { team: cur.team, pic: cur.pic };
      if (String(team || '').trim().toUpperCase() !== cur.team) own.team = skuValidateOwner_(team, '').team;
      if (String(pic || '').trim().toLowerCase() !== cur.pic) {
        own.pic = String(pic || '').trim().toLowerCase();
        if (own.pic && !skuPeople_().some(function (x) { return x.email === own.pic; })) {
          throw new Error('PIC "' + pic + '" không phải người dùng đã được duyệt trong sheet Team.');
        }
      }

      // Đổi bộ phận không được tạo ra trùng danh tính với SKU khác
      if (own.team !== cur.team) {
        const clash = skuRows_().index.byFull[skuKey_([own.team, cur.cat, cur.sub, cur.name, cur.variant, cur.event])];
        if (clash && clash.sku !== code) throw new Error('Bộ phận ' + own.team + ' đã có SKU ' + clash.sku + ' cho cùng sản phẩm này.');
      }

      const sh = ensureSheet_(SH_SKU, SKU_HEADERS, SKU_COLS);
      sh.getRange(cur.rowIndex, SK.TEAM + 1, 1, 3).setValues([[own.team, own.pic,
        patch.active === undefined ? cur.active : !!patch.active]]);
      if (patch.note !== undefined) sh.getRange(cur.rowIndex, SK.NOTE + 1).setValue(cell_(String(patch.note || '')));
      skuDirty_();

      log_(u, 'SKU_UPDATE', code + ' | ' + cur.team + '->' + own.team + ' | PIC ' + (cur.pic || '-') + '->' + (own.pic || '-') +
           (patch.active !== undefined ? ' | active=' + !!patch.active : ''));
      return { ok: true, message: 'Đã cập nhật ' + code + '.' };
    });
  } catch (e) { return { ok: false, message: e.message }; }
}
