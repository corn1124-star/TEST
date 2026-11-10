/* ═══════════ NHÓM 3: XÁC THỰC — LỚP 1, 2, 3 ═══════════
   Cache 3 tầng: _authCache (1 execution) · CacheService theo EMAIL · Department.
   Sửa Team/Department TRỰC TIẾP trên Sheet -> trigger onSheetEdit bump epoch. */

let _authCache = null;

const AUTH_EPOCH_PROP = 'auth_epoch_v1';
const AUTH_CACHE_TTL  = 300;   // 5 phút — hạn tối đa; epoch mới là cơ chế chính
const DEPT_CACHE_TTL  = 900;
const AUTH_ROLES      = ['admin', 'member', 'pending'];   // role khác (rỗng thì coi là member) bị chặn như pending

/** Epoch nhúng vào cache key. Bump epoch = vô hiệu hoá TOÀN BỘ cache tức thì. */
function authEpoch_() {
  const p = PropertiesService.getScriptProperties();
  let e = p.getProperty(AUTH_EPOCH_PROP);
  if (!e) { e = String(Date.now()); p.setProperty(AUTH_EPOCH_PROP, e); }
  return e;
}

function bumpAuthEpoch_() {
  /* Luôn khác giá trị cũ, kể cả khi gọi 2 lần trong cùng 1 mili-giây (nếu không, cache quyền cũ vẫn được dùng). */
  const p = PropertiesService.getScriptProperties();
  const old = Number(p.getProperty(AUTH_EPOCH_PROP)) || 0;
  p.setProperty(AUTH_EPOCH_PROP, String(Math.max(Date.now(), old + 1)));
  _authCache = null;
  for (const k in _teamOfCache) delete _teamOfCache[k];
}

function authCacheKey_(email) { return 'auth_' + authEpoch_() + '_' + email; }
function deptCacheKey_()      { return 'dept_' + authEpoch_(); }
function teamCacheKey_()      { return 'team_' + authEpoch_(); }   // [TEAM]

/** { CC_IN_HOA: tên phòng } từ sheet Department (A = tên, B = CC). */
function deptMap_() {
  const sh = sheet_(SH_DEPT);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return {};

  const v = sh.getRange(2, 1, lastRow - 1, 2).getValues();
  const map = {};
  for (let i = 0; i < v.length; i++) {
    const cc = String(v[i][1] || '').trim();
    if (cc) map[cc.toUpperCase()] = String(v[i][0] || '').trim();
  }
  return map;
}

function deptMapCached_() {
  const cache = CacheService.getScriptCache();
  const key = deptCacheKey_();

  try { const c = cache.get(key); if (c) return JSON.parse(c); } catch (e) {}

  const map = deptMap_();
  try { cache.put(key, JSON.stringify(map), DEPT_CACHE_TTL); } catch (e) {}
  return map;
}

/* ── [TEAM] TEAM CODE ─────────────────────────────────────────────────
   Sheet Department: A = Tên phòng · B = Cost Center · C = Team Code.
   Nhiều CC cùng Team Code -> dùng CHUNG tồn kho. Ô C trống -> Team = CC,
   tức hành vi y như trước khi có tính năng này. */

/** { CC_IN_HOA: TEAM_CODE } */
function teamMap_() {
  const sh = sheet_(SH_DEPT);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return {};

  const cols = Math.min(3, sh.getMaxColumns());
  const v = sh.getRange(2, 1, lastRow - 1, cols).getValues();
  const map = {};

  for (let i = 0; i < v.length; i++) {
    const cc = String(v[i][1] || '').trim().toUpperCase();
    if (!cc) continue;
    const team = cols >= 3 ? String(v[i][2] || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
    map[cc] = team || cc;
  }
  return map;
}

function teamMapCached_() {
  const cache = CacheService.getScriptCache();
  const key = teamCacheKey_();

  try { const c = cache.get(key); if (c) return JSON.parse(c); } catch (e) {}

  const map = teamMap_();
  try { cache.put(key, JSON.stringify(map), DEPT_CACHE_TTL); } catch (e) {}
  return map;
}

const _teamOfCache = {};   // memo trong 1 execution — mỗi lần tính tồn gọi hàng nghìn lần

/** CC bất kỳ (ngắn hay đầy đủ) -> Team Code. Không map được -> chính CC đó. */
function teamOfCc_(cc) {
  const s = String(cc || '').trim().toUpperCase();
  if (!s) return '';
  if (_teamOfCache[s] !== undefined) return _teamOfCache[s];

  const map = teamMapCached_();
  let t = map[s];
  if (t === undefined) {
    const full = resolveCc_(s, map);
    t = map[full] || full;
  }

  _teamOfCache[s] = t;
  return t;
}

function resolveCc_(short, map) {
  const s = String(short || '').trim().toUpperCase();
  if (!s) return '';
  if (map[s] !== undefined) return s;
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i++) if (keys[i].slice(-s.length) === s) return keys[i];
  for (let i = 0; i < keys.length; i++) if (keys[i].indexOf(s) !== -1) return keys[i];
  return s;
}

