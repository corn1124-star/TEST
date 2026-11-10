# SIM: ngày yêu cầu / ngày nhận + xuất báo cáo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm hai ô ngày (ngày tạo yêu cầu, ngày nhận SIM) vào SIM, và nút xuất báo cáo SIM (CSV/XLSX, lọc theo khoảng ngày) cho người xử lý thanh toán cước.

**Architecture:** Sheet `Sim` thêm 2 cột cuối (không đụng dữ liệu cũ), lưu ngày dạng chữ `yyyy-MM-dd`. Trang SIM hiện hai ngày trong form + bảng + sắp xếp. Báo cáo dựng hoàn toàn ở trình duyệt từ `SM.rows` đã tải (không gọi server thêm, không xin thêm quyền); XLSX do một bộ ghi zip/XML nhỏ tự viết, không dùng thư viện ngoài.

**Tech Stack:** Google Apps Script (V8, HtmlService), JS thuần ở client, test bằng QA harness `Downloads\SEC WH QA` (Node 22, Chrome headless).

**Spec:** Chốt trong chat ngày 2026-11-10 (không có file spec riêng). Tóm tắt: xem "Global Constraints".

**Không phải git repo:** thư mục này không có git, nên kế hoạch không có bước commit. Mốc an toàn là `clasp push`/`clasp deploy` ở Task 6, và các bước chạy test.

## Global Constraints

- Quyền: chỉ team POPS + admin vào được trang SIM; kiểm ở server (`simAccess_`) — không đổi.
- "Ai nhận" = trường **Người liên hệ** có sẵn (`contactName`); **không** thêm trường người mới.
- Hai ngày mới: "Ngày tạo yêu cầu" (`requestedOn`) và "Ngày nhận SIM" (`receivedOn`); cả hai **tự chọn, không bắt buộc**; SIM cũ để trống.
- Lưu trong sheet: chuỗi `yyyy-MM-dd` (ô định dạng chữ `@`), cột 17 và 18 (chỉ số 16, 17), header `Requested On`, `Received On`. Hiển thị: `dd/MM/yyyy`.
- Báo cáo có **đúng 5 cột theo thứ tự**: Ngày tạo yêu cầu · Ngày nhận SIM · Người nhận · Người giữ · Số thuê bao.
- Báo cáo: chọn "lọc theo" (ngày tạo yêu cầu **hoặc** ngày nhận SIM) + từ ngày – đến ngày (đều tuỳ chọn, bao gồm hai đầu); xếp mới nhất lên đầu theo ngày đã chọn; SIM đã xoá không đưa vào; SIM không có ngày đã chọn thì không lọt khi có chặn từ/đến.
- Định dạng: CSV và XLSX (không làm PDF). Tiếng Việt có dấu đúng; số thuê bao giữ số 0 đầu khi mở bằng Excel.
- Không thêm thư viện ngoài/CDN; không xin thêm OAuth scope; không đổi `appsscript.json`.
- Giao diện có đủ chuỗi `I18N.vi` và `I18N.en`; dùng class/biến CSS đang có (Theme Grab).
- Chạy test QA từng suite một (chạy song song gây flaky): `export PATH="$PATH:/c/Users/thanh.phan/AppData/Local/Programs/node-v22.14.0-win-x64"; cd "/c/Users/thanh.phan/Downloads/SEC WH QA"`.

## Review Focus

1. **Số 0 đầu của số thuê bao** mở bằng Excel: CSV ghi dạng `0902 343 108` (giữ chữ), XLSX ghi ô chữ — test ở Task 3 và 4.
2. **Ngày do người sửa tay trong Sheet** (ô thành kiểu ngày thật / `Date`) vẫn đọc ra `yyyy-MM-dd`, và lọc khoảng ngày không lệch 1 ngày do múi giờ (so sánh chuỗi, không dùng `new Date('yyyy-MM-dd')`) — Task 1 và 4.
3. **Kết quả rỗng / khoảng ngày ngược** (từ > đến): nút Tải về bị khoá kèm thông báo, không tải file rỗng — Task 5.
4. **Sheet `Sim` đang chạy có 16 cột**: header hai cột mới phải được ghi, dữ liệu cũ không đổi, lần sửa SIM cũ không làm mất cột khác — Task 1.
5. **Tên có dấu phẩy/nháy/ký tự `= + - @` đầu, hoặc `& < >`** trong CSV và XML của XLSX không làm hỏng file hay chạy thành công thức — Task 3 và 4.

---

### Task 1: Server — hai cột ngày trong `Sims.js`

