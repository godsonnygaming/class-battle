# Class Battle 🎮📚

Website quiz dành cho lớp học THCS: tài khoản thành viên, phòng quiz nhiều người, điểm XP và bảng xếp hạng.

## Có gì trong bản mẫu?

- Đăng ký/đăng nhập; mật khẩu được băm bằng bcrypt.
- Phòng đấu có mã ngắn, chủ phòng bắt đầu trận.
- Quiz thời gian thực bằng Socket.IO; 5 câu mỗi trận, 25 giây mỗi câu.
- Điểm trận và tổng điểm được lưu trong PostgreSQL.
- Giao diện responsive, phong cách gaming tối/neon.
- Bộ câu hỏi mẫu trong `server.js`.

## Triển khai nhanh bằng GitHub + Render

### Bước 1 — Tạo repository GitHub

1. Mở https://github.com/new và đăng nhập.
2. Repository name: `class-battle`.
3. Chọn **Private** nếu chỉ muốn mã nguồn riêng tư.
4. Bấm **Create repository**.
5. Tải file ZIP dự án này về máy, giải nén, rồi đưa toàn bộ file và thư mục bên trong lên repository. Trên GitHub có thể dùng **Add file → Upload files**, kéo thả các file vào, rồi **Commit changes**. Giữ nguyên thư mục `public`.

### Bước 2 — Tạo cơ sở dữ liệu PostgreSQL

1. Mở https://render.com/ và đăng nhập.
2. Trong Dashboard, tạo một PostgreSQL database (New → PostgreSQL).
3. Chọn vùng gần người dùng nếu có, đặt tên như `class-battle-db`.
4. Sau khi database được tạo, mở phần Connections và sao chép **Internal Database URL** nếu web service ở cùng vùng Render. Nếu dùng từ máy cá nhân để thử, dùng External URL khi được cấp.
5. Không chia sẻ URL này; nó chứa thông tin truy cập cơ sở dữ liệu.

Lưu ý: gói miễn phí và thời hạn của database có thể thay đổi. Kiểm tra giá và thời hạn hiện hành trong Render trước khi chọn. Nếu database hết hạn hoặc bị xóa, dữ liệu có thể mất.

### Bước 3 — Tạo Web Service từ GitHub

1. Trong Render, chọn **New → Web Service**.
2. Kết nối GitHub và chọn repository `class-battle`.
3. Cấu hình:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/health` (nếu có mục này)
4. Trong phần **Environment Variables**, thêm:
   - `DATABASE_URL` = Internal Database URL của database vừa tạo.
   - `SESSION_SECRET` = chuỗi ngẫu nhiên dài, riêng tư.
   - `NODE_ENV` = `production`
5. Chọn gói phù hợp rồi nhấn **Create Web Service**.
6. Chờ build/deploy hoàn tất. Mở URL `https://ten-dich-vu.onrender.com`.

Không đăng `SESSION_SECRET`, mật khẩu hay `DATABASE_URL` lên GitHub. File `.env` đã nằm trong `.gitignore`.

### Bước 4 — Kiểm tra

1. Mở URL website, tạo hai tài khoản thử nghiệm với tên khác nhau.
2. Trình duyệt thứ nhất tạo phòng; sao chép mã phòng.
3. Trình duyệt thứ hai đăng nhập và nhập mã.
4. Chủ phòng bấm **Bắt đầu trận đấu**.
5. Trả lời câu hỏi; sau trận kiểm tra bảng xếp hạng.
6. Mở `https://ten-dich-vu.onrender.com/health`; kết quả bình thường là `{"ok":true}`.

### Bước 5 — Cập nhật website

Sửa file trong GitHub rồi bấm **Commit changes**. Render thường tự triển khai lại khi nhánh được kết nối có commit mới.

## Chạy trên máy tính (tùy chọn)

Cần cài Node.js phiên bản 20 trở lên và có PostgreSQL.

1. Tạo database PostgreSQL.
2. Mở terminal trong thư mục dự án.
3. Cài dependencies: `npm install`
4. Đặt biến môi trường `DATABASE_URL` và `SESSION_SECRET`.
5. Chạy `npm start`.
6. Mở `http://localhost:3000`.

## Quan trọng trước khi dùng thật cho cả lớp

Đây là bản khởi đầu để học và thử nghiệm, chưa phải hệ thống thi đấu có độ tin cậy cao. Phòng đấu hiện được lưu trong bộ nhớ máy chủ nên sẽ mất nếu máy chủ khởi động lại; chỉ điểm tài khoản và kết quả đã ghi vào PostgreSQL được lưu bền vững. Bản đầu cũng chưa có chức năng khôi phục mật khẩu, quản trị viên, lọc nội dung câu hỏi hay tự động khôi phục người chơi bị mất kết nối.

- Chỉ dùng biệt danh; không yêu cầu học sinh nhập họ tên đầy đủ, địa chỉ, số điện thoại hoặc thông tin nhạy cảm.
- Không dùng lại mật khẩu của email/mạng xã hội.
- Với lớp học thật, nên có giáo viên/người lớn hỗ trợ quản lý tài khoản và quyền riêng tư.
- Nếu nâng cấp để dùng rộng rãi, cần kiểm thử bảo mật, chống spam, giới hạn số người/phòng và thiết kế xử lý mất kết nối.
