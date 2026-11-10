/* ═══════════ NHÓM 14: PHIẾU NHẬP / XUẤT (CHỈ ADMIN) ═══════════
   KHOÁ GOM PHIẾU: 1 phiếu = 1 NGÀY + 1 NGƯỜI YÊU CẦU + 1 LOẠI.
   Phiếu là chứng từ giao nhận với MỘT người cụ thể -> vẫn lọc theo CC, không theo team. */

/** Chuẩn hoá thành mã in được: an.dinh -> ANDINH · OPS-COA -> OPSCOA */
function picCode_(s) {
  const x = alnum_(s);
  return x || 'NA';
}

/** Mã phiếu: PN_20260904_OPSCOA_ANDINH · PX_... = Loại_Thời gian_Team_PIC */
function buildTicketId_(type, isoDate, cc, pic) {
  const prefix = (type === 'Import') ? 'PN' : 'PX';
  return [prefix, String(isoDate).replace(/-/g, ''),
          picCode_(cc), picCode_(pic)].join('_');
}

function getTickets(filter) {
  try {
    const admin = requireAdmin_();
    const f = filter || {};

    const from = String(f.from || '').trim();
    const to   = String(f.to || from).trim();
    const type = String(f.type || '').trim();
    const cc   = String(f.cc || '').trim().toUpperCase();

    if (!from) throw new Error('Vui lòng chọn ngày bắt đầu.');

    const groups = {};

    readAllRows_().forEach(function (r, i) {
      if (!String(r[C.CODE] || '').trim()) return;

      const d = toIso_(r[C.DATE]);
      if (!d || d < from || d > to) return;

      const rType = String(r[C.TYPE] || '').trim();
      if (type && rType !== type) return;

      const rCc = String(r[C.CC] || '').trim();
      if (cc && rCc.toUpperCase() !== cc) return;

      const rPic = String(r[C.PIC] || '').trim() || '(không rõ)';

      const key = d + '|' + rPic.toLowerCase() + '|' + rType;

      if (!groups[key]) {
        groups[key] = {
          ticketId: buildTicketId_(rType, d, rCc, rPic),
          date: d, dateVn: toVn_(d),
          pic: rPic, cc: rCc,
          dept: String(r[C.DEPT] || '').trim(),
          type: rType, items: [],
          totalQty: 0, totalBox: 0, totalValue: 0, locs: {}
        };
      }

      const g = groups[key];
      const tx = rowToTx_(r, i + 2);

      g.items.push(tx);
      g.totalQty += tx.qty;
      g.totalBox += tx.boxCount;
      g.totalValue += (tx.purchasePrice * tx.qty);

      if (tx.loc) g.locs[tx.loc] = true;
    });

    const rows = Object.keys(groups).map(function (k) {
      const g = groups[k];
      g.items.sort(function (a, b) { return Number(a.no) - Number(b.no); });
      g.itemCount = g.items.length;
      g.locList = Object.keys(g.locs).join(', ');
      delete g.locs;
      return g;
    });

    rows.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.pic.localeCompare(b.pic, 'vi');
    });

    log_(admin, 'TICKET_VIEW', from + '..' + to + ' | ' + rows.length + ' phiếu');

    return { ok: true, rows: rows, range: { from: from, to: to },
             orgName: ORG_NAME, orgAddress: ORG_ADDR };
  } catch (e) { return { ok: false, message: e.message }; }
}

