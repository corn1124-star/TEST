/* ═══════════ NHÓM 6: MÃ HÀNG ═══════════
   Mã hàng là SKU do danh mục cấp (xem Sku.js). File này giữ các hàm chuẩn hoá chữ dùng chung cho mã SKU,
   mã con thùng (<SKU>.B01 · .B02 …) và xem trước mã. */

const BOX_SEP  = '.B';  // ngăn mã con thùng

function noDiacritics_(t) {
  return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

/** Chuẩn hoá thành chuỗi mã: bỏ dấu, viết hoa, chỉ giữ A-Z0-9. */
function alnum_(t) {
  return noDiacritics_(t).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Viết tắt kiểu ACRONYM: chữ cái đầu mỗi từ, nhưng SỐ giữ nguyên vẹn.
 * 'Size L' -> 'SL' · 'Size XXL' -> 'SXXL' · 'Year End Party 2026' -> 'YEP2026'
 */
function acronym_(t, max) {
  const words = noDiacritics_(t).toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ').trim().split(' ')
    .filter(function (w) { return w; });

  let out = '';

  words.forEach(function (w) {
    if (/^\d+$/.test(w)) out += w;                               // số: giữ nguyên
    else if (/^[A-Z]+$/.test(w) && w.length <= 3) out += w;      // XL, XXL, SG
    else out += w.charAt(0);                                     // từ dài: 1 chữ đầu
  });

  return out.slice(0, max);
}

/** Mã con của 1 thùng: <SKU>.B01 · .B02 … */
function boxCodeOf_(assetCode, boxNo) {
  return String(assetCode) + BOX_SEP + ('00' + (Number(boxNo) || 0)).slice(-2);
}

/** Team của 1 mã: lấy từ danh mục SKU; mã chưa có trong danh mục thì suy từ Cost Center của dòng. */
function teamOfCode_(code, ccHint) {
  const s = skuRows_().index.byCode[String(code || '').trim()];
  return s ? s.team : teamOfCc_(ccHint);
}

function needsVariant_(sub) {
  const s = noDiacritics_(sub).toUpperCase().trim();
  if (!s) return false;
  for (let i = 0; i < VARIANT_SUBS.length; i++) {
    const x = noDiacritics_(VARIANT_SUBS[i]).toUpperCase().trim();
    if (x && s.indexOf(x) !== -1) return true;
  }
  return false;
}

/** [API] Xem trước SKU. Staff luôn là bộ phận của mình; KHÔNG tạo gì, chỉ cho xem trước. */
function previewAssetCode(data) {
  try {
    const user = auth_();
    const cat = String(data.cat || '').trim(), sub = String(data.sub || '').trim();
    const name = String(data.name || '').trim(), event = String(data.event || '').trim();
    const variant = String(data.variant || '').trim();

    if (!cat || !sub || !name || !event) {
      return { ok: false, message: 'Cần đủ nhóm hàng, phân nhóm, tên hàng và event.' };
    }
    if (needsVariant_(sub) && !variant) {
      return { ok: false, message: 'Phân nhóm "' + sub + '" bắt buộc nhập biến thể.' };
    }

    const team = user.role === 'admin' ? (String(data.team || '').trim().toUpperCase() || user.teamCode) : user.teamCode;
    const sk = resolveSku_(team, cat, sub, name, variant, event, { create: false });
    const m = /^([A-Z0-9]+)-(\d+)(?:-(.+))?$/.exec(sk.sku) || [];
    return {
      ok: true, code: sk.sku, reused: sk.existing, format: 'sku', team: team,
      pic: sk.record ? sk.record.pic : '', active: sk.record ? sk.record.active : true,
      parts: [
        { key: 'cat', seg: m[1] || '', src: cat },
        { key: 'seq', seg: m[2] || '', src: name },
        { key: 'var', seg: m[3] || '', src: variant }
      ]
    };
  } catch (e) { return { ok: false, message: e.message }; }
}