**Files:**
- Modify: `server/sims/Sims.js` (hằng `SIM`, `SIM_COLS`, `SIM_HEADERS`; `simSheet_`, `simRows_`, `simSave`; thêm `simNormDate_`, `simTextDates_`)
- Test: `Downloads\SEC WH QA\test-sim-server.mjs` (mới; mô phỏng theo `test-server-mail.mjs`: nạp `server/sims/Sims.js` bằng `vm` với sheet giả trong bộ nhớ)

**Interfaces:**
- Produces: `SIM.REQUESTED_ON = 16`, `SIM.RECEIVED_ON = 17`, `SIM_COLS = 18`; `simNormDate_(raw: any) -> string` (`''` nếu rỗng/không hợp lệ, ngược lại `'yyyy-MM-dd'`; nhận `Date` thì format theo `sheetTz_()`; ngày không có thật như `2026-02-30` là không hợp lệ); mỗi dòng của `simRows_()`/`simList().rows` có thêm `requestedOn`, `receivedOn` (chuỗi `yyyy-MM-dd` hoặc `''`); `simSave(data)` nhận thêm `data.requestedOn`, `data.receivedOn`.

- [ ] **Step 1: Viết `test-sim-server.mjs` (chạy sẽ fail).** Sandbox cần: `Utilities.formatDate/getUuid`, `sheetTz_`, `ss_`, `ensureSheet_` (trả sheet giả có `getRange(r,c,nr,nc).getValues/setValues/setNumberFormat`, `getLastRow`, `getMaxColumns`), `auth_`, `popsIsAllowed_`, `skuPeople_`, `withLock_`, `log_`, `cell_` (bản thật: thêm `'` khi chuỗi bắt đầu `= + - @`). Các test (tên = nội dung assert):
  - `simNormDate_`: `'2026-11-05'`→`'2026-11-05'`; `''`/`null`→`''`; `'2026-02-30'`, `'05/11/2026'`, `'abc'`→`''`; `new Date(2026,10,5)`→`'2026-11-05'`.
  - tạo SIM với `requestedOn:'2026-11-03', receivedOn:'2026-11-05'` → hàng mới có đúng hai chuỗi đó ở chỉ số 16, 17 và `setNumberFormat('@')` đã gọi cho hai ô đó.
  - sửa SIM: đổi `receivedOn` thành `''` → ô được xoá; `requestedOn` giữ; các cột 0–15 khác (kể cả `Created At/By`) không đổi.
  - `requestedOn:'2026-02-30'` → `{ok:false}`, message chứa `Ngày không hợp lệ`, và sheet không bị ghi.
  - sheet cũ 16 cột (`getMaxColumns()=16`, header cột 17–18 trống, có 1 SIM): `simList()` trả `requestedOn:''`, `receivedOn:''`; sau `simSheet_()` header hai ô mới là `Requested On`, `Received On`, dữ liệu cũ nguyên vẹn.
  - ô ngày là `Date` (người sửa tay) → `simList()` trả `'yyyy-MM-dd'`.
- [ ] **Step 2: Chạy `node test-sim-server.mjs`** — Expected: FAIL (thiếu `simNormDate_`, v.v.).
- [ ] **Step 3: Cài đặt trong `Sims.js`.** Thêm 2 chỉ số/2 header, `SIM_COLS = 18`. `simSheet_()` gọi `ensureSheet_` rồi, nếu hai ô header 17–18 chưa đúng, ghi chúng (ensureSheet_ chỉ ghi header khi ô A1 sai nên sheet cũ sẽ không tự có). `simRows_` đọc hai cột qua `simNormDate_`. `simSave` chuẩn hoá hai ngày bằng `simNormDate_`; chuỗi không rỗng mà kết quả `''` thì `throw new Error('Ngày không hợp lệ: ' + raw)` — kiểm trước khi lấy khoá. Tạo mới: dòng 18 phần tử, gọi `simTextDates_(sh, at, 1)` trước khi ghi. Sửa: ghi riêng hai ô ngày bằng `setValues` ở cột 17–18 (sau `simTextDates_`), không động đến các cột còn lại.
- [ ] **Step 4: Chạy lại `node test-sim-server.mjs`** — Expected: tất cả PASS.

---

### Task 2: Client — hai ngày trong form, bảng và sắp xếp (`Sims.html`)

**Files:**
- Modify: `client/features/Sims.html` (I18N vi/en, `SIM_SORTS`, `SIM_HEAD`, `simRender`, `simFormOpen`, `simSave`, thêm `simShowDate`)
- Test: `Downloads\SEC WH QA\test-sim-ui.mjs` (mới; mẫu: `example-test.mjs`)

