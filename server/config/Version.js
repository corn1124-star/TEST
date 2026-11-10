/* Phiên bản ứng dụng. Đổi khi phát hành — xem CHANGELOG.md và tools\release.ps1.
   MAJOR: đổi cấu trúc Sheet/không tương thích · MINOR: thêm tính năng · PATCH: sửa lỗi. */
const APP_VERSION = '4.1.3';
const APP_BUILD_DATE = '2026-10-23';
/* Dấu bản dựng: nằm trong khoá cache của khung HTML. tools\make-test-build.ps1 và release.ps1 đóng dấu giờ build vào đây,
   nên đổi code là cache khung trang tự mất hiệu lực. 'dev' = chưa đóng dấu. */
const APP_BUILD_ID = '20261109-sort2';

function getAppVersion() { auth_(); return { version: APP_VERSION, built: APP_BUILD_DATE }; }
