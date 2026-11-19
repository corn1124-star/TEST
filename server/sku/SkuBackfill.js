/* ══════════════════════════════════════════════════════════════════════
   SkuBackfill.gs — ĐƯA MÃ HÀNG CŨ TRONG SỔ CÁI VÀO SHEET SKU (chạy một lần)
   ══════════════════════════════════════════════════════════════════════
   Vì sao: staff chỉ thấy mã có trong sheet SKU (Access.gs). Hàng nhập từ trước khi có SKU mang mã cũ
   (vd OPSGFB_0510_C095) nên chưa có dòng SKU nào -> staff thấy 0 hàng, chỉ admin thấy.
   Cách làm (DB-REDESIGN.md §7): giữ NGUYÊN mã cũ làm SKU, ghi mã đó vào cột Legacy Code. Team Code lấy từ
   Cost Center của dòng đầu tiên mã đó xuất hiện (cùng cách app tính Team Code của user: teamOfCc_).
   · Bỏ qua mã đã có trong SKU (chạy lại an toàn). Không sửa, không xoá dòng nào có sẵn, không đụng sổ cái.
   · Chạy trong trình soạn Apps Script: skuBackfillDryRun (chỉ tính + in báo cáo) rồi mới skuBackfillWrite.
   ══════════════════════════════════════════════════════════════════════ */

function skuBackfillPlan_() {
  const have = skuRows_().index.byCode;
  const seen = {}, plan = [];
  readAllRows_().forEach(function (r) {
    const code = String(r[C.CODE] || '').trim();
    if (!code || have[code] || seen[code]) return;
    seen[code] = true;
    const cc = resolveCc_(String(r[C.CC] || '').trim(), deptMapCached_());
    plan.push({
      sku: code, name: String(r[C.NAME] || '').trim(), variant: String(r[C.VARIANT] || '').trim(),
      cat: String(r[C.CAT] || '').trim(), sub: String(r[C.SUB] || '').trim(), event: String(r[C.EVENT] || '').trim(),
      unit: String(r[C.UNIT] || '').trim(), team: teamOfCc_(cc), cc: cc
    });
  });
  return plan;
}

function skuBackfillReport_(plan, verb) {
  const byTeam = {}, unmapped = {};
  const known = teamMapCached_();
  plan.forEach(function (p) {
    byTeam[p.team || '(trống)'] = (byTeam[p.team || '(trống)'] || 0) + 1;
    if (!p.team || known[p.cc] === undefined) unmapped[p.cc || '(trống)'] = (unmapped[p.cc || '(trống)'] || 0) + 1;
  });
  const lines = [verb + ' ' + plan.length + ' mã vào sheet SKU. Theo Team Code: ' + JSON.stringify(byTeam)];
  if (Object.keys(unmapped).length) {
    lines.push('[!] CC không có trong sheet Department (Team Code = chính CC, staff của CC này sẽ không khớp): ' + JSON.stringify(unmapped));
  }
  const text = lines.join('\n');
  Logger.log(text);
  return text;
}

/** [ADMIN] Chỉ tính và in báo cáo, không ghi gì. */
function skuBackfillDryRun() {
  requireAdmin_();
  return skuBackfillReport_(skuBackfillPlan_(), 'SẼ thêm');
}

/** [ADMIN] Ghi các mã còn thiếu vào sheet SKU (một lần setValues). Chạy lại thì không thêm gì nữa. */
function skuBackfillWrite() {
  requireAdmin_();
  return withLock_(function () {
    const plan = skuBackfillPlan_();
    if (!plan.length) { Logger.log('Không có mã nào thiếu.'); return 'Không có mã nào thiếu.'; }

    const sh = ensureSheet_(SH_SKU, SKU_HEADERS, SKU_COLS);
    const now = new Date();
    const rows = plan.map(function (p) {
      return [p.sku, cell_(p.name), cell_(p.variant), cell_(p.cat), cell_(p.sub), cell_(p.event), p.unit, p.team,
              '', true, p.sku, '', now, 'backfill', 'Nạp từ sổ cái (mã cũ)'];
    });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, SKU_COLS).setValues(rows);
    skuDirty_();
    return skuBackfillReport_(plan, 'ĐÃ thêm');
  });
}
