# QA HANDOVER & COMPREHENSIVE CHANGELOG

> **Target Audience**: Codex / QA Engineers / Peer Reviewers
> **Repository**: `pro7-team-manager`
> **Environment**: Next.js / Vinext, Vite 8, React 19, Supabase SSR
> **Change Boundary**: Frontend, CSS, query, permission, and client interaction changes. No remote database migration was approved or applied by this branch.

---

## 1. Tổng Quan Mục Tiêu (Executive Summary)

Đợt cập nhật này tập trung toàn diện vào **trải nghiệm người dùng (UX/UI)**, **hệ thống thiết kế (Design System)** theo chuẩn `/checklist-design`, và **tính năng quản lý thực tế** của ứng dụng Quản lý đội bóng PRO7:
- Audit và tinh chỉnh toàn bộ màu sắc, typography và bố cục theo phong cách hiện đại (cảm hứng từ [Rewind App](https://rewindapp.flatstudio.co/)).
- Sửa triệt để các lỗi lệch kích thước, tràn viền chữ, ngắt dòng không mong muốn trên các thành phần thẻ (Card), huy hiệu (Badge) và nút bấm (Button).
- Thay thế hoàn toàn dữ liệu giả/cứng bằng logic thực tế (phong độ cầu thủ theo số trận ra sân thực, lịch sử trận đấu, phân tích thông số và sa bàn trận đã đấu).
- Không áp dụng migration database từ branch này; các thay đổi query, permission và client interaction phải được audit trước khi release.

---

## 2. Chi Tiết Các Thay Đổi Theo Từng Module

### 2.1. Thanh Điều Hướng & Header Tối Giản
- **File thay đổi**: `app/components/pro7-route-navigation.tsx`, `app/components/pro7-route-header.tsx`, `app/globals.css`
- **Chi tiết**:
  - Di chuyển các mục cấu hình/topnav phức tạp từ thanh tiêu đề vào menu popover và sidebar, giúp không gian màn hình chính rộng rãi, không bị rối mắt.
  - Header sticky với hiệu ứng kính mờ (`backdrop-filter: blur(10px)`), tích hợp nút chuyển đổi Dark/Light mode và Avatar truy cập nhanh.

---

### 2.2. Trang Tổng Quan (Overview Dashboard)
- **File thay đổi**: `app/teams/[slug]/overview/overview-view.tsx`, `app/globals.css`
- **Chi tiết**:
  - **Huy hiệu Win (`W`)**: Chuyển sang màu xanh lá thể thao chuẩn quốc tế (`#00e676`, chữ `#034b23`). Huy hiệu Hòa (`D`) màu xám (`#64748b`), Thua (`L`) màu đỏ (`#ef4444`).
  - **Tương tác Thẻ (`.stat-card-interactive`)**: Thay vì phóng to giật cục các chữ cái `W` bên trong, **toàn bộ thẻ "PHONG ĐỘ GẦN ĐÂY" sẽ nổi lên (`translateY(-3px)` + `box-shadow`)** khi hover, tạo phản hồi xúc giác đồng nhất.
  - **Cân bằng kích thước thẻ**: Áp dụng `align-items: stretch` và cấu trúc 3 phần (`stat-label`, `stat-body` min-height 42px, `stat-footer`), đảm bảo cả 4 thẻ (`Tỉ lệ thắng`, `Phong độ gần đây`, `Vua phá lưới`, `Thứ hạng`) có chiều cao và đường gióng đáy bằng nhau 100%.
  - **Điều hướng nhanh**: Click vào thẻ phong độ sẽ chuyển hướng trực tiếp sang trang Lịch sử trận đấu (`/teams/[slug]/matches`).

---

### 2.3. Quản Lý Đội Hình & Phong Độ Cầu Thủ (Squad)
- **File thay đổi**: `app/teams/[slug]/squad/squad-view.tsx`, `app/globals.css`
- **Chi tiết**:
  - **Loại bỏ chuỗi mẫu cứng `W - W - D - W - L`**: Truy vấn danh sách trận đấu đã kết thúc và tính toán sự góp mặt thực tế của từng cầu thủ (đá chính, thay người, ghi bàn, kiến tạo, số phút thi đấu).
  - Cầu thủ đã tham gia: Hiển thị đúng số trận thực tế và kết quả (ví dụ `Phong độ (1 trận): [W]`).
  - Cầu thủ chưa từng thi đấu: Hiển thị trạng thái trung thực `Ra sân: Chưa ra sân (0 trận)`.

---

### 2.4. Quản Lý Trận Đấu & Phân Tích (Matches Center & Analysis)
- **File thay đổi**: `app/teams/[slug]/matches/matches-view.tsx`, `app/teams/[slug]/matches/[matchId]/match-detail.tsx`, `app/globals.css`
- **Chi tiết**:
  - **Mục "LỊCH SỬ THI ĐẤU (Các trận đã kết thúc)"**: Bổ sung danh sách toàn bộ các trận đã hoàn tất trong lịch sử đội bóng.
  - **Khắc phục lỗi vỡ chữ Tên Đội**: Thêm `white-space: nowrap` cho tên đội bóng (`.match-team-name`), triệt tiêu tình trạng tên ngắn như `FC NÁT` bị ngắt thành 2 dòng.
  - **Sửa lỗi tràn viền Huy Hiệu (`.match-result-pill`)**: Chuyển từ class tròn cố định 28px sang dạng **viên thuốc bo góc mềm (pill badge)**. Chữ "THẮNG" hiển thị vừa vặn, không bị đè chữ hay tràn viền.
  - **Chuẩn hóa kích thước nút bấm (`.history-action-btn`)**: Đồng bộ cả 2 nút `Chiến thuật` (Secondary) và `Xem phân tích →` (Primary) về cùng chiều cao chuẩn `38px`, padding `0 16px`, bo góc `9px`, chữ nằm trên 1 hàng duy nhất.
  - **Bảng so sánh thông số trận đấu**: Hiển thị đầy đủ 4 chỉ số đối đầu (Kiểm soát, Cú sút, Trúng đích, Phạt góc) cho tất cả các trận khi ấn vào phân tích.
  - **Quản trị trận đã kết thúc**: Cho phép Admin cập nhật lại tỉ số trận đấu sau khi trận đã kết thúc và lưu tức thời.

---

### 2.5. Sa Bàn Chiến Thuật Trận Đã Đấu (Tactics Board)
- **File thay đổi**: `lib/tactics/queries.ts`, `app/teams/[slug]/tactics/[matchId]/tactics-board.tsx`
- **Chi tiết**:
  - Loại bỏ điều kiện cứng `status === "scheduled"` trong query `getTacticsDetail()`. Giờ đây cả trận `scheduled` và `completed` đều có thể xem lại sơ đồ chiến thuật mà không bị lỗi `404 Not Found`.
  - Bổ sung nút truy cập nhanh **"Sa bàn chiến thuật"** trên vé trận đấu và danh sách lịch sử trận.

---

### 2.6. Quản Lý Quỹ Đội & VietQR (Funds)
- **File thay đổi**: `app/teams/[slug]/funds/funds-view.tsx`, `app/globals.css`
- **Chi tiết**:
  - Tích hợp Modal quét mã VietQR tự động sinh theo thông tin đội và số tài khoản ngân hàng MB Bank.
  - Nút sao chép số tài khoản một chạm kèm thông báo trực quan.

---

### 2.7. Typography & Khả Năng Tiếp Cận (WCAG / Contract Compliance)
- **File thay đổi**: `app/typography.css`, `public/fonts/`, `tests/typography-contract.test.ts`
- **Chi tiết**:
  - Nhúng phông chữ Roboto tự lưu trữ (self-hosted) hỗ trợ đầy đủ tiếng Việt.
  - Đảm bảo 100% văn bản giao diện có `font-size >= 12px`.
  - Đảm bảo touch target trên thiết bị di động tối thiểu `44px × 44px`.

---

## 3. Danh Sách Các File Đã Thay Đổi (Git Diff Scope)

| STT | Tệp tin | Loại thay đổi | Mô tả |
|:---:|---|:---:|---|
| 1 | `app/components/pro7-route-navigation.tsx` | Modified | Dọn dẹp topnav, đưa cấu hình vào popover/sidebar |
| 2 | `app/globals.css` | Modified | Design System: màu form badges, pill badges, card lift, nút bấm |
| 3 | `app/layout.tsx` | Modified | Nạp phông chữ Roboto self-hosted và meta tags |
| 4 | `app/login/login-form.tsx` | Modified | Tối ưu giao diện đăng nhập và thuộc tính trợ năng |
| 5 | `app/pro7-app.tsx` | Modified | Tối ưu chuyển đổi Dark Mode |
| 6 | `app/responsive.css` | Modified | Responsive trên di động, touch target >= 44px |
| 7 | `app/teams/[slug]/funds/funds-view.tsx` | Modified | Modal thanh toán VietQR và giao dịch quỹ đội |
| 8 | `app/teams/[slug]/matches/[matchId]/match-detail.tsx` | Modified | So sánh thông số trận, form sửa tỉ số dành cho Admin |
| 9 | `app/teams/[slug]/matches/matches-view.tsx` | Modified | Danh sách lịch sử trận đấu, nút đồng bộ, pill badges |
| 10 | `app/teams/[slug]/overview/overview-view.tsx` | Modified | Thẻ thống kê đồng đều, hover lift cả thẻ, link trận cũ |
| 11 | `app/teams/[slug]/squad/squad-view.tsx` | Modified | Phong độ cầu thủ theo số lần ra sân thực tế |
| 12 | `app/teams/[slug]/tactics/[matchId]/tactics-board.tsx` | Modified | Sa bàn chiến thuật cho cả trận đã kết thúc |
| 13 | `app/typography.css` | Modified | Hệ thống tỷ lệ kiểu chữ ngữ nghĩa |
| 14 | `lib/tactics/queries.ts` | Modified | Cho phép truy vấn sa bàn trận đã kết thúc |
| 15 | `tests/typography-contract.test.ts` | Modified | Khế ước kiểm thử Typography >= 12px |
| 16 | `public/fonts/*` | Added | Phông chữ Roboto Latin & Vietnamese self-hosted |
| 17 | `scripts/run-unit-tests.mjs` | Added | Runner unit test chỉ quét thư mục `tests/` hoặc các file focused được truyền rõ ràng |

---

## 4. Hướng Dẫn Kiểm Thử QA (QA Verification Steps)

### A. Kiểm Thử Tự Động (Automated Test Suites)
Chạy các lệnh sau tại thư mục gốc dự án:
```bash
# 1. Kiểm tra build và kiểm thử tích hợp render HTML
npm test

# 2. Kiểm tra khế ước Typography (WCAG >= 12px)
node --test tests/typography-contract.test.ts

# 3. Kiểm tra các trang trận đấu
npm run test:unit -- tests/matches-pages.test.ts

# 4. Kiểm tra các trang đội hình
npm run test:unit -- tests/squad-pages.test.ts

# 5. Kiểm tra sa bàn chiến thuật
npm run test:unit -- tests/tactics-mounted.test.ts
```
*Kết quả yêu cầu: 100% tests Passed, Build 0 lỗi.*

---

### B. Kiểm Thử Thủ Công Trên Trình Duyệt (Manual Walkthrough)
1. **Đăng nhập**:
   - URL: `http://localhost:3000/login`
   - Dùng tài khoản QA được cung cấp ngoài repository.
   - Không lưu username, password, JWT hoặc service key trong tài liệu và script.
2. **Kiểm tra Trang Tổng Quan (`/teams/nat-fc/overview`)**:
   - Kiểm tra 4 thẻ thống kê ở giữa màn hình có chiều cao bằng nhau, gióng hàng thẳng tắp.
   - Rê chuột (hover) vào thẻ **PHONG ĐỘ GẦN ĐÂY**: Kiểm tra **toàn bộ thẻ nổi lên (`translateY(-3px)`)**, huy hiệu `W` màu xanh lá không bị giật/phóng to.
   - Bấm vào thẻ: Kiểm tra trang tự động chuyển sang `/teams/nat-fc/matches`.
3. **Kiểm tra Trang Đội Hình (`/teams/nat-fc/squad`)**:
   - Kiểm tra các cầu thủ chưa đá trận nào hiển thị `Ra sân: Chưa ra sân (0 trận)`.
   - Cầu thủ đã tham gia trận đấu hiển thị đúng số trận và huy hiệu kết quả.
4. **Kiểm tra Trang Trận Đấu (`/teams/nat-fc/matches`)**:
   - Kiểm tra phần **LỊCH SỬ THI ĐẤU**:
     - Tên đội `FC NÁT` nằm trên 1 hàng, không bị rớt dòng chữ `NÁT`.
     - Huy hiệu `THẮNG` dạng viên thuốc (pill) xanh nhạt viền mảnh, chữ nằm gọn trong khung, không tràn viền.
     - 2 nút `Chiến thuật` và `Xem phân tích →` có cùng chiều cao 38px, thẳng hàng.
5. **Kiểm tra Chi Tiết Trận & Quản Trị Tỉ Số**:
   - Bấm `Xem phân tích →` ở một trận đã kết thúc.
   - Kiểm tra bảng so sánh thông số (Kiểm soát, Cú sút, Trúng đích, Phạt góc) hiển thị đầy đủ.
   - Kiểm tra form Admin: sửa tỉ số và bấm "Cập nhật tỉ số" thành công.
   - Bấm nút "Sa bàn chiến thuật" ở đầu trang: Kiểm tra sa bàn mở ra thành công, không bị 404.
6. **Kiểm tra Chế Độ Tối (Dark Mode)**:
   - Bấm nút biểu tượng Mặt trăng / Mặt trời ở góc trên bên phải.
   - Kiểm tra toàn bộ thẻ, nút bấm, viền và huy hiệu hiển thị tương phản sắc nét.

## Security release blocker

- A previously committed QA credential must be rotated before production release.
- Removing it from the latest tree does not invalidate copies in Git history.
- Rotation and any history rewrite require separate explicit authorization.
