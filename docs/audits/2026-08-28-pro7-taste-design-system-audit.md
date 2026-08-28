# PRO7 Taste design-system audit

Ngày audit: 2026-08-28
Phạm vi: Login, Account, Overview, Squad, Matches, Tactics, Funds, Admin Settings, shell điều hướng và các trạng thái loading/error/modal trên localhost.
Chuẩn tham chiếu: Taste (`redesign-existing-projects`), UI/UX Pro Max và Checklist Design.
Theme: đen, trắng, đỏ; không dùng neon.

## Scope and versions

- Nhánh kiểm tra: `codex/qa-backend-crud-completion`.
- Baseline trước đợt Taste: commit `c186f6a`.
- Font production được pin và self-host bằng `@fontsource-variable/open-sans@5.3.0` và `@fontsource/barlow@5.3.0`.
- Không thay đổi schema, dữ liệu Supabase, quyền RLS/RPC hoặc nghiệp vụ CRUD trong đợt này.
- `supabase/.temp/` được giữ nguyên, không stage hay chỉnh sửa.

## Before/after source findings

| Hạng mục | Trước | Sau |
|---|---|---|
| Font | Nhiều lớp font và vai trò chưa thống nhất | Open Sans cho body/control; Barlow cho display, heading và số liệu |
| Line height | Nhiều selector kế thừa hoặc dùng nhịp rời rạc | Body/copy `1.5`; heading/label/control `1.25` |
| Spacing | Nhiều gap/padding lẻ theo từng màn hình | Nhịp chính 8/12/16/24/32px; page stack 24px desktop và 16px mobile |
| Card | Radius/shadow khác nhau giữa module | Radius chính 12px; modal/popover 16px; shadow dùng token chung |
| Touch target | Một số control nhỏ hoặc không đồng nhất | Control tương tác mobile tối thiểu 44px; form input mobile 48px |
| Responsive shell | Navigation và content có nguy cơ lệch ở tablet/mobile | Sidebar/drawer/bottom navigation có breakpoint rõ; 4 mục Member và 5 mục Admin có contract riêng |
| Palette | Còn màu pitch xanh và token cũ sai nghĩa | Đen–trắng–đỏ/trung tính; pitch đen với grid đỏ; không còn neon có nghĩa trong production CSS |
| Kết quả trận | Win/Draw/Loss cùng dùng đỏ thương hiệu ở một số card | Win xanh lá, Draw xám trung tính, Loss đỏ trên Overview, Squad, Matches và chi tiết trận; cùng nghĩa ở light/dark |
| Login | Có CTA “Trải nghiệm bản Demo” | CTA quảng bá demo đã xóa; login chỉ còn luồng xác thực thật |

## Automated verification

- Unit: 580 kiểm tra; 575 đạt; 0 lỗi; 5 kiểm tra PostgreSQL/Supabase phụ thuộc môi trường được skip có chủ đích.
- Typography contract xác nhận font, semantic scale, line-height `1.5/1.25`, input mobile 16px và không còn microtype production.
- Design-system/CSS audit: 17/17 đạt.
- Matches/Tactics focused: 104/104 đạt.
- Admin/shared focused: 38/38 đạt.
- ESLint toàn bộ phạm vi `app/layout.tsx`, `app/components`, `app/login`, `app/account`, `app/teams` và ba CSS contract: đạt, không warning.
- `git diff --check`: đạt.
- Production build/render được chạy ở gate cuối; các cảnh báo Node `DEP0205`, middleware deprecation và cổng Vite HMR là cảnh báo công cụ hiện hữu, không phải lỗi test.

Review độc lập sau gate đầu đã phát hiện và xác nhận sửa ba regression cascade: badge vị trí GK/DEF không còn teal/vàng, nút hiện mật khẩu và account menu đạt 44×44px, và wordmark PRO7 giữ Barlow thay vì bị selector con trả về Open Sans.

## Member browser matrix

