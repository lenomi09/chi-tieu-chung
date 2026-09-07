# Chi tiêu chung

Web app ghi chép và tính toán tiền chi tiêu chung với nhóm bạn / nhóm ở ghép. Có 2 vai trò:

- **Admin (bạn)**: đăng nhập bằng mật khẩu, được thêm/sửa/xoá thành viên, khoản chi, ghi nhận
  thanh toán trực tiếp, và **duyệt/từ chối** yêu cầu thanh toán người khác gửi lên.
- **Người khác (không cần đăng nhập)**: chỉ xem được thành viên, khoản chi, tổng kết, ai nợ
  ai — và gửi **yêu cầu "tôi đã trả nợ"**, chờ admin duyệt thì số dư mới cập nhật.

Dữ liệu lưu bằng SQLite (qua `@libsql/client`) — chạy local dùng file `data.db` ngay trên
máy, không cần cài gì thêm; khi deploy có thể trỏ sang DB Turso free để dữ liệu không mất
khi server khởi động lại.

## Cài đặt

Yêu cầu: [Node.js](https://nodejs.org/) bản 18 trở lên.

```bash
cd chi-tieu-chung
npm install
```

## Cấu hình

Copy `.env.example` thành `.env` (đã có sẵn `.env` mẫu với `SESSION_SECRET` ngẫu nhiên) và
đặt mật khẩu admin của bạn:

```
ADMIN_PASSWORD=mật-khẩu-của-bạn
SESSION_SECRET=<chuỗi-ngẫu-nhiên-dài>
```

Không đặt `ADMIN_PASSWORD` thì không ai đăng nhập admin được — app vẫn chạy nhưng ở chế độ
chỉ xem cho tất cả mọi người.

## Chạy local

```bash
npm start
```

Mở trình duyệt vào **http://localhost:3456**. Bấm "Đăng nhập admin" ở góc trên để vào chế
độ chỉnh sửa đầy đủ.

## Chạy kiểm thử

```bash
npm test
```

Gồm 2 bộ:
- `test/calc.test.js` — công thức tính số dư và "ai nợ ai" (bộ số liệu mẫu Lan/Minh/Huy).
- `test/settlement-approval.test.js` — luồng đăng nhập, phân quyền 401 khi chưa login, và
  yêu cầu thanh toán chỉ tính vào số dư sau khi admin duyệt (không tính khi pending/rejected).

## Migrate dữ liệu cũ (nếu bạn từng dùng bản file JSON)

Nếu trước đây có file `data.json` từ bản cũ, chạy 1 lần để đưa dữ liệu sang `data.db`:

```bash
npm run migrate
```

## Deploy lên internet (free, cho ~6 người dùng)

Việc này cần bạn tự tạo tài khoản ở các dịch vụ dưới đây (không thể tạo hộ):

1. **Tạo DB free trên [Turso](https://turso.tech)**: cài `turso` CLI, đăng nhập, rồi
   ```bash
   turso db create chi-tieu-chung
   turso db show chi-tieu-chung --url        # -> TURSO_DATABASE_URL
   turso db tokens create chi-tieu-chung      # -> TURSO_AUTH_TOKEN
   ```
2. **Đẩy code lên GitHub**: tạo repo riêng của bạn, `git init` trong thư mục
   `chi-tieu-chung`, commit, push.
3. **Tạo Web Service free trên [Render](https://render.com)**: trỏ vào repo GitHub đó.
   - Build command: `npm install`
   - Start command: `npm start`
4. **Set biến môi trường** trên Render (mục Environment):

   | Biến | Giá trị |
   |---|---|
   | `ADMIN_PASSWORD` | mật khẩu bạn tự chọn |
   | `SESSION_SECRET` | chuỗi ngẫu nhiên dài (khác với lúc chạy local) |
   | `TURSO_DATABASE_URL` | lấy từ bước 1 |
   | `TURSO_AUTH_TOKEN` | lấy từ bước 1 |
   | `NODE_ENV` | `production` |

5. Nếu đã có dữ liệu local muốn mang lên: set tạm `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN`
   trong `.env` local rồi chạy `npm run migrate` — script sẽ ghi thẳng vào DB Turso đó.

Lưu ý: Render free service "ngủ" sau ~15 phút không ai truy cập, request đầu tiên sau đó
chậm vài giây — bình thường với nhóm nhỏ.

## Cách dùng nhanh

1. **Đăng nhập admin** (góc trên bên phải header) để mở khoá quyền chỉnh sửa.
2. **Thành viên**: (admin) thêm tên từng người trong nhóm.
3. **Thêm khoản chi**: (admin) chọn ngày, nội dung, số tiền, người trả. Ô "Chia cho ai"
   mặc định tick hết tất cả — bỏ tick người nào không dùng khoản đó nếu cần chia riêng.
4. **Tổng kết / Ai nợ ai**: ai cũng xem được, tự động cập nhật.
5. **Thanh toán**:
   - Admin: điền form "Ghi nhận thanh toán" → tính vào số dư ngay.
   - Người khác: điền form "Gửi yêu cầu đã trả nợ" → vào hàng chờ, admin vào bảng lịch sử
     thanh toán bấm "Duyệt"/"Từ chối". Bị từ chối vẫn lưu lại lịch sử, không tính vào số dư.
6. **Xoá sạch dữ liệu**: (admin) dùng khi mọi người đã trả hết nợ hoặc muốn ghi chi tiêu
   đợt mới — xoá khoản chi + lịch sử thanh toán, giữ nguyên danh sách thành viên.
