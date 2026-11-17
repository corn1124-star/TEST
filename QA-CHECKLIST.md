# SEC WH — QA checklist (cập nhật 2026-11-17, bản v4.4.0 + nhánh SIM)

Cách test tự động: harness trình duyệt thật (Chrome headless + CDP) nạp `client/Index.html` với `google.script.run` giả (mock) — xem `qa/README.md`. Chạy từng bộ một, không chạy song song (song song làm vài bài thất thường); kết quả in PASS/FAIL, thoát mã 0 khi xanh.
Viewport: D = 1440×900, M = 390×844 (điện thoại, cảm ứng). Vai trò: A = admin, S = staff. Mỗi mục chạy cả VI và EN khi có chuỗi mới.
Phần "Kiểm bằng tay trên app thật" ở cuối là những gì bộ test KHÔNG chứng minh được (Google thật, Excel thật, mắt nhìn).

## Nhóm 1 — Trang chủ & Kho (OverviewStock.html, Index page-home/page-kho)
- 1.01–1.03, 1.05, 1.06: đã thay bằng `test-dashboard.mjs` + `test-dashboard-data.mjs` (trang Tổng quan Coral, đối chiếu số bằng dữ liệu mẫu, đã thử đột biến). Mục tay: xem mục 4 phần cuối.
- 1.04 [A,D] Dòng chào dưới tiêu đề: có việc → "N yêu cầu chờ duyệt · M mã cần chú ý"; không có → câu chào cũ. Đổi VI/EN cập nhật.
- 1.07 [A,D] Kho → chọn Xuất: gõ tìm / đổi nhóm khi form xuất đang mở → form + số đã nhập (ngày, SL, vị trí) còn nguyên dưới đúng dòng; dòng bị lọc mất → form đóng gọn, không lỗi console.
- 1.08 [A,D] Form xuất: SL > tồn → nút khóa + báo; sau reloadData (nút ⟳) form còn, "Tồn khả dụng" cập nhật; Esc đóng form; bấm lại cùng dòng → focus ô SL.
- 1.09 [A,D] Xuất → xác nhận bằng hộp thoại uiDialog (không phải confirm gốc); Hủy = không gửi; OK = gọi exportEntry đúng payload; nút trở lại bình thường khi lỗi.
- 1.10 [A,D] Nhập → xác nhận bằng uiDialog; thành công → thấy thông báo xanh (không bị xóa ngay) và form reset.
- 1.11 [A,D] "Lưu & thêm mã khác": sau thành công giữ PO/hóa đơn/NCC (và ngày, vị trí); xóa tên/SL/thùng; nút chính "Ghi nhập kho" vẫn xóa hết như cũ.
- 1.12 [S,D] Staff gửi yêu cầu nhập thiếu PO/hóa đơn/NCC/giá>0 → bị chặn tại client, báo đúng trường, focus trường thiếu; có dấu * đỏ ở 4 nhãn; admin KHÔNG bị bắt buộc.
- 1.13 [A,D] Ô lọc "Chọn hàng đã có": gõ lọc theo mã/tên/biến thể; mục đang chọn luôn còn trong danh sách; Xóa form → bộ lọc rỗng.
- 1.14 [A,D] Bảng tồn kho: cột "Tồn" có dấu phân cách nghìn (1.234); dòng tóm tắt hiện tổng theo từng đơn vị.
- 1.15 [A,D+M] Nút "Xem tồn kho ↓" cuộn tới bảng; bấm lại nút Nhập/Xuất đang chọn thì đóng form; ở 390 hai nút nằm một hàng.
- 1.16 [A,D] Bàn phím: Tab tới dòng bảng chọn xuất + Enter/Space mở form; dòng cảnh báo ở Trang chủ + "Xem tất cả" thao tác được bằng bàn phím, có viền focus.
- 1.17 [A,D] Đổi VI⇄EN khi form xuất/nhập đang mở → nhãn đổi, giá trị đã nhập giữ nguyên, không lỗi console.
- 1.18 [A,S,M] Không có tràn ngang trang ở 390 (document.scrollWidth ≤ 390) cho Trang chủ và Kho.

