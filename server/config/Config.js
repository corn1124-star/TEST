const SS_ID = '1fkJScnGLd0n9OwwOnLtKp2XkIPchhz8g1wDHub4IhpM';

const SH_DB = 'Database', SH_CAT = 'Category', SH_DEPT = 'Department';
const SH_LOC = 'Location', SH_TEAM = 'Team', SH_LOG = 'AuditLog';
const SH_NOTI = 'Notification', SH_PENDING = 'PendingRequests';
const SH_BOX = 'BoxDetail', SH_BOXMOVE = 'BoxMove';

/* Nơi app THỰC SỰ đọc/ghi dữ liệu giao dịch. Hiển thị ở thanh bên để kiểm chứng.
   Chỉ đổi khi code đã thật sự chuyển sang BigQuery (Mốc 2) — đừng đặt theo ý muốn. */
const DATA_BACKEND_ACTIVE = 'SHEETS';

const UNITS = ['Each', 'Box', 'Bag'];
const VARIANT_SUBS = ['Clothes'];
const LOW_STOCK = 5; // ngưỡng "sắp hết"

/* ═══════════ NHẬN DIỆN ỨNG DỤNG ═══════════
   APP_NAME dùng cho tiêu đề trang + tên người gửi email.
   ORG_* in trên đầu phiếu — sửa 2 dòng này nếu đổi pháp nhân. */
const APP_NAME = 'Grab Inventory Management';
const ORG_NAME = 'CÔNG TY TNHH GRAB';
const ORG_ADDR = 'Tầng 15, 1060 Nguyễn Văn Linh, Phường Tân Hưng, Thành phố Hồ Chí Minh';

