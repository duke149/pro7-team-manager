# PRO7 frontend audit theo Checklist Design

Ngày audit: 2026-08-26
Phạm vi: frontend đang render tại `http://localhost:3000`, gồm Login, Overview, Squad, Match, Tactics, Funds, Admin Settings, Account Profile; light/dark theme; source component TSX và `app/globals.css`.
Checklist gốc: [Checklist Design](https://www.checklist.design/skill)

Quy ước: 🟢 đạt; 🟡 đạt một phần/cần cải thiện; 🔴 chưa đạt; ⚪ không áp dụng cho MVP hiện tại; ❔ không đủ bằng chứng để xác nhận.

Phần bảng chi tiết bên dưới ghi lại baseline lúc bắt đầu audit. Sau khi người dùng duyệt triển khai, các phát hiện ưu tiên đã được sửa và kiểm tra lại bằng contract test, production build và phiên đăng nhập thật trên localhost.

## Re-audit sau triển khai

| Hạng mục ưu tiên | Trạng thái sau sửa | Bằng chứng xác nhận |
|---|---:|---|
| Responsive tablet 768–1023px | 🟢 | Shell dùng header gọn + drawer 270px và ẩn bottom navigation. Browser tại 768px xác nhận nav `display:none`, drawer/scrim hoạt động, Squad giữ lưới hai cột và không tràn ngang. |
| Chữ nhỏ và touch target | 🟢 | Phone navigation 12px; Profile label 14px; input mobile 16px/48px; Theme, Notification, Account, search và filter đạt tối thiểu 44px. |
| Header và tài khoản mobile | 🟢 | Theme + notification badge + account menu đều dùng được tại 320–375px. Account menu đưa Hồ sơ/Cài đặt được phép/Đăng xuất vào popover, đóng bằng Escape và trả focus cho trigger. |
| Admin Settings | 🟢 | Đã có 5 module dữ liệu thật: hồ sơ đội, thành viên & vai trò, thông báo trận đấu, audit log redacted và danger zone có xác nhận tên/slug. Mọi mutation vẫn đi qua RLS/RPC và permission riêng. |
| Token màu và neon | 🟢 | Bổ sung primitive → semantic → component tokens; loại tên token sai nghĩa và toàn bộ giá trị xanh/neon còn sót. Hai theme chỉ dùng hệ đen–trắng–đỏ/trung tính. |
| Modal keyboard | 🟢 | Modal Thêm cầu thủ dùng primitive chung có initial focus, Tab/Shift+Tab trap, Escape và trả focus; callback đóng ổn định khi parent re-render. |
| Authentication UX | 🟢 | Login có nút hiện/ẩn mật khẩu; thêm forgot/reset password với phản hồi trung lập; first-login đổi mật khẩu thiết lập lại session bằng mật khẩu mới sau khi Admin API vô hiệu refresh token cũ. |
| Notification/RVSP | 🟢 | Header dùng notification thật, badge chưa đọc, deep link an toàn và mark-read self-only. Luồng thật trận `fc nat` tại `CK2` đã được chạy lại sau provisioning: Admin mời toàn bộ thành viên active, Bùi Hữu Quyền nhận thông báo, mở deep link và trả lời Có; Admin thấy `3/25` và trạng thái “Có mặt”. |
| Member permission boundary | 🟢 | Kiểm tra tài khoản cầu thủ: Squad/Match/Tactics/Profile được xem đúng quyền; Funds và Admin Settings trả 404; CTA quản trị bị ẩn. |
| Reduced motion | 🟢 | Có `prefers-reduced-motion: reduce` để tắt animation/transition không thiết yếu. |

Các mục còn 🟡/🔴 ở bảng baseline là khuyến nghị dài hạn ngoài lát cắt đã duyệt (ví dụ VoiceOver/NVDA trên thiết bị thật, drag/drop avatar có progress, token governance/changelog đầy đủ và analytics nâng cao); chúng không được tuyên bố đã hoàn thành nếu chưa có bằng chứng tương ứng.

## UI/UX Pro Max responsive re-audit

Đợt kiểm tra bổ sung dùng trực tiếp UI/UX Pro Max cùng phiên browser localhost đã đăng nhập. Viewport được đo tại 320, 375, 414, 768, 1024 và 1440px; kiểm tra light/dark trên Overview và Profile.

| Màn hình | Viewport | Kết quả |
|---|---:|---|
| Overview | 375px | Header 72px, ba action 44×44px, notification popover 355px nằm trong viewport, bottom nav cố định 72px và phân bố đều bốn route Member. |
| Squad | 768px | Không còn bottom nav 138px rơi xuống cuối trang; drawer là navigation duy nhất, grid hai cột 358px và body không overflow. |
| Matches | 1024px | Sidebar desktop 250px, bottom nav ẩn, content không overflow và RSVP hierarchy giữ nguyên. |
| Overview | 1440px | Sidebar/content ratios và bốn stat cards giữ nguyên giao diện đã duyệt. |
| Profile | 375px | Form một cột, input 48px/16px, label 14px; cả light/dark không overflow. |
| Tactics | 375px | Member empty/applied state nằm gọn trong viewport; bottom navigation không che nội dung. |

Funds và Admin Settings đã được recheck bằng phiên Admin thật ở desktop: cả hai dùng Be Vietnam Pro, không tràn ngang; Funds có CTA thu/chi và Settings có đủ 5 module. Năm mục bottom navigation Admin ở 320/375/414px được giữ bằng responsive contract; phiên browser Member tiếp tục không thấy Funds/Settings theo đúng permission.

## Typography và Auth/Roster re-audit cuối

| Hạng mục | Kết quả | Bằng chứng |
|---|---:|---|
| Typeface | 🟢 | Chỉ dùng Be Vietnam Pro self-hosted; WOFF2 hash `7eac7000f8156452c799ba630a0b71153a9cd5001a95c56dd15468670e247d0a`, OFL được lưu cùng asset, không gọi font CDN. |
| Type scale | 🟢 | Có semantic token cho display/heading/body/control/label/caption/input; production CSS không còn text có nghĩa 6–11px, weight 900 hoặc tracking trên `.08em`. |
| Browser font | 🟢 | Login, Match, Funds và Settings đều resolve computed family `Be Vietnam Pro`; tên tiếng Việt hiển thị dấu đúng và desktop không có horizontal overflow. |
| Username Auth | 🟢 | 23/23 username đăng nhập bằng email nội bộ `<username>@pro7.test`; Login vẫn giữ luồng email bình thường và bắt buộc đổi mật khẩu ở lần đầu. |
| Roster/RBAC | 🟢 | 24 active membership gồm Owner; roster 23 người gồm 3 Admin/20 Member; Đức Lee, Tuấn Đạt và Trung Hiếu giữ UUID cũ; Phi Hùng inactive nhưng lịch sử trận được giữ. |
| Provisioning guard | 🟢 | CLI bắt buộc Supabase URL khớp project ref đã pin, fail-closed nếu Auth Admin trả sai ID/email; SQL preflight phân biệt chính xác trạng thái legacy trước Auth và target-only sau Auth. Credential tạm không nằm trong tracked test/log. |
| Mobile form cascade | 🟢 | Computed-style contract ở viewport 375px xác nhận input Match là 16px sau toàn bộ cascade, không chỉ kiểm tra token bằng regex. |
| Match mutation reconciliation | 🟢 | Browser phát hiện Vinext giữ RSC props cũ sau `router.refresh()`. Luồng Match đã chuyển sang hard reload chỉ sau mutation thành công; browser xác nhận RSVP “Không” rồi “Có” cập nhật ngay count/trạng thái và token authoritative. |

Sau khi hoàn tất provisioning, Owner/Admin đã chủ động kiểm tra CRUD hồ sơ đội bằng cách đổi `PRO7 FC / pro7-fc` thành `FC NÁT / nat-fc`. Dữ liệu liên kết theo `team_id` vẫn được giữ nguyên. Các artifact onboarding cố ý tiếp tục pin slug ban đầu `pro7-fc`, nên một lần chạy lại sẽ fail-closed cho tới khi slug được khôi phục hoặc một plan onboarding mới được duyệt.

## Addendum 2026-08-28 — Taste design-system polish

Phần typography “Be Vietnam Pro” phía trên là bằng chứng lịch sử và đã được thay thế theo quyết định mới của sản phẩm. Production hiện dùng Open Sans cho body/control và Barlow cho display/heading/numeric; body/copy dùng line-height `1.5`, còn heading/label/control dùng `1.25`. Audit mới, bằng chứng responsive và các ngoại lệ browser được ghi tại [PRO7 Taste design-system audit](./2026-08-28-pro7-taste-design-system-audit.md).

## Phát hiện ưu tiên

1. 🔴 Responsive ở vùng tablet hẹp bị vỡ. Tại viewport browser khoảng 803px, sidebar desktop vẫn chiếm 250px nhưng header chưa chuyển sang mobile cho tới 760px; tiêu đề bị xuống từng từ và cụm tài khoản/đăng xuất bị cắt khỏi màn hình.
2. 🔴 Kiểu chữ quá nhỏ trên diện rộng. CSS có nhiều nhãn 6–9px; đây là vấn đề đọc hiểu và accessibility rõ ràng, đặc biệt ở navigation, metadata, badge, fixture và card.
3. 🔴 Admin Settings mới là placeholder, chưa có cấu trúc settings, quản trị role/user, audit log hay danger zone như phạm vi MVP đã mô tả.
4. 🔴 Design token chưa được hệ thống hóa. `app/globals.css` dùng hàng trăm giá trị màu trực tiếp nhưng chỉ có một nhóm biến gốc nhỏ; token `--lime` hiện chứa màu đỏ, gây sai nghĩa và khó bảo trì theme.
5. 🟡 Light/dark theme nhìn chung đúng đen–trắng–đỏ, nhưng CSS vẫn còn dấu vết neon/xanh trong trạng thái cũ như focus `rgba(156,255,56,...)`, pitch grid và một số màu hover/component trước lớp override.
6. 🟡 Modal Match/Funds đã có focus trap và Escape, nhưng modal Thêm cầu thủ chưa có cùng hành vi keyboard; hệ thống component chưa đồng nhất.
7. 🟡 UI dùng card, button, trạng thái loading/error và permission gating khá tốt; các lát cắt CRUD chính giữ đúng phong cách PRO7 và dữ liệu thật/demo từ backend.

## Nền tảng design system

### [Accessibility](https://www.checklist.design/design-system/accessibility)

| Checklist item | Trạng thái | Bằng chứng/nhận xét |
|---|---:|---|
| Target conformance level | 🟡 | Nhiều pattern hướng WCAG đã có trong code, nhưng chưa thấy tài liệu cam kết AA/AAA hoặc contribution checklist. |
| Colour contrast standards | 🟡 | Đen/trắng/đỏ chính có độ tương phản tốt; nhiều chữ phụ rất nhỏ và xám nhạt chưa có bảng contrast được xác nhận cho cả hai theme. |
| Focus indicator design | 🟡 | Có `:focus-visible` cho input/button/link và theme red override; một số component dùng focus riêng, nhưng không phải mọi custom control đều có cùng chuẩn. |
| Keyboard navigation patterns | 🟡 | Match/Funds modal có Tab wrap, Escape và trả focus; tactics hỗ trợ keyboard. Modal Thêm cầu thủ chưa có focus trap/Escape tương ứng. |
| ARIA pattern library | 🟡 | Có `aria-label`, `aria-pressed`, `aria-busy`, `aria-live`, `role=alert/status/dialog`; chưa có thư viện/pattern dùng chung và vài segmented group chỉ là `div` có label. |
| Screen reader testing | ❔ | DOM accessibility tree có tên điều khiển tương đối tốt, nhưng không có bằng chứng test VoiceOver/NVDA. |
| Accessibility annotations in design | ❔ | Không có design file/annotation kit trong phạm vi repo để xác nhận. |
| Accessibility in contribution guidelines | 🔴 | Không thấy accessibility checklist trong hướng dẫn đóng góp. |

### [Color System](https://www.checklist.design/design-system/color-system)

| Checklist item | Trạng thái | Bằng chứng/nhận xét |
|---|---:|---|
| Primitive palette | 🔴 | Không có ramp màu có hệ thống; màu được khai báo trực tiếp rất nhiều trong CSS. |
| Semantic color tokens | 🟡 | Có biến `--ink`, `--muted`, `--line`, `--paper`, `--red`; phần lớn component vẫn tham chiếu raw hex. `--lime` thực tế là đỏ nên tên token sai nghĩa. |
| Interactive state colors | 🟡 | Hover/focus/disabled/active có ở phần lớn control, nhưng không đồng nhất giữa các shell và thiếu pressed state rõ ràng ở nhiều nơi. |
| Feedback colors | 🟡 | Error/success/status có text kèm màu; token feedback chưa được chuẩn hóa và dark mode dùng nhiều giá trị riêng lẻ. |
| Contrast ratios (accessibility) | 🟡 | Chưa có ma trận contrast; nhiều metadata xám 6–9px có nguy cơ không đạt AA dù brand red/black/white chính dễ đọc. |
| Dark and light mode definition | 🟢 | Dashboard, route shell và profile có light/dark rõ ràng; kiểm tra trực quan cho thấy nội dung và card chuyển theme nhất quán. |
| Brand color integration | 🟡 | Đỏ PRO7 được dùng nhất quán cho active/CTA; vẫn còn residual green/neon ở một số declaration nền, hover và pitch. |
| Color blindness considerations | 🟡 | Status quan trọng thường có text/icon; một số dot và W/L badge vẫn phụ thuộc mạnh vào màu. |

### [Typography](https://www.checklist.design/design-system/typography)

| Checklist item | Trạng thái | Bằng chứng/nhận xét |
|---|---:|---|
| Type scale | 🔴 | Kích thước 6–36px được đặt trực tiếp theo selector, chưa theo modular scale. |
| Semantic text styles | 🔴 | Chưa có token/style theo vai trò như body/label/caption; style gắn chặt vào class màn hình. |
| Typeface selection and loading | 🔴 | CSS tham chiếu Inter và Montserrat nhưng root layout không load font; trình duyệt có thể rơi về Arial. |
| Line height per style | 🟡 | Body/form copy có line-height ở vài nơi; nhiều heading, label và metadata dùng mặc định. |
| Letter spacing per style | 🟡 | Kicker/label dùng letter-spacing khá nhất quán về cảm giác, nhưng không có semantic style chung. |
| Responsive type behaviour | 🟡 | Có override cho mobile; vùng 761–900px làm heading bị co và xuống dòng không kiểm soát. |
| Minimum readable size | 🔴 | Nhiều nhãn/metadata/badge ở 6–9px, thấp hơn mức đọc thoải mái trên desktop và mobile. |
| Accessibility responsiveness | 🔴 | Chưa có bằng chứng 200% zoom; lỗi overflow ở tablet hẹp cho thấy phóng to dễ làm mất nội dung. |

### [Spacing / Grid](https://www.checklist.design/design-system/spacing-and-grid)

| Checklist item | Trạng thái | Bằng chứng/nhận xét |
|---|---:|---|
| Spacing scale | 🔴 | Padding/gap dùng nhiều số rời rạc thay vì base-4/base-8 thống nhất. |
| Semantic spacing tokens | 🔴 | Không có spacing token; toàn bộ khoảng cách đang hardcode trong selector. |
| Column grid | 🟡 | Các layout 2 cột, 3 card, 4 stat rõ ràng nhưng là grid theo từng màn, chưa có hệ 4/8/12 cột dùng chung. |
| Breakpoints | 🟡 | Có nhiều breakpoint 390/420/520/720/760/900/980/1100 nhưng không có token/tên dùng chung; khoảng trống 761–900 gây lỗi header. |
| Component vs layout spacing | 🟡 | Nhìn trực quan có phân biệt page gap và component padding, nhưng chưa được mã hóa thành hai scale riêng. |
| Density variants | ⚪ | MVP chưa yêu cầu compact/comfortable density selector. |
| Baseline grid alignment | 🟡 | Card và control khá thẳng hàng; chữ 6–9px cùng chiều cao linh hoạt làm nhịp baseline chưa ổn định. |

### [Tokens](https://www.checklist.design/design-system/tokens)

| Checklist item | Trạng thái | Bằng chứng/nhận xét |
|---|---:|---|
| Three-tier token architecture | 🔴 | Chưa có primitive → semantic → component tier. |
| Naming convention | 🔴 | Một số tên mô tả mục đích, nhưng `--lime` chứa màu đỏ và nhiều raw value phá vỡ convention. |
| Token documentation | 🔴 | Không có tài liệu intended use/do-not-use cho token. |
| Token governance | 🔴 | Không có quy tắc khi nào dùng token so với hardcoded value. |
| Design tool sync | ❔ | Không có Figma/design-variable source trong phạm vi audit. |
| Versioning and changelog | 🔴 | Không có changelog/version riêng cho token. |

### [Button](https://www.checklist.design/design-system/button)

| Checklist item | Trạng thái | Bằng chứng/nhận xét |
|---|---:|---|
| Base style | 🟢 | Fill, outline/soft, ghost và text button được phân biệt rõ. |
| Shape | 🟢 | Phần lớn button dùng radius 8–10px, padding và border tương đối nhất quán với PRO7. |
| Variants | 🟢 | Có primary, red CTA, soft, danger, icon, dashed và disabled variants. |
| Copy | 🟢 | Copy tiếng Việt mô tả đúng hành động: Lưu, Xếp lịch, Thêm vào đội, Hủy giao dịch. |
| States | 🟡 | Hover/focus/disabled/loading có nhưng không đồng bộ hoàn toàn; vài icon/close button chỉ 31–34px, thấp hơn touch target khuyến nghị. |

### [Input Field](https://www.checklist.design/design-system/input-field)

| Checklist item | Trạng thái | Bằng chứng/nhận xét |
|---|---:|---|
| Input field | 🟢 | Input text/email/date/number/select/textarea đều có container rõ. |
| Label | 🟢 | Form chính dùng label hiển thị và liên kết bao input. |
| Placeholder text | 🟢 | Các trường phù hợp có ví dụ dễ hiểu, màu nhạt hơn nội dung đã nhập. |
| Data format | 🟢 | Dùng đúng input type và min/max cho email, ngày, số áo, tỉ số, chiều cao/cân nặng. |
| Illustration or icon | ⚪ | Không bắt buộc cho các form ngắn hiện tại. |
| Hint | 🟡 | Avatar có format/dung lượng; nhiều field nghiệp vụ chưa có hint về giới hạn hoặc định dạng trước khi lỗi. |

### [Modal](https://www.checklist.design/design-system/modal)

| Checklist item | Trạng thái | Bằng chứng/nhận xét |
|---|---:|---|
| Title | 🟢 | Modal có title cụ thể và `aria-labelledby`. |
| Actionable item | 🟢 | Primary/secondary action rõ, copy dự báo đúng kết quả. |
| Close action | 🟢 | Có nút Đóng và Hủy. |
| Responsiveness | 🟡 | Modal thành viên chuyển bottom sheet dưới 520px; Match/Funds dùng modal generic và chưa có full-screen mobile rule riêng. |
| Background change behind modal | 🟢 | Backdrop tối + blur tách foreground rõ. |
| Description | 🟢 | Mỗi modal có đoạn mô tả ngắn về tác vụ. |

### [Card](https://www.checklist.design/design-system/card)

| Checklist item | Trạng thái | Bằng chứng/nhận xét |
|---|---:|---|
| Style | 🟢 | Card nền trắng/đen, border nhẹ, radius và shadow tạo hierarchy rõ. |
| Consistency | 🟡 | Card PRO7 khá nhất quán, nhưng login/profile/product shell tạo thêm hệ card riêng với token khác. |
| Spacing | 🟡 | Padding nhìn hợp lý nhưng dùng nhiều giá trị 14/15/17/18/19/20/22/24/25/28 thay vì scale. |
| Responsiveness | 🟡 | Mobile stack tốt; tablet hẹp vẫn bị header/layout ép chiều ngang. |
| Content hierarchy | 🟢 | Heading, metric, trạng thái và CTA trong card được sắp theo ưu tiên dễ quét. |

### [Loading](https://www.checklist.design/design-system/loading)

| Checklist item | Trạng thái | Bằng chứng/nhận xét |
|---|---:|---|
| Visual indicator | 🟢 | Squad, Match, Tactics, Funds có loading indicator. |
| Text | 🟢 | Copy loading cụ thể theo module, không chỉ dùng “Loading”. |
| Time | ❔ | Không có telemetry để xác nhận ngưỡng hiển thị tránh flash ở request nhanh. |
| Accessibility | 🟢 | Loading route dùng `aria-busy`, text và indicator không phụ thuộc màu đơn lẻ. |
| Visuals | ⚪ | Illustration giải trí là tùy chọn, không cần cho dashboard nghiệp vụ. |

## Luồng tương tác

### [Filtering items](https://www.checklist.design/flows/filtering-items)

| Checklist item | Trạng thái | Bằng chứng/nhận xét |
|---|---:|---|
| Show action near item collection | 🟢 | Search, position chips và Bộ lọc nằm ngay phía trên danh sách Squad. |
| Show available filter options | 🟢 | Position luôn hiện; status, sort và direction nằm trong panel Bộ lọc. |
| Consider different filter types | 🟢 | Kết hợp search text, quick links và select phù hợp với từng thuộc tính. |
| Show active filters clearly when applied | 🟡 | Position active thể hiện rõ; status/sort/direction đang áp dụng không được tóm tắt khi panel đóng. |
| Provide easy filter removal | 🟡 | Có thể quay về Tất cả/default, nhưng chưa có “Xóa tất cả bộ lọc”. |
| Show result count | 🟡 | Summary hiển thị quân số của kết quả hiện tại, nhưng không nói rõ đây là số sau lọc. |
| Empty state | 🟡 | Có no-results copy; nên thêm CTA xóa/broaden filter trực tiếp trong state. |

### [Saving changes](https://www.checklist.design/flows/saving-changes)

| Checklist item | Trạng thái | Bằng chứng/nhận xét |
|---|---:|---|
| Show action that enables change | 🟢 | Form player, profile, match, tactics và funds có action rõ. |
| Disable save action until changes are made | 🔴 | Nhiều form chỉ disable khi pending, vẫn cho save khi dữ liệu chưa thay đổi. |
| State changes to active once a change is made | 🔴 | Chưa có dirty-state chung để đổi trạng thái CTA sau chỉnh sửa. |
| Action changes to loading state when pressed | 🟢 | Button dùng pending copy/disabled như “Đang lưu…”, “Đang thêm…”. |
| Notify changes have been saved | 🟢 | Có status/success message và refresh dữ liệu authoritative sau mutation. |

### [Showing input error](https://www.checklist.design/flows/showing-input-error)

| Checklist item | Trạng thái | Bằng chứng/nhận xét |
|---|---:|---|
| Keep the input in default state | 🟢 | Field bắt đầu ở trạng thái mặc định. |
| Allow user to enter information | 🟢 | Không chặn gõ theo từng ký tự ngoài constraint HTML hợp lệ. |
| Signal error after loss of focus | 🔴 | Luồng hiện chủ yếu validate khi submit, chưa có blur validation nhất quán. |
| Return to default state upon reattempt | 🟡 | Một số field error giữ tới lần submit tiếp theo thay vì tự bỏ khi người dùng sửa lại. |

### [Submitting a form](https://www.checklist.design/flows/submitting-a-form)

| Checklist item | Trạng thái | Bằng chứng/nhận xét |
|---|---:|---|
| Show button to submit | 🟢 | Mọi form CRUD chính có submit CTA dễ nhận biết. |
| Show loading state after submission | 🟢 | Pending state khóa double-submit và đổi copy ở các form mới. |
| Show success message when it submits | 🟢 | Profile/player/tactics/funds/match trả status hoặc cập nhật view authoritative. |
| If it doesn't, show an error message | 🟢 | Error dùng `role=alert` ở các flow quan trọng. |
| An error may occur because of the wrong information | 🟢 | Field-level errors và `aria-invalid` có ở provisioning/profile/funds/player. |

### [Uploading media](https://www.checklist.design/flows/uploading-media)

| Checklist item | Trạng thái | Bằng chứng/nhận xét |
|---|---:|---|
| Empty state | 🟡 | Profile có avatar fallback và nút Tải ảnh lên; chưa có drop-zone trực quan. |
| Drag and drop interaction | 🔴 | Không hỗ trợ drag/drop hay drag-over state. |
| Progress indicator | 🟡 | Có pending/disabled feedback nhưng không có upload progress. |
| File restrictions & constraints | 🟢 | Hiển thị JPEG/PNG/WebP và tối đa 3 MiB trước khi chọn file. |
| Outcome status | 🟢 | Có success/error feedback sau upload/remove. |
| Upload actions | 🟢 | Hỗ trợ tải lên/thay thế và xóa avatar. |
| Showing multiple uploaded files | ⚪ | Avatar chỉ cho phép một ảnh nên danh sách nhiều file không áp dụng. |

## Màn hình web app

### [Analytics](https://www.checklist.design/web-app/analytics) — Overview

| Checklist item | Trạng thái | Bằng chứng/nhận xét |
|---|---:|---|
| Date range selector | 🔴 | Dashboard không có chọn khoảng thời gian. |
| Headline metrics | 🟢 | Tỉ lệ thắng, phong độ, vua phá lưới và thứ hạng dễ quét. |
| Charts with labels and axes | 🟡 | Ring/progress/mini bars có nhãn, nhưng không có axes/legend đầy đủ cho dữ liệu theo thời gian. |
| Period comparison | 🟡 | Có số trận/thành tích và vài delta; chưa nhất quán trên mọi metric. |
| Segment breakdown | 🔴 | Chưa có breakdown theo giải, sân nhà/khách hoặc giai đoạn. |
| Last updated indicator | 🔴 | Không có timestamp cập nhật dữ liệu; icon refresh không mô tả thời điểm lần cuối. |
| Loading and empty states | 🟡 | Có route loading/error/empty, nhưng không có skeleton riêng từng widget. |

### [User Management](https://www.checklist.design/web-app/user-management) — Squad

| Checklist item | Trạng thái | Bằng chứng/nhận xét |
|---|---:|---|
| User list | 🟡 | Grid có tên, role, trạng thái, số áo/vị trí; email không hiển thị ở list và hoạt động gần nhất chưa có. |
| Invite user action | 🟢 | Admin có “Thêm cầu thủ” bằng email và chọn role; đúng quyết định MVP là tạo membership trực tiếp, không dùng lời mời membership. |
| Roles and permissions | 🟢 | Role có thể chọn/đổi trong detail theo quyền và RPC authoritative. |
| Pending invitation status | ⚪ | Membership invitation đã được loại khỏi scope theo quyết định sản phẩm. |
| Search and filter | 🟢 | Search theo tên, lọc position/status, sort và direction đã nối backend. |
| Remove or deactivate user | 🟢 | Có soft-deactivate riêng với reason; tránh xóa cứng ngoài ý muốn. |

### [Single Item Detail](https://www.checklist.design/web-app/single-item-detail) — Player/Match detail

| Checklist item | Trạng thái | Bằng chứng/nhận xét |
|---|---:|---|
| Clear title or identifier | 🟢 | Tên cầu thủ/đối thủ và số áo/trạng thái hiển thị nổi bật. |
| Status indicator (if applicable) | 🟢 | Status có text chip, không chỉ dùng màu. |
| Key details section | 🟢 | Thông tin an toàn và trường admin được nhóm rõ theo hierarchy. |
| Edit action | 🟢 | Admin có form edit player/match, member chỉ thấy nội dung được phép. |
| Related items or activity | 🟡 | Match có attendance/event/stat; player chưa có activity/audit history hiển thị. |
| Breadcrumb or back navigation | 🟢 | Có back link về danh sách/parent route. |
| Destructive actions | 🟢 | Deactivate/cancel/void tách khỏi primary action và yêu cầu reason/xác nhận phù hợp. |

### [Admin Panel](https://www.checklist.design/web-app/admin-panel)

| Checklist item | Trạng thái | Bằng chứng/nhận xét |
|---|---:|---|
| Role-based access | 🟢 | Route admin được permission guard phía server. |
| User management | 🟡 | CRUD member/role nằm ở Squad detail, nhưng Admin Settings chưa tổng hợp hoặc dẫn rõ tới khu vực này. |
| Organisation settings | 🔴 | Trang hiện chỉ ghi “sẽ được xây dựng ở lát cắt tiếp theo”. |
| Usage overview | 🔴 | Chưa có usage/permission/seat overview hoặc export. |
| Billing and plan management | ⚪ | Subscription SaaS không thuộc MVP quản lý đội; Quỹ đội là nghiệp vụ khác. |
| Audit log | 🔴 | Backend có audit event nhưng chưa có UI audit log cho admin. |
| Danger zone | 🔴 | Chưa có khu vực transfer ownership/xóa đội với confirmation. |

### [Settings](https://www.checklist.design/web-app/settings)

| Checklist item | Trạng thái | Bằng chứng/nhận xét |
|---|---:|---|
| Structure | 🔴 | Admin Settings chưa có category/navigation. |
| Account details | 🟢 | Account Profile có tên, email, phone, birthday, body metrics, position và avatar. |
| Security details | 🟡 | Có route đổi mật khẩu, nhưng chưa được tổ chức/điều hướng rõ từ Settings/Profile. |
| Notification preferences | 🔴 | Không có lựa chọn loại/kênh thông báo. |
| Billing | ⚪ | Không thuộc scope MVP hiện tại. |
| Additional preferences | 🟡 | Có light/dark toggle; chưa có timezone, locale và date format settings. |
| Danger zone | 🔴 | Chưa có deactivate/delete account/team controls trong Settings. |

### [Empty State](https://www.checklist.design/web-app/empty-state)

| Checklist item | Trạng thái | Bằng chứng/nhận xét |
|---|---:|---|
| Illustration or icon | 🟡 | Một số state có icon/dot; chưa có visual contextual nhất quán cho mọi module. |
| Clear heading | 🟢 | Heading nói rõ thiếu dữ liệu hay lỗi tải. |
| Supporting description | 🟢 | Có copy hướng dẫn hoặc giải thích dữ liệu chưa tồn tại. |
| Primary action | 🟡 | Squad có CTA thêm cầu thủ và error có retry; một số zero state chưa đưa CTA tạo item đầu tiên ngay tại chỗ. |
| Zero state vs. no-results state | 🟢 | Squad phân biệt no data/no results theo query; loading/error có state riêng. |
| Error state variant | 🟢 | Squad/Matches/Tactics/Funds có error boundary và nút Thử lại. |

### [Account](https://www.checklist.design/web-app/account)

| Checklist item | Trạng thái | Bằng chứng/nhận xét |
|---|---:|---|
| Profile photo | 🟢 | Avatar có upload/change/remove và fallback initials. |
| Display name | 🟢 | Tên hiển thị rõ và có thể chỉnh sửa. |
| Account details | 🟢 | Email read-only cùng phone, birthday, height, weight và preferred positions. |
| Linked accounts (if applicable) | ⚪ | MVP không dùng liên kết third-party account. |
| Save confirmation | 🟢 | Có explicit save và success/error feedback. |
| Delete or deactivate account | ⚪ | Không nằm trong scope tài khoản member hiện tại; admin quản lý membership bằng deactivate. |

### [Login](https://www.checklist.design/web-app/login)

| Checklist item | Trạng thái | Bằng chứng/nhận xét |
|---|---:|---|
| Email and password fields | 🟢 | Có đúng input type, label, autocomplete và giữ email. |
| Show/hide password toggle | 🔴 | Chưa có toggle hiển thị mật khẩu. |
| Forgot password | 🔴 | Chưa có link reset password trên Login. |
| Remember me | 🟡 | Session Supabase được lưu mặc định nhưng người dùng không có lựa chọn rõ. |
| SSO or social login | ⚪ | Không nằm trong MVP hiện tại. |
| Sign up link | ⚪ | Tài khoản do admin provision; không cho tự đăng ký là chủ đích. |
| Error messages | 🟢 | Login failure hiển thị feedback rõ trong form. |

## Mobile/responsive

### [Dashboard](https://www.checklist.design/mobile/dashboard)

| Checklist item | Trạng thái | Bằng chứng/nhận xét |
|---|---:|---|
| Thumb-zone layout | 🟡 | Bottom nav ở vùng ngón cái; CTA chính vẫn nằm trên header, khó với một tay. |
| Widget-based structure | 🟢 | Dashboard chia thành card/widget dễ quét. |
| Pull to refresh | ⚪ | Đây là responsive web app; không có native pull-to-refresh requirement. |
| Glanceable metrics | 🟢 | Các metric và trận kế tiếp xuất hiện sớm. |
| Quick actions | 🟢 | Chốt đội hình, Chi tiết trận và reminder được đặt gần nội dung liên quan. |
| Personalised content | 🟢 | Dữ liệu, navigation và action thay đổi theo team/role. |
| Per-widget states | 🟡 | Route-level loading là chính; dashboard chưa có skeleton/empty riêng cho từng widget. |
| Notification surface | 🟡 | Attendance pending được nêu rõ; nút chuông chưa thể hiện danh sách/trạng thái notification hoàn chỉnh. |

### [Tab Bar Navigation](https://www.checklist.design/mobile/tab-bar-navigation)

| Checklist item | Trạng thái | Bằng chứng/nhận xét |
|---|---:|---|
| Tab count | 🟢 | Tối đa 5 destination, tiếp tục lọc theo permission. |
| Icon and label | 🟢 | Mỗi tab có Lucide icon và label tiếng Việt. |
| Active and default states | 🟢 | Active dùng nền đỏ + chữ trắng, khác biệt rõ với default. |
| Badge counts | 🟡 | Chưa hiển thị count pending match/notification trên tab dù dữ liệu phù hợp tồn tại. |
| Fixed presence | 🟢 | Nav cố định dưới đáy ở route top-level. |
| Tap target size | 🟢 | Thanh cao 72px và vùng mỗi tab đủ lớn; product shell tối thiểu 45px. |
| Haptic feedback | ⚪ | Không áp dụng cho responsive web hiện tại. |

## Kiến nghị theo thứ tự triển khai

1. Sửa responsive shell trước: chuyển sidebar/header sang mobile ở khoảng 900px hoặc tạo layout tablet riêng; bảo đảm không có nội dung bị cắt ở 768–1024px và 200% zoom.
2. Đưa cỡ chữ tối thiểu cho nội dung có nghĩa lên 12px trên desktop và 13–14px trên mobile; chỉ giữ 10–11px cho caption ít quan trọng.
3. Chuẩn hóa token: đổi `--lime` thành semantic red token, loại toàn bộ xanh/neon residual, tạo primitive/semantic/component tiers cho light/dark.
4. Trích xuất component primitives dùng chung cho Button, Field, Modal, Card, Status, Empty/Loading; áp dụng một focus/keyboard contract cho mọi modal.
5. Hoàn thiện Admin Settings theo module: team profile, role/permission, notification preferences, audit log và danger zone có confirmation.
6. Bổ sung Login show-password và forgot-password; thêm dirty-state, blur validation và disable-save-until-changed cho form.
7. Sau khi sửa, chạy audit lại ở 390, 768, 820, 1024, 1440px; light/dark; keyboard-only; 200% zoom; VoiceOver Safari.
