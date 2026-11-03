# SMS Academy – Backend API

API máy chủ của nền tảng đào tạo trực tuyến SMS Academy: đăng nhập, ghi danh bằng mã kích hoạt, học bài có kiểm soát thời gian, bài kiểm tra chấm phía máy chủ, cấp và tra cứu chứng nhận, báo cáo cho quản trị viên.

- **Công nghệ:** Node.js 22 + Express 4 + TypeScript, CSDL SQLite tích hợp sẵn (`node:sqlite`), không cần cài CSDL riêng.
- **Cổng mặc định:** `4000`, mọi API nằm dưới `/api`.
- **Frontend:** Next.js ở thư mục [`../frontend`](../frontend) chuyển tiếp `/api/*` sang đây. Tổng quan cả dự án xem ở [README gốc](../README.md).

## Yêu cầu

- Node.js **22.13 trở lên** (cần module `node:sqlite`).

## Chạy trên máy

```bash
npm install
npm run dev        # tsx watch, tự chạy lại khi sửa code
```

Kiểm tra: mở `http://localhost:4000/api/health` → `{"ok":true}`.

Lần chạy đầu tiên, server tự tạo file `data/elearning.db` và nạp dữ liệu mẫu:

| Dữ liệu | Giá trị |
|---|---|
| Quản trị viên | `admin@sms.vn` / `Admin@2026` (đổi bằng `ADMIN_EMAIL`, `ADMIN_PASSWORD`) |
| Học viên demo | `0901234567` hoặc `hocvien@demo.vn` / `Hocvien@2026` |
| Công ty | Công ty Demo |
| Mã kích hoạt | `SMS-DEMO-2026` (100 lượt, mở cả 3 khóa mẫu) |
| Khóa học mẫu | FSSC 22000, Phòng ngừa lao động trẻ em, HACCP – 7 nguyên tắc |

Muốn làm lại từ đầu: dừng server, xóa thư mục `data/` rồi chạy lại.

## Các lệnh

| Lệnh | Việc |
|---|---|
| `npm run dev` | Chạy chế độ phát triển (tự nạp lại) |
| `npm run build` | Biên dịch TypeScript sang `dist/` |
| `npm start` | Chạy bản đã build (`node dist/index.js`) |
| `npm run typecheck` | Kiểm tra kiểu, không xuất file |

## Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `4000` | Cổng API |
| `DATA_DIR` | `./data` | Thư mục chứa `elearning.db` |
| `NODE_ENV` | – | `production` bật cookie `Secure` và tắt hiện mã xác nhận |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | `admin@sms.vn`, `Admin@2026` | Tài khoản quản trị, **chỉ dùng khi tạo CSDL lần đầu** |
| `DEMO_SHOW_CODES` | bật khi không phải production | `1`: trả mã quên mật khẩu trong response (`devCode`) để thử nhanh. `0`: tắt |
| `INSECURE_COOKIE` | – | `1`: bỏ cờ `Secure` của cookie khi chạy production qua http (chỉ thử nội bộ) |
| `CORS_ORIGIN` | – | Danh sách tên miền được gọi thẳng API, cách nhau dấu phẩy. Không cần nếu chỉ dùng qua frontend |

Dự án không dùng `dotenv`. Nếu muốn đọc từ file `.env`, chạy bằng cờ có sẵn của Node:

```bash
node --env-file=.env dist/index.js
```

## Chạy thật (production)

```bash
npm ci
npm run build
NODE_ENV=production PORT=4000 ADMIN_PASSWORD='<mật khẩu mạnh>' npm start
```

- Backend chỉ cần mở cho frontend, không nên public ra Internet. HTTPS đặt ở Nginx/Caddy phía trước frontend.
- `app.set("trust proxy", 1)` đã bật để lấy đúng IP khách khi đứng sau 1 lớp proxy.
- **Sao lưu `data/elearning.db` hằng ngày.** Đây là toàn bộ dữ liệu.
- Trước khi chạy thật, cần nối dịch vụ email trong [`src/lib/mail.ts`](src/lib/mail.ts) (hiện chỉ in email ra terminal).

## Docker

Image được build từ [`Dockerfile`](Dockerfile) gồm 2 bước: build TypeScript, sau đó tạo image chạy chỉ chứa dependency production. Image dùng `node:22-alpine`, chạy bằng user `node`, có healthcheck `/api/health`, và lưu CSDL ở `/app/data` (là volume).

