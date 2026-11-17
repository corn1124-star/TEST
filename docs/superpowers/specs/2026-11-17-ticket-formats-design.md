# Thiết kế: format phiếu kho mới + Phiếu giao hàng

Ngày viết: 2026-11-17. Trạng thái: **bản nháp chờ duyệt**, chưa có code.
Ứng dụng: SEC WH (Apps Script + Google Sheets), trang "Phiếu kho" (chỉ admin).

Quy ước trong tài liệu: **[Bạn chốt]** = người dùng đã nói rõ. **[Mình chọn]** = lựa chọn của Claude khi người dùng chưa trả lời, cần được xem lại. Phần không gắn nhãn là hệ quả kỹ thuật của hai loại trên.

---

## 1. Mục đích

Hôm nay app in được hai loại phiếu (nhập, xuất) bằng một mẫu chung, chỉ đổi tiêu đề. Cả hai đều có hai ô ký "Người lập phiếu" và "Người nhận hàng". Cách này không khớp thực tế:

- Phiếu nhập và phiếu xuất là chứng từ **nội bộ**, admin lập và lưu trong kho. Không có ai "nhận hàng" ký lên đó.
- Khi hàng xuất đi, shipper cầm hàng đến người nhận. Cần một chứng từ đi cùng shipper, làm bằng chứng shipper đã lấy hàng và người nhận đã nhận hàng. Hiện chưa có.

Vì vậy: (1) thêm **Phiếu giao hàng** cho hàng xuất, (2) đưa cả ba phiếu về cùng một khung, và sửa ô ký của phiếu nhập/xuất cho đúng thực tế.

## 2. Mục tiêu, không phải mục tiêu, điều phải tránh

**Mục tiêu**
- Admin in được Phiếu giao hàng từ một phiếu xuất, bằng một thao tác.
- Ba phiếu có cùng khung: đầu phiếu, khối thông tin, bảng hàng, khối ký, chân trang.
- Phiếu in trên A4 ngang, rõ nét, đọc được khi photo hoặc fax (nền trắng, chữ đen, viền liền), song ngữ Việt–Anh.

**Không phải mục tiêu**
- Phiếu nhập hàng của bên vận chuyển. Đây là giấy của bên vận chuyển, nằm ngoài app. **[Bạn chốt]**
- Lưu trạng thái giao hàng trong app (đã lấy, đã nhận). Phiếu chỉ để in và ký tay.
- Tên shipper, biển số xe, giờ lấy, giờ nhận. Phiếu giao hàng không có ô giờ, chỉ có chữ ký. **[Bạn chốt]**
- Tạo hàng loạt Phiếu giao hàng ("In tất cả phiếu giao hàng"). **[Mình chọn]**
- Địa chỉ, người liên hệ, số điện thoại của nơi nhận. App chưa lưu các thông tin này cho địa điểm. **[Mình chọn]**
- Đổi kiểu giao diện sang B hoặc C. Đã chọn kiểu A (giữ phong cách chứng từ hiện tại, làm gọn). **[Bạn chốt]**

**Điều phải tránh**
- Ghi "Admin lập phiếu" trên phiếu. Ô ký chỉ ghi "Người lập phiếu". **[Bạn chốt]**
- Hiển thị Phiếu giao hàng cho phiếu nhập.
- Làm hỏng phiếu nhập/xuất đang dùng hằng ngày: gom phiếu (1 ngày + 1 người yêu cầu + 1 loại), mã phiếu `PN_...`/`PX_...`, nút "In phiếu" và "In tất cả" giữ nguyên hành vi.

## 3. Ba phiếu

Khung chung (A4 ngang, lề 12mm trên-dưới, 14mm trái-phải, vùng in 269mm), theo bản mẫu `ticket-set-v3.html` trong `.superpowers/brainstorm/1623-1794825502/content/`:

