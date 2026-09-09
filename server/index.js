'use strict';

require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const db = require('./lib/db');
const auth = require('./lib/auth');

const authRoutes = require('./routes/auth');
const memberRoutes = require('./routes/members');
const expenseRoutes = require('./routes/expenses');
const settlementRoutes = require('./routes/settlements');
const asyncRoute = require('./middleware/asyncRoute');
const requireAdmin = require('./middleware/requireAdmin');
const { buildState } = require('./services/stateService');

const app = express();
const PORT = process.env.PORT || 3456;

// Nâng giới hạn body JSON vì ảnh bill (đã nén phía trình duyệt) được gửi dạng
// base64 lồng trong payload — mặc định 100kb của Express là không đủ.
app.use(express.json({ limit: '6mb' }));
app.use(cookieParser());

// Cho trình duyệt dùng chung đúng 1 bản logic tính toán với server (optimistic UI).
app.get('/calc.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'lib', 'calc.js'));
});

// Trong lúc đang chuyển từ frontend cũ (public/) sang React mới (client/dist):
// ưu tiên serve bản build React nếu đã có, không thì tạm dùng bản cũ — để app
// luôn chạy được ở mọi thời điểm trong quá trình di chuyển (không phải tắt app
// giữa chừng). Sau khi client/ thay thế hẳn public/, dòng fallback này bỏ đi.
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
const legacyPublicPath = path.join(__dirname, '..', 'public');
const staticRoot = fs.existsSync(clientDistPath) ? clientDistPath : legacyPublicPath;
app.use(express.static(staticRoot));

app.get(
  '/api/state',
  asyncRoute(async (req, res) => {
    res.json(await buildState(req));
  })
);

app.use('/api', authRoutes);
app.use('/api/members', memberRoutes);
app.use('/api', expenseRoutes);
app.use('/api', settlementRoutes);

// ---- Xoá sạch dữ liệu (giữ lại danh sách thành viên, chỉ admin) ----

app.post(
  '/api/reset',
  requireAdmin,
  asyncRoute(async (req, res) => {
    await db.resetData();
    res.json(await buildState(req));
  })
);

// SPA: mọi route GET không khớp API/static nào ở trên (F5 giữa app 1 trang)
// trả về đúng index.html của bản đang serve, để client-side không bị 404.
app.get(/^(?!\/api).*/, (req, res, next) => {
  const indexPath = path.join(staticRoot, 'index.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  next();
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Có lỗi phía server' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Ứng dụng đang chạy tại: http://localhost:${PORT}`);
    console.log(`Dữ liệu được lưu tại: ${db.DB_URL}`);
    console.log(`Đang phục vụ frontend từ: ${staticRoot}`);
    if (!auth.ADMIN_PASSWORD) {
      console.warn('CẢNH BÁO: chưa đặt biến môi trường ADMIN_PASSWORD — không ai đăng nhập admin được.');
    }
  });
}

module.exports = app;
