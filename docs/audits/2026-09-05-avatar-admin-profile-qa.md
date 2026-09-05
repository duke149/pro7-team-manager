# Audit avatar và quyền sửa hồ sơ — 05/09/2026

Không thay dữ liệu thật, không upload Storage, không deploy. Hồ sơ Nguyễn Hùng trong FC NÁT chỉ được mở để đọc bằng tài khoản hunglt (admin).

## Avatar

- PASS: Playwright Chromium chạy component thật trong fixture cô lập; ảnh vuông bốn màu 800×800. Kéo ở zoom 100% bị clamp về tâm (không dư ảnh ngoài khung). Sau zoom 200%, pointer drag thay đổi cả X và Y. Confirm trả đúng transform, Reset trả về tâm.
- PASS: test hàm crop xác minh rectangle xuất, clamp biên và WebP; test form xác minh đưa blob crop vào luồng upload. Đây là test có mock biên Storage, không chứng minh upload live.
- GAP: chưa có xoay ảnh hoặc resize vùng chọn bằng tay nắm bốn góc. Khung crop cố định vuông, xuất 512×512.
- BUG từ đối chiếu CSS/geometry: `.account-avatar-crop-mask::after` dùng `inset:10%` trong khi `createAvatarCropDrawPlan` xuất toàn bộ khung. Vòng tròn hướng dẫn không trùng vùng avatar tròn khi hiển thị toàn bộ ảnh xuất. Cần đồng nhất preview và output.
- Chưa kiểm chứng touch drag trên iOS Safari, EXIF rotation và lưu avatar live/reload đội hình bằng tài khoản QA.

Script: `scripts/qa-avatar-browser.mjs` (cần QA_SCREENSHOTS). Kết quả thực thi exit 0. Ảnh: `/Users/everygolflb/.codex/visualizations/2026/08/24/01a033cf-894c-7760-94ab-ada21d8eaea8/pro7-e2e-20260905/20-avatar-drag-2x.png`. Fixture không nạp toàn bộ font/theme app nên ảnh chỉ làm bằng chứng tương tác crop, không dùng làm kết luận typography.

## Admin sửa cầu thủ

UI thực tế và payload `player-detail.tsx` / `lib/squad/actions.ts` cùng xác nhận:

| Nhóm trường | Hiện trạng |
| --- | --- |
| Vai trò, số áo, vị trí chính, tình trạng, ngày gia nhập, ghi chú | Có form quản trị và API |
| Tên, điện thoại, ngày sinh, chiều cao, cân nặng, vị trí ưa thích | Không có form sửa từ admin; API hồ sơ cá nhân chỉ nhắm chính người đăng nhập |
| Avatar người khác | Chưa có control/admin upload; cơ chế avatar hiện giới hạn chủ sở hữu |
| Thống kê thi đấu | Không có form sửa tại hồ sơ cầu thủ; không được coi sửa thống kê trận là đã có sửa toàn bộ profile |
| Owner | UI chặn sửa membership owner; cần giữ tách biệt quyền hồ sơ và quyền chuyển owner khi mở rộng |

Ảnh read-only: `/Users/everygolflb/.codex/visualizations/2026/08/24/01a033cf-894c-7760-94ab-ada21d8eaea8/pro7-e2e-20260905/21-admin-player-fields.png`.

Phát hiện thêm: danh sách cầu thủ hiển thị “Không thể tải phong độ” trên nhiều thẻ; chưa truy nguyên trong lượt này.

## Kết quả regression

38/38 test đạt trong avatar-crop, avatar-crop-dialog, profile-avatar-crop-mounted, squad-actions, squad-player-detail-mounted, profile-actions. Các test chứng minh hành vi hiện có, không chứng minh chức năng admin còn thiếu đã được triển khai. Kiểm thử CRUD hai tài khoản QA vẫn vướng provision origin như báo cáo RSVP.

## Phần cần xây dựng tiếp

1. Đồng nhất vùng preview/output; bổ sung điều khiển căn vị trí dễ thấy, xem xét xoay/tay nắm crop theo phạm vi được duyệt.
2. Bổ sung form và API admin sửa thông tin/avatar cùng đội, kiểm tra quyền server/RLS, giới hạn trường và audit log. Không mở rộng endpoint self-profile bằng userId tùy ý.
3. Kiểm thử member không sửa người khác, admin không sửa khác đội; lưu/reload thông tin và ảnh ở cả Profile/Đội hình bằng QA accounts.