**Interfaces:**
- Consumes: `r.requestedOn`, `r.receivedOn` (Task 1); `simSave(data)` nhận `data.requestedOn`/`data.receivedOn`.
- Produces: `simShowDate(iso: string) -> string` (`'2026-11-05'`→`'05/11/2026'`, `''`→`''`); id ô form `simFRequested`, `simFReceived` (`<input type="date">`); khoá sắp xếp `requested`, `received`.

- [ ] **Step 1: Viết `test-sim-ui.mjs` (fail trước).** Mở `role=admin`, `eval("SESSION.canSim = true")`, `__setServer({ simList: () => ({ok:true, isAdmin:true, people:[…], rows:[3 SIM: một có cả hai ngày, một chỉ có ngày yêu cầu, một không có ngày]}), simSave: (d) => ({ok:true, message:'Đã lưu.'}) })`, `eval("goto('sim')")`. Assert:
  - `simShowDate('2026-11-05') === '05/11/2026'` và `simShowDate('') === ''`.
  - bảng có tiêu đề "Ngày tạo yêu cầu" và "Ngày nhận SIM"; ô có ngày hiển thị `05/11/2026`; ô trống hiển thị `—`.
  - sắp xếp theo `received` giảm dần: SIM có ngày nhận lên trước, SIM không có ngày luôn ở cuối (cả khi tăng dần).
  - mở form sửa: `#simFRequested`/`#simFReceived` là `type=date` và đã điền `2026-11-03`/`2026-11-05`; bấm Lưu → `page.calls('simSave')[0].args[0]` có `requestedOn:'2026-11-03'`, `receivedOn:'2026-11-05'`; xoá ô nhận rồi lưu → `receivedOn:''`.
  - viewport `M` (390px): `document.documentElement.scrollWidth <= innerWidth`, và `page.consoleErrors()` rỗng ở cả D và M.
- [ ] **Step 2: Chạy `node test-sim-ui.mjs`** — Expected: FAIL.
- [ ] **Step 3: Cài đặt.** Thêm chuỗi vi/en: `sim.c.requested` ("Ngày tạo yêu cầu"/"Request date"), `sim.c.received` ("Ngày nhận SIM"/"SIM received"), `sim.requested`, `sim.received`, và gợi ý form (để trống nếu chưa có). `SIM_SORTS` thêm `requested`, `received` (giá trị so sánh = chuỗi ISO). `SIM_HEAD` = `['phone','holder','contact','requested','received','note','by']`; cập nhật cả `emptyRow(...)` và chỉ số ô công cụ (đang cứng `tr.cells[5]` → dùng `SIM_HEAD.length`). Form: hai `<input type="date">` cùng hàng `grid`, đặt sau ô Người liên hệ. `simSave()` gửi thêm `requestedOn`, `receivedOn`.
- [ ] **Step 4: Chạy lại `node test-sim-ui.mjs`** — Expected: PASS.

---

### Task 3: Bộ ghi XLSX và `downloadBlob` (không phụ thuộc SIM)

**Files:**
- Create: `client/app/Xlsx.html` (khối `<script>`, theo kiểu các file trong `client/app/`)
- Modify: `client/app/Core.html:274` (`downloadCsv` gọi lại hàm mới `downloadBlob`); `client/Index.html` (thêm `<?!= include('client/app/Xlsx'); ?>` gần dòng 951)
- Test: `Downloads\SEC WH QA\test-xlsx.mjs` (mới)

