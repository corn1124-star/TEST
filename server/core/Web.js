/* ═══════════ NHÓM 1: HẠ TẦNG ═══════════ */

/**
 * Khung HTML của app (~400 KB) không phụ thuộc người dùng, nên dựng MỘT lần rồi lưu đệm.
 * Khoá có APP_VERSION + APP_BUILD_ID: phát hành bản mới là tự dựng lại.
 */
function renderIndex_() {
  const key = 'idx_' + APP_VERSION + '_' + APP_BUILD_ID;
  const hit = cacheGetStr_(key);
  if (hit) return hit;

  const html = HtmlService.createTemplateFromFile('client/Index').evaluate().getContent();
  cachePutStr_(key, html, 21600);
  return html;
}

/** Các trang của app mở được riêng khi nhúng vào Google Sites: ?page=kho, ?page=report ... */
const EMBED_PAGES = ['home', 'kho', 'history', 'stocktake', 'report', 'me', 'admin', 'sku', 'ticket'];

/**
 * Chèn cờ chế độ nhúng vào khung HTML đã lưu đệm (khung dùng chung mọi người nên không đưa tham số vào cache).
 * Client đọc window.SECWH_EMBED (client/app/Embed.html): ẩn menu chính, mở thẳng trang được chọn.
 */
function withEmbedFlag_(html, page) {
  const flag = { page: page, url: ScriptApp.getService().getUrl() };
  const js = '<script>window.SECWH_EMBED=' + JSON.stringify(flag).replace(/</g, '\\u003c') + ';</script>';
  return html.replace('</head>', js + '</head>');
}

function doGet(e) {
  const page = String((e && e.parameter && e.parameter.page) || '').toLowerCase();

  // ?page=pops -> trang quản lý riêng của POPS (Pops.gs / Popshtml.html)
  if (page === 'pops') return popsDoGet();

  // ?page=<trang của app> -> chế độ nhúng Google Sites
  const html = EMBED_PAGES.indexOf(page) !== -1 ? withEmbedFlag_(renderIndex_(), page) : renderIndex_();

  return HtmlService.createHtmlOutput(html)
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(f) { return HtmlService.createHtmlOutputFromFile(f).getContent(); }