1. **Đầu phiếu:** bên trái logo + tên pháp nhân + địa chỉ (chỉ ghi địa chỉ, **không** có nhãn "Địa chỉ (Address):"). Bên phải "Số phiếu (No.)" và "Ngày (Date)". Không có đường kẻ ngang bên dưới. **[Bạn chốt 2026-11-17]**
2. **Tiêu đề** giữa trang, song ngữ.
3. **Khối thông tin:** 2 hàng, mỗi hàng 2 cặp nhãn–giá trị.
4. **Bảng hàng** có hàng tổng ở cuối.
5. **Khối ký** ở cuối trang, ô ký cao khoảng 24mm, **không có đường kẻ ngang** trên chỗ ký. **[Bạn chốt 2026-11-17]**
6. **Không có chân trang** "In lúc ... · tài khoản in". Bỏ hẳn dòng này. **[Bạn chốt 2026-11-17]**

**Toàn bộ chữ và nét trên phiếu là màu đen**, không dùng màu xám hay màu nào khác (phiếu in trắng đen). Áp dụng cho cả ba phiếu. **[Bạn chốt 2026-11-17]** Bảng hàng vẫn giữ lưới ô viền đen liền (bỏ lưới thì bảng không đọc được); chỉ bỏ các đường kẻ ngang trang trí nêu trên. Hai việc này tôi hiểu là "đường kẻ ngang" mà bạn muốn xoá; nếu bạn muốn xoá cả lưới bảng thì báo lại.

| | Phiếu nhập kho | Phiếu xuất kho | Phiếu giao hàng (mới) |
|---|---|---|---|
| Tiêu đề | PHIẾU NHẬP KHO (IMPORT TICKET) | PHIẾU XUẤT KHO (EXPORT TICKET) | PHIẾU GIAO HÀNG (DELIVERY NOTE) |
| Mã phiếu | `PN_...` (giữ nguyên) | `PX_...` (giữ nguyên) | `PGH_<ngày>_<team>_<người yêu cầu>` |
| Tính chất | nội bộ | nội bộ | đi cùng shipper |
| Ô ký | **một ô** "Người lập phiếu", nằm bên **trái** | **một ô** "Người lập phiếu", nằm bên **trái** | **ba ô**: Người lập phiếu, Shipper, Người nhận hàng |
| Giờ lấy / giờ nhận | không | không | không |

Ô ký của phiếu nhập và phiếu xuất nằm bên trái, bỏ ô "Người nhận hàng". **[Bạn chốt]** Phiếu giao hàng có ba ô ký, không có ô giờ. **[Bạn chốt]**

### 3.1 Khối thông tin

- Phiếu nhập và phiếu xuất: hàng 1 = Người yêu cầu, Bộ phận. Hàng 2 = Khối, Địa điểm. Giữ nguyên bốn trường hiện có và nguồn dữ liệu hiện có (`pic`, `cc`, `dept`, `locList`).
  - Bản mẫu v3 ghi "Nhập tại / Xuất tại: Kho A · Kệ 3-02". Đó là chữ minh hoạ trong bản mẫu, **không** phải trường mới. Giữ nhãn "Địa điểm (Location)" lấy từ cột Location. **[Mình chọn]**
- Phiếu giao hàng: hàng 1 = Người yêu cầu, Bộ phận. Hàng 2 = **Giao đến (Deliver to)**, một hàng riêng (không có đường kẻ), chữ lớn hơn (khoảng 12,5pt), lấy từ cột Location. **[Bạn chốt: điểm đến lấy từ địa điểm có sẵn trên hệ thống do người tạo yêu cầu chọn.]** Không có Khối.

### 3.2 Bảng hàng

- Phiếu nhập và phiếu xuất giữ **8 cột như hiện nay**, kể cả cột "Vị trí (Bin)". Người lấy hàng cần vị trí kệ. **[Mình chọn]** Bản mẫu v3 bỏ cột này, nên mình lệch khỏi bản mẫu ở điểm này. Cần bạn xác nhận.
- Phiếu giao hàng **bỏ cột "Vị trí"** (7 cột). Shipper và người nhận không cần vị trí trong kho. **[Mình chọn]**
- Cột "Ghi chú" luôn để trống cho người nhận viết tay, như hiện nay.
- Hàng tổng: tổng số lượng, tổng số thùng. Chỉ in một lần ở cuối phiếu.

### 3.3 Nhiều dòng hàng, nhiều trang

