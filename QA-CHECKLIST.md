# SEC WH — QA checklist (sau đợt sửa audit UX/UI 2026-10-29)

Cách test: harness trình duyệt thật (Chrome headless + CDP) nạp `client/Index.html` với `google.script.run` giả (mock) — xem `C:/Users/thanh.phan/Downloads/SEC WH QA/README.md`. Mỗi mục ghi kết quả PASS / FAIL / BLOCKED (kèm lý do) trong `C:/Users/thanh.phan/Downloads/SEC WH QA/results/<nhóm>.md`.
Viewport: D = 1440×900, M = 390×844 (điện thoại, cảm ứng). Vai trò: A = admin, S = staff. Mỗi mục chạy cả VI và EN khi có chuỗi mới.

## Nhóm 1 — Trang chủ & Kho (OverviewStock.html, Index page-home/page-kho)
- 1.01 [A,D] KPI "Cần chú ý" = (số mã tồn ≤ ngưỡng, gồm âm & 0); bấm → tab "Cần chú ý" ở Kho hiện ĐÚNG số dòng đó.
- 1.02 [A,D] Link "Xem tất cả" trong khối "Cần xử lý ngay" mở cùng tab, cùng số dòng.
- 1.03 [A,S,D] Thứ tự KPI: admin = Chờ duyệt, Cần chú ý, Mã đang có, Tổng tồn; staff = Cần chú ý, Yêu cầu của tôi, …; KPI cần hành động > 0 có vạch màu trái; không có màu tím.
- 1.04 [A,D] Dòng chào dưới tiêu đề: có việc → "N yêu cầu chờ duyệt · M mã cần chú ý"; không có → câu chào cũ. Đổi VI/EN cập nhật.
- 1.05 [A,D] Dữ liệu có nhiều đơn vị: KPI "Tổng tồn (đơn vị)" chỉ cộng đơn vị chiếm đa số, foot liệt kê đơn vị khác; thanh nhóm hàng hiện đơn vị, không cộng lẫn.
- 1.06 [A,D+M] Biểu đồ Nhập–Xuất 30 ngày: chữ không méo ở 1440 và 390; đổi kích thước cửa sổ → vẽ lại; tick Y là số nguyên, không trùng (kiểm dữ liệu đỉnh = 1, 2, 7, 1234); màu cột khớp legend; dữ liệu rỗng → thông báo, không lỗi.
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

---
## Kết quả sau lần sửa thứ hai (2026-10-29)
Chạy lại 5 script test bằng harness Chrome (mock server). Smoke 92/92. Báo cáo lần 1 ở `SEC WH QA/results/before/`, log lần 2 ở `results/rerun-group1..5.log`.

| Nhóm | Mục lỗi lần 1 | Sau khi sửa |
|---|---|---|
| 1 | 1.01, 1.02, 1.11, 1.17 | Hết lỗi (1.03, 1.12 báo FAIL vì test cũ còn kỳ vọng vạch 4px và admin không bắt buộc chứng từ — hai điều đã đổi theo quyết định) |
| 2 | 2.12 | Hết lỗi (2.08/2.12 FAIL còn lại là selector/kỳ vọng test cũ: class `member-menu` đã bỏ khỏi link, nút có icon "✎ Sửa") |
| 3 | 3.02, 3.06, 3.07 | Hết lỗi (3.10 FAIL vì test cũ kỳ vọng CONFIG.org thắng; nay server thắng) |
| 4 | 4.06, 4.07, 4.13 | Hết lỗi |
| 5 | 5.04, 5.05, 5.08, 5.09 | 5.08 đạt; 5.04/5.05 còn FAIL do kỳ vọng cũ (thanh dính top:-16px là cách bù padding, đo thực tế sát mép; ô nút trong thẻ có nhãn); đã sửa aria-label nav theo ngôn ngữ |

Chưa kiểm chứng được: google.script.history trên deployment thật, Google Sites embed, hộp thoại in, ảnh Drive.
Test cũ cần cập nhật kỳ vọng: 1.03, 1.12, 2.08, 2.12, 3.10, 5.02, 5.04, 5.05, 5.10.
