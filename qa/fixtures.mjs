// fixtures.mjs - realistic data + stateful mock handlers for every google.script.run function the SEC WH client calls.
//
// IMPORTANT: createFixtures() is self-contained on purpose. build.mjs inlines `createFixtures.toString()` into
// dist/index.html, and mock.js calls it in the browser (window.__createFixtures). So: no imports, no references to
// anything outside the function, plain ES2020 only.
//
// Everything is generated from a seeded PRNG relative to "now" (the browser clock, or ?now=...), so the same URL
// gives the same data every run. The field names are copied from the real server code (server/**/*.js).
//
//   const fx = createFixtures({ role: 'admin' | 'staff', lang: 'vi', now: Date.now(), seed: 20261029 });
//   fx.data      plain objects: config, session, users, items, rows (transactions), boxes, requests, ...
//   fx.handlers  { bootstrapAll(), getData(), getTransactions(f), ... }  (what window.__server gets by default)
//   fx.reset()   restore the initial state (undo all mutations done by import/approve/save... handlers)
export function createFixtures(env) {
  env = env || {};
  const ROLE = env.role === 'staff' ? 'staff' : 'admin';
  const NOW = env.now || Date.now();
  const SEED = env.seed || 20261029;
  const ADMIN_MSG = 'Chức năng này chỉ dành cho quản trị viên.';

  /* ============================== helpers ============================== */
  let seed = SEED;
  function rnd() {                       // mulberry32
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const pad = (n, w) => String(n).padStart(w || 2, '0');
  const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const isoAgo = (n) => iso(new Date(NOW - n * 86400000));
  const vn = (s) => (s ? String(s).split('-').reverse().join('/') : '');
  const tsOf = (d) => pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  const tsAgo = (h) => tsOf(new Date(NOW - h * 3600000));
  const ymdhm = (d) => iso(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  const noDia = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'D');
  const alnum = (s) => noDia(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const isoValid = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(new Date(s + 'T00:00:00').getTime());
  const svgThumb = (label, color) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="' + color + '"/>' +
    '<text x="80" y="66" font-size="14" text-anchor="middle" fill="#fff" font-family="sans-serif">' + label + '</text></svg>');

  /* ============================== reference data ============================== */
  const CONFIG = {
    categories: ['Uniform', 'Gear', 'Marketing', 'Office', 'Event'],
    tree: {
      Uniform: ['Clothes', 'Hat', 'Badge'],
      Gear: ['Helmet', 'Bag', 'Rain Gear'],
      Marketing: ['Banner', 'Standee', 'Gift'],
      Office: ['Stationery', 'Equipment'],
      Event: ['Decor', 'Booth']
    },
    locations: ['Kho A - Quận 7', 'Kho B - Thủ Đức', 'Showroom HCM', 'Văn phòng Q1'],
    units: ['Each', 'Box', 'Bag'],
    variantSubs: ['Clothes'],
    lowStock: 5
  };
  const LOCS = CONFIG.locations;

  const DEPTS = {
    'OPS-COA': { team: 'OPSCOA', dept: 'Operations - COA' },
    'MKT-BRAND': { team: 'MKTBRAND', dept: 'Marketing - Brand' },
    'HR-ADM': { team: 'HRADM', dept: 'HR & Admin' },
    'WH-SEC': { team: 'WHSEC', dept: 'Warehouse - SEC' }
  };
  const CC_OF = { O: 'OPS-COA', M: 'MKT-BRAND', H: 'HR-ADM', W: 'WH-SEC' };
  const teamOfCc = (cc) => (DEPTS[cc] ? DEPTS[cc].team : String(cc || ''));

  // [email, username, cc raw (short), cc, role]
  const USER_TABLE = [
    ['minh.admin@example.com', 'Minh Admin', 'SEC', 'WH-SEC', 'admin'],
    ['linh.vo@example.com', 'Linh Vo', 'SEC', 'WH-SEC', 'admin'],
    ['dat.hoang@example.com', 'Dat Hoang', 'SEC', 'WH-SEC', 'member'],
    ['an.dinh@example.com', 'An Dinh', 'COA', 'OPS-COA', 'member'],
    ['huy.tran@example.com', 'Huy Tran', 'COA', 'OPS-COA', 'member'],
    ['quynh.do@example.com', 'Quynh Do', 'COA', 'OPS-COA', 'member'],
    ['lan.pham@example.com', 'Lan Pham', 'BRAND', 'MKT-BRAND', 'member'],
    ['tuan.nguyen@example.com', 'Tuan Nguyen', 'BRAND', 'MKT-BRAND', 'member'],
    ['mai.le@example.com', 'Mai Le', 'ADM', 'HR-ADM', 'member'],
    ['bao.ngo@example.com', 'Bao Ngo', 'ADM', 'HR-ADM', 'member'],
    ['thao.tran@example.com', 'Thảo Trần', 'COA', 'OPS-COA', 'pending'],
    ['viet.le@example.com', 'Việt Lê', 'BRAND', 'MKT-BRAND', 'pending']
  ];
  const SUPPLIERS = ['Công ty TNHH In ấn Sao Mai', 'Công ty CP Thời trang Việt Tiến', 'Nhà phân phối Hoàng Hà',
    'Công ty TNHH Quảng cáo Ánh Dương', 'Văn phòng phẩm Hồng Hà'];

  /* [cat, sub, name, variant, event, unit, cc key, target stock, unit price VND, bin, location index, boxed?]
     Target stock covers: negative (3), zero (5), low <=5 (8), normal, very large (1850 / 4200). */
  const ITEM_TABLE = [
    ['Uniform', 'Clothes', 'Áo thun Driver Day', 'S', 'Driver Day 2026', 'Each', 'O', 120, 85000, 'A1-01-1', 0, 1],
    ['Uniform', 'Clothes', 'Áo thun Driver Day', 'M', 'Driver Day 2026', 'Each', 'O', 85, 85000, 'A1-01-2', 0, 1],
    ['Uniform', 'Clothes', 'Áo thun Driver Day', 'L', 'Driver Day 2026', 'Each', 'O', 3, 85000, 'A1-01-3', 0, 0],
    ['Uniform', 'Clothes', 'Áo thun Driver Day', 'XL', 'Driver Day 2026', 'Each', 'O', 0, 85000, 'A1-01-4', 0, 0],
    ['Uniform', 'Clothes', 'Áo khoác Merchant', 'M', 'N/A', 'Each', 'O', 42, 210000, 'A1-02-1', 0, 0],
    ['Uniform', 'Clothes', 'Áo khoác Merchant', 'L', 'N/A', 'Each', 'O', -4, 210000, 'A1-02-2', 0, 0],
    ['Uniform', 'Hat', 'Nón lưỡi trai Grab xanh', '', 'N/A', 'Each', 'O', 260, 45000, 'A1-03-1', 0, 0],
    ['Uniform', 'Badge', 'Thẻ nhân viên kèm dây đeo', '', 'N/A', 'Each', 'H', 1500, 12000, 'C1-01-1', 1, 1],
    ['Gear', 'Helmet', 'Mũ bảo hiểm 3/4 Grab', '', 'N/A', 'Each', 'O', 75, 150000, 'B2-03-2', 1, 0],
    ['Gear', 'Helmet', 'Mũ bảo hiểm Fullface size L', '', 'N/A', 'Each', 'O', 5, 320000, 'B2-03-3', 1, 0],
    ['Gear', 'Bag', 'Túi giao hàng Grab 40L', '', 'N/A', 'Each', 'O', 18, 260000, 'B2-04-1', 1, 0],
    ['Gear', 'Bag', 'Balo Driver Pro', '', 'N/A', 'Each', 'O', 0, 390000, 'B2-04-2', 1, 0],
    ['Gear', 'Rain Gear', 'Áo mưa bộ 2 lớp', '', 'N/A', 'Bag', 'O', 340, 55000, 'B3-01-1', 1, 1],
    ['Gear', 'Rain Gear', 'Áo mưa cánh dơi', '', 'N/A', 'Each', 'O', 4, 38000, 'B3-01-2', 1, 0],
    ['Gear', 'Rain Gear', 'Bạt che yên xe', '', 'N/A', 'Each', 'O', 95, 22000, 'B3-01-3', 1, 0],
    ['Marketing', 'Banner', 'Banner Tết 2027 3x1m', '', 'Tết 2027', 'Each', 'M', 22, 180000, 'D1-01-1', 2, 0],
    ['Marketing', 'Banner', 'Banner Grab Food Festival 2m', '', 'Food Festival', 'Each', 'M', 1, 140000, 'D1-01-2', 2, 0],
    ['Marketing', 'Standee', 'Standee X 60x160', '', 'N/A', 'Each', 'M', 36, 120000, 'D1-02-1', 2, 0],
    ['Marketing', 'Standee', 'Standee Roll-up Merchant', '', 'Merchant Day', 'Each', 'M', 0, 450000, 'D1-02-2', 2, 0],
    ['Marketing', 'Gift', 'Móc khóa Grab', '', 'Driver Day 2026', 'Each', 'M', 1850, 9500, 'D2-01-1', 2, 1],
    ['Marketing', 'Gift', 'Ly giữ nhiệt Grab 500ml', '', 'Driver Day 2026', 'Each', 'M', 310, 85000, 'D2-01-2', 2, 1],
    ['Marketing', 'Gift', 'Sổ tay A5 Grab bìa da cao cấp in nổi logo kèm bút ký 2 màu (phiên bản giới hạn Year End Party 2026)', '', 'Year End Party 2026', 'Each', 'M', 4200, 65000, '', 2, 0],
    ['Marketing', 'Gift', 'Túi vải canvas Grab', '', 'N/A', 'Bag', 'M', -12, 28000, 'D2-02-1', 2, 0],
    ['Marketing', 'Gift', 'Voucher bìa cứng (hộp 50)', '', 'Merchant Day', 'Box', 'M', 18, 75000, 'D2-02-2', 2, 0],
    ['Office', 'Stationery', 'Giấy A4 Double A 70gsm (thùng 5 ream)', '', 'N/A', 'Box', 'H', 64, 410000, 'C2-01-1', 3, 1],
    ['Office', 'Stationery', 'Bút bi Thiên Long TL-027 (hộp 20)', '', 'N/A', 'Box', 'H', 9, 68000, 'C2-01-2', 3, 0],
    ['Office', 'Stationery', 'Sổ tay lò xo A5', '', 'N/A', 'Each', 'H', 140, 18000, 'C2-01-3', 3, 0],
    ['Office', 'Stationery', 'Băng keo trong 5cm', '', 'N/A', 'Each', 'W', 5, 14000, 'C2-02-1', 3, 0],
    ['Office', 'Stationery', 'Kẹp bướm 32mm (hộp 12)', '', 'N/A', 'Box', 'W', 33, 21000, 'C2-02-2', 3, 0],
    ['Office', 'Stationery', 'Giấy note 3x3 vàng', '', 'N/A', 'Each', 'H', 0, 9000, '', 3, 0],
    ['Office', 'Equipment', 'Máy in nhãn Brother PT-E550W', '', 'N/A', 'Each', 'W', 2, 4200000, 'C3-01-1', 3, 0],
    ['Office', 'Equipment', 'Pin AA Panasonic (vỉ 4)', '', 'N/A', 'Each', 'W', 56, 48000, 'C3-01-2', 3, 0],
    ['Office', 'Equipment', 'Ổ cắm điện 6 lỗ', '', 'N/A', 'Each', 'W', 14, 120000, 'C3-01-3', 3, 0],
    ['Office', 'Equipment', 'Máy bấm kim', '', 'N/A', 'Each', 'H', 11, 55000, 'C3-02-1', 3, 0],
    ['Event', 'Decor', 'Bóng bay chữ Grab 40 inch', '', 'Year End Party 2026', 'Each', 'M', 48, 35000, 'E1-01-1', 0, 0],
    ['Event', 'Decor', 'Dây đèn LED 10m', '', 'Year End Party 2026', 'Each', 'M', 27, 90000, 'E1-01-2', 0, 0],
    ['Event', 'Decor', 'Hoa giả trang trí bàn', '', 'Year End Party 2026', 'Bag', 'M', 62, 40000, 'E1-01-3', 0, 1],
    ['Event', 'Decor', 'Backdrop 4x3m YEP 2026', '', 'Year End Party 2026', 'Each', 'M', 1, 1800000, 'E1-02-1', 0, 0],
    ['Event', 'Booth', 'Bàn gấp 1m8', '', 'N/A', 'Each', 'W', 24, 650000, 'E2-01-1', 0, 0],
    ['Event', 'Booth', 'Ghế nhựa Duy Tân', '', 'N/A', 'Each', 'W', 160, 95000, 'E2-01-2', 0, 0],
    ['Event', 'Booth', 'Lều bạt 3x3m', '', 'N/A', 'Each', 'W', 6, 2300000, 'E2-02-1', 0, 0],
    ['Event', 'Booth', 'Tủ trưng bày', '', 'N/A', 'Each', 'W', -1, 3100000, 'E2-02-2', 0, 0],
    ['Event', 'Booth', 'Kệ trưng bày sản phẩm', '', 'N/A', 'Each', 'O', 9, 480000, 'E2-03-1', 0, 0],
    ['Gear', 'Bag', 'Túi cứu thương mini', '', 'N/A', 'Each', 'O', 31, 70000, 'B2-04-3', 1, 0],
    ['Gear', 'Helmet', 'Mũ bảo hiểm trẻ em', '', 'N/A', 'Each', 'O', 2, 130000, 'B2-03-4', 1, 0],
    ['Uniform', 'Hat', 'Mũ bucket Grab 2026', '', 'Year End Party 2026', 'Each', 'H', 0, 60000, 'A1-03-2', 0, 0],
    ['Marketing', 'Banner', 'Cờ phướn Tết (bộ 10)', '', 'Tết 2027', 'Bag', 'M', 70, 95000, 'D1-01-3', 2, 0],
    ['Office', 'Equipment', 'Pin sạc dự phòng 10000mAh', '', 'N/A', 'Each', 'W', 12, 290000, 'C3-02-2', 3, 0]
  ];

  /* ============================== mutable state ============================== */
  let users, ME, items, skus, rows, boxes, boxSeq, requests, notis, photos, deleted, stk, backups, mailOn, reqCounter,
      pendingUsers;

  function init() {
    seed = SEED;
    buildUsers();
    buildItems();
    buildRows();
    buildBoxes();
    buildSkus();
    buildRequests();
    buildNotifications();
    buildStocktakes();
    buildMisc();
  }

  /* ------------------------------ users ------------------------------ */
  function buildUsers() {
    users = USER_TABLE.map((u, i) => ({
      rowIndex: i + 2, email: u[0], username: u[1], cc: u[2], ccFull: u[3], teamCode: teamOfCc(u[3]),
      department: DEPTS[u[3]].dept, role: u[4]
    }));
    const me = users.find((u) => u.email === (ROLE === 'admin' ? 'minh.admin@example.com' : 'an.dinh@example.com'));
    ME = { email: me.email, username: me.username, cc: me.ccFull, ccRaw: me.cc, teamCode: me.teamCode,
           department: me.department, role: ROLE === 'admin' ? 'admin' : 'member' };
  }
  const usersOfCc = (cc) => users.filter((u) => u.ccFull === cc && u.role === 'member').map((u) => u.username);
  const admins = () => users.filter((u) => u.role === 'admin').map((u) => u.username);

  /* ------------------------------ items / SKUs ------------------------------ */
  function buildItems() {
    const prodNo = {}, perCat = {};
    items = ITEM_TABLE.map((t) => {
      const cat = t[0], sub = t[1], name = t[2], variant = t[3];
      const pk = [cat, sub, name, t[4]].join('|');
      if (!prodNo[pk]) { perCat[cat] = (perCat[cat] || 0) + 1; prodNo[pk] = perCat[cat]; }
      const catCode = alnum(cat).slice(0, 3) || 'GEN';
      const vcode = alnum(variant).slice(0, 4);
      const code = catCode + '-' + pad(prodNo[pk], 4) + (vcode ? '-' + vcode : '');
      return { code, cat, sub, name, variant, event: t[4], unit: t[5], cc: CC_OF[t[6]], dept: DEPTS[CC_OF[t[6]]].dept,
               stock: t[7], price: t[8], bin: t[9], loc: LOCS[t[10]], boxed: !!t[11], productNo: prodNo[pk] };
    });
  }

  function buildSkus() {
    skus = items.map((it, i) => {
      const owner = users.find((u) => u.ccFull === it.cc && u.role !== 'pending');
      return { sku: it.code, name: it.name, variant: it.variant, cat: it.cat, sub: it.sub, event: it.event, unit: it.unit,
               team: teamOfCc(it.cc), pic: owner.email, active: true, legacy: '', productNo: it.productNo,
               createdAt: ymdhm(new Date(NOW - (120 - i) * 86400000)), createdBy: 'minh.admin@example.com', note: '',
               rowIndex: i + 2 };
    });
    skus.push(
      { sku: 'GEA-0099', name: 'Găng tay xe máy (mẫu cũ)', variant: '', cat: 'Gear', sub: 'Bag', event: 'N/A', unit: 'Each', team: 'OPSCOA',
        pic: '', active: false, legacy: 'OLD-GL-01', productNo: 99, createdAt: ymdhm(new Date(NOW - 400 * 86400000)),
        createdBy: 'minh.admin@example.com', note: 'Ngừng sử dụng từ 2026', rowIndex: skus.length + 2 },
      { sku: 'OFF-0099', name: 'Bìa còng A4 (chưa có giao dịch)', variant: '', cat: 'Office', sub: 'Stationery', event: 'N/A', unit: 'Each',
        team: 'HRADM', pic: 'mai.le@example.com', active: true, legacy: '', productNo: 99, createdAt: ymdhm(new Date(NOW - 3 * 86400000)),
        createdBy: 'linh.vo@example.com', note: '', rowIndex: skus.length + 3 });
  }
  const skuByCode = (c) => skus.find((s) => s.sku === c);
  const skuKey = (t, cat, sub, name, variant, event) => [t, cat, sub, name, variant, event].map((x) => noDia(x).toUpperCase().replace(/\s+/g, ' ').trim()).join('|');

  function skuAllocate(team, cat, sub, name, variant, event) {
    const found = skus.find((s) => skuKey(s.team, s.cat, s.sub, s.name, s.variant, s.event) === skuKey(team, cat, sub, name, variant, event));
    if (found) return { sku: found.sku, existing: true, record: found, productNo: found.productNo };
    const catCode = alnum(cat).slice(0, 3) || 'GEN';
    let max = 0;
    skus.forEach((s) => { const m = /^([A-Z0-9]+)-(\d+)/.exec(s.sku); if (m && m[1] === catCode) max = Math.max(max, Number(m[2])); });
    const sib = skus.find((s) => skuKey(s.team, s.cat, s.sub, s.name, '', s.event) === skuKey(team, cat, sub, name, '', event));
    const productNo = sib ? sib.productNo : max + 1;
    const vc = alnum(variant).slice(0, 4);
    let sku = catCode + '-' + pad(productNo, 4) + (vc ? '-' + vc : '');
    while (skuByCode(sku)) sku += 'X';
    return { sku, existing: false, record: null, productNo };
  }

  /* ------------------------------ transactions ------------------------------ */
  function splitInto(total, n) {
    const w = []; let sum = 0;
    for (let i = 0; i < n; i++) { const x = rnd() + 0.2; w.push(x); sum += x; }
    const out = w.map((x) => 1 + Math.floor((total - n) * x / sum));
    out[n - 1] += total - out.reduce((a, b) => a + b, 0);
    return out;
  }

  function buildRows() {
    const raw = [];
    let poSeq = 100;
    items.forEach((it) => {
      const S = it.stock;
      const nExp = ri(6, 13);
      let E = Math.max(nExp + 2, Math.round(Math.max(Math.abs(S), 10) * (0.35 + rnd() * 0.9)));
      if (S < 0) E = Math.max(E, -S + 8);
      const I = E + S;
      const nImp = I >= 8 ? 2 : 1;
      const I2 = nImp === 2 ? Math.max(1, Math.round(I * 0.25)) : 0;
      const I1 = I - I2;
      const supplier = pick(SUPPLIERS);
      const po = 'PO-2026-' + pad(++poSeq, 4), inv = 'INV-' + pad(ri(1000, 9999), 5);
      const members = usersOfCc(it.cc).concat(admins());
      const base = { code: it.code, dept: it.dept, cc: it.cc, cat: it.cat, sub: it.sub, name: it.name, unit: it.unit,
                     event: it.event, variant: it.variant, poNo: po, invoiceNo: inv, supplier, purchasePrice: it.price, bin: it.bin };
      raw.push(Object.assign({}, base, { type: 'Import', qty: I1, date: isoAgo(ri(45, 110)), loc: it.loc, pic: pick(admins()),
                                         boxCount: it.boxed ? Math.min(ri(3, 8), I1) : 0 }));
      if (nImp === 2) {
        raw.push(Object.assign({}, base, { poNo: 'PO-2026-' + pad(++poSeq, 4), invoiceNo: 'INV-' + pad(ri(1000, 9999), 5),
                                           type: 'Import', qty: I2, date: isoAgo(ri(2, 30)), loc: it.loc, pic: pick(members),
                                           boxCount: it.boxed ? Math.min(ri(1, 2), I2) : 0 }));
      }
      splitInto(E, nExp).forEach((q) => {
        raw.push(Object.assign({}, base, { type: 'Export', qty: q, date: isoAgo(rnd() < 0.8 ? ri(0, 6) : ri(7, 40)),
                                           loc: rnd() < 0.7 ? it.loc : pick(LOCS), pic: pick(members), boxCount: 0 }));
      });
    });
    raw.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.type === b.type ? 0 : a.type === 'Import' ? -1 : 1)));
    rows = raw.map((r, i) => Object.assign({ rowIndex: i + 2, no: i + 1 }, r));
  }
  const nextNo = () => rows.reduce((m, r) => Math.max(m, r.no), 0) + 1;
  const visibleRow = (r) => ROLE === 'admin' || teamOfCc(r.cc) === ME.teamCode;
  const stockOf = (code) => rows.reduce((s, r) => (r.code === code ? s + (r.type === 'Import' ? r.qty : -r.qty) : s), 0);
  const baseOf = (code) => rows.find((r) => r.code === code && r.type === 'Import') || rows.find((r) => r.code === code);

  function addTx(o) {
    const no = nextNo();
    const r = Object.assign({ rowIndex: no + 1, no, dept: '', cc: '', pic: '', cat: '', sub: '', name: '', qty: 0, unit: 'Each',
      date: isoAgo(0), loc: '', event: 'N/A', variant: '', poNo: '', invoiceNo: '', supplier: '', purchasePrice: 0, boxCount: 0, bin: '' }, o);
    rows.push(r);
    return r;
  }

  /* ------------------------------ boxes (BoxDetail) ------------------------------ */
  function addBoxes(code, cc, txRow, date, loc, list) {
    let n = boxes.filter((b) => b.code === code).reduce((m, b) => Math.max(m, b.boxNo), 0);
    list.forEach((q) => {
      n++;
      boxes.push({ boxId: 'BX-' + pad(++boxSeq, 5), boxCode: code + '.B' + pad(n, 2), boxNo: n, code, cc, txRow, date,
                   dateVn: vn(date), qtyIn: q, left: q, out: 0, loc, moves: [] });
    });
  }
  function consumeFifo(code, qty, date, pic) {
    const alloc = []; let need = qty;
    boxes.filter((b) => b.code === code && b.left > 0).sort((a, b) => a.boxNo - b.boxNo).forEach((b) => {
      if (need <= 0) return;
      const take = Math.min(need, b.left);
      b.left -= take; b.out += take; need -= take;
      b.moves.push({ ts: tsOf(new Date(NOW)), qty: take, date, dateVn: vn(date), pic });
      alloc.push({ boxNo: b.boxNo, qty: take });
    });
    return alloc;
  }
  function buildBoxes() {
    boxes = []; boxSeq = 0;
    const boxedCodes = {};
    items.forEach((it) => { if (it.boxed) boxedCodes[it.code] = 1; });
    rows.forEach((r) => {
      if (!boxedCodes[r.code]) return;
      if (r.type === 'Import' && r.boxCount > 0) {
        const per = Math.floor(r.qty / r.boxCount), list = [];
        for (let i = 0; i < r.boxCount; i++) list.push(per);
        list[r.boxCount - 1] += r.qty - per * r.boxCount;
        addBoxes(r.code, r.cc, r.rowIndex, r.date, r.loc, list);
      } else if (r.type === 'Export') consumeFifo(r.code, r.qty, r.date, r.pic);
    });
    boxes.forEach((b) => b.moves.sort((x, y) => (x.date < y.date ? 1 : -1)));
  }

  /* ------------------------------ lean payload (bootstrapAll.data / getData) ------------------------------ */
  function computeLean() {
    const map = {}, pics = {}, ccs = {};
    let txCount = 0, impTx = 0, expTx = 0;
    const days = [], dayIdx = {};
    for (let i = 29; i >= 0; i--) { const d = isoAgo(i); dayIdx[d] = days.length; days.push({ d, imp: 0, exp: 0 }); }
    rows.forEach((r) => {
      if (!r.code || !visibleRow(r)) return;
      const isImp = r.type === 'Import';
      let m = map[r.code];
      if (!m) {
        m = map[r.code] = { code: r.code, cat: r.cat, sub: r.sub, name: r.name, variant: r.variant, event: r.event, unit: r.unit,
          cc: r.cc, dept: r.dept, bin: r.bin, imp: 0, exp: 0, boxImp: 0, boxLeft: 0, last: r.date, lastOut: '', locs: {}, binNo: -1 };
      }
      if (isImp) { m.imp += r.qty; m.boxImp += r.boxCount; m.locs[r.loc] = (m.locs[r.loc] || 0) + r.qty; }
      else { m.exp += r.qty; m.locs[r.loc] = (m.locs[r.loc] || 0) - r.qty; if (r.date > m.lastOut) m.lastOut = r.date; }
      if (r.date > m.last) m.last = r.date;
      if (r.bin && r.no >= m.binNo) { m.bin = r.bin; m.binNo = r.no; }
      if (r.pic) pics[r.pic] = 1;
      if (r.cc) ccs[r.cc] = 1;
      txCount++; if (isImp) impTx++; else expTx++;
      const di = dayIdx[r.date];
      if (di !== undefined) { if (isImp) days[di].imp += r.qty; else days[di].exp += r.qty; }
    });
    boxes.forEach((b) => {
      if (map[b.code] && b.left > 0 && (ROLE === 'admin' || teamOfCc(b.cc) === ME.teamCode)) map[b.code].boxLeft++;
    });
    const stock = Object.keys(map).sort().map((k) => {
      const m = map[k];
      m.stock = m.imp - m.exp;
      let best = -1, mainLoc = '—';
      Object.keys(m.locs).forEach((L) => { if (m.locs[L] > best) { best = m.locs[L]; mainLoc = L; } });
      m.mainLoc = best > 0 ? mainLoc : '—';
      delete m.locs; delete m.binNo;
      return m;
    });
    return { stock, filters: { pics: Object.keys(pics).sort(), ccs: Object.keys(ccs).sort() },
             home: { txCount, impTx, expTx, days }, scope: ROLE === 'admin' ? 'ALL' : ME.teamCode };
  }

  /* ------------------------------ staff requests (PendingRequests sheet) ------------------------------ */
  function newReqId(d) {
    const hex = (++reqCounter * 2654435761 >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(0, 6);
    return 'REQ-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '00-' + hex;
  }
  function mkReq(o, extra) {
    const u = users.find((x) => x.username === o.user);
    const when = new Date(NOW - (o.hoursAgo || 1) * 3600000);
    const it = o.code ? items.find((i) => i.code === o.code) : null;
    const r = Object.assign({
      requestId: newReqId(when), submittedAt: tsOf(when), date: isoAgo(o.daysAgo == null ? 0 : o.daysAgo),
      userEmail: u.email, user: u.username, cc: u.ccFull, team: u.teamCode, department: u.department,
      type: 'Export', category: it ? it.cat : '', subCategory: it ? it.sub : '', name: it ? it.name : '', variant: it ? it.variant : '',
      event: it ? it.event : 'N/A', quantity: 1, unit: it ? it.unit : 'Each', boxCount: 0, location: it ? it.loc : LOCS[0],
      assetCode: o.code || '', status: 'PENDING', decisionBy: '', decisionTime: '', decisionNote: '',
      poNo: '', invoiceNo: '', supplier: '', purchasePrice: 0, hoursAgo: o.hoursAgo || 1
    }, o, extra);
    delete r.daysAgo; delete r.code;
    return r;
  }
  const codeOf = (i) => items[i].code;

  function buildRequests() {
    reqCounter = 41;
    const imp = { poNo: 'PO-2026-0412', invoiceNo: 'INV-20418', supplier: 'Nhà phân phối Hoàng Hà', purchasePrice: 52000 };
    const list = [
      // --- PENDING ---
      mkReq({ user: 'An Dinh', code: codeOf(8), quantity: 10, hoursAgo: 2 }),                                            // export within stock
      mkReq({ user: 'An Dinh', code: codeOf(13), quantity: 10, hoursAgo: 5 }),                                           // export EXCEEDS stock (4)
      mkReq({ user: 'An Dinh', type: 'Import', category: 'Gear', subCategory: 'Bag', name: 'Bình nước Grab 750ml', event: 'Driver Day 2026',
              quantity: 120, boxCount: 6, unit: 'Each', location: LOCS[1], hoursAgo: 8, daysAgo: 0 }, imp),               // import, NEW sku
      mkReq({ user: 'An Dinh', type: 'Import', code: codeOf(2), quantity: 60, boxCount: 3, hoursAgo: 20 }, imp),         // import into existing SKU
      mkReq({ user: 'Lan Pham', code: codeOf(16), quantity: 3, hoursAgo: 3 }),                                           // export EXCEEDS stock (1)
      mkReq({ user: 'Lan Pham', type: 'Import', code: codeOf(20), quantity: 200, boxCount: 10, hoursAgo: 26 }, imp),
      mkReq({ user: 'Huy Tran', code: 'GEA-9999', name: 'Mã không tồn tại trong kho', category: 'Gear', subCategory: 'Bag', quantity: 2, hoursAgo: 30 }), // assetCode not in stock
      mkReq({ user: 'Mai Le', type: 'Import', category: 'Office', subCategory: 'Stationery', name: 'Bút lông bảng Thiên Long', event: 'N/A',
              quantity: 30, unit: 'Box', boxCount: 0, location: LOCS[3], hoursAgo: 40 }, { poNo: 'PO-2026-0420', invoiceNo: 'INV-20455', supplier: 'Văn phòng phẩm Hồng Hà', purchasePrice: 64000 }),
      mkReq({ user: 'Tuan Nguyen', code: codeOf(18), quantity: 1, hoursAgo: 44 }),                                        // export of a zero-stock item
      mkReq({ user: 'Quynh Do', type: 'Import', category: 'Uniform', subCategory: 'Clothes', name: 'Áo thun Driver Day', variant: 'XXL',
              event: 'Driver Day 2026', quantity: 40, boxCount: 0, location: LOCS[0], hoursAgo: 50 }, imp),             // variant required (Clothes)
      // --- APPROVED ---
      mkReq({ user: 'An Dinh', code: codeOf(6), quantity: 20, status: 'APPROVED', decisionBy: 'minh.admin@example.com', decisionTime: tsAgo(60), decisionNote: 'Approved', hoursAgo: 70, daysAgo: 3 }),
      mkReq({ user: 'An Dinh', type: 'Import', code: codeOf(14), quantity: 40, status: 'APPROVED', decisionBy: 'linh.vo@example.com', decisionTime: tsAgo(100), decisionNote: 'OK nhập kho', hoursAgo: 120, daysAgo: 5 }, imp),
      mkReq({ user: 'Lan Pham', code: codeOf(21), quantity: 100, status: 'APPROVED', decisionBy: 'minh.admin@example.com', decisionTime: tsAgo(72), decisionNote: 'Approved', hoursAgo: 90, daysAgo: 4 }),
      mkReq({ user: 'Huy Tran', code: codeOf(10), quantity: 2, status: 'APPROVED', decisionBy: 'linh.vo@example.com', decisionTime: tsAgo(50), decisionNote: 'Approved', hoursAgo: 55, daysAgo: 2 }),
      // --- REJECTED ---
      mkReq({ user: 'An Dinh', code: codeOf(0), quantity: 500, status: 'REJECTED', decisionBy: 'minh.admin@example.com', decisionTime: tsAgo(150), decisionNote: 'Số lượng vượt định mức tháng', hoursAgo: 160, daysAgo: 7 }),
      mkReq({ user: 'An Dinh', type: 'Import', category: 'Gear', subCategory: 'Helmet', name: 'Mũ bảo hiểm 1/2 đầu', quantity: 30, boxCount: 0, unit: 'Each', location: LOCS[1], status: 'REJECTED', decisionBy: 'linh.vo@example.com', decisionTime: tsAgo(200), decisionNote: 'Thiếu hóa đơn đầu vào, vui lòng bổ sung PO', hoursAgo: 210, daysAgo: 9 }, imp),
      mkReq({ user: 'Mai Le', code: codeOf(26), quantity: 10, status: 'REJECTED', decisionBy: 'minh.admin@example.com', decisionTime: tsAgo(300), decisionNote: 'Mã đã ngừng sử dụng', hoursAgo: 310, daysAgo: 12 })
    ];
    requests = list.reverse().reverse();      // oldest first, like the sheet
    requests.sort((a, b) => b.hoursAgo - a.hoursAgo);
  }
  const reqById = (id) => requests.find((r) => r.requestId === id);

  /* ------------------------------ notifications ------------------------------ */
  function buildNotifications() {
    notis = []; let rowIndex = 1;
    const push = (o) => notis.push(Object.assign({ rowIndex: ++rowIndex, ts: '', time: '', user: '', cc: '', type: '', name: '', qty: '', loc: '', msg: '', read: false, recipient: '' }, o));
    requests.forEach((r, i) => {
      const nameFull = r.name + (r.variant ? ' · ' + r.variant : '');
      if (r.status === 'PENDING') {
        push({ ts: r.submittedAt, time: vn(r.date), user: r.user, cc: r.cc, type: r.type, name: nameFull, qty: r.quantity + ' ' + r.unit, loc: r.location,
               msg: r.user + ' (' + r.cc + ' · ' + r.team + ') yêu cầu ' + (r.type === 'Import' ? 'nhập kho' : 'xuất kho') + ' — ' + r.quantity + ' ' + r.unit +
                    ' · ' + nameFull + ' tại ' + r.location + ' · ' + vn(r.date) + ' [' + r.requestId + ']',
               read: i % 3 === 2, recipient: '' });
      } else {
        const ok = r.status === 'APPROVED';
        push({ ts: r.decisionTime, time: vn(r.date), user: r.decisionBy.split('@')[0], cc: r.cc, type: r.type, name: nameFull, qty: r.quantity + ' ' + r.unit, loc: r.location,
               msg: 'Yêu cầu [' + r.requestId + '] của bạn đã ' + (ok ? 'được DUYỆT' : 'bị TỪ CHỐI') + ' bởi ' + r.decisionBy.split('@')[0] + '.' +
                    (ok ? ' Asset Code: ' + r.assetCode : ' Lý do: ' + r.decisionNote),
               read: false, recipient: r.userEmail });
      }
    });
  }
  const notiVisible = (n) => (ROLE === 'admin' ? n.recipient === '' : n.recipient === ME.email);

  /* ------------------------------ stocktake ------------------------------ */
  function stkLine(it, extra) {
    const price = it.price;
    const l = Object.assign({ code: it.code, name: it.name + (it.variant ? ' · ' + it.variant : ''), unit: it.unit, cc: it.cc, bin: it.bin, loc: it.loc,
      price, sys: stockOf(it.code), counted: null, sysAtCount: null, variance: null, valueVar: null, result: null, countedBy: '', countedAt: '',
      status: 'PENDING', note: '', adjQty: null, adjTxRow: null }, extra || {});
    return stkRecalc(l);
  }
  function stkRecalc(l) {
    if (l.counted === null) { l.sysAtCount = null; l.variance = null; l.valueVar = null; l.result = null; return l; }
    l.variance = l.counted - l.sysAtCount;
    l.valueVar = l.variance * l.price;
    l.result = l.variance === 0 ? 'MATCH' : l.variance > 0 ? 'OVER' : 'SHORT';
    return l;
  }
  function stkSummary(lines) {
    const s = { total: lines.length, counted: 0, pending: 0, matched: 0, over: 0, short: 0, netQty: 0, netValue: 0, overValue: 0, shortValue: 0,
                accuracy: null, adjusted: 0, kept: 0 };
    lines.forEach((l) => {
      if (l.status === 'ADJUSTED') s.adjusted++;
      if (l.status === 'KEPT') s.kept++;
      if (l.counted === null) { s.pending++; return; }
      s.counted++;
      if (l.result === 'MATCH') s.matched++;
      else if (l.result === 'OVER') { s.over++; s.overValue += l.valueVar; }
      else { s.short++; s.shortValue += l.valueVar; }
      s.netQty += l.variance; s.netValue += l.valueVar;
    });
    if (s.counted) s.accuracy = Math.round(s.matched / s.counted * 1000) / 10;
    return s;
  }
  function stkId(daysBack, n) { const d = new Date(NOW - daysBack * 86400000); return 'KK-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(n); }
  function buildStocktakes() {
    const live = items.filter((i) => stockOf(i.code) !== 0).sort((a, b) => (a.bin || '\uffff') < (b.bin || '\uffff') ? -1 : 1);
    const who = 'Dat Hoang', t0 = ymdhm(new Date(NOW - 3 * 3600000));
    // 1) COUNTING: 24 lines - some counted (match / over / short), some moved since counting, many still blank
    const modes = ['m', 'm', 'o', 's', 'n', 'n', 'n', 'm', 'n', 's', 'n', 'n', 'o', 'n', 'm', 'n', 'n', 'x', 's', 'n', 'n', 'x', 'n', 'n'];
    const lines1 = live.slice(0, 24).map((it, i) => {
      const sys = stockOf(it.code), mo = modes[i];
      if (mo === 'n') return stkLine(it);
      const counted = mo === 'o' ? sys + 2 : mo === 's' ? Math.max(0, sys - 2) : sys;
      const at = mo === 'x' ? sys + 1 : sys;                       // 'x' = stock moved after the count was typed
      return stkLine(it, { counted, sysAtCount: at, countedBy: who, countedAt: t0, status: 'COUNTED' });
    });
    // 2) CLOSED / PARTIAL: some adjusted, some kept, rest match
    const lines2 = live.slice(24, 36).map((it, i) => {
      const sys = stockOf(it.code);
      const diff = i < 4 ? (i % 2 ? -2 : 3) : i < 6 ? 1 : 0;
      const status = i < 4 ? 'ADJUSTED' : i < 6 ? 'KEPT' : 'COUNTED';
      return stkLine(it, { sys, counted: Math.max(0, sys + diff), sysAtCount: sys, countedBy: who, countedAt: ymdhm(new Date(NOW - 20 * 86400000)), status,
                           adjQty: status === 'ADJUSTED' ? diff : null, adjTxRow: status === 'ADJUSTED' ? 100 + i : null });
    });
    // 3) CLOSED / MATCHED
    const lines3 = live.slice(0, 8).map((it) => { const s = stockOf(it.code); return stkLine(it, { counted: s, sysAtCount: s, countedBy: who, countedAt: ymdhm(new Date(NOW - 35 * 86400000)), status: 'COUNTED' }); });
    // 4) CANCELLED
    const lines4 = live.slice(10, 20).map((it) => stkLine(it));
    const sess = (id, name, status, team, loc, daysBack, lines, extra) => Object.assign({ id, name, status, team, cat: '', loc, createdBy: 'minh.admin@example.com',
      createdAt: ymdhm(new Date(NOW - daysBack * 86400000)), closedBy: '', closedAt: '', note: '', decision: '', summary: null, lines }, extra || {});
    stk = [
      sess(stkId(35, 1), 'Kiểm kê tháng 8', 'CLOSED', 'ALL', '', 35, lines3, { closedBy: 'minh.admin@example.com', closedAt: ymdhm(new Date(NOW - 34 * 86400000)), decision: 'MATCHED', summary: stkSummary(lines3) }),
      sess(stkId(20, 1), 'Kiểm kê Kho A - cuối quý 3', 'CLOSED', 'ALL', 'Kho A - Quận 7', 20, lines2, { closedBy: 'linh.vo@example.com', closedAt: ymdhm(new Date(NOW - 19 * 86400000)), decision: 'PARTIAL', note: 'Giữ sổ sách 2 mã chờ đối chiếu', summary: stkSummary(lines2) }),
      sess(stkId(10, 1), 'Kiểm kê thử (đã huỷ)', 'CANCELLED', 'OPSCOA', '', 10, lines4, { closedBy: 'minh.admin@example.com', closedAt: ymdhm(new Date(NOW - 10 * 86400000)), note: ' [Huỷ: Tạo nhầm phạm vi]' }),
      sess(stkId(2, 1), 'Kiểm kê định kỳ tháng 10', 'COUNTING', 'ALL', '', 2, lines1, {})
    ];
  }
  const stkFind = (id) => { const s = stk.find((x) => x.id === String(id || '').trim()); if (!s) throw new Error('Không tìm thấy đợt kiểm kê ' + id + '.'); return s; };
  const stkMeta = (s) => ({ id: s.id, name: s.name, status: s.status, team: s.team, cat: s.cat, loc: s.loc, createdBy: s.createdBy, createdAt: s.createdAt,
    closedBy: s.closedBy, closedAt: s.closedAt, note: s.note, decision: s.decision, summary: s.summary });

  /* ------------------------------ misc ------------------------------ */
  function buildMisc() {
    mailOn = true;
    pendingUsers = users.filter((u) => u.role === 'pending').map((u) => ({ rowIndex: u.rowIndex, email: u.email, username: u.username, cc: u.ccFull, department: u.department, teamCode: u.teamCode }));
    const h = items[8];
    photos = [
      { rowIndex: 2, photoId: 'PH-0001', refType: 'CODE', refKey: h.code, code: h.code, itemName: h.name, fileId: 'file-1', url: 'https://example.invalid/photo/1',
        fileName: 'mu-bao-hiem-1.jpg', folder: '2026-09-12 / ' + h.code, size: 182000, thumb: svgThumb('Mũ 3/4 (mock)', '#2b8a3e'), by: 'minh.admin@example.com', at: '12/09 10:15', canDelete: true },
      { rowIndex: 3, photoId: 'PH-0002', refType: 'CODE', refKey: h.code, code: h.code, itemName: h.name, fileId: 'file-2', url: 'https://example.invalid/photo/2',
        fileName: 'mu-bao-hiem-2.jpg', folder: '2026-09-12 / ' + h.code, size: 164000, thumb: svgThumb('Mũ 3/4 (mock) 2', '#1971c2'), by: 'dat.hoang@example.com', at: '12/09 10:16', canDelete: ROLE === 'admin' }
    ];
    deleted = [
      { archiveRow: 2, deletedAt: ymdhm(new Date(NOW - 12 * 86400000)), deletedBy: 'minh.admin@example.com', reason: 'Nhập nhầm mã hàng', code: items[26].code, name: items[26].name, variant: '', type: 'Import', qty: 40, unit: items[26].unit, date: isoAgo(13), loc: items[26].loc, cc: items[26].cc, boxes: 0 },
      { archiveRow: 3, deletedAt: ymdhm(new Date(NOW - 8 * 86400000)), deletedBy: 'linh.vo@example.com', reason: 'Trùng phiếu xuất', code: items[8].code, name: items[8].name, variant: '', type: 'Export', qty: 6, unit: 'Each', date: isoAgo(9), loc: items[8].loc, cc: items[8].cc, boxes: 0 },
      { archiveRow: 4, deletedAt: ymdhm(new Date(NOW - 3 * 86400000)), deletedBy: 'minh.admin@example.com', reason: 'Sai số lượng, nhập lại', code: items[20].code, name: items[20].name, variant: '', type: 'Import', qty: 100, unit: 'Each', date: isoAgo(4), loc: items[20].loc, cc: items[20].cc, boxes: 5 }
    ];
    backups = [0, 1, 2].map((i) => ({ id: 'bk-' + i, name: 'SEC WH backup ' + isoAgo(30 * (i + 1) + 3), url: 'https://example.invalid/backup/' + i,
      at: ymdhm(new Date(NOW - (30 * (i + 1) + 3) * 86400000)), ageHours: (30 * (i + 1) + 3) * 24 }));
  }

  /* ============================== handlers ============================== */
  const H = {};
  let CTX = H;                                  // the object the handler was called on (window.__server), so tests can set flags on it
  function def(name, fn, opt) {
    H[name] = function () {
      CTX = this || H;
      try {
        if (opt === 'admin' && ROLE !== 'admin') throw new Error(ADMIN_MSG);
        return fn.apply(null, arguments);
      } catch (e) { return { ok: false, message: e.message }; }
    };
  }

  /* ---------- boot / data ---------- */
  const pendingCount = () => requests.filter((r) => r.status === 'PENDING' && (ROLE === 'admin' || r.userEmail === ME.email)).length;
  def('bootstrapAll', () => {
    const data = computeLean();
    return { ok: true, session: clone(ME), config: clone(CONFIG), data, pendingCount: pendingCount(), backend: 'SHEETS',
             perf: { authMs: 12, configMs: 4, dataMs: 85, pendingMs: 9, totalMs: 110, items: data.stock.length, txRows: data.home.txCount, cache: 'miss', backend: 'SHEETS', version: '4.1.3' } };
  });
  def('getData', () => Object.assign({ ok: true }, computeLean()));

  /* ---------- notifications ---------- */
  def('getNotifications', (onlyUnread, limit) => {
    const mine = notis.filter(notiVisible);
    const list = mine.slice(-(Number(limit) || 200));
    const unread = list.filter((n) => !n.read).length;
    const out = list.filter((n) => !onlyUnread || !n.read).reverse().map((n) => ({ rowIndex: n.rowIndex, ts: n.ts, time: n.time, user: n.user, cc: n.cc, type: n.type,
      name: n.name, qty: n.qty, loc: n.loc, msg: n.msg, read: n.read }));
    return { ok: true, rows: out, unread, total: list.length };
  });
  def('getUnreadCount', () => ({ ok: true, unread: notis.filter((n) => notiVisible(n) && !n.read).length, pending: pendingCount() }));
  def('markNotificationRead', (rowIndex) => {
    const n = notis.find((x) => x.rowIndex === Number(rowIndex) && notiVisible(x));
    if (!n) throw new Error('Bạn không có quyền đánh dấu thông báo này.');
    n.read = true; return { ok: true, rowIndex: n.rowIndex };
  });
  def('markAllNotificationsRead', () => { let marked = 0; notis.forEach((n) => { if (notiVisible(n) && !n.read) { n.read = true; marked++; } }); return { ok: true, marked }; });

  /* ---------- history (admin) ---------- */
  def('getTransactions', (f) => {
    f = f || {};
    const pic = String(f.username || '').trim().toLowerCase(), type = String(f.type || '').trim(), cat = String(f.cat || '').trim();
    const from = String(f.from || '').trim(), to = String(f.to || '').trim(), kw = String(f.keyword || '').trim().toLowerCase();
    const out = rows.filter((r) => {
      if (pic && r.pic.toLowerCase() !== pic) return false;
      if (type && r.type !== type) return false;
      if (cat && r.cat !== cat) return false;
      if (kw && [r.code, r.name, r.variant, r.event, r.cat, r.sub, r.loc, r.pic, r.poNo, r.invoiceNo, r.bin].join(' ').toLowerCase().indexOf(kw) === -1) return false;
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      return true;
    }).sort((a, b) => b.no - a.no);
    let imp = 0, exp = 0, boxImp = 0;
    out.forEach((r) => { if (r.type === 'Import') { imp += r.qty; boxImp += r.boxCount; } else exp += r.qty; });
    const limit = Math.min(Number(f.limit) || 300, out.length);
    return { ok: true, rows: clone(out.slice(0, limit)), total: out.length, scope: String(f.username || '').trim() || 'ALL', isAdmin: true, summary: { imp, exp, boxImp } };
  }, 'admin');

  def('getItemDetail', (code) => {
    const target = String(code || '').trim();
    if (!target) throw new Error('Thiếu Asset Code.');
    const list = rows.filter((r) => r.code === target);
    if (!list.length) throw new Error('Không tìm thấy giao dịch nào của mã ' + target + '.');
    let imp = 0, exp = 0, boxImp = 0, value = 0; const locs = {}, pics = {}, bins = {};
    let meta = null;
    list.forEach((tx) => {
      if (tx.type === 'Import') { imp += tx.qty; boxImp += tx.boxCount; value += tx.purchasePrice * tx.qty; locs[tx.loc] = (locs[tx.loc] || 0) + tx.qty; }
      else { exp += tx.qty; locs[tx.loc] = (locs[tx.loc] || 0) - tx.qty; }
      if (tx.pic) pics[tx.pic] = true;
      if (tx.bin) bins[tx.bin] = true;
      if (!meta || (tx.type === 'Import' && meta.type !== 'Import')) {
        meta = { code: tx.code, cat: tx.cat, sub: tx.sub, name: tx.name, variant: tx.variant, event: tx.event, unit: tx.unit, cc: tx.cc, dept: tx.dept,
                 type: tx.type, bin: tx.bin, poNo: tx.poNo, invoiceNo: tx.invoiceNo, supplier: tx.supplier, purchasePrice: tx.purchasePrice };
      }
    });
    const sorted = list.slice().sort((a, b) => b.no - a.no);
    let mainLoc = '—', best = -1;
    Object.keys(locs).forEach((L) => { if (locs[L] > best) { best = locs[L]; mainLoc = L; } });
    const bx = boxes.filter((b) => b.code === target).sort((a, b) => a.boxNo - b.boxNo);
    const totalIn = bx.reduce((s, b) => s + b.qtyIn, 0), totalLeft = bx.reduce((s, b) => s + b.left, 0);
    return { ok: true, meta, rows: clone(sorted),
      summary: { imp, exp, stock: imp - exp, boxImp, value, txCount: list.length, mainLoc: best > 0 ? mainLoc : '—', picList: Object.keys(pics).join(', '),
                 binList: Object.keys(bins).join(', '), first: sorted[sorted.length - 1].date, last: sorted[0].date },
      hasBoxes: bx.length > 0, boxes: clone(bx),
      boxSummary: { boxCount: bx.length, boxWithStock: bx.filter((b) => b.left > 0).length, totalIn, totalLeft, totalOut: totalIn - totalLeft } };
  }, 'admin');

  def('getBoxBreakdown', (code) => {
    const target = String(code || '').trim();
    if (!target) throw new Error('Thiếu Asset Code.');
    const list = boxes.filter((b) => b.code === target && (ROLE === 'admin' || teamOfCc(b.cc) === ME.teamCode))
      .sort((a, b) => a.boxNo - b.boxNo).map((b) => ({ boxNo: b.boxNo, boxCode: b.boxCode, dateVn: b.dateVn, qtyIn: b.qtyIn, out: b.qtyIn - b.left, left: b.left }));
    return { ok: true, rows: list };
  });

  def('deleteTransaction', (row, reason, expect) => {
    const r = rows.find((x) => x.rowIndex === Number(row));
    const why = String(reason || '').trim();
    if (!r) throw new Error(expect ? 'Dữ liệu đã thay đổi (có người vừa sửa/xóa giao dịch khác). Hãy tải lại trang rồi thao tác lại.' : 'Dòng ' + row + ' không tồn tại.');
    if (why.length < 3) throw new Error('Vui lòng nhập lý do xóa (ít nhất 3 ký tự).');
    if (expect && expect.code && expect.code !== r.code) throw new Error('Dữ liệu đã thay đổi (có người vừa sửa/xóa giao dịch khác). Hãy tải lại trang rồi thao tác lại.');
    if (r.type === 'Import' && stockOf(r.code) - r.qty < 0) {
      throw new Error('Không xóa được: mã ' + r.code + ' hiện còn ' + stockOf(r.code) + ', xóa lần nhập ' + r.qty + ' này sẽ làm tồn âm (' + (stockOf(r.code) - r.qty) + '). Xóa hoặc sửa các giao dịch xuất của mã này trước.');
    }
    rows.splice(rows.indexOf(r), 1);
    deleted.push({ archiveRow: deleted.length + 2, deletedAt: ymdhm(new Date(NOW)), deletedBy: ME.email, reason: why, code: r.code, name: r.name, variant: r.variant,
                   type: r.type, qty: r.qty, unit: r.unit, date: r.date, loc: r.loc, cc: r.cc, boxes: 0 });
    return { ok: true, message: 'Đã xóa giao dịch ' + r.type + ' ' + r.qty + ' của ' + r.code + '. Có thể khôi phục ở mục "Đã xóa".' };
  }, 'admin');

  def('editTransaction', (row, data, expect) => {
    data = data || {};
    const r = rows.find((x) => x.rowIndex === Number(row));
    const qty = Number(data.qty), loc = String(data.loc || '').trim(), date = String(data.date || '').trim();
    if (!date) throw new Error('Vui lòng chọn ngày.');
    if (!isoValid(date)) throw new Error('Ngày giao dịch không hợp lệ.');
    if (!loc) throw new Error('Vui lòng chọn địa điểm.');
    if (!qty || qty <= 0) throw new Error('Số lượng phải lớn hơn 0.');
    if (qty !== Math.floor(qty)) throw new Error('Số lượng phải là số nguyên.');
    if (!r) throw new Error(expect ? 'Dữ liệu đã thay đổi (có người vừa sửa/xóa giao dịch khác). Hãy tải lại trang rồi thao tác lại.' : 'Dòng ' + row + ' không tồn tại.');
    if (qty !== r.qty && boxes.some((b) => b.txRow === r.rowIndex)) {
      throw new Error('Dòng này đã có chi tiết thùng nên không đổi được số lượng. Xoá các dòng tương ứng ở sheet BoxDetail trước khi sửa.');
    }
    const next = stockOf(r.code) + (r.type === 'Import' ? qty - r.qty : r.qty - qty);
    if (next < 0) throw new Error('Không sửa được: tồn kho ' + r.code + ' sẽ âm (' + next + ').');
    Object.assign(r, { date, loc, qty, boxCount: Number(data.boxCount) || 0, poNo: String(data.poNo || ''), invoiceNo: String(data.invoiceNo || ''),
                       supplier: String(data.supplier || ''), purchasePrice: Number(data.purchasePrice) || 0,
                       bin: String(data.bin || '').trim().toUpperCase().replace(/[^A-Z0-9\-]/g, '') });
    return { ok: true, message: 'Đã cập nhật dòng ' + r.rowIndex + '. Tồn kho ' + r.code + ': ' + next };
  }, 'admin');

  /* ---------- direct import / export (admin) and staff requests ---------- */
  function checkLoc(loc) { if (LOCS.indexOf(loc) === -1) throw new Error('Địa điểm "' + loc + '" không có trong danh mục.'); }
  const needsVariant = (sub) => noDia(sub).toUpperCase().indexOf('CLOTHES') !== -1;

  def('previewAssetCode', (d) => {
    d = d || {};
    const cat = String(d.cat || '').trim(), sub = String(d.sub || '').trim(), name = String(d.name || '').trim(), event = String(d.event || '').trim(), variant = String(d.variant || '').trim();
    if (!cat || !sub || !name || !event) return { ok: false, message: 'Cần đủ nhóm hàng, phân nhóm, tên hàng và event.' };
    if (needsVariant(sub) && !variant) return { ok: false, message: 'Phân nhóm "' + sub + '" bắt buộc nhập biến thể.' };
    const team = ME.role === 'admin' ? (String(d.team || '').trim().toUpperCase() || ME.teamCode) : ME.teamCode;
    const a = skuAllocate(team, cat, sub, name, variant, event);
    const m = /^([A-Z0-9]+)-(\d+)(?:-(.+))?$/.exec(a.sku) || [];
    return { ok: true, code: a.sku, reused: a.existing, format: 'sku', team, pic: a.record ? a.record.pic : '', active: a.record ? a.record.active : true,
             parts: [{ key: 'cat', seg: m[1] || '', src: cat }, { key: 'seq', seg: m[2] || '', src: name }, { key: 'var', seg: m[3] || '', src: variant }] };
  });

  function resolveSku(team, d, pic) {
    const a = skuAllocate(team, d.cat, d.sub, d.name, d.variant || '', d.event);
    if (!a.existing) {
      skus.push({ sku: a.sku, name: d.name, variant: d.variant || '', cat: d.cat, sub: d.sub, event: d.event, unit: d.unit, team, pic: pic || '', active: true, legacy: '',
                  productNo: a.productNo, createdAt: ymdhm(new Date(NOW)), createdBy: ME.email, note: '', rowIndex: skus.length + 2 });
    }
    return a;
  }

  def('importEntry', (d) => {
    d = d || {};
    const pick = String(d.code || '').trim();
    let cat = String(d.cat || '').trim(), sub = String(d.sub || '').trim(), name = String(d.name || '').trim(), event = String(d.event || '').trim(), unit = String(d.unit || '').trim(), variant = String(d.variant || '').trim();
    const qty = Number(d.qty), boxCount = Number(d.boxCount) || 0, loc = String(d.loc || '').trim(), date = String(d.date || '').trim();
    if (pick) {
      const s = skuByCode(pick); if (!s) throw new Error('Không tìm thấy SKU ' + pick + '.');
      cat = s.cat; sub = s.sub; name = s.name; variant = s.variant; event = s.event || 'N/A'; unit = s.unit || unit;
    }
    if (!date) throw new Error('Vui lòng chọn ngày nhập.');
    if (!isoValid(date)) throw new Error('Ngày nhập không hợp lệ.');
    if (!cat) throw new Error('Vui lòng chọn nhóm hàng.');
    if (!sub) throw new Error('Vui lòng chọn phân nhóm.');
    if (!name) throw new Error('Vui lòng nhập tên hàng.');
    if (!event) throw new Error('Vui lòng nhập event.');
    if (!loc) throw new Error('Vui lòng chọn địa điểm.');
    checkLoc(loc);
    if (!qty || qty <= 0) throw new Error('Số lượng phải lớn hơn 0.');
    if (qty !== Math.floor(qty)) throw new Error('Số lượng phải là số nguyên.');
    if (CONFIG.units.indexOf(unit) === -1) throw new Error('Đơn vị phải là Each, Box hoặc Bag.');
    if (needsVariant(sub) && !variant) throw new Error('Phân nhóm "' + sub + '" bắt buộc nhập biến thể.');
    if (!String(d.poNo || '').trim()) throw new Error('Vui lòng nhập PO No.');
    if (!String(d.invoiceNo || '').trim()) throw new Error('Vui lòng nhập số hoá đơn.');
    if (!String(d.supplier || '').trim()) throw new Error('Vui lòng nhập nhà cung cấp.');
    if (!Number(d.purchasePrice) || Number(d.purchasePrice) <= 0) throw new Error('Vui lòng nhập giá nhập (lớn hơn 0).');
    if (boxCount < 0 || boxCount > qty) throw new Error('Số thùng phải là số nguyên từ 0 đến ' + qty + '.');
    const team = String(d.team || '').trim().toUpperCase() || ME.teamCode;
    const a = pick ? { sku: pick, existing: true } : resolveSku(team, { cat, sub, name, variant, event, unit }, String(d.pic || '').toLowerCase());
    const ccFull = Object.keys(DEPTS).find((k) => DEPTS[k].team === team) || ME.cc;
    const r = addTx({ code: a.sku, type: 'Import', dept: DEPTS[ccFull].dept, cc: ccFull, pic: ME.username, cat, sub, name, qty, unit, date, loc, event, variant,
                      poNo: d.poNo, invoiceNo: d.invoiceNo, supplier: d.supplier, purchasePrice: Number(d.purchasePrice), boxCount, bin: '' });
    if (boxCount > 0) addBoxes(a.sku, r.cc, r.rowIndex, date, loc, Array.isArray(d.boxList) && d.boxList.length === boxCount ? d.boxList.map(Number) : [qty]);
    return { ok: true, code: a.sku, assetCode: a.sku, reused: a.existing,
             message: 'Đã nhập kho ' + qty + ' ' + unit + (boxCount ? ' (' + boxCount + ' thùng)' : '') + ' — Asset Code: ' + a.sku + (a.existing ? ' (dùng lại mã cũ)' : ' (mã mới)') };
  }, 'admin');

  def('exportEntry', (d) => {
    d = d || {};
    const code = String(d.code || '').trim(), loc = String(d.loc || '').trim(), date = String(d.date || '').trim(), qty = Number(d.qty);
    if (!code) throw new Error('Chưa chọn mặt hàng để xuất.');
    if (!date) throw new Error('Vui lòng chọn ngày xuất.');
    if (!isoValid(date)) throw new Error('Ngày xuất không hợp lệ.');
    if (!loc) throw new Error('Vui lòng chọn địa điểm xuất đến.');
    checkLoc(loc);
    if (!qty || qty <= 0) throw new Error('Số lượng phải lớn hơn 0.');
    if (qty !== Math.floor(qty)) throw new Error('Số lượng phải là số nguyên.');
    const base = baseOf(code);
    if (!base) throw new Error('Không tìm thấy Asset Code ' + code + '.');
    const before = stockOf(code);
    if (before <= 0) throw new Error('Mặt hàng ' + code + ' đã hết hàng.');
    if (qty > before) throw new Error('Vượt tồn kho: chỉ còn ' + before + ' ' + base.unit + '.');
    const r = addTx({ code, type: 'Export', dept: base.dept, cc: base.cc, pic: ME.username, cat: base.cat, sub: base.sub, name: base.name, qty, unit: base.unit, date, loc,
                      event: base.event, variant: base.variant, poNo: base.poNo, invoiceNo: base.invoiceNo, supplier: base.supplier, purchasePrice: base.purchasePrice, bin: base.bin });
    const alloc = consumeFifo(code, qty, date, ME.username);
    const left = stockOf(code);
    return { ok: true, code, left, alloc, message: 'Đã xuất ' + qty + ' ' + base.unit + ' của ' + code + ' → ' + loc + '. Tồn còn lại: ' + left +
      (alloc.length ? ' · Lấy từ: ' + alloc.map((a) => 'Thùng ' + a.boxNo + ' (' + a.qty + ')').join(', ') : '') };
  }, 'admin');

  def('submitRequest', (d) => {
    d = d || {};
    if (ME.role === 'admin') throw new Error('Admin dùng chức năng nhập/xuất trực tiếp.');
    const type = String(d.type || '').trim();
    if (type !== 'Import' && type !== 'Export') throw new Error('Loại giao dịch không hợp lệ.');
    const date = String(d.date || '').trim(), qty = Number(d.qty), loc = String(d.loc || '').trim();
    if (!date) throw new Error('Vui lòng chọn ngày.');
    if (!isoValid(date)) throw new Error('Ngày giao dịch không hợp lệ.');
    if (!loc) throw new Error('Vui lòng chọn địa điểm.');
    checkLoc(loc);
    if (!qty || qty <= 0) throw new Error('Số lượng phải lớn hơn 0.');
    if (qty !== Math.floor(qty)) throw new Error('Số lượng phải là số nguyên.');
    const q = { type, date, quantity: qty, location: loc, user: ME.username, userEmail: ME.email, cc: ME.cc, team: ME.teamCode, department: ME.department,
                requestId: newReqId(new Date(NOW)), submittedAt: tsOf(new Date(NOW)), status: 'PENDING', decisionBy: '', decisionTime: '', decisionNote: '', hoursAgo: 0,
                assetCode: '', boxCount: 0, poNo: '', invoiceNo: '', supplier: '', purchasePrice: 0 };
    if (type === 'Import') {
      const pick = String(d.code || '').trim(), s = pick ? skuByCode(pick) : null;
      if (pick && !s) throw new Error('SKU ' + pick + ' không thuộc bộ phận của bạn và bạn không phải PIC của SKU này.');
      Object.assign(q, { category: s ? s.cat : String(d.cat || '').trim(), subCategory: s ? s.sub : String(d.sub || '').trim(), name: s ? s.name : String(d.name || '').trim(),
        variant: s ? s.variant : String(d.variant || '').trim(), event: s ? (s.event || 'N/A') : String(d.event || '').trim(), unit: s ? s.unit : String(d.unit || '').trim(),
        assetCode: pick, boxCount: Number(d.boxCount) || 0, poNo: String(d.poNo || '').trim(), invoiceNo: String(d.invoiceNo || '').trim(),
        supplier: String(d.supplier || '').trim(), purchasePrice: Number(d.purchasePrice) });
      if (!q.category) throw new Error('Vui lòng chọn nhóm hàng.');
      if (!q.subCategory) throw new Error('Vui lòng chọn phân nhóm.');
      if (!q.name) throw new Error('Vui lòng nhập tên hàng.');
      if (!q.event) throw new Error('Vui lòng nhập event.');
      if (CONFIG.units.indexOf(q.unit) === -1) throw new Error('Đơn vị phải là Each, Box hoặc Bag.');
      if (needsVariant(q.subCategory) && !q.variant) throw new Error('Phân nhóm "' + q.subCategory + '" bắt buộc nhập biến thể.');
      if (q.boxCount < 0 || q.boxCount > qty) throw new Error('Số thùng phải là số nguyên từ 0 đến ' + qty + '.');
      if (!q.poNo) throw new Error('Vui lòng nhập PO No.');
      if (!q.invoiceNo) throw new Error('Vui lòng nhập số hoá đơn.');
      if (!q.supplier) throw new Error('Vui lòng nhập nhà cung cấp.');
      if (!q.purchasePrice || q.purchasePrice <= 0) throw new Error('Vui lòng nhập giá nhập (lớn hơn 0).');
    } else {
      const code = String(d.code || '').trim();
      if (!code) throw new Error('Chưa chọn Asset Code để xuất.');
      const base = baseOf(code);
      if (!base || teamOfCc(base.cc) !== ME.teamCode) throw new Error('SKU ' + code + ' không thuộc bộ phận của bạn và bạn không phải PIC của SKU này.');
      const st = stockOf(code);
      if (st <= 0) throw new Error('Mặt hàng đã hết hàng.');
      if (qty > st) throw new Error('Vượt tồn kho: chỉ còn ' + st + ' ' + base.unit + '.');
      Object.assign(q, { category: base.cat, subCategory: base.sub, name: base.name, variant: base.variant, event: base.event, unit: base.unit, assetCode: code,
                         poNo: base.poNo, invoiceNo: base.invoiceNo, supplier: base.supplier, purchasePrice: base.purchasePrice });
    }
    requests.push(q);
    const nameFull = q.name + (q.variant ? ' · ' + q.variant : '');
    notis.push({ rowIndex: notis.length + 2, ts: q.submittedAt, time: vn(date), user: ME.username, cc: ME.cc, type, name: nameFull, qty: qty + ' ' + q.unit, loc,
                 msg: ME.username + ' (' + ME.cc + ' · ' + ME.teamCode + ') yêu cầu ' + (type === 'Import' ? 'nhập kho' : 'xuất kho') + ' — ' + qty + ' ' + q.unit + ' · ' + nameFull +
                      ' tại ' + loc + ' · ' + vn(date) + ' [' + q.requestId + ']', read: false, recipient: '' });
    return { ok: true, requestId: q.requestId, message: 'Đã gửi yêu cầu. Mã: ' + q.requestId + '. Vui lòng chờ phê duyệt.' };
  });

  def('getMyRequests', (limit) => {
    const mine = requests.filter((r) => r.userEmail === ME.email);
    const summary = { pending: 0, approved: 0, rejected: 0 };
    mine.forEach((r) => { summary[r.status.toLowerCase()]++; });
    const list = mine.map((r) => ({ requestId: r.requestId, submittedAt: r.submittedAt, transactionDate: vn(r.date), type: r.type, name: r.name, variant: r.variant,
      quantity: String(r.quantity), unit: r.unit, boxCount: String(r.boxCount || 0), location: r.location, assetCode: r.assetCode, status: r.status,
      decisionBy: r.decisionBy, decisionTime: r.decisionTime, decisionNote: r.decisionNote })).reverse();
    const lim = Number(limit) || 200; let done = 0;
    return { ok: true, rows: list.filter((r) => r.status === 'PENDING' || ++done <= lim), total: list.length, summary };
  });

  def('getPendingRequests', () => ({ ok: true, rows: requests.filter((r) => r.status === 'PENDING').map((r) => ({
    requestId: r.requestId, submittedAt: r.submittedAt, transactionDate: vn(r.date), user: r.user, cc: r.cc, team: r.team, type: r.type, category: r.category,
    subCategory: r.subCategory, name: r.name, variant: r.variant, event: r.event, quantity: String(r.quantity), unit: r.unit, boxCount: String(r.boxCount || 0),
    location: r.location, assetCode: r.assetCode, poNo: r.poNo, invoiceNo: r.invoiceNo, supplier: r.supplier, purchasePrice: String(r.purchasePrice || '') })).reverse() }), 'admin');

  def('approvePendingRequest', (id, note) => {
    const q = reqById(id);
    if (!q) throw new Error('Không tìm thấy yêu cầu ' + id);
    if (q.status !== 'PENDING') throw new Error('Yêu cầu này đã được xử lý trước đó.');
    let code = q.assetCode, alloc = null;
    if (q.type === 'Import') {
      if (!(code && skuByCode(code))) code = resolveSku(q.team, { cat: q.category, sub: q.subCategory, name: q.name, variant: q.variant, event: q.event, unit: q.unit }, q.userEmail).sku;
      const prev = baseOf(code);
      const r = addTx({ code, type: 'Import', dept: q.department, cc: q.cc, pic: q.user, cat: q.category, sub: q.subCategory, name: q.name, qty: q.quantity, unit: q.unit, date: q.date,
                        loc: q.location, event: q.event, variant: q.variant, poNo: q.poNo, invoiceNo: q.invoiceNo, supplier: q.supplier, purchasePrice: q.purchasePrice,
                        boxCount: q.boxCount, bin: prev ? prev.bin : '' });
      if (q.boxCount > 0) {
        const per = Math.floor(q.quantity / q.boxCount), list = [];
        for (let i = 0; i < q.boxCount; i++) list.push(per);
        list[q.boxCount - 1] += q.quantity - per * q.boxCount;
        addBoxes(code, q.cc, r.rowIndex, q.date, q.location, list);
      }
    } else {
      const base = baseOf(code);
      if (!base) throw new Error('Không tìm thấy tài sản gốc để xuất.');
      const st = stockOf(code);
      if (st <= 0) throw new Error('Không thể duyệt: tài sản đã hết hàng (tồn = ' + st + ').');
      if (q.quantity > st) throw new Error('Không thể duyệt: tồn kho chỉ còn ' + st + ' ' + base.unit + '.');
      addTx({ code, type: 'Export', dept: q.department, cc: q.cc, pic: q.user, cat: base.cat, sub: base.sub, name: base.name, qty: q.quantity, unit: base.unit, date: q.date,
              loc: q.location, event: base.event, variant: base.variant, poNo: base.poNo, invoiceNo: base.invoiceNo, supplier: base.supplier, purchasePrice: base.purchasePrice, bin: base.bin });
      alloc = consumeFifo(code, q.quantity, q.date, q.user);
    }
    Object.assign(q, { status: 'APPROVED', assetCode: code, decisionBy: ME.email, decisionTime: tsOf(new Date(NOW)), decisionNote: String(note || 'Approved') });
    notis.push({ rowIndex: notis.length + 2, ts: q.decisionTime, time: vn(q.date), user: ME.username, cc: q.cc, type: q.type, name: q.name, qty: q.quantity + ' ' + q.unit, loc: q.location,
                 msg: 'Yêu cầu [' + q.requestId + '] của bạn đã được DUYỆT bởi ' + ME.username + '. Asset Code: ' + code, read: false, recipient: q.userEmail });
    return { ok: true, alloc, message: 'Đã duyệt ' + q.requestId + '. Asset Code: ' + code + (alloc && alloc.length ? ' · Lấy từ: ' + alloc.map((a) => 'Thùng ' + a.boxNo + ' (' + a.qty + ')').join(', ') : '') };
  }, 'admin');

  def('rejectPendingRequest', (id, reason) => {
    const why = String(reason || '').trim();
    if (!why) throw new Error('Vui lòng nhập lý do từ chối.');
    const q = reqById(id);
    if (!q) throw new Error('Không tìm thấy yêu cầu ' + id);
    if (q.status !== 'PENDING') throw new Error('Yêu cầu này đã được xử lý trước đó.');
    Object.assign(q, { status: 'REJECTED', decisionBy: ME.email, decisionTime: tsOf(new Date(NOW)), decisionNote: why });
    notis.push({ rowIndex: notis.length + 2, ts: q.decisionTime, time: vn(q.date), user: ME.username, cc: q.cc, type: q.type, name: q.name, qty: q.quantity + ' ' + q.unit, loc: q.location,
                 msg: 'Yêu cầu [' + q.requestId + '] của bạn đã bị TỪ CHỐI bởi ' + ME.username + '. Lý do: ' + why, read: false, recipient: q.userEmail });
    return { ok: true, message: 'Đã từ chối ' + q.requestId + '.' };
  }, 'admin');

  def('reqEditGet', (id) => {
    const q = reqById(id);
    if (!q || (ROLE !== 'admin' && q.userEmail !== ME.email)) throw new Error('Không tìm thấy yêu cầu ' + id);
    return { ok: true, req: { requestId: q.requestId, type: q.type, date: q.date, category: q.category, sub: q.subCategory, name: q.name, variant: q.variant, event: q.event,
      unit: q.unit, requester: q.user, assetCode: q.assetCode, qty: q.quantity, boxCount: q.boxCount, loc: q.location, poNo: q.poNo, invoiceNo: q.invoiceNo,
      supplier: q.supplier, price: q.purchasePrice, maxQty: q.type === 'Export' ? (q.assetCode ? stockOf(q.assetCode) : 0) : null } };
  });
  def('reqEditSave', (id, data) => {
    data = data || {};
    const q = reqById(id);
    if (!q || (ROLE !== 'admin' && q.userEmail !== ME.email)) throw new Error('Không tìm thấy yêu cầu ' + id);
    if (q.status !== 'PENDING') throw new Error('Yêu cầu này đã được xử lý, không sửa được.');
    const qty = Number(data.qty);
    if (!isoValid(String(data.date || ''))) throw new Error('Ngày giao dịch không hợp lệ.');
    if (!qty || qty <= 0) throw new Error('Số lượng phải lớn hơn 0.');
    if (qty !== Math.floor(qty)) throw new Error('Số lượng phải là số nguyên.');
    if (!String(data.loc || '').trim()) throw new Error('Vui lòng chọn địa điểm.');
    if (q.type === 'Export' && q.assetCode && qty > stockOf(q.assetCode)) throw new Error('Vượt tồn kho, chỉ còn ' + stockOf(q.assetCode) + ' ' + q.unit + '.');
    let changed = 0;
    const put = (k, v) => { if (String(q[k]) !== String(v)) { q[k] = v; changed++; } };
    put('date', data.date); put('quantity', qty); put('location', data.loc);
    if (q.type === 'Import') {
      if (!String(data.poNo || '').trim()) throw new Error('Vui lòng nhập PO No.');
      put('boxCount', Number(data.boxCount) || 0); put('poNo', data.poNo); put('invoiceNo', data.invoiceNo); put('supplier', data.supplier); put('purchasePrice', Number(data.price));
    }
    return changed ? { ok: true, changed, message: 'Đã cập nhật yêu cầu ' + q.requestId + ' (' + changed + ' thay đổi). Quản trị viên đã được thông báo.' }
                   : { ok: true, changed: 0, message: 'Không có thông tin nào thay đổi.' };
  });
  def('reqDelete', (id) => {
    const q = reqById(id);
    if (!q || (ROLE !== 'admin' && q.userEmail !== ME.email)) throw new Error('Không tìm thấy yêu cầu ' + id);
    if (q.status !== 'PENDING') throw new Error('Yêu cầu này đã được xử lý, không xóa được.');
    requests.splice(requests.indexOf(q), 1);
    return { ok: true, message: 'Đã xoá yêu cầu ' + id + '.' };
  });

  /* ---------- users ---------- */
  const userRow = (u) => ({ rowIndex: u.rowIndex, email: u.email, username: u.username, cc: u.cc, teamCode: u.teamCode, department: u.department, role: u.role, isSelf: u.email === ME.email });
  def('getUsers', () => ({ ok: true, rows: users.map(userRow) }), 'admin');
  def('addUser', (d) => {
    d = d || {};
    const email = String(d.email || '').trim().toLowerCase(), username = String(d.username || '').trim(), cc = String(d.cc || '').trim().toUpperCase(), role = String(d.role || 'member');
    if (!email || email.indexOf('@') === -1) throw new Error('Email không hợp lệ.');
    if (!username) throw new Error('Vui lòng nhập tên đăng nhập.');
    if (!cc) throw new Error('Vui lòng nhập Cost Centre.');
    if (role !== 'admin' && role !== 'member') throw new Error('Vai trò không hợp lệ.');
    const ccFull = Object.keys(DEPTS).find((k) => k === cc || k.endsWith('-' + cc));
    if (!ccFull) throw new Error('Cost Centre "' + d.cc + '" không có trong sheet Department.');
    if (users.some((u) => u.email === email)) throw new Error('Email ' + email + ' đã tồn tại trong hệ thống.');
    if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) throw new Error('Tên "' + username + '" đã có người dùng. Hãy thêm họ hoặc chữ lót để phân biệt.');
    users.push({ rowIndex: users.length + 2, email, username, cc, ccFull, teamCode: teamOfCc(ccFull), department: DEPTS[ccFull].dept, role });
    return { ok: true, message: 'Đã thêm người dùng ' + email + '.' };
  }, 'admin');
  def('updateUser', (row, d, expectEmail) => {
    const u = users.find((x) => x.rowIndex === Number(row));
    if (!u || !expectEmail || u.email.toLowerCase() !== String(expectEmail).toLowerCase()) throw new Error('Danh sách người dùng đã thay đổi (có admin khác vừa thao tác). Hãy tải lại danh sách rồi thao tác lại.');
    if (u.role === 'pending') throw new Error('Người này đang chờ duyệt đăng ký. Hãy Duyệt hoặc Từ chối ở mục đăng ký chờ duyệt.');
    const role = String(d.role || 'member');
    if (u.role === 'admin' && role !== 'admin' && users.filter((x) => x.role === 'admin').length < 2) throw new Error('Không thể hạ quyền admin cuối cùng.');
    const cc = String(d.cc || '').trim().toUpperCase();
    const ccFull = Object.keys(DEPTS).find((k) => k === cc || k.endsWith('-' + cc));
    if (!ccFull) throw new Error('Cost Centre "' + d.cc + '" không có trong sheet Department.');
    Object.assign(u, { username: String(d.username || u.username).trim(), cc, ccFull, teamCode: teamOfCc(ccFull), department: DEPTS[ccFull].dept, role });
    return { ok: true, message: 'Đã cập nhật ' + u.email + '.' };
  }, 'admin');
  def('deleteUser', (row, reason, expectEmail) => {
    const u = users.find((x) => x.rowIndex === Number(row));
    if (!u || !expectEmail || u.email.toLowerCase() !== String(expectEmail).toLowerCase()) throw new Error('Danh sách người dùng đã thay đổi (có admin khác vừa thao tác). Hãy tải lại danh sách rồi thao tác lại.');
    if (u.email === ME.email) throw new Error('Bạn không thể tự xóa chính mình.');
    if (u.role === 'admin' && users.filter((x) => x.role === 'admin').length < 2) throw new Error('Không thể xóa admin cuối cùng.');
    users.splice(users.indexOf(u), 1);
    return { ok: true, message: 'Đã xóa ' + u.email + '.' };
  }, 'admin');
  // status: 'active' (default) | 'register' | 'pending' - mock.js sets __server.__regStatus for ?boot=register|pending
  def('getRegisterInfo', () => {
    const st = CTX.__regStatus || 'active', url = 'https://script.google.com/macros/s/MOCK/exec';
    if (st === 'register') return { ok: true, status: 'register', email: 'new.user@example.com', url,
      departments: Object.keys(DEPTS).map((cc) => ({ name: DEPTS[cc].dept, cc, team: DEPTS[cc].team })) };
    if (st === 'pending') return { ok: true, status: 'pending', email: 'new.user@example.com', username: 'New User', cc: 'OPS-COA', teamCode: 'OPSCOA', department: DEPTS['OPS-COA'].dept, url };
    return { ok: true, status: 'active', url };
  });
  def('registerSelf', () => ({ ok: true, message: 'Đã gửi đăng ký. Vui lòng chờ quản trị viên duyệt.' }));
  def('getPendingUsers', () => ({ ok: true, rows: clone(pendingUsers) }), 'admin');
  def('approveUser', (row, email) => {
    const p = pendingUsers.find((x) => x.rowIndex === Number(row) && x.email === email);
    if (!p) throw new Error('Danh sách đăng ký đã thay đổi. Hãy tải lại.');
    pendingUsers.splice(pendingUsers.indexOf(p), 1);
    const u = users.find((x) => x.email === email); if (u) u.role = 'member';
    return { ok: true, message: 'Đã duyệt ' + email + '.' };
  }, 'admin');
  def('rejectUser', (row, email) => {
    const p = pendingUsers.find((x) => x.rowIndex === Number(row) && x.email === email);
    if (!p) throw new Error('Danh sách đăng ký đã thay đổi. Hãy tải lại.');
    pendingUsers.splice(pendingUsers.indexOf(p), 1);
    users.splice(users.findIndex((x) => x.email === email), 1);
    return { ok: true, message: 'Đã từ chối ' + email + '.' };
  }, 'admin');

  /* ---------- tickets (Phiếu kho) ---------- */
  def('getTickets', (f) => {
    f = f || {};
    const from = String(f.from || '').trim(), to = String(f.to || from).trim(), type = String(f.type || '').trim(), cc = String(f.cc || '').trim().toUpperCase();
    if (!from) throw new Error('Vui lòng chọn ngày bắt đầu.');
    const groups = {};
    rows.forEach((r) => {
      if (!r.date || r.date < from || r.date > to) return;
      if (type && r.type !== type) return;
      if (cc && r.cc.toUpperCase() !== cc) return;
      const pic = r.pic || '(không rõ)', key = r.date + '|' + pic.toLowerCase() + '|' + r.type;
      const g = groups[key] || (groups[key] = { ticketId: (r.type === 'Import' ? 'PN' : 'PX') + '_' + r.date.replace(/-/g, '') + '_' + (alnum(r.cc) || 'NA') + '_' + (alnum(pic) || 'NA'),
        date: r.date, dateVn: vn(r.date), pic, cc: r.cc, dept: r.dept, type: r.type, items: [], totalQty: 0, totalBox: 0, totalValue: 0, locs: {} });
      g.items.push(clone(r)); g.totalQty += r.qty; g.totalBox += r.boxCount; g.totalValue += r.purchasePrice * r.qty; if (r.loc) g.locs[r.loc] = true;
    });
    const list = Object.keys(groups).map((k) => {
      const g = groups[k];
      g.items.sort((a, b) => a.no - b.no); g.itemCount = g.items.length; g.locList = Object.keys(g.locs).join(', '); delete g.locs; return g;
    }).sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.pic.localeCompare(b.pic, 'vi')));
    return { ok: true, rows: list, range: { from, to }, orgName: 'CÔNG TY TNHH GRAB', orgAddress: 'Tầng 15, 1060 Nguyễn Văn Linh, Phường Tân Hưng, Thành phố Hồ Chí Minh' };
  }, 'admin');

  /* ---------- stocktake ---------- */
  def('stocktakeMeta', () => ({ ok: true, teams: ['HRADM', 'MKTBRAND', 'OPSCOA', 'WHSEC'], categories: clone(CONFIG.categories), locations: clone(CONFIG.locations) }), 'admin');
  def('stocktakeList', () => ({ ok: true, sessions: stk.slice(-30).reverse().map((s) => {
    const m = stkMeta(s); if (s.status === 'COUNTING') m.summary = stkSummary(s.lines); return m; }) }), 'admin');
  def('stocktakeGet', (id) => {
    const s = stkFind(id), meta = stkMeta(s), lines = clone(s.lines);
    if (s.status === 'COUNTING') lines.forEach((l) => { if (l.counted === null) return; l.now = stockOf(l.code); l.moved = l.now !== l.sysAtCount; });
    meta.summary = stkSummary(lines);
    return { ok: true, session: meta, lines };
  }, 'admin');
  def('stocktakeCreate', (o) => {
    o = o || {};
    const team = String(o.team || 'ALL').trim().toUpperCase(), cat = String(o.cat || '').trim(), loc = String(o.loc || '').trim();
    const pickItems = items.filter((it) => {
      const st = stockOf(it.code);
      if (st === 0) return false;
      if (team !== 'ALL' && teamOfCc(it.cc) !== team) return false;
      if (cat && it.cat !== cat) return false;
      if (loc && it.loc !== loc) return false;
      return true;
    });
    if (!pickItems.length) throw new Error('Không có mã hàng nào khớp phạm vi đã chọn.');
    const busy = {}; stk.filter((s) => s.status === 'COUNTING').forEach((s) => s.lines.forEach((l) => { busy[l.code] = s.id; }));
    const clash = pickItems.filter((it) => busy[it.code]);
    if (clash.length) throw new Error(clash.length + ' mã đang nằm trong đợt kiểm kê khác chưa đóng (vd ' + clash[0].code + ' ở ' + busy[clash[0].code] + '). Xác nhận hoặc huỷ đợt đó trước.');
    pickItems.sort((a, b) => ((a.bin || '\uffff') < (b.bin || '\uffff') ? -1 : 1));
    const n = stk.filter((s) => s.id.indexOf(stkId(0, 1).slice(0, -2)) === 0).length + 1;
    const s = { id: stkId(0, n), name: String(o.name || '').trim() || 'Kiểm kê ' + vn(isoAgo(0)), status: 'COUNTING', team, cat, loc, createdBy: ME.email,
                createdAt: ymdhm(new Date(NOW)), closedBy: '', closedAt: '', note: String(o.note || ''), decision: '', summary: null, lines: pickItems.map((it) => stkLine(it)) };
    stk.push(s);
    return { ok: true, id: s.id, items: s.lines.length, message: 'Đã tạo đợt ' + s.id + ' với ' + s.lines.length + ' mã hàng.' };
  }, 'admin');
  def('stocktakeSaveCounts', (id, entries) => {
    const s = stkFind(id);
    if (!entries || !entries.length) throw new Error('Không có số đếm nào để lưu.');
    if (s.status !== 'COUNTING') throw new Error('Đợt ' + s.id + ' đã đóng, không sửa số đếm được.');
    entries.forEach((e) => {
      const l = s.lines.find((x) => x.code === String(e.code || '').trim());
      if (!l) throw new Error('Mã ' + e.code + ' không thuộc đợt ' + s.id + '.');
      const qs = e.qty === null || e.qty === undefined ? '' : String(e.qty).trim();
      if (qs === '') { Object.assign(l, { counted: null, countedBy: '', countedAt: '', status: 'PENDING' }); }
      else {
        const q = Number(qs);
        if (!isFinite(q) || q < 0 || q !== Math.floor(q)) throw new Error('Số đếm của ' + l.code + ' phải là số nguyên không âm.');
        if (!(l.status === 'COUNTED' && l.counted === q)) Object.assign(l, { counted: q, sysAtCount: stockOf(l.code), countedBy: ME.username, countedAt: ymdhm(new Date(NOW)), status: 'COUNTED' });
      }
      if (e.note !== undefined) l.note = String(e.note || '').trim();
      stkRecalc(l);
    });
    return { ok: true, saved: entries.length, message: 'Đã lưu ' + entries.length + ' dòng.' };
  }, 'admin');
  def('stocktakeConfirm', (id, opts) => {
    opts = opts || {};
    const s = stkFind(id);
    if (s.status !== 'COUNTING') throw new Error('Đợt này đã đóng.');
    const counted = s.lines.filter((l) => l.status === 'COUNTED'), pend = s.lines.length - counted.length;
    if (!counted.length) throw new Error('Chưa nhập số đếm nào.');
    if (pend && !opts.allowPartial) throw new Error('Còn ' + pend + ' mã chưa nhập số đếm. Nhập nốt hoặc chọn xác nhận một phần.');
    const diff = counted.filter((l) => l.variance !== 0);
    const chosen = opts.adjust === 'ALL' ? diff : Array.isArray(opts.adjust) ? diff.filter((l) => opts.adjust.indexOf(l.code) !== -1) : [];
    const bad = chosen.filter((l) => l.variance < 0 && stockOf(l.code) + l.variance < 0).map((l) => l.code + ' (tồn hiện tại ' + stockOf(l.code) + ', cần trừ ' + (-l.variance) + ')');
    if (bad.length) throw new Error('Điều chỉnh sẽ làm tồn âm: ' + bad.slice(0, 3).join('; ') + '. Kiểm tra lại số đếm hoặc bỏ chọn dòng đó.');
    chosen.forEach((l) => {
      const b = baseOf(l.code), up = l.variance > 0;
      const r = addTx({ code: l.code, type: up ? 'Import' : 'Export', dept: b.dept, cc: b.cc, pic: ME.username, cat: b.cat, sub: b.sub, name: b.name, qty: Math.abs(l.variance), unit: b.unit,
                        date: isoAgo(0), loc: b.loc, event: b.event, variant: b.variant, poNo: 'KK:' + s.id, invoiceNo: 'KIEM-KE', supplier: 'Kiểm kê', purchasePrice: l.price, bin: b.bin });
      if (!up) consumeFifo(l.code, -l.variance, isoAgo(0), ME.username);
      Object.assign(l, { status: 'ADJUSTED', adjQty: l.variance, adjTxRow: r.rowIndex });
    });
    diff.forEach((l) => { if (chosen.indexOf(l) === -1) l.status = 'KEPT'; });
    const decision = !diff.length ? 'MATCHED' : chosen.length === diff.length ? 'ADJUSTED' : chosen.length ? 'PARTIAL' : 'KEPT';
    Object.assign(s, { status: 'CLOSED', closedBy: ME.email, closedAt: ymdhm(new Date(NOW)), decision, summary: stkSummary(s.lines), note: s.note + (opts.note ? ' [' + opts.note + ']' : '') });
    return { ok: true, adjusted: chosen.length, kept: diff.length - chosen.length, decision, summary: s.summary,
             message: decision === 'MATCHED' ? 'Tất cả khớp, không cần hiệu chỉnh. Đã đóng đợt.' : chosen.length ? 'Đã hiệu chỉnh ' + chosen.length + ' mã' + (diff.length - chosen.length ? ', giữ nguyên ' + (diff.length - chosen.length) + ' mã' : '') + '. Đã đóng đợt.' : 'Không hiệu chỉnh. Đã lưu kết quả và đóng đợt.' };
  }, 'admin');
  def('stocktakeCancel', (id, reason) => {
    const s = stkFind(id);
    if (s.status !== 'COUNTING') throw new Error('Đợt đã đóng, không huỷ được.');
    Object.assign(s, { status: 'CANCELLED', closedBy: ME.email, closedAt: ymdhm(new Date(NOW)), note: s.note + (reason ? ' [Huỷ: ' + reason + ']' : '') });
    return { ok: true, message: 'Đã huỷ đợt ' + s.id + '.' };
  }, 'admin');
  def('stocktakeDelete', (id) => {
    const s = stkFind(id);
    const adj = s.lines.filter((l) => l.status === 'ADJUSTED').length;
    if (adj) throw new Error('Không xóa được: đợt này đã ghi ' + adj + ' dòng điều chỉnh vào sổ cái. Hãy xóa các giao dịch điều chỉnh (PO "KK:' + s.id + '") ở Lịch sử trước.');
    stk.splice(stk.indexOf(s), 1);
    return { ok: true, message: 'Đã xóa đợt ' + s.id + '.' };
  }, 'admin');

  /* ---------- reports ---------- */
  def('reportNxt', (p) => {
    p = p || {};
    const isoOk = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '').trim()) ? String(s).trim() : '');
    const to = isoOk(p.to) || isoAgo(0), from = isoOk(p.from) || (to.slice(0, 8) + '01'), cat = String(p.cat || '').trim();
    if (from > to) throw new Error('"Từ ngày" phải trước hoặc bằng "Đến ngày".');
    const map = {};
    rows.forEach((r) => {
      if (!visibleRow(r) || !r.date || r.date > to || (cat && r.cat !== cat)) return;
      const m = map[r.code] || (map[r.code] = { code: r.code, name: r.name, variant: r.variant, cat: r.cat, sub: r.sub, unit: r.unit, cc: r.cc, opening: 0, imp: 0, exp: 0, boxOpening: 0, boxIn: 0, boxOut: 0 });
      const isImp = r.type === 'Import';
      if (r.date < from) m.opening += isImp ? r.qty : -r.qty; else if (isImp) m.imp += r.qty; else m.exp += r.qty;
    });
    boxes.forEach((b) => {
      const m = map[b.code]; if (!m || b.date > to || !b.date) return;
      let acc = 0, emptied = '';
      b.moves.slice().sort((x, y) => (x.date < y.date ? -1 : 1)).forEach((mv) => { acc += mv.qty; if (!emptied && acc >= b.qtyIn) emptied = mv.date; });
      if (b.date < from && (!emptied || emptied >= from)) m.boxOpening++;
      if (b.date >= from) m.boxIn++;
      if (emptied && emptied >= from && emptied <= to) m.boxOut++;
    });
    const list = [], tot = { opening: 0, imp: 0, exp: 0, closing: 0, boxOpening: 0, boxIn: 0, boxOut: 0, boxClosing: 0 };
    Object.keys(map).sort().forEach((k) => {
      const m = map[k];
      if (!m.opening && !m.imp && !m.exp && !m.boxOpening && !m.boxIn && !m.boxOut) return;
      m.closing = m.opening + m.imp - m.exp; m.boxClosing = m.boxOpening + m.boxIn - m.boxOut;
      list.push(m);
      Object.keys(tot).forEach((t) => { tot[t] += m[t]; });
    });
    const max = Number(CTX.__reportMax) || 5000;        // tests: __setServer({__reportMax: 20}) forces truncated:true
    return { ok: true, from, to, cat, total: list.length, truncated: list.length > max, rows: list.slice(0, max), totals: tot };
  });

  /* ---------- SKU (admin) ---------- */
  def('skuMeta', () => ({ ok: true, teams: ['HRADM', 'MKTBRAND', 'OPSCOA', 'WHSEC'],
    people: users.filter((u) => u.role !== 'pending').map((u) => ({ email: u.email, username: u.username, team: u.teamCode, role: u.role })) }), 'admin');
  def('skuList', () => ({ ok: true, rows: skus.map((s) => Object.assign({}, s, { stock: stockOf(s.sku) })) }), 'admin');
  def('skuCreate', (d) => {
    d = d || {};
    const cat = String(d.cat || '').trim(), sub = String(d.sub || '').trim(), name = String(d.name || '').trim(), event = String(d.event || '').trim() || 'N/A', unit = String(d.unit || '').trim();
    let variant = String(d.variant || '').trim();
    if (!cat || !sub || !name) throw new Error('Cần nhóm hàng, phân nhóm và tên hàng.');
    if (CONFIG.units.indexOf(unit) === -1) throw new Error('Đơn vị phải là Each, Box hoặc Bag.');
    if (!(CONFIG.tree[cat] || []).includes(sub)) throw new Error('Nhóm hàng / phân nhóm "' + cat + ' / ' + sub + '" không có trong danh mục.');
    if (needsVariant(sub)) { if (!variant) throw new Error('Phân nhóm "' + sub + '" bắt buộc nhập biến thể.'); } else variant = '';
    const team = String(d.team || '').trim().toUpperCase();
    if (['HRADM', 'MKTBRAND', 'OPSCOA', 'WHSEC'].indexOf(team) === -1) throw new Error('Bộ phận "' + d.team + '" không có trong sheet Department (cột Team Code).');
    const a = resolveSku(team, { cat, sub, name, variant, event, unit }, String(d.pic || '').toLowerCase());
    return { ok: true, sku: a.sku, existing: a.existing, message: a.existing ? 'SKU đã có: ' + a.sku + '.' : 'Đã tạo SKU ' + a.sku + '.' };
  }, 'admin');
  def('skuUpdate', (code, patch) => {
    patch = patch || {};
    const s = skuByCode(String(code || '').trim());
    if (!s) throw new Error('Không tìm thấy SKU ' + code + '.');
    if (patch.team !== undefined) s.team = String(patch.team).toUpperCase();
    if (patch.pic !== undefined) s.pic = String(patch.pic).toLowerCase();
    if (patch.active !== undefined) s.active = !!patch.active;
    if (patch.note !== undefined) s.note = String(patch.note || '');
    return { ok: true, message: 'Đã cập nhật ' + s.sku + '.' };
  }, 'admin');

  /* ---------- admin tools: soft-deleted, processed requests, backups, mail ---------- */
  def('listDeletedTransactions', (limit) => ({ ok: true, rows: clone(deleted.slice(-(Number(limit) || 100)).reverse()) }), 'admin');
  def('restoreTransaction', (archiveRow) => {
    const d = deleted.find((x) => x.archiveRow === Number(archiveRow));
    if (!d) throw new Error('Dữ liệu đã thay đổi. Hãy tải lại danh sách.');
    const b = baseOf(d.code) || {};
    addTx({ code: d.code, type: d.type, dept: b.dept || '', cc: d.cc, pic: ME.username, cat: b.cat || '', sub: b.sub || '', name: d.name, qty: d.qty, unit: d.unit, date: d.date, loc: d.loc,
            event: b.event || 'N/A', variant: d.variant, poNo: b.poNo || '', invoiceNo: b.invoiceNo || '', supplier: b.supplier || '', purchasePrice: b.purchasePrice || 0, bin: b.bin || '' });
    deleted.splice(deleted.indexOf(d), 1);
    return { ok: true, message: 'Đã khôi phục ' + d.type + ' ' + d.qty + ' của ' + d.code + '.' };
  }, 'admin');
  def('getProcessedRequests', (limit) => ({ ok: true, rows: requests.filter((r) => r.status !== 'PENDING').map((r) => ({ requestId: r.requestId, status: r.status, user: r.user, cc: r.cc,
    type: r.type, name: r.name + (r.variant ? ' · ' + r.variant : ''), quantity: r.quantity, unit: r.unit, decisionBy: r.decisionBy, note: r.decisionNote })).reverse().slice(0, Number(limit) || 100) }), 'admin');
  def('adminDeleteRequest', (id, reason) => {
    const q = reqById(id);
    if (!q) throw new Error('Không tìm thấy yêu cầu ' + id);
    if (String(reason || '').trim().length < 3) throw new Error('Vui lòng nhập lý do xóa (ít nhất 3 ký tự).');
    requests.splice(requests.indexOf(q), 1);
    return { ok: true, message: 'Đã xóa yêu cầu ' + id + '.' };
  }, 'admin');
  def('backupStatus', () => ({ ok: true, auto: true, autoError: '', hour: 2, keep: 10, everyMonths: 3, staleAfterHours: (90 + 15) * 24, folderUrl: 'https://example.invalid/backups',
    total: backups.length, items: clone(backups) }), 'admin');
  def('backupRunNow', () => { backups.unshift({ id: 'bk-new' + backups.length, name: 'SEC WH backup ' + isoAgo(0), url: 'https://example.invalid/backup/new', at: ymdhm(new Date(NOW)), ageHours: 0 });
    return { ok: true, name: backups[0].name, url: backups[0].url, trashed: 0, message: 'Đã tạo bản sao lưu ' + backups[0].name + '.' }; }, 'admin');
  def('backupDelete', (id) => { const i = backups.findIndex((b) => b.id === id); if (i < 0) throw new Error('Không tìm thấy bản sao lưu.');
    const n = backups.splice(i, 1)[0].name; return { ok: true, message: 'Đã xóa bản sao lưu ' + n + ' (vào thùng rác Drive).' }; }, 'admin');
  def('backupSetAuto', (on) => ({ ok: true, auto: !!on, message: on ? 'Đã bật sao lưu tự động.' : 'Đã tắt sao lưu tự động.' }), 'admin');
  def('getMyMailPref', () => ({ ok: true, on: mailOn, email: ME.email, mailEnabled: true }), 'admin');
  def('setMyMailPref', (want) => { mailOn = !!want; return { ok: true, on: mailOn, message: mailOn ? 'Đã bật nhận email yêu cầu mới.' : 'Đã tắt nhận email yêu cầu mới.' }; }, 'admin');

  /* ---------- photos (Drive is mocked: nothing is uploaded) ---------- */
  def('photoList', (kind, key) => ({ ok: true, rows: String(key || '').trim() ? clone(photos.filter((p) => p.refKey === String(key).trim() || p.code === String(key).trim())) : [] }));
  def('photoSave', (p) => {
    p = p || {};
    const ph = { rowIndex: photos.length + 2, photoId: 'PH-' + pad(photos.length + 1, 4), refType: String(p.refType || 'DRAFT'), refKey: String(p.refKey || ''), code: String(p.code || ''),
      itemName: String(p.itemName || ''), fileId: 'file-' + (photos.length + 1), url: 'https://example.invalid/photo/' + (photos.length + 1), fileName: String(p.fileName || 'photo.jpg'),
      folder: isoAgo(0) + ' / ' + (p.code || '_Cho duyet'), size: 120000, thumb: svgThumb('Ảnh mới (mock)', '#862e9c'), by: ME.email, at: tsOf(new Date(NOW)), canDelete: true };
    photos.push(ph);
    return { ok: true, photo: clone(ph) };
  });
  def('photoDelete', (id) => { const i = photos.findIndex((p) => p.photoId === id); if (i < 0) throw new Error('Không tìm thấy ảnh.'); photos.splice(i, 1); return { ok: true }; });
  def('photoAttach', () => ({ ok: true, attached: 0 }));

  // NOT defined on purpose (mock default {ok:true,message:'(mock)'}): popsGetUsers (separate POPS page, not part of Index.html).

  /* ============================== go ============================== */
  init();
  const data = {
    config: CONFIG, get session() { return ME; }, get users() { return users; }, get items() { return items; }, get skus() { return skus; },
    get rows() { return rows; }, get boxes() { return boxes; }, get requests() { return requests; }, get notifications() { return notis; },
    get stocktakes() { return stk; }, get photos() { return photos; }, get deleted() { return deleted; }, get backups() { return backups; },
    get lean() { return computeLean(); }
  };
  return { data, handlers: H, reset: init, role: ROLE, helpers: { stockOf, isoAgo, addTx, rows: () => rows } };
}

// Node-side snapshot for people who want plain fixture objects (admin view, fixed clock). Not used by the browser.
export const fixtures = createFixtures({ role: 'admin', now: Date.UTC(2026, 9, 29, 3, 0, 0) });