Bạn chưa cho biết một phiếu thường dài bao nhiêu dòng, nên phiếu phải chịu được cả phiếu dài. **[Mình chọn]**
- Dòng tiêu đề bảng lặp lại ở đầu mỗi trang.
- Một dòng hàng không bị cắt ngang giữa hai trang.
- Hàng tổng và khối ký chỉ ở **trang cuối**, và không tách khỏi nhau. Nếu trang cuối không đủ chỗ cho khối ký thì cả khối ký xuống một trang mới kèm ít nhất một dòng hàng, để tờ cuối không chỉ có chữ ký.
- Số trang "Trang x / y" **không bắt buộc**. Nếu không làm ổn định được thì bỏ. Nếu có làm thì tính riêng cho từng tờ, không tính chung cả cửa sổ in.

## 4. Cách tạo Phiếu giao hàng

**[Mình chọn]**, chưa được bạn xác nhận.

- Trong thẻ của mỗi phiếu **xuất** ở trang Phiếu kho, thêm nút "In phiếu giao hàng" cạnh nút "In phiếu". Phiếu nhập không có nút này.
- Phiếu giao hàng dùng **đúng danh sách hàng của phiếu xuất tương ứng** (cùng ngày, cùng người yêu cầu).
- Một Phiếu giao hàng chỉ có **một điểm đến** vì chỉ có một người nhận ký. Phiếu xuất gom theo ngày + người yêu cầu + loại, nên một phiếu xuất có thể có nhiều Location khác nhau. Khi đó bấm nút sẽ in **mỗi điểm đến một Phiếu giao hàng**, mỗi tờ chỉ gồm các dòng hàng của điểm đến đó. Mã phiếu của các tờ này thêm hậu tố địa điểm để không trùng nhau. Phiếu xuất chỉ có một địa điểm thì in một tờ. **Câu hỏi này đang chờ bạn xác nhận** (xem mục 7).
- Dòng hàng không có Location: vẫn in được. Ô "Giao đến" để trống cho người ký ghi tay. Các dòng này gom thành một tờ riêng, đứng **cuối**. Các tờ còn lại sắp theo tên địa điểm. **[Mình chọn]**
- Mỗi tờ là một chứng từ độc lập: STT đánh lại từ 1, hàng tổng (số lượng, số thùng) tính lại theo các dòng của tờ đó. Nhiều tờ nằm trong cùng một cửa sổ in, mỗi tờ bắt đầu ở trang mới. Nếu một tờ dài hơn một trang thì quy tắc ở mục 3.3 áp dụng cho từng tờ. **[Mình chọn]**
- **Lưu ý về dữ liệu:** `DB-REDESIGN.md` (rủi ro R1) ghi rằng cột Location của dòng xuất cũ có thể có hai nghĩa: nơi giữ hàng hoặc nơi nhận. Form xuất hiện nay ghi "Xuất đến" nên dữ liệu mới nên đúng là điểm đến, nhưng dòng cũ hoặc dòng admin nhập trực tiếp có thể ghi nơi lấy hàng. Phiếu giao hàng tin vào Location như hiện có. **Admin xem lại ô "Giao đến" trên bản xem trước trước khi in**, vì app không phân biệt được hai trường hợp. Thêm cách chọn điểm đến lúc in chỉ làm nếu bạn yêu cầu (mục 7, câu 2).
- "In tất cả" (`printAllTickets`) giữ nguyên: chỉ in các phiếu nhập/xuất, **không** gồm Phiếu giao hàng. **[Mình chọn]**
- Tất cả tính toán ở **phía trình duyệt** từ dữ liệu `getTickets` đã có (mỗi dòng hàng đã có trường vị trí đích). Không cần đổi server, không cần thêm cột Google Sheets, không lưu gì thêm.

## 5. Ràng buộc và phạm vi kỹ thuật