/**
 * [TEAM] Tra danh tính KHÔNG throw khi chưa đăng ký / đang chờ duyệt.
 * Dùng cho auth_() và cho API đăng ký (Register.gs).
 * @return user object, hoặc { email, notFound:true }
 */
function authLookup_() {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) throw new Error('Không xác định được email. Hãy mở link bằng tài khoản Google công ty.');

  const cache = CacheService.getScriptCache();
  const key = authCacheKey_(email);

  try {
    const c = cache.get(key);
    if (c) {
      const x = JSON.parse(c);
      if (x && x.teamCode !== undefined) return x;   // bỏ qua cache bản cũ chưa có teamCode
    }
  } catch (e) {}

  const sh = sheet_(SH_TEAM);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { email: email, notFound: true };

  const values = sh.getRange(2, 1, lastRow - 1, 4).getValues();
  const map = deptMapCached_();

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][TEAM_COLS.EMAIL] || '').trim().toLowerCase() !== email) continue;

    const raw = String(values[i][TEAM_COLS.CC] || '').trim();
    const ccFull = resolveCc_(raw, map);
    const roleRaw = String(values[i][TEAM_COLS.ROLE] || '').trim().toLowerCase();
    const roleOk = !roleRaw || AUTH_ROLES.indexOf(roleRaw) !== -1;   // rỗng giữ 'member'; giá trị lạ (disabled, gõ nhầm...) -> pending

    const u = {
      email: email,
      username: String(values[i][TEAM_COLS.USERNAME] || email.split('@')[0]).trim(),
      ccRaw: raw, cc: ccFull,
      teamCode: teamOfCc_(ccFull),                                   // [TEAM]
      department: map[ccFull] || '(chưa map Department)',
      role: roleOk ? (roleRaw || 'member') : 'pending'
    };

    if (!roleOk) log_(u, 'DENIED_ROLE', 'role không hợp lệ "' + roleRaw + '" -> coi như pending');   // chỉ ghi khi đọc Sheet (cache miss), không mỗi request

    try { cache.put(key, JSON.stringify(u), AUTH_CACHE_TTL); } catch (e) {}
    return u;
  }

  return { email: email, notFound: true };   // KHÔNG cache — đăng ký xong phải thấy ngay
}

/**
 * [LỚP 1 — DANH TÍNH] Hàm quan trọng nhất file.
 * Email lấy từ Session mỗi lần gọi -> không thể giả mạo.
 * [TEAM] Chưa có trong Team -> AUTH_NEED_REGISTER. Role 'pending' -> AUTH_PENDING.
 *        User pending bị chặn ở MỌI API, không chỉ ở giao diện.
 */
function auth_() {
  if (_authCache) return _authCache;

  const u = authLookup_();
  if (u.notFound) throw new Error(AUTH_NEED_REGISTER);
  if (u.role === 'pending') throw new Error(AUTH_PENDING);

  _authCache = u;
  return u;
}

/**
 * [LỚP 2 — VAI TRÒ] Đặt ở DÒNG ĐẦU mọi API quản trị, không có ngoại lệ.
 */
function requireAdmin_() {
  const u = auth_();
  if (u.role !== 'admin') {
    log_(u, 'DENIED_ADMIN_API', 'thử gọi API quản trị');
    throw new Error('Chức năng này chỉ dành cho quản trị viên.');
  }
  return u;
}

/** Xoá cache xác thực của 1 email — nội bộ, không kiểm quyền (người đăng ký mới chưa phải admin). */
function clearAuthCacheFor_(email) {
  CacheService.getScriptCache().remove(authCacheKey_(String(email).trim().toLowerCase()));
  _authCache = null;
}

function clearAuthCache(email) {
  requireAdmin_();   // [QUYỀN] hàm công khai: ai có link web app cũng gọi được qua google.script.run
  if (email) {
    clearAuthCacheFor_(email);
    return 'Đã xoá cache xác thực của ' + email + '.';
  }
  bumpAuthEpoch_();
  return 'Đã vô hiệu hoá toàn bộ cache xác thực. Mọi user sẽ đọc lại quyền từ Sheet.';
}

function log_(u, action, detail) {
  try { sheet_(SH_LOG).appendRow([new Date(), u.email, action, u.cc, u.role, detail || '']); } catch (e) {}
}