## Nhóm 2 — Lịch sử, Yêu cầu của tôi, định tuyến (History.html, MyPage.html, Core.html, Nav.html)
- 2.01 [A,D] Lịch sử: vào trang → tải 1 lần (đếm số lời gọi getTransactions = 1); dòng thông tin ghi khoảng ngày đang lọc.
- 2.02 [A,D] Khi total > số dòng đang hiện: có nút "Tải thêm 300"; bấm → limit tăng 300; chạm trần 3000 → báo lọc thêm/xuất CSV; phản hồi cũ đến muộn bị bỏ qua.
- 2.03 [A,D] "Xóa lọc" → về 7 ngày gần nhất + bỏ các bộ lọc khác; "Xem tất cả thời gian" → from/to rỗng và dòng thông tin ghi "Tất cả thời gian".
- 2.04 [A,D] `historyShowUser('x')` (từ Quản lý → bấm tên người dùng): sang Lịch sử, lọc đúng người, mọi bộ lọc ngày xóa, chỉ 1 lời gọi getTransactions.
- 2.05 [A,D] Xuất CSV khi bảng rỗng → toast lỗi (không alert); khi total > hiện → tải đủ rồi mới xuất.
- 2.06 [A,D] Form sửa: không còn "Dòng Sheet"; gõ SL mới → dòng "Tồn hiện tại X → sau khi sửa Y"; Y<0 → kiểu lỗi; mã không có trong STOCK → ẩn dòng; Lưu → uiDialog kèm hiệu ứng tồn; OK → editTransaction đúng tham số (rowIndex, expect).
- 2.07 [S,D] Staff: gọi goto('history') → toast "cần quyền admin", không đổi trang, không alert; menu staff không có Lịch sử.
- 2.08 [S,D] Trang Yêu cầu của tôi: thứ tự KPI → bảng → thẻ hồ sơ; 3 KPI có foot khác nhau; bấm KPI lọc tab; KPI "chờ duyệt" màu hổ phách (không tím).
- 2.09 [A,S,D] Định tuyến: goto đổi hash/history; nút Back quay trang trước (không thoát app); trang bị cấm theo vai trò không khôi phục từ hash; hash lạ → Trang chủ; mọi thứ bọc try/catch (mô phỏng không có google.script.history).
- 2.10 [A,D] Core: không còn gọi updateCrumb/sbChip; console sạch lỗi ở boot và chuyển 9 trang.
- 2.11 [A,D] Cảnh báo rời Kiểm kê: nhập số đếm chưa lưu → bấm tab khác → uiDialog; "Hủy" ở lại; "Bỏ" → sang trang mới, số chưa lưu mất; Back trình duyệt cũng bị chặn tương tự.
- 2.12 [A,S,M] Bảng Lịch sử / Yêu cầu của tôi ở 390: dạng thẻ, mỗi ô có nhãn từ tiêu đề cột, nút Sửa/Sửa-Xóa-yêu-cầu bấm được (≥40px).