- Code in hiện nằm ở `client/pages/AdminAndTickets.html`: `buildPrintHtml`, bảng nhãn `TICKET_TXT`, `printTicket`, `printAllTickets`, `openPrintWindow`. Thêm nút ở `renderTickets` cùng file. Nhãn giao diện (VI/EN) ở `client/app/I18n.html`. Phần gom phiếu ở `server/transactions/Tickets.js` (`getTickets`, `buildTicketId_`) giữ nguyên, chỉ có thể thêm mã tiền tố `PGH` nếu việc tạo mã dùng chung.
- Phiếu giấy **luôn song ngữ**, không phụ thuộc nút VI/EN của app (quy tắc đang có).
- CSS của phiếu phải **inline** trong tài liệu in (cửa sổ in là document riêng).
- Nền trắng, chữ đen tuyệt đối, viền liền, phân biệt tiêu đề và hàng tổng bằng độ dày viền chứ không bằng màu nền (quy tắc đang có để in rõ nét).
- Khối ký dùng `<table>`, không dùng flex (Chrome tính lại chiều cao flex khi in, đường ký rơi xuống đáy trang).
- `tfoot` trong Chrome mặc định lặp ở mọi trang khi in. Phải ép hàng tổng chỉ hiện một lần ở cuối.
- Logo lấy từ `.hd-logo` đã nhúng sẵn trên thanh đầu trang. Tên pháp nhân và địa chỉ giữ cách lấy hiện nay (server, rồi CONFIG, rồi hằng dự phòng).
- Bỏ khỏi `buildPrintHtml`: nhãn `addr` ("Địa chỉ (Address):"), dòng chân trang `printed`, đường ký `tr.ln` (code hiện tại không có đường kẻ dưới đầu phiếu; đường đó chỉ có trong bản mẫu v3/v4, nên khi dựng không được thêm vào). Nếu sau khi bỏ mà `TICKET_TXT.addr`, `TICKET_TXT.printed` không còn chỗ dùng thì xoá luôn khỏi bảng nhãn.
- Hiện **chưa có test** nào cho `buildPrintHtml` trong bộ `qa/`. Thay đổi này phải thêm test cho: số ô ký của từng loại phiếu, nhãn "Người lập phiếu" (không có "Admin"), không còn "Người nhận hàng" trên phiếu nhập/xuất, tách phiếu giao hàng theo địa điểm, phiếu nhập không có nút giao hàng.
- Sau khi làm xong: nâng `APP_BUILD_ID` (`server/config/Version.js`) và `APP_VERSION` (4.4.0 là gợi ý), cập nhật `QA-CHECKLIST.md` (thêm mục in thử cả ba phiếu trên máy in/PDF thật).
- **Không deploy, không push GitHub** khi chưa có lệnh rõ ràng của bạn trong chat.

## 6. Việc để người xây tự quyết

- Chi tiết CSS, cỡ chữ, khoảng cách miễn là khớp bản mẫu v3 và các ràng buộc ở mục 5.
- Cách đặt hậu tố địa điểm trong mã `PGH_...` khi phiếu xuất tách nhiều điểm đến (miễn là duy nhất và đọc được).
- Cách tổ chức code: tách `buildPrintHtml` thành các hàm nhỏ dùng chung khung, hay giữ một hàm có tham số theo loại phiếu.
- Chữ nhãn song ngữ cho các từ mới (Giao đến / Deliver to, Shipper, PHIẾU GIAO HÀNG / DELIVERY NOTE). Các cụm này lấy từ bản mẫu v3.

## 7. Những điều còn chờ bạn

1. Bản mẫu v3 đã ổn chưa? (thứ tự khối thông tin, tên nhãn, độ lớn của "Giao đến")
2. Một phiếu xuất có nhiều địa điểm thì in **mỗi điểm đến một tờ** (đề xuất ở mục 4) hay một tờ ghi cả danh sách địa điểm?
3. Phiếu nhập/xuất **giữ cột "Vị trí"** (đề xuất ở mục 3.2), hay bỏ như bản mẫu v3?
4. ~~Nút "In phiếu giao hàng" nằm cạnh "In phiếu" trong thẻ phiếu xuất~~ **[Bạn chốt 2026-11-17]**, cùng kiểu và cùng cỡ với nút "In phiếu".
5. Phiếu giao hàng có cần thêm địa chỉ, người liên hệ, số điện thoại nơi nhận? (hiện đề xuất: không)
6. Với dòng xuất cũ, cột Location có thể là nơi lấy hàng chứ không phải nơi nhận (xem lưu ý ở mục 4). Bạn chấp nhận cách "admin tự xem lại ô Giao đến trước khi in" không, hay cần chọn điểm đến ngay lúc in?

Nếu bạn chỉ nói "đồng ý với mặc định", toàn bộ các mục **[Mình chọn]** coi như được duyệt và người xây dựng theo đó.