Nên chạy cả dự án bằng [`docker-compose.yml`](../docker-compose.yml) ở thư mục gốc (xem [README gốc](../README.md#chạy-bằng-docker)). Nếu chỉ chạy riêng backend:

```bash
docker build -t sms-academy-backend .
docker run -d -p 4000:4000 -v sms-data:/app/data sms-academy-backend
```

## Cấu trúc thư mục

```
src/
  index.ts            khởi động Express, CORS, gắn route, xử lý lỗi chung
  routes/
    auth.ts           /api/auth    đăng nhập, đăng ký bằng mã, quên mật khẩu
    learner.ts        /api/...     trang chủ, khóa học, học bài, bài thi, tài khoản, chứng nhận
    admin.ts          /api/admin   tổng quan, soạn khóa, công ty & mã, báo cáo, cấp lại mật khẩu
    verify.ts         /api/verify  tra cứu chứng nhận công khai
  lib/
    db.ts             lược đồ SQLite, nâng cấp CSDL cũ, dữ liệu mẫu, logic học bài / thi / chứng nhận
    admin.ts          kiểm tra & lưu khóa học, thống kê, báo cáo, công ty, mã kích hoạt
    auth.ts           phiên đăng nhập (cookie), middleware phân quyền, giới hạn số lần thử
    access.ts         kiểm tra học viên có được vào khóa học không
    crypto.ts         băm mật khẩu (scrypt), sinh token/mã, chuẩn hóa số điện thoại
    mail.ts           gửi email (bản demo: in ra terminal)
    seed.ts           3 khóa học mẫu
data/elearning.db     CSDL (tự tạo, đã nằm trong .gitignore)
```

Muốn chuyển sang PostgreSQL: chỉ cần viết lại `lib/db.ts` và `lib/admin.ts`, giữ nguyên tên và kiểu các hàm export; các route không phải sửa.

## Quy tắc nghiệp vụ

**Tài khoản và đăng nhập**
- Đăng nhập bằng **số điện thoại hoặc email** (công nhân thường không có email). Số điện thoại được chuẩn hóa về dạng `0xxxxxxxxx` (`+84…`, `84…` đều nhận).
- Mật khẩu ít nhất 8 ký tự, có cả chữ và số. Băm bằng `scrypt` có salt.
- Phiên lưu trong bảng `sessions` (chỉ lưu SHA-256 của token), cookie `sms_session` `httpOnly`, `SameSite=Lax`. "Ghi nhớ đăng nhập" giữ 30 ngày, không ghi nhớ thì 12 giờ.
- Đổi hoặc đặt lại mật khẩu sẽ đăng xuất các thiết bị khác.
- Giới hạn số lần thử (lưu trong bộ nhớ, mất khi khởi động lại): đăng nhập 10 lần / 15 phút, đăng ký 5 lần / 15 phút, quên mật khẩu 5 lần / giờ, tra cứu chứng nhận 120 lần / phút / IP.

**Ghi danh**
- Học viên đăng ký bằng **mã kích hoạt** dạng `SMS-XXXX-XXXX` (bỏ các ký tự dễ nhầm 0/O, 1/I). Mỗi mã gắn với 1 công ty, danh sách khóa học, số lượt dùng tối đa và ngày hết hạn (tùy chọn).
- Học viên đã có tài khoản có thể nhập thêm mã để mở khóa mới (`/api/account/redeem`).
- Học viên chỉ thấy khóa đã ghi danh; quản trị viên thấy mọi khóa.

**Học bài** (máy chủ kiểm tra, không tin trình duyệt)
- Học **tuần tự**: phải xong bài trước mới mở được bài sau.
- Bài **video** (YouTube): phải xem liên tục tới ít nhất **95%** thời lượng, và thời gian từ lúc mở bài phải ≥ 90% thời lượng video.
- Bài **tài liệu đọc**: phải ở lại tối thiểu một khoảng thời gian, mặc định tính theo tốc độ 200 chữ/phút (tối thiểu 30 giây), quản trị viên có thể đặt riêng.

**Bài kiểm tra**
- Chỉ làm được sau khi xong tất cả bài học.
- Mỗi lượt rút ngẫu nhiên `quiz_size` câu từ ngân hàng câu hỏi và xáo trộn thứ tự đáp án; chấm điểm trên máy chủ.
- **Đạt khi đúng ≥ 70%.** Khi trượt chỉ báo câu nào sai, không lộ đáp án đúng; khi đạt mới trả đáp án và giải thích.
- Trượt hết `max_attempts` lượt → xóa tiến độ khóa học, học viên phải học lại từ đầu và được tính lại số lượt.
- Nếu quản trị viên sửa ngân hàng câu hỏi trong lúc học viên đang thi, lượt đó bị hủy và không bị tính.

**Chứng nhận**
- Cấp tự động khi đạt lần đầu, mã dạng `SMS-YYCC-NNNNRR`. Đạt lại với điểm cao hơn thì cập nhật điểm, giữ nguyên mã.
- Tên in trên chứng nhận lấy từ `cert_name` (chữ in hoa), học viên sửa được trong trang tài khoản.
- Ai cũng tra cứu được qua `/api/verify/:code` (mã QR trên chứng nhận dẫn tới đây); chỉ trả thông tin in trên giấy.

**Soạn khóa học**
- Sửa khóa học giữ nguyên `id` của bài học và câu hỏi cũ nên tiến độ học viên không bị mất.
- Link YouTube nhận được các dạng `youtu.be/…`, `watch?v=…`, `embed/…`, `shorts/…` hoặc mã 11 ký tự.

## Danh sách API

Mọi response là JSON. Lỗi trả về dạng `{ "error": "<thông báo tiếng Việt>" }` với mã HTTP phù hợp (400, 401, 403, 404, 409, 429, 500).

### Công khai

| Phương thức | Đường dẫn | Body / query | Việc |
|---|---|---|---|
| GET | `/api/health` | – | Kiểm tra server sống |
| GET | `/api/verify/:code` | – | Tra cứu chứng nhận |

### `/api/auth`

| Phương thức | Đường dẫn | Body / query | Việc |
|---|---|---|---|
| POST | `/login` | `login` (SĐT hoặc email), `password`, `remember` | Đăng nhập, đặt cookie |
| POST | `/logout` | – | Đăng xuất |
| GET | `/me` | – | Người dùng hiện tại (401 nếu chưa đăng nhập) |
| GET | `/register` | `?code=` | Kiểm tra mã kích hoạt, trả tên công ty và khóa học |
| POST | `/register` | `code`, `name`, `phone` và/hoặc `email`, `password`, `department`, `agree` | Tạo tài khoản, ghi danh, đăng nhập luôn |
| POST | `/forgot` | `email` | Gửi mã 6 số (hiệu lực 10 phút). Luôn trả `ok` để không lộ email nào có tài khoản |
| POST | `/reset` | `email`, `code`, `password`, `checkOnly` | Kiểm tra mã (tối đa 5 lần sai) và đặt mật khẩu mới |

### Học viên (cần đăng nhập)

| Phương thức | Đường dẫn | Body / query | Việc |
|---|---|---|---|
| GET | `/api/home` | – | Khóa đã ghi danh, tiến độ, điểm cao nhất |
| GET | `/api/courses/:id` | – | Chi tiết khóa, bài học, bài đã xong, trạng thái thi |
| POST | `/api/lesson` | `courseId`, `lessonId`, `duration` | Ghi nhận mở bài (và thời lượng video) |
| POST | `/api/progress` | `lessonId`, `watched` (giây) | Đánh dấu hoàn thành bài |
| GET | `/api/quiz` | `?courseId=` | Tạo lượt thi mới |
| POST | `/api/quiz` | `sessionId`, `answers` (mảng chỉ số đáp án) | Nộp bài, nhận điểm và mã chứng nhận nếu đạt |
| GET | `/api/certificates` | – | Chứng nhận đã có và khóa còn thiếu |
| GET | `/api/account` | – | Hồ sơ, số phiên đăng nhập, lịch sử học |
| PATCH | `/api/account` | `name`, `cert_name`, `phone`, `department` | Sửa hồ sơ |
| POST | `/api/account/password` | `current`, `next` | Đổi mật khẩu |
| POST | `/api/account/redeem` | `code` | Nhập mã kích hoạt mới |
| DELETE | `/api/account/sessions` | – | Đăng xuất mọi thiết bị khác |

### `/api/admin` (chỉ quản trị viên)

| Phương thức | Đường dẫn | Body / query | Việc |
|---|---|---|---|
| GET | `/dashboard` | – | Số liệu tổng quan, thống kê từng khóa, chứng nhận mới cấp |
| GET | `/courses/:id` | – | Toàn bộ khóa học kèm đáp án |
| POST | `/courses` | `CourseInput` | Tạo khóa học |
| PUT | `/courses/:id` | `CourseInput` | Sửa khóa học |
| DELETE | `/courses/:id` | – | Xóa khóa học (xóa kèm tiến độ, bài thi, chứng nhận liên quan) |
| GET | `/companies` | – | Danh sách công ty, mã kích hoạt, khóa học |
| POST | `/companies` | `name`, `taxCode`, `contact` | Thêm công ty |
| POST | `/codes` | `companyId`, `courseIds`, `maxUses`, `label`, `expiresAt` (`YYYY-MM-DD`) | Tạo mã kích hoạt |
| PATCH | `/codes` | `code`, `active` | Khóa / mở lại mã |
| GET | `/reports` | `?company=&course=` | Báo cáo học viên × khóa học |
| GET | `/reports/export` | `?company=&course=` | Xuất CSV (UTF-8 có BOM, mở thẳng bằng Excel) |
| POST | `/users` | `userId` | Cấp mật khẩu tạm cho học viên (dạng `sms12345`) |

`CourseInput`:

```jsonc
{
  "title": "HACCP – 7 nguyên tắc",
  "category": "An toàn thực phẩm",
  "level": "Cơ bản",
  "description": "…",
  "quizSize": 3,          // số câu mỗi lượt thi, ≤ số câu trong ngân hàng
  "maxAttempts": 3,       // 1–10
  "lessons": [
    { "id": 1, "kind": "video", "title": "…", "youtubeId": "https://youtu.be/…", "content": "tóm tắt", "body": "", "minSeconds": 0 },
    { "kind": "reading", "title": "…", "youtubeId": "", "content": "…", "body": "## Mục\n\nĐoạn văn…\n\n- gạch đầu dòng", "minSeconds": 0 }
  ],
  "questions": [
    { "id": 1, "question": "…", "options": ["A", "B", "C", "D"], "answer": 1, "explanation": "…" }
  ]
}
```

Gửi kèm `id` để sửa bài học / câu hỏi có sẵn; bỏ `id` để thêm mới; phần tử cũ không có trong danh sách sẽ bị xóa. `minSeconds: 0` nghĩa là tự tính theo số chữ. Tài liệu đọc cần ít nhất 20 chữ.

## Cơ sở dữ liệu

Lược đồ được tạo tự động trong [`src/lib/db.ts`](src/lib/db.ts) (`CREATE TABLE IF NOT EXISTS`), sau đó chạy `migrate()` để nâng cấp CSDL cũ. Copy file `elearning.db` của bản cũ vào `data/` là dùng được ngay.

| Bảng | Nội dung |
|---|---|
| `courses`, `lessons`, `questions` | Khóa học, bài học (video/tài liệu), ngân hàng câu hỏi |
| `companies`, `activation_codes`, `enrollments` | Doanh nghiệp, mã kích hoạt, ghi danh |
| `users`, `sessions`, `password_resets` | Tài khoản, phiên đăng nhập, mã quên mật khẩu |
| `lesson_views`, `progress` | Thời điểm mở bài, bài đã hoàn thành |
| `quiz_sessions`, `quiz_attempts` | Đề đã phát cho từng lượt, kết quả thi |
| `certificates` | Chứng nhận đã cấp (lưu sẵn tên, khóa, công ty tại thời điểm cấp) |

## Hạn chế hiện tại

- Email chưa gửi thật: [`src/lib/mail.ts`](src/lib/mail.ts) chỉ in ra terminal. Cần nối SMTP (nodemailer) hoặc SendGrid / Amazon SES.
- Bộ đếm giới hạn số lần thử nằm trong bộ nhớ: mất khi khởi động lại và không dùng chung được nếu chạy nhiều tiến trình.
- SQLite phù hợp một máy chủ; muốn chạy nhiều máy cần chuyển sang PostgreSQL.
- Chưa có test tự động.