## Nhóm 3 — Quản lý (duyệt/người dùng) & Phiếu kho (AdminAndTickets.html)
- 3.01 [A,D] Thứ tự trang Quản lý: Duyệt → Người dùng → Tùy chọn email → Sao lưu → Công cụ admin; các khối phụ vẫn tải bình thường.
- 3.02 [A,D] Dòng chờ duyệt: Duyệt + Từ chối hiện; "Xóa yêu cầu" nằm trong menu "Thêm" (mở được, không bị cắt bởi bảng cuộn; đóng khi bấm ngoài); xóa vẫn hỏi xác nhận.
- 3.03 [A,D] Yêu cầu xuất: hiện "Tồn: N đơn vị"; SL > tồn → badge đỏ "không đủ" + cảnh báo trong hộp xác nhận duyệt; yêu cầu nhập / không có mã / mã không có trong STOCK → không hiện gì.
- 3.04 [A,D] Duyệt 1 dòng: uiDialog xác nhận; OK → approvePendingRequest(id,''); thành công → toast + thông báo giữ lại sau khi bảng tải lại; lỗi → nút khôi phục.
- 3.05 [A,D] Từ chối: uiDialog bắt buộc lý do (OK bị khóa đến khi nhập đủ); gửi đúng lý do; không còn alert/prompt.
- 3.06 [A,D] Duyệt hàng loạt: checkbox chọn tất cả/từng dòng; nút "Duyệt đã chọn (n)" cập nhật n; 1 hộp xác nhận; chạy tuần tự; dừng ở lỗi đầu tiên và báo; trong lúc chạy khóa các nút; cảnh báo nếu tổng xuất vượt tồn (trừ dần theo cùng mã); cuối cùng reload.
- 3.07 [A,D] Người dùng: tên bấm được → historyShowUser; Sửa/Xóa; Xóa → 1 uiDialog (lý do tùy chọn, danger); không tự xóa mình; thông báo lỗi cụ thể cho email sai / thiếu username / thiếu CC và focus đúng ô; nhãn nút lưu khi thêm = "Thêm người dùng".
- 3.08 [A,D] Phiếu kho: vào trang → tự tải (ticketOnEnter) khi chưa có dữ liệu; đổi ngày/loại/CC → tự tải sau ~300ms, phản hồi cũ bị bỏ; nút "Tải" vẫn chạy.
- 3.09 [A,D] Mỗi thẻ phiếu có phần mở rộng liệt kê mặt hàng (mã, tên+biến thể, SL, đơn vị, bin) đúng với g.items.
- 3.10 [A,D] In phiếu: tài liệu in dùng logo data-URI (không có URL thicao.com), TICKET_ORG/ADDR được CONFIG.org/address ghi đè nếu có; popup bị chặn (mô phỏng window.open → null) → in qua iframe ẩn, không in đôi; cả 2 thất bại → toast.
- 3.11 [A,M] Bảng Duyệt / Người dùng ở 390: dạng thẻ, ô checkbox + nút hành động bấm được; menu "Thêm" mở dạng sheet dưới, không che nav dưới.
- 3.12 [A,D] `test-tickets.mjs` — format phiếu và Phiếu giao hàng. Phiếu nhập/xuất: một ô ký "NGƯỜI LẬP PHIẾU" bên trái (không còn "Người nhận hàng", "Admin"), không dòng "In lúc", nhãn Địa chỉ bỏ, 8 cột có Vị trí, chỉ #000/#fff, phiếu 40 dòng: thead lặp, tfoot một lần. Phiếu giao hàng (nút "In phiếu giao hàng" chỉ ở thẻ phiếu xuất): một tờ, số PGH_…, 7 cột không có Vị trí, ba ô ký (Người lập phiếu, Shipper, Người nhận hàng) rộng bằng nhau, "Giao đến" ghi đủ các địa điểm (không có Location → để trống), tổng SL khớp phiếu, thoát HTML đúng, "In tất cả" không chứa phiếu giao hàng; EN: nút "Print delivery note".

