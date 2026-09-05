# Kiểm thử lời mời và RSVP — 05/09/2026

## Phạm vi và giới hạn

Kiểm thử UI thật trên `http://127.0.0.1:3000`, kết nối backend hiện tại. Chỉ ghi dữ liệu đội `pro7-qa-20260905`; không sửa FC NÁT, không deploy. Phiên đăng nhập hiện có là hunglt, vai trò owner trong đội QA. Đây chưa phải kiểm thử độc lập bằng tài khoản member.

Trận kiểm thử: `fe371deb-be44-42d3-a1cb-09e7c7eb1113`, đối thủ “QA RSVP — không thi đấu thật”, sân QA, 19:00 ngày 13/09/2026, hạn phản hồi 17:00 cùng ngày. Trận được giữ lại để kiểm tra tiếp.

Ảnh bằng chứng: `/Users/everygolflb/.codex/visualizations/2026/08/24/01a033cf-894c-7760-94ab-ada21d8eaea8/pro7-e2e-20260905/`.

## Các bước đã chạy

| Bước | Thao tác | Kết quả quan sát | Trạng thái / ảnh |
| --- | --- | --- | --- |
| 1 | Tạo trận QA sắp diễn ra | Hiện trong lịch và trang chi tiết | PASS |
| 2 | Mời membership Lê Thành Hưng trong đội QA | Xuất hiện Đang chờ; chuông thông báo tăng lên 1 | PASS / 11-rsvp-invited.png |
| 3 | Mở chuông, bấm lời mời | Link đúng `/teams/pro7-qa-20260905/matches/fe371deb-be44-42d3-a1cb-09e7c7eb1113/rsvp`; mở màn Xác nhận tham gia | PASS / 12-rsvp-ready.png |
| 4 | Bấm Có trên màn RSVP | Tự chuyển về chi tiết, bảng quản trị ghi 1 chắc chắn; reload vẫn giữ | PASS / 13-rsvp-yes-reloaded.png |
| 5 | Mở lại cùng link, bấm Có thể | Chuyển về chi tiết, 0 chắc chắn; tên ở nhóm Chưa chắc chắn; reload vẫn giữ | PASS / 14-rsvp-maybe-reloaded.png |
| 6 | Mở lại cùng link, bấm Không | Bảng ghi Vắng, 0 chắc chắn; reload vẫn giữ | PASS / 15-rsvp-no-reloaded.png |
| 7 | Admin bấm Mời thành viên lần nữa | Phản hồi Vắng không bị reset | PASS; chưa đối chiếu số hàng notification trong DB |
| 8 | Bấm Chia sẻ lời mời | UI chuyển Đang mở…; chưa xác nhận được hoàn tất native share sheet/OTT | CHƯA KẾT LUẬN / 17-share-pending.png |
| 9 | Mở RSVP của trận QA khác chưa mời tài khoản | Hiện Bạn chưa được mời, không có lựa chọn phản hồi | PASS / 18-rsvp-not-invited.png |
| 10 | Đặt hạn QA về 04/09 rồi mở RSVP | Hiện Đã hết hạn xác nhận; sau kiểm tra đã lưu lại hạn 13/09 17:00 | PASS / 19-rsvp-deadline-closed.png |
| 11 | Browser Chromium mới không đăng nhập, truy cập link RSVP | Redirect `/login`, tham số `next` giữ nguyên toàn bộ path RSVP; không có pageerror | PASS / 16-rsvp-anonymous-login.png |

Script lặp lại bước 11: `scripts/qa-rsvp-anonymous.mjs`. Chạy với biến `QA_SCREENSHOTS` là thư mục ảnh tuyệt đối. Chromium Playwright đã được tải để chạy test này. Kết quả thực thi: exit 0, `PASS anonymous RSVP redirects to login, preserves exact next path, no page errors`.

## Điểm cần điều tra / chưa đạt cổng nghiệm thu

1. Provision tài khoản QA từ 127.0.0.1 bị từ chối: “Nguồn yêu cầu không được chấp nhận.” Chưa thể kiểm thử luồng owner → member bằng hai phiên độc lập. Đã đề nghị đăng nhập localhost:3000; chưa thay cấu hình Edge Function production.
2. Chia sẻ URL và mời membership là hai thao tác khác nhau. Theo code, nút chia sẻ không tạo attendance. Vì vậy gửi link cho người chưa được mời sẽ không cho accept. Đây là hành vi đã tái hiện, chưa kết luận là lỗi người dùng vừa báo.
3. URL chia sẻ dùng origin hiện tại. Link tạo trên localhost/127.0.0.1 không dùng để mở app từ điện thoại khác; cần kiểm tra link production riêng.
4. Native share/clipboard/nhận link trong Zalo hoặc Messenger chưa có bằng chứng hoàn tất; không coi việc bấm nút là gửi thành công.
5. Chưa kiểm thử đăng nhập thành công từ link bằng QA member, tài khoản khác đội, stale-version hai phiên, mất mạng, double-click, hủy trận rồi accept và push notification hệ điều hành.
6. Nhãn LỜI MỜI TRẬN ĐẤU trên light mode có tương phản thấp trong ảnh 12. Không đổi CSS trong lượt kiểm thử này.

## Kết luận

Đã chứng minh thao tác Có/Có thể/Không có ghi nhận thật và tồn tại sau reload với membership owner đã được mời trong đội QA. Chưa tái hiện lỗi accept của người dùng và chưa đủ bằng chứng tuyên bố toàn bộ luồng member/OTT hoạt động. Không push production.
