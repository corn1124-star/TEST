/* ══════════════════════════════════════════════════════════════════════
   DiagVisibility.gs — CHẨN ĐOÁN "staff không thấy mặt hàng" (chỉ đọc, chỉ admin)
   ══════════════════════════════════════════════════════════════════════
   Chạy trong trình soạn Apps Script: chọn diagVisibility (hoặc diagVisibilityAll) > Run > xem Execution log.
   Với mỗi staff: Team Code app tính ra, số mã trong sổ cái, số mã thấy được, và vì sao các mã còn lại bị ẩn
   (không có trong sheet SKU / SKU thuộc team khác). Dùng đúng luật của codeVisible_ (Access.gs). Không ghi gì.
   ══════════════════════════════════════════════════════════════════════ */

/** [ADMIN] Chẩn đoán một staff (theo email) — hoặc tất cả staff nếu bỏ trống email. Trả về cả chuỗi lẫn ghi Logger. */
function diagVisibility(email) {
  requireAdmin_();   // [QUYỀN] hàm công khai: ai có link web app cũng gọi được qua google.script.run
  const only = String(email || '').trim().toLowerCase();

  const skuByCode = skuRows_().index.byCode;
  const skuTeams = {};
  skuRows_().list.forEach(function (s) { skuTeams[s.team || '(trống)'] = (skuTeams[s.team || '(trống)'] || 0) + 1; });

  const ledger = {};   // mã -> true (mọi mã có trong Database)
  readAllRows_().forEach(function (r) {
    const code = String(r[C.CODE] || '').trim();
    if (code) ledger[code] = true;
  });
  const codes = Object.keys(ledger);

  const out = [];
  out.push('Mã trong sổ cái: ' + codes.length + ' · dòng trong sheet SKU: ' + skuRows_().list.length);
  out.push('Team Code trong sheet SKU: ' + JSON.stringify(skuTeams));

  const map = deptMapCached_();
  const sh = sheet_(SH_TEAM);
  const rows = sh.getLastRow() < 2 ? [] : sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();

  rows.forEach(function (v) {
    const em = String(v[TEAM_COLS.EMAIL] || '').trim().toLowerCase();
    if (!em || (only && em !== only)) return;
    const role = String(v[TEAM_COLS.ROLE] || '').trim().toLowerCase() || 'member';
    if (!only && role === 'admin') return;

    const raw = String(v[TEAM_COLS.CC] || '').trim();
    const ccFull = resolveCc_(raw, map);
    const user = { email: em, role: role, ccRaw: raw, cc: ccFull, teamCode: teamOfCc_(ccFull) };

    let seen = 0;
    const notInSku = [], otherTeam = {};
    codes.forEach(function (code) {
      const s = skuByCode[code];
      if (role === 'admin' || codeVisible_(user, code)) { seen++; return; }
      if (!s) { notInSku.push(code); return; }
      const t = s.team || '(trống)';
      (otherTeam[t] = otherTeam[t] || []).push(code);
    });

    out.push('');
    out.push(em + ' · role=' + role + ' · CC nhập="' + raw + '" -> "' + ccFull + '" · Team Code app tính ra="' + user.teamCode + '"' +
             (map[ccFull] === undefined ? '  [!] CC này KHÔNG có trong sheet Department' : ''));
    out.push('  thấy ' + seen + '/' + codes.length + ' mã');
    if (notInSku.length) out.push('  ẩn vì KHÔNG có trong sheet SKU: ' + notInSku.length + ' (vd ' + notInSku.slice(0, 5).join(', ') + ')');
    Object.keys(otherTeam).forEach(function (t) {
      out.push('  ẩn vì SKU thuộc Team "' + t + '" (khác "' + user.teamCode + '"): ' + otherTeam[t].length +
               ' (vd ' + otherTeam[t].slice(0, 5).join(', ') + ')');
    });
  });

  if (only && out.length === 2) out.push('Không thấy email "' + only + '" trong sheet Team.');
  const text = out.join('\n');
  Logger.log(text);
  return text;
}

/** Bản không tham số để chạy thẳng từ trình soạn (Run không truyền được tham số): chẩn đoán mọi staff. */
function diagVisibilityAll() { return diagVisibility(''); }