## Nhóm 4 — Kiểm kê, Báo cáo, SKU (Stocktake*.html, Reports.html, Sku.html)
- 4.01 [A,D] Đếm mù mặc định BẬT khi đợt đang đếm: dòng chưa lưu số đếm hiện "—" ở Hệ thống/Chênh lệch/Kết quả, không có vạch màu và không có ghi chú "tồn đã đổi"; gõ số vào ô KHÔNG làm lộ kết quả.
- 4.02 [A,D] Chế độ mù: thanh thống kê chỉ còn "Tất cả (đã đếm/tổng)" và "Chưa nhập", tính từ số ĐÃ LƯU; lưu rồi → dòng đó lộ số hệ thống/kết quả.
- 4.03 [A,D] Nút "Đếm mù": tắt → hiện đủ như cũ; trạng thái giữ qua tải lại (localStorage gim_stk_blind); aria-pressed đúng; ẩn khi đợt đã đóng/hủy.
- 4.04 [A,D] Hộp thoại xác nhận kết quả vẫn hiện đủ số liệu; CSV "phiếu đếm" không chứa số hệ thống.
- 4.05 [A,D] Hủy đợt: 1 uiDialog (danger, lý do tùy chọn) → stocktakeCancel(id, reason); Quay lại khi còn số chưa lưu → uiDialog "bỏ?"; beforeunload vẫn chặn.
- 4.06 [A,D] Danh sách đợt: Tab tới dòng + Enter/Space mở đợt (không mở 2 lần); h1 dùng page-title kèm dòng mô tả; nhãn thống kê chữ thường 12px.
- 4.07 [A,D] Hộp thoại dán Excel & xác nhận: role=dialog, aria-modal, tên bằng aria-labelledby, Escape đóng lớp trên cùng, focus ban đầu đúng, Tab không thoát khỏi hộp, trả focus khi đóng.
- 4.08 [A,D] Báo cáo Nhập–Xuất–Tồn: đổi ngày/nhóm → tự chạy sau 300ms, 1 lời gọi reportNxt cho mỗi lần đổi ổn định; from > to → toast `rp.badRange`, không gọi server; không còn nút "Xem báo cáo".
- 4.09 [A,D] Nút ngày nhanh: Tháng này / Tháng trước / 7 ngày / Quý này đặt đúng from/to (kiểm vài ngày đặc biệt: đầu tháng, tháng 1, hết quý) và nút khớp được tô sáng.
- 4.10 [A,D] Điều khiển Cái/Thùng/Cả hai nằm cuối bộ lọc ở cả 3 tab; đổi → đổi cột đúng, không gọi lại server cho NXT.
- 4.11 [A,D] Dòng Tổng: NXT dùng res.totals và bằng các ô tổng phía trên (kể cả khi bị cắt/lọc thùng); Tồn kho chỉ cộng số thùng, KHÔNG cộng "Tồn" khác đơn vị; Cảnh báo không có dòng tổng; bản in có tfoot; CSV không đổi.
- 4.12 [A,D] SKU: mô tả trang chỉ nói về admin; nút "SKU mới" có icon package; tooltip mã cũ dịch được; tạo/sửa SKU vẫn chạy.
- 4.13 [A,M] Bảng SKU/Báo cáo/Kiểm kê ở 390: SKU & Báo cáo → dạng thẻ có nhãn; #stkTable giữ quy tắc ẩn cột cũ; nhóm nút ngày nhanh không tràn ở 360px.

## Nhóm 5 — Giao diện chung, hộp thoại, toast, responsive (Styles/Theme/Dialog/Toast, Nav)
- 5.01 [D] Không còn box-shadow lúc nghỉ trên .card, .filters, .table-wrap, .kpi, .chart-card, .qa; chỉ còn trên noti-box, user-box, more-pop, dialog, toast (đo getComputedStyle).
- 5.02 [D] Rê chuột vào .qa / .kpi.tap: không dịch chuyển (transform none), có đổi viền/nền; focus-visible vẫn thấy.
- 5.03 [D+M] Nav con (.sub-item.on) và tab dưới (mobile) màu trung tính; chỉ 1 ô hành động chính màu xanh đặc ở Trang chủ.
- 5.04 [M] `.rt` ở <640px: thead ẩn, hàng thành thẻ, mỗi ô có nhãn (`data-label`), ô hành động rộng hết hàng, hàng rỗng (td.empty) bình thường, hàng skeleton không bị ảnh hưởng; ≥640px bảng như cũ; #stockTable/#stkTable không bị `.rt` đè. MutationObserver không lặp vô hạn (đo số lần mutation sau khi yên).
- 5.05 [M] Tiêu đề trang không bị nút "?" che; thanh actions dính (`sticky`) không có khoảng hở 56px ở ≤600px; nút ≥44px (pointer:coarse), .btn.sm ≥40px.
- 5.06 [D+M] uiDialog: role/aria; focus trap; Escape; trả focus; OK khóa đến khi đủ lý do (≥3 ký tự); Enter gửi (ô 1 dòng), `multiline` + Ctrl+Enter; gọi liên tiếp 2 hộp không rò listener (đếm); bấm nền chỉ đóng khi mousedown cũng ở nền; danger không có lý do → focus vào Hủy; ở ≤480px nút xếp dọc; z-index trên .odoo-modal và .guide-modal; `opts.html` và `cancelLabel` hoạt động.
- 5.07 [D+M] Toast: role=status; lỗi role=alert, ≥6s, có nút × (aria-label, đích bấm 44px); ở ≤860px nằm trên thanh tab dưới; z-index trên dialog.
- 5.08 [D] Tương phản (đo từ computed style): badge in/out/warn/danger/ok/pending/neutral ≥ 4.5:1; chữ phụ trên nền .qa-green ≥ 4.5:1; th ≥ 11px; .hint & label ≥ 12px.
- 5.09 [A,S,D+M] Quét toàn app: mở lần lượt tất cả trang (home, kho, history, stocktake, admin, sku, ticket, report, me) ở D và M, VI và EN; ghi lỗi console, lỗi mạng, ID bị thiếu, tràn ngang, văn bản bị cắt; chụp ảnh từng trang.
- 5.10 [A,S] Phân quyền giao diện: staff không thấy phần tử `.admin-menu`/`.admin-gate`; admin không thấy `.member-menu`; goto vào trang bị cấm bị chặn bằng toast.

