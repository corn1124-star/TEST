/* ══════════════════════════════════════════════════════════════════════
   Cache.gs — LƯU ĐỆM GIÁ TRỊ LỚN TRONG CacheService
   ══════════════════════════════════════════════════════════════════════
   CacheService giới hạn ~100 KB mỗi giá trị (tính theo byte; tiếng Việt tới 3 byte/ký tự).
   Ở đây chuỗi lớn được cắt thành các mảnh CACHE_CHUNK ký tự, ghi/đọc bằng MỘT lệnh putAll/getAll.
   Thiếu bất kỳ mảnh nào -> coi như không có cache (an toàn, tự dựng lại).

   DATA_EPOCH: số đổi mỗi khi dữ liệu giao dịch thay đổi (dbChanged_). Đưa vào khoá cache nên
   mọi bản lưu đệm cũ tự mất hiệu lực tức thì — không phải chờ hết hạn.
   ══════════════════════════════════════════════════════════════════════ */

const CACHE_CHUNK    = 30000;        // ký tự/mảnh (≤ 90 KB kể cả chữ 3 byte)
const CACHE_MAX_CHARS = 3000000;     // lớn hơn thì bỏ qua cache, không cố nhét
const DATA_EPOCH_PROP = 'DATA_EPOCH';

let _epochMemo = null;

/** Số "đời" dữ liệu hiện tại. Đọc Script Properties một lần mỗi lần chạy. */
function dataEpoch_() {
  if (_epochMemo !== null) return _epochMemo;
  const p = PropertiesService.getScriptProperties();
  let e = p.getProperty(DATA_EPOCH_PROP);
  if (!e) { e = String(Date.now()); p.setProperty(DATA_EPOCH_PROP, e); }
  _epochMemo = e;
  return e;
}

/** Gọi SAU MỖI lần ghi vào Database: xoá bộ nhớ đọc trong lần chạy + làm mọi cache dữ liệu hết hiệu lực. */
function dbChanged_() {
  dbDirty_();
  _epochMemo = String(Date.now());
  PropertiesService.getScriptProperties().setProperty(DATA_EPOCH_PROP, _epochMemo);
}

function cachePutStr_(key, str, ttl) {
  if (typeof str !== 'string' || str.length > CACHE_MAX_CHARS) return false;
  try {
    const cache = CacheService.getScriptCache();
    const n = Math.max(1, Math.ceil(str.length / CACHE_CHUNK));
    const put = {};
    for (let i = 0; i < n; i++) put[key + ':' + i] = str.substr(i * CACHE_CHUNK, CACHE_CHUNK);
    put[key + ':n'] = String(n);
    cache.putAll(put, ttl || 600);
    return true;
  } catch (e) { return false; }
}

function cacheGetStr_(key) {
  try {
    const cache = CacheService.getScriptCache();
    const n = Number(cache.get(key + ':n'));
    if (!n) return null;

    const keys = [];
    for (let i = 0; i < n; i++) keys.push(key + ':' + i);
    const got = cache.getAll(keys);

    let out = '';
    for (let i = 0; i < n; i++) {
      const part = got[key + ':' + i];
      if (part === undefined || part === null) return null;          // thiếu mảnh -> không dùng
      out += part;
    }
    return out;
  } catch (e) { return null; }
}

function cachePutJson_(key, obj, ttl) {
  let s;
  try { s = JSON.stringify(obj); } catch (e) { return false; }
  return cachePutStr_(key, s, ttl);
}

function cacheGetJson_(key) {
  const s = cacheGetStr_(key);
  if (s === null) return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}
