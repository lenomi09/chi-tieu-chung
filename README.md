# Chi tiêu chung

Web app ghi chép và tính toán tiền chi tiêu chung với nhóm bạn / nhóm ở ghép. Có 2 vai trò:

- **Admin (bạn)**: đăng nhập bằng mật khẩu, được thêm/sửa/xoá thành viên, thêm/sửa/xoá
  khoản chi, ghi nhận thanh toán trực tiếp, và **duyệt/từ chối** khoản chi người khác gửi lên.
- **Người khác (không cần đăng nhập)**: xem được thành viên, khoản chi, tổng kết, ai nợ
  ai — và **gửi yêu cầu thêm khoản chi mình đã tự bỏ tiền mua**, chờ admin duyệt thì khoản
  đó mới tính vào số dư chung.

Dữ liệu lưu bằng SQLite (qua `@libsql/client`) — chạy local dùng file `data.db` ngay trên
máy, không cần cài gì thêm; khi deploy có thể trỏ sang DB Turso free để dữ liệu không mất
khi server khởi động lại.

## Kiến trúc

- **Backend**: Node.js + Express (`server/`), tổ chức theo `routes/` (định tuyến),
  `services/` (validate + business logic), `middleware/`, `lib/` (auth, tính toán số dư,
  truy cập DB). `server/lib/calc.js` là nơi DUY NHẤT chứa công thức tính số dư/"ai nợ ai" —
  dùng chung cho cả server và (qua route `/calc.js`) trình duyệt.
- **Frontend**: React + Vite + TypeScript + Tailwind CSS (`client/`), tổ chức theo tính
  năng dưới `client/src/features/{auth,members,expenses,settlements,dashboard}`, các
  component UI dùng chung ở `client/src/components/ui/`. Form dùng React Hook Form + Zod.
- Production: Express phục vụ bản build tĩnh của React từ `client/dist/`.

## Cài đặt

Yêu cầu: [Node.js](https://nodejs.org/) bản 20 trở lên.

```bash
cd chi-tieu-chung
npm install
npm run build   # build frontend React (client/dist) — bắt buộc trước khi npm start
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

**Xem bản production (đã build):**

```bash
npm run build
npm start
```

Mở trình duyệt vào **http://localhost:3456**. Bấm "Đăng nhập admin" ở góc trên để vào chế
độ chỉnh sửa đầy đủ.

**Phát triển frontend (hot reload):** chạy song song 2 lệnh ở 2 terminal —

```bash
npm run dev          # backend, http://localhost:3456
npm run dev:client   # Vite dev server, http://localhost:5173 (proxy /api sang backend)
```

Mở **http://localhost:5173** khi phát triển giao diện — mọi thay đổi trong `client/src`
được áp dụng ngay không cần build lại.

## Chạy kiểm thử

```bash
npm test
```

Gồm 2 bộ:
- `test/calc.test.js` — công thức tính số dư và "ai nợ ai" (bộ số liệu mẫu Lan/Minh/Huy).
- `test/expense-approval.test.js` — luồng đăng nhập, phân quyền 401 khi chưa login, và
  yêu cầu thêm khoản chi chỉ tính vào số dư sau khi admin duyệt (không tính khi pending/rejected).

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
   - Build command: `npm install && npm run build`
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
3. **Khoản chi**: chọn ngày, nội dung, số tiền, người trả. Ô "Chia cho ai" mặc định tick
   hết tất cả — bỏ tick người nào không dùng khoản đó nếu cần chia riêng.
   - Admin: bấm "+ Thêm khoản chi" → tính vào số dư ngay, có thể Sửa/Xoá bất kỳ khoản nào.
   - Người khác: bấm "Gửi yêu cầu" → khoản chi vào hàng chờ (badge "Chờ duyệt" trong bảng
     danh sách khoản chi), admin bấm "Duyệt"/"Từ chối" ngay trên dòng đó. Bị từ chối vẫn
     lưu lại lịch sử, không tính vào số dư.
4. **Tổng kết / Ai nợ ai**: ai cũng xem được, tự động cập nhật.
5. **Ghi nhận thanh toán**: khi ai đó đã thực sự chuyển khoản/trả tiền mặt, bấm nút tương
   ứng ngay trên dòng nợ ở mục "Ai nợ ai" — không nhập tay người trả/người nhận/số tiền để
   tránh ghi nhầm; số tiền luôn đúng bằng đúng số nợ đang hiện.
   - Admin: bấm "Ghi nhận đã trả" → tính vào số dư ngay, không cần duyệt vì admin đã được
     tin tưởng.
   - Người khác: bấm "Gửi yêu cầu đã trả" → thanh toán vào hàng chờ (badge "Chờ duyệt"
     trong bảng "Lịch sử thanh toán"), admin bấm "Duyệt"/"Từ chối". Bị từ chối vẫn lưu lại
     lịch sử, không tính vào số dư — tránh trường hợp tự khai đã trả để nợ biến mất trước
     khi admin xác minh.
6. **Xoá sạch dữ liệu**: (admin) dùng khi mọi người đã trả hết nợ hoặc muốn ghi chi tiêu
   đợt mới — xoá khoản chi + lịch sử thanh toán, giữ nguyên danh sách thành viên.