## Nhóm 6 — Sắp xếp cột (TableSort.html, Reports.html) — `test-tablesort.mjs`
- 6.01 [A,S,D] Mọi bảng (Kho, Lịch sử, Kiểm kê, SKU, SIM, Người dùng, Duyệt, Yêu cầu của tôi): bấm tiêu đề → `aria-sort` + mũi tên đúng; số xếp theo số, ô trống luôn nằm cuối; "Gửi lúc" (`dd/MM HH:mm`) xếp theo thời gian, đúng cả khi vắt qua cuối tháng.
- 6.02 [A,D] Báo cáo nhiều trang: sắp xếp trên TOÀN BỘ dòng rồi mới chia trang (trang 1 = 100 giá trị lớn nhất, trang 2 nối tiếp); đổi cột/chiều khi đang ở trang 2 → về trang 1; dòng Tổng không đổi.
- 6.03 [A,D] Xuất CSV và In (báo cáo) theo đúng thứ tự đang sắp xếp, đủ mọi dòng (không chỉ trang đang xem); không sắp xếp thì giữ thứ tự gốc.
- 6.04 [A,M] Điện thoại: ô "Sắp xếp theo…" + nút chiều trên danh sách thẻ sắp xếp đúng toàn bộ dòng báo cáo.
- 6.05 [A,S,D] Sắp xếp một cột rồi bấm Sửa/Xóa ở Yêu cầu của tôi → mở đúng yêu cầu của dòng đó; Kiểm kê: gõ số đếm không làm dòng nhảy; Lịch sử: sắp xếp rồi "Xem thêm".

## Nhóm 7 — SIM (Sims.html, SimExport.html, Xlsx.html, Sims.js) — `test-sim-server.mjs`, `test-sim-ui.mjs`, `test-sim-export.mjs`, `test-xlsx.mjs`
- 7.01 [POPS,A] Tab SIM dưới Kho: chỉ team POPS và admin thấy; thêm/sửa/xóa mềm/khôi phục; số điện thoại, người giữ, người liên hệ, ghi chú; người nhập và giờ lấy từ đăng nhập.
- 7.02 [POPS,A,D+M] Hai ngày tùy chọn "Ngày tạo yêu cầu" và "Ngày nhận SIM": nhập `dd/MM/yyyy` hoặc `yyyy-MM-dd`; ngày sai bị chặn khi lưu; ô ngày cũ không đọc được được giữ nguyên, không bị ghi đè; cả hai cột sắp xếp được.
- 7.03 [POPS,A,D+M] Thẻ "Xuất báo cáo": đúng 5 cột (Ngày tạo yêu cầu, Ngày nhận SIM, Người nhận, Người giữ, Số thuê bao); lọc theo MỘT trong hai ngày + từ/đến (tùy chọn, tính cả hai đầu), mới nhất lên đầu, SIM đã xóa không có; tên file đúng; EN không lộ khoá chuỗi.
- 7.04 [POPS,A] CSV có BOM UTF-8; XLSX mở được (kiểm cấu trúc zip/XML bằng test; mở bằng Excel thật là mục tay 8).
- 7.05 [A] Nhập SIM từ Database cũ (`simImportPreview`/`simImportRun`, chỉ admin; chỉ SIM tồn ròng > 0; Database không bị đụng).