**Interfaces:**
- Produces: `xlsxBuild(sheetName: string, headers: string[], rows: string[][]) -> Uint8Array` (mọi ô là chữ `inlineStr`; hàng tiêu đề in đậm; tên sheet cắt ≤31 ký tự và bỏ `[]:*?/\`); `downloadBlob(filename: string, blob: Blob) -> void` (hành vi như phần tạo thẻ `<a>` hiện có của `downloadCsv`).

- [ ] **Step 1: Viết `test-xlsx.mjs` (fail trước).** Mở app, gọi `xlsxBuild('SIM', ['Số thuê bao','Người giữ'], [['0902343108','Nguyễn Văn "A", Ltd & <Co>'], ['0911000222','=HYPERLINK("x")']])` rồi `Array.from(bytes)` trả về Node. Trong Node, tự đọc zip (bản ghi cục bộ + central directory; mục dạng *stored*) và assert: 5 mục `[Content_Types].xml`, `_rels/.rels`, `xl/workbook.xml`, `xl/_rels/workbook.xml.rels`, `xl/worksheets/sheet1.xml` cộng `xl/styles.xml`; CRC32 từng mục khớp `zlib.crc32` của Node; `sheet1.xml` chứa `0902343108` trong ô `t="inlineStr"` (không có số 0 bị mất), `Nguyễn Văn "A", Ltd &amp; &lt;Co&gt;` đúng UTF-8, và `=HYPERLINK("x")` nằm trong ô chữ chứ không phải `<f>`; tên sheet `'a/b*c'.repeat(10)` thành tên hợp lệ ≤31 ký tự. Nếu máy có Python với `openpyxl`, thêm bước tuỳ chọn mở file bằng `openpyxl.load_workbook` (có thì chạy, không có thì bỏ qua và ghi rõ trong báo cáo).
- [ ] **Step 2: Chạy `node test-xlsx.mjs`** — Expected: FAIL (`xlsxBuild` chưa có).
- [ ] **Step 3: Cài đặt `xlsxBuild`** — gói zip kiểu *stored* (không nén) tự viết, `crc32` bảng tra, `TextEncoder` UTF-8, escape XML (`& < > "` và bỏ ký tự điều khiển không hợp lệ trong XML 1.0). Thêm `downloadBlob`, đổi `downloadCsv` dùng nó (giữ BOM `﻿`).
- [ ] **Step 4: Chạy `node test-xlsx.mjs`**, rồi `node smoke.mjs` (đảm bảo `downloadCsv` không hỏng) — Expected: PASS và `92 PASS`.

---

### Task 4: Dựng nội dung báo cáo SIM (hàm thuần)

**Files:**
- Create: `client/features/SimExport.html` (script; phần hàm thuần; phần giao diện thêm ở Task 5)
- Modify: `client/Index.html` (include `client/features/SimExport` **trước** dòng include `client/features/Sims`, và sau `client/app/Xlsx`)
- Test: `Downloads\SEC WH QA\test-sim-export.mjs` (mới)

**Interfaces:**
- Consumes: `simShowDate`, `simShowPhone` (Sims.html), `csvCell` (Core.html), `xlsxBuild` (Task 3).
- Produces:
  - `simReportRows(rows: SimRow[], opt: { by: 'requestedOn'|'receivedOn', from: string, to: string }) -> SimRow[]` — bỏ `deleted`; nếu `from` hoặc `to` khác rỗng thì bỏ dòng thiếu ngày `by`; so sánh chuỗi ISO, bao gồm hai đầu; xếp giảm dần theo `by` (ngày trống cuối), hoà thì theo `phone` tăng dần.
  - `simReportTable(rows: SimRow[]) -> { headers: string[5], rows: string[][] }` — cột: `requestedOn`, `receivedOn` (dd/MM/yyyy hoặc `''`), `contactName`, `holderName`, `phone` (10 số liền); nhãn lấy từ `t()`.
  - `simCsvLines(table) -> string[]` — dùng `csvCell`; cột số thuê bao ghi dạng `0902 343 108` (qua `simShowPhone`) để Excel không bỏ số 0.
  - `simReportFileName(opt, ext: 'csv'|'xlsx') -> string` — `SIM_<from hoặc all>_<to hoặc all>.<ext>`.

- [ ] **Step 1: Viết `test-sim-export.mjs` (fail trước)** — gọi các hàm qua `page.eval` với dữ liệu cố định, assert: lọc `from='2026-11-01', to='2026-11-30'` theo `receivedOn` bao gồm đúng hai ngày biên `2026-11-01` và `2026-11-30` và loại `2026-12-01`; SIM đã xoá không có; SIM không có `receivedOn` bị loại khi có `from`, nhưng có mặt (cuối danh sách) khi cả `from`/`to` rỗng; thứ tự giảm dần theo ngày, ngày trống cuối; `simReportTable` có đúng 5 cột theo thứ tự trong Global Constraints và ngày dạng `05/11/2026`; `simCsvLines` dòng đầu là tiêu đề, số `0902343108` thành `0902 343 108`, tên `Lê, "Mai"` được bao nháy đúng, tên `=1+1` có `'` đứng đầu; `simReportFileName({from:'2026-11-01',to:'',by:'receivedOn'},'csv') === 'SIM_2026-11-01_all.csv'`.
- [ ] **Step 2: Chạy `node test-sim-export.mjs`** — Expected: FAIL.
- [ ] **Step 3: Cài đặt bốn hàm ở trên** trong `SimExport.html` (chỉ hàm thuần + chuỗi I18N vi/en cho nhãn cột báo cáo: `simx.c.requested`, `simx.c.received`, `simx.c.recipient`, `simx.c.holder`, `simx.c.phone`).
- [ ] **Step 4: Chạy lại `node test-sim-export.mjs`** — Expected: PASS.

---

### Task 5: Giao diện "Xuất báo cáo" trên trang SIM

**Files:**
- Modify: `client/features/Sims.html` (nút trong `.sim-bar`, chuỗi I18N, thẻ `#simExportCard`); `client/features/SimExport.html` (hàm giao diện)
- Test: mở rộng `test-sim-ui.mjs`

**Interfaces:**
- Consumes: Task 4 (`simReportRows/Table/CsvLines/FileName`), Task 3 (`xlsxBuild`, `downloadBlob`), `SM.rows`.
- Produces: `simExportOpen()`, `simExportRun()`; id: `simXBy` (select: `requestedOn` | `receivedOn`), `simXFrom`, `simXTo` (date), `simXFmt` (select: `csv` | `xlsx`, mặc định `csv`), `simXCount` (dòng "Sẽ xuất N SIM"), `simXGo` (nút Tải về).

- [ ] **Step 1: Viết test (fail trước).** Bấm "Xuất báo cáo" → thẻ hiện ra; đổi `simXBy`/khoảng ngày → `#simXCount` cập nhật số SIM khớp `simReportRows`; chọn khoảng không có SIM → `#simXGo` bị khoá và có thông báo; `from > to` → khoá kèm thông báo khác; đặt `URL.createObjectURL` giả để bắt Blob, bấm Tải về với CSV → tên file `SIM_….csv`, nội dung bắt đầu bằng BOM + tiêu đề 5 cột; với XLSX → tên `.xlsx`, bốn byte đầu `PK\x03\x04`; không có lỗi console ở D và M; không phát sinh thêm lệnh gọi `google.script.run` nào (`page.calls()` không tăng sau khi mở thẻ/xuất).
- [ ] **Step 2: Chạy `node test-sim-ui.mjs`** — Expected: FAIL ở các assert mới.
- [ ] **Step 3: Cài đặt.** Nút dùng icon `download` có sẵn trong sprite (`#i-download`, như nút CSV ở Reports); thẻ dùng lớp `card sim-card`/`grid`/`field` như form thêm SIM; mỗi lần đổi ô nào cũng tính lại `simXCount` và trạng thái nút. Chuỗi vi/en: nhãn "Lọc theo", "Từ ngày", "Đến ngày", "Định dạng", "Tải về", "Sẽ xuất {n} SIM", "Không có SIM nào trong khoảng này", "Ngày bắt đầu phải trước ngày kết thúc".
- [ ] **Step 4: Chạy lại `node test-sim-ui.mjs`** — Expected: PASS. Chụp ảnh D và M (`results/screens/sim-*.png`) để xem bố cục.

---

### Task 6: Kiểm toàn bộ và phát hành (chờ bạn duyệt trước khi push)

**Files:**
- Modify: `server/config/Version.js:7` (`APP_BUILD_ID`, ví dụ `20261110-simdate1`)

- [ ] **Step 1: Chạy tuần tự từng suite**, mỗi lần một lệnh: `smoke` (92), `test-dashboard` (30), `test-dashboard-data`, `test-review-fixes`, `test-server-mail`, `test-tablesort`, `test-group1`…`test-group5`, và bốn file mới (`test-sim-server`, `test-sim-ui`, `test-xlsx`, `test-sim-export`). Expected: tất cả xanh, không lỗi console.
- [ ] **Step 2: Cập nhật `PRODUCT.md`/`QA-CHECKLIST.md`** nếu có mục mô tả trang SIM (thêm hai ngày và xuất báo cáo); không đụng nếu không có.
- [ ] **Step 3: Dừng và báo cáo cho bạn** kèm ảnh chụp; chỉ khi bạn đồng ý mới tiếp tục.
- [ ] **Step 4: Sau khi bạn duyệt:** tăng `APP_BUILD_ID`, `clasp push`, rồi `clasp deploy -i <id của deployment @N cao nhất>` (xem `clasp deployments`); `clasp pull` vào thư mục mới trong `Downloads` để đối chiếu file giống bản local.
- [ ] **Step 5: Việc chỉ làm được trên bản thật** (harness không có Google): mở trang SIM, thêm SIM có hai ngày, kiểm Sheet `Sim` có header `Requested On`/`Received On` và ngày dạng chữ; tải thử CSV và XLSX rồi mở bằng Excel kiểm số 0 đầu và tiếng Việt.
