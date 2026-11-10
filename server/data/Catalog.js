/* ═══════════ NHÓM 4: DANH MỤC ═══════════ */

function categoryTree_() {
  const v = sheet_(SH_CAT).getDataRange().getValues();
  if (v.length < 2) return { categories: [], tree: {} };

  const categories = [], tree = {};

  for (let col = 0; col < v[0].length; col++) {
    const cat = String(v[0][col] || '').trim();
    if (!cat) continue;
    const subs = [];
    for (let row = 1; row < v.length; row++) {
      const sub = String(v[row][col] || '').trim();
      if (sub && subs.indexOf(sub) === -1) subs.push(sub);
    }
    if (subs.length) { categories.push(cat); tree[cat] = subs; }
  }

  return { categories: categories, tree: tree };
}

function locations_() {
  const v = sheet_(SH_LOC).getDataRange().getValues();
  const out = [];
  for (let i = 1; i < v.length; i++) {
    const x = String(v[i][0] || '').trim();
    if (x && out.indexOf(x) === -1) out.push(x);
  }
  return out;
}

/* Địa điểm và nhóm hàng trên giao diện chỉ là ô chọn: server phải tự kiểm tra, vì gọi API trực tiếp hoặc dùng
   danh sách cũ của tab đã mở đều gửi lên được giá trị ngoài danh mục. */
function requireKnownLoc_(loc) {
  if (locations_().indexOf(loc) === -1) throw new Error('Địa điểm "' + loc + '" không có trong danh mục.');
}

function requireKnownCat_(cat, sub) {
  const subs = categoryTree_().tree[cat];
  if (!subs || subs.indexOf(sub) === -1) throw new Error('Nhóm hàng / phân nhóm "' + cat + ' / ' + sub + '" không có trong danh mục.');
}

const BOOTSTRAP_CACHE_KEY = 'bootstrap_v7';
const BOOTSTRAP_CACHE_TTL = 300;

/** Category/Location là dữ liệu TĨNH, không theo user -> cache toàn cục an toàn. */
function getBootstrapCached_() {
  const cache = CacheService.getScriptCache();
  try { const c = cache.get(BOOTSTRAP_CACHE_KEY); if (c) return JSON.parse(c); } catch (e) {}

  const cat = categoryTree_();
  const payload = {
    categories: cat.categories, tree: cat.tree,
    locations: locations_(), units: UNITS, variantSubs: VARIANT_SUBS,
    lowStock: LOW_STOCK
  };

  try { cache.put(BOOTSTRAP_CACHE_KEY, JSON.stringify(payload), BOOTSTRAP_CACHE_TTL); } catch (e) {}
  return payload;
}

function clearBootstrapCache() {
  requireAdmin_();   // [QUYỀN] hàm công khai: ai có link web app cũng gọi được qua google.script.run
  CacheService.getScriptCache().remove(BOOTSTRAP_CACHE_KEY);
  return 'Đã xoá cache danh mục.';
}