## Kiểm bằng tay trên app thật (bộ test dùng dữ liệu giả cho các phần này)
Làm sau mỗi lần deploy. Hard-reload (Ctrl+F5), mở menu tài khoản: dòng cuối phải đúng `APP_BUILD_ID` vừa phát hành.
1. **Tổng quan:** "Cần chú ý" = số mã có tồn ≤ 5 (gồm hết hàng, tồn âm) và bấm vào ra đúng số dòng ở Kho; "Nhập trừ xuất, 30 ngày" khớp Sheet; "Tồn lâu" (quá 90 ngày không phát sinh) hợp lý với kho thật; dòng chào: admin thấy số chờ duyệt, staff thấy số yêu cầu của mình.
2. **POPS:** tab POPS trên thanh trên mở đúng trang; nút "Trang chủ" quay về app chính.
3. **Email đăng ký mới:** admin bật công tắc nhận email → đăng ký bằng tài khoản thử → email tới; admin không bật → không có email, đăng ký vẫn thành công.
4. **Google thật:** gửi yêu cầu có ảnh → ảnh lên Drive, xem lại được; Quản lý → Sao lưu → file xuất hiện trong Drive; đăng nhập staff và admin thật, mở từng tab, không lỗi đỏ/trang trắng.
5. **Nhìn bằng mắt:** màn hình tải xe Grab hiện rồi biến mất, không giật; xanh Grab; thông báo nổi dưới thanh trên (máy tính + điện thoại).
6. **Báo cáo:** lọc hơn 100 dòng, sắp xếp cột "Tồn" giảm dần, sang trang 2 nối tiếp; bấm Xuất CSV và In → đúng thứ tự đang xem.
7. **Bàn phím:** mỗi cột sắp xếp được là một điểm dừng Tab trước dòng đầu của bảng (hành vi chuẩn, chưa có "bỏ qua tiêu đề").
8. **SIM:** mở một file XLSX xuất ra bằng Excel thật (và LibreOffice nếu có); CSV mở bằng Excel en-US có thể đảo ngày/tháng nên XLSX an toàn hơn; trước khi deploy kiểm cột Q:R của sheet `Sim` đang trống.

9. **In phiếu (v4.4.0):** in một Phiếu nhập, một Phiếu xuất và một Phiếu giao hàng ra PDF hoặc máy in thật, chế độ đen trắng: chữ rõ, viền liền, khung ký đủ chỗ; kiểm một phiếu khoảng 40 dòng: hàng tiêu đề lặp ở trang 2, hàng tổng và khối ký chỉ ở trang cuối, luôn đi cùng ít nhất một dòng hàng (không bao giờ nằm trơ trọi; trang cuối đó có thể không có hàng tiêu đề); kiểm một phiếu xuất cũ mà Location là nơi lấy hàng chứ không phải nơi nhận: admin phải xem lại ô "Giao đến" trước khi in.

## Chưa kiểm chứng được bằng harness
`google.script.history` trên deployment thật, Google Sites embed, hộp thoại in của trình duyệt, ảnh Drive, độ tương phản nút xanh `#00873b` (4,58:1, sát ngưỡng 4,5).
Biết nhưng chưa xử lý: mục 1.08 từng thất thường khi các thao tác nối nhau trong vài mili giây (nguyên nhân trong app chưa xác định).