| Route | Viewport đã quan sát | Kết quả |
|---|---:|---|
| `/login` | 390×844 | Không overflow; không còn CTA demo; Open Sans/Barlow resolve đúng |
| `/account/profile` | 390×844 | Form một cột, control đủ cao, theme control có tên truy cập rõ |
| `/teams/nat-fc/overview` | 390×844 | Page gap 16px, card radius 12px, heading dùng nhịp 1.25 |
| `/teams/nat-fc/squad` | 390×844 | Filter cuộn ngang, card stack đúng, không tràn body |
| `/teams/nat-fc/matches` | 390×844 | History card responsive, RSVP action cao 44px, không tràn ngang |
| `/teams/nat-fc/tactics` | 390×844 | Empty/list state gọn trong viewport; không có applied tactic để kiểm tra pitch thật |
| Funds / Admin Settings | Member | Trả 404 đúng permission; bottom nav chỉ có 4 mục |

Các breakpoint 320, 375, 390, 414, 768, 1024 và 1440px được khóa thêm bằng responsive contract để ngăn regression về width, tablet drawer và bottom navigation.

## Admin browser matrix

- Tài khoản Admin thử nghiệm đăng nhập thành công nhưng middleware chuyển bắt buộc tới `/account/change-password` theo policy first-login.
- Không tự đổi mật khẩu và không bypass policy chỉ để chụp giao diện.
- Vì vậy Funds/Admin Settings và bottom navigation 5 mục chưa được tuyên bố là đã re-verify bằng browser trong phiên này.
- Contract test vẫn xác nhận 5 mục Admin có `min-height: 56px`, phân bố đều tại 320/375/390/414px và không làm đổi boundary permission.
- Route Matches thật trong phiên Admin hiện chuyển tới `/account/change-password`; vì vậy vòng sửa màu này xác nhận browser trên trạng thái Overview công khai nội bộ và dùng render/CSS contract cho list/detail Matches thay vì bypass policy xác thực.

## Theme and accessibility results

- Light/dark dùng chung semantic token và cùng hierarchy; primary palette đen–trắng–đỏ.
- Xanh lá chỉ là ngoại lệ ngữ nghĩa cho trạng thái thắng; không được dùng làm màu thương hiệu hay CTA. Hòa dùng xám, thua dùng đỏ để người dùng không hiểu nhầm kết quả.
- Focus-visible vẫn hiện rõ trên button, link, input và segmented control.
- Copy dùng line-height 1.5 để đọc đoạn dài; heading/label/control dùng 1.25 để giữ baseline và chiều cao control ổn định.
- Mobile input giữ 16px để tránh Safari tự zoom.
- Bottom navigation, icon button và form action đáp ứng touch target tối thiểu 44px; nav item tối thiểu 56px.
- `prefers-reduced-motion` tiếp tục vô hiệu animation/transition không thiết yếu.
- Modal/popover giữ Escape, focus trap hoặc focus restoration theo component tương ứng.

## Remaining documented exceptions

1. Cần hoàn tất một lượt browser Admin sau khi người dùng chủ động đổi mật khẩu first-login để xác nhận trực quan Funds, Settings và bottom nav 5 mục.
2. Tài khoản Member hiện không có applied tactic phù hợp, nên pitch thật chưa được quan sát trong browser; contract/mounted test và CSS audit đang bao phủ phần này.
3. Chưa có kiểm tra VoiceOver/NVDA trên thiết bị thật hoặc ma trận contrast tự động cho toàn bộ trạng thái.
4. Route `/demo` cũ vẫn tồn tại cho mục đích nội bộ, nhưng không còn được quảng bá hoặc liên kết từ Login.
5. `npm audit` của dependency tree vẫn báo 15 mục (1 low, 4 moderate, 10 high); không chạy sửa tự động vì có thể thay đổi dependency ngoài phạm vi giao diện.

## Screenshot inventory

Ảnh được quan sát trực tiếp bằng in-app Browser và không lưu vào repository:

- Login mobile, 390×844, CTA demo đã biến mất.
- Account Profile mobile, 390×844, form một cột.
- Overview mobile, 390×844, light/dark shell.
- Squad mobile, 390×844, filter và card stack.
- Matches mobile, 390×844, RSVP/history.
- Tactics mobile, 390×844, empty/list state.
- Member denial state cho Funds và Admin Settings.

Kết luận: typography và spacing đã có quy ước thống nhất, responsive shell không còn phụ thuộc vào các giá trị lẻ theo từng màn hình, và giao diện giữ đúng PRO7 đen–trắng–đỏ. Điểm nghiệm thu trực quan còn lại là phiên Admin sau khi hoàn tất đổi mật khẩu bắt buộc.
