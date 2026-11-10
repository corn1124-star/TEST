/* Database: 21 cột (A-U) */
const C = {
  NO:0, CODE:1, TYPE:2, DEPT:3, CC:4, PIC:5, CAT:6, SUB:7, NAME:8, QTY:9,
  UNIT:10, DATE:11, LOC:12, EVENT:13, VARIANT:14,
  PO_NO:15, INVOICE_NO:16, SUPPLIER:17, PURCHASE_PRICE:18, BOX:19, BIN:20
};
const DB_COLS = 21;
const HEADERS = ['No','Asset Code','Type','Department','Cost Center','PIC','Category',
  'Sub-Category','Name','Quantity','Unit','Date','Location','Event','Variant',
  'PO No','Invoice no.','Supplier','Purchase Price (VND)','Box Count','Bin Location'];

/* BoxDetail: 11 cột (A-K) */
const B = {
  ID:0, BOX_CODE:1, CODE:2, CC:3, TX_ROW:4, DATE:5, BOX_NO:6,
  QTY_IN:7, REMAINING:8, LOC:9, NOTE:10
};
const BOX_COLS = 11;
const BOX_HEADERS = ['Box ID','Box Code','Asset Code','Cost Center','Tx Row',
  'Import Date','Box No','Qty In','Remaining','Location','Note'];

/* BoxMove: 8 cột (A-H) */
const BM = { TS:0, CODE:1, BOX_ID:2, BOX_NO:3, QTY:4, DATE:5, PIC:6, TX_ROW:7 };
const BOXMOVE_COLS = 8;
const BOXMOVE_HEADERS = ['Timestamp','Asset Code','Box ID','Box No',
  'Qty Out','Export Date','PIC','Tx Row'];

/* Notification: 11 cột (A-K) */
const N = { TS:0, TIME:1, USER:2, CC:3, TYPE:4, NAME:5, QTY:6, LOC:7, MSG:8, READ:9, RECIPIENT:10 };
const NOTI_COLS = 11;
const NOTI_HEADERS = ['Timestamp','Time','User','Cost Center','Type','Name','Quantity',
  'Location','Message','Read','Recipient Email'];

/* PendingRequests: 26 cột (A-Z) */
const P = {
  ID:0, SUBMITTED_AT:1, TRANSACTION_DATE:2, USER_EMAIL:3, USER:4, CC:5, DEPARTMENT:6,
  TYPE:7, CATEGORY:8, SUB_CATEGORY:9, NAME:10, VARIANT:11, EVENT:12, QUANTITY:13,
  UNIT:14, LOCATION:15, ASSET_CODE:16, STATUS:17, DECISION_BY:18, DECISION_TIME:19,
  DECISION_NOTE:20, PO_NO:21, INVOICE_NO:22, SUPPLIER:23, PURCHASE_PRICE:24, BOX:25
};
const PENDING_COLS = 26;
const PENDING_HEADERS = ['Request ID','Submitted At','Transaction Date','User Email','User',
  'Cost Center','Department','Type','Category','Sub-Category','Name','Variant','Event',
  'Quantity','Unit','Location','Asset Code','Status','Decision By','Decision Time',
  'Decision Note','PO No','Invoice no.','Supplier','Purchase Price (VND)','Box Count'];

/* Team: A = Email · B = Username · C = Cost Center · D = Role (admin | member | pending)
         E = Notify Email — chỉ admin: TRUE = nhận email khi staff gửi yêu cầu mới (trống / FALSE = không nhận) */
const TEAM_COLS = { EMAIL:0, USERNAME:1, CC:2, ROLE:3, NOTIFY:4 };
const TEAM_NOTIFY_HEADER = 'Notify Email';

/* [TEAM] Thông điệp đặc biệt — RegisterUI.html bắt 2 chuỗi này để hiện form
   đăng ký / màn hình chờ duyệt thay cho thông báo lỗi. KHÔNG đổi. */
const AUTH_NEED_REGISTER = '__NEED_REGISTER__';
const AUTH_PENDING       = '__PENDING__';

