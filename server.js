'use strict';

require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const db = require('./lib/db');
const auth = require('./lib/auth');
const { computeSummary, computeDebts } = require('./lib/calc');

const app = express();
const PORT = process.env.PORT || 3456;

// Nâng giới hạn body JSON vì ảnh bill (đã nén phía trình duyệt) được gửi dạng
// base64 lồng trong payload — mặc định 100kb của Express là không đủ.
app.use(express.json({ limit: '6mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Cho trình duyệt dùng chung đúng 1 bản logic tính toán với server (optimistic UI).
app.get('/calc.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'lib', 'calc.js'));
});

// Bọc route async để lỗi tự rơi vào error handler thay vì làm crash tiến trình.
function asyncRoute(handler) {
  return (req, res, next) => handler(req, res, next).catch(next);
}

async function buildState(req) {
  const { members, expenses, settlements } = await db.getState();
  const approvedExpenses = expenses.filter((e) => e.status === 'approved');
  const approvedSettlements = settlements.filter((s) => s.status === 'approved');
  const summary = computeSummary(members, approvedExpenses, approvedSettlements);
  const debts = computeDebts(members, approvedExpenses, approvedSettlements);
  return {
    isAdmin: auth.isAdminRequest(req),
    members,
    expenses,
    settlements,
    summary,
    debts,
  };
}

app.get(
  '/api/state',
  asyncRoute(async (req, res) => {
    res.json(await buildState(req));
  })
);

// ---- Đăng nhập / đăng xuất admin ----

app.post('/api/login', (req, res) => {
  const password = req.body.password || '';
  if (!auth.ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'Server chưa cấu hình ADMIN_PASSWORD' });
  }
  if (password !== auth.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Sai mật khẩu' });
  }
  auth.setSessionCookie(res);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

// ---- Thành viên (chỉ admin) ----

app.post(
  '/api/members',
  auth.requireAdmin,
  asyncRoute(async (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Tên thành viên không được để trống' });
    await db.addMember(name);
    res.json(await buildState(req));
  })
);

app.put(
  '/api/members/:id',
  auth.requireAdmin,
  asyncRoute(async (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Tên thành viên không được để trống' });
    const ok = await db.renameMember(req.params.id, name);
    if (!ok) return res.status(404).json({ error: 'Không tìm thấy thành viên' });
    res.json(await buildState(req));
  })
);

app.delete(
  '/api/members/:id',
  auth.requireAdmin,
  asyncRoute(async (req, res) => {
    const id = req.params.id;
    const exists = await db.memberExists(id);
    if (!exists) return res.status(404).json({ error: 'Không tìm thấy thành viên' });

    const referenced = await db.memberIsReferenced(id);
    if (referenced) {
      return res.status(400).json({
        error: 'Không thể xoá thành viên này vì đã có khoản chi hoặc thanh toán liên quan. Hãy sửa/xoá các khoản đó trước.',
      });
    }

    await db.deleteMember(id);
    res.json(await buildState(req));
  })
);

// ---- Khoản chi ----

function validateExpenseInput(body, members) {
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Số tiền phải lớn hơn 0';
  }
  if (!body.payerId || !members.some((m) => m.id === body.payerId)) {
    return 'Vui lòng chọn người trả hợp lệ';
  }
  const shareMemberIds = Array.isArray(body.shareMemberIds) ? body.shareMemberIds : [];
  const validShareIds = shareMemberIds.filter((id) => members.some((m) => m.id === id));
  if (validShareIds.length === 0) {
    return 'Vui lòng chọn ít nhất 1 người tham gia chia khoản chi này';
  }
  if (!body.date) {
    return 'Vui lòng chọn ngày';
  }
  return null;
}

const MAX_RECEIPT_LENGTH = 4 * 1024 * 1024; // ~4MB chuỗi base64

function validateReceipt(receipt) {
  if (receipt === null || receipt === undefined || receipt === '') return null;
  if (typeof receipt !== 'string' || !receipt.startsWith('data:image/')) {
    return 'Ảnh bill không hợp lệ';
  }
  if (receipt.length > MAX_RECEIPT_LENGTH) {
    return 'Ảnh bill quá lớn';
  }
  return null;
}

app.post(
  '/api/expenses',
  auth.requireAdmin,
  asyncRoute(async (req, res) => {
    const members = await db.getMembers();
    const err = validateExpenseInput(req.body, members) || validateReceipt(req.body.receipt);
    if (err) return res.status(400).json({ error: err });

    await db.addExpense({
      date: req.body.date,
      description: (req.body.description || '').trim(),
      amount: Math.round(Number(req.body.amount)),
      payerId: req.body.payerId,
      shareMemberIds: req.body.shareMemberIds.filter((id) => members.some((m) => m.id === id)),
      status: 'approved',
      receipt: req.body.receipt || null,
    });
    res.json(await buildState(req));
  })
);

// ---- Yêu cầu thêm khoản chi (ai cũng gửi được, chờ admin duyệt) ----

app.post(
  '/api/expense-requests',
  asyncRoute(async (req, res) => {
    const members = await db.getMembers();
    const err = validateExpenseInput(req.body, members) || validateReceipt(req.body.receipt);
    if (err) return res.status(400).json({ error: err });

    await db.addExpense({
      date: req.body.date,
      description: (req.body.description || '').trim(),
      amount: Math.round(Number(req.body.amount)),
      payerId: req.body.payerId,
      shareMemberIds: req.body.shareMemberIds.filter((id) => members.some((m) => m.id === id)),
      status: 'pending',
      receipt: req.body.receipt || null,
    });
    res.json(await buildState(req));
  })
);

app.post(
  '/api/expense-requests/:id/approve',
  auth.requireAdmin,
  asyncRoute(async (req, res) => {
    const e = await db.getExpenseById(req.params.id);
    if (!e) return res.status(404).json({ error: 'Không tìm thấy yêu cầu khoản chi' });
    await db.setExpenseStatus(req.params.id, 'approved');
    res.json(await buildState(req));
  })
);

app.post(
  '/api/expense-requests/:id/reject',
  auth.requireAdmin,
  asyncRoute(async (req, res) => {
    const e = await db.getExpenseById(req.params.id);
    if (!e) return res.status(404).json({ error: 'Không tìm thấy yêu cầu khoản chi' });
    await db.setExpenseStatus(req.params.id, 'rejected');
    res.json(await buildState(req));
  })
);

app.put(
  '/api/expenses/:id',
  auth.requireAdmin,
  asyncRoute(async (req, res) => {
    const exists = await db.expenseExists(req.params.id);
    if (!exists) return res.status(404).json({ error: 'Không tìm thấy khoản chi' });

    const members = await db.getMembers();
    const err = validateExpenseInput(req.body, members) || validateReceipt(req.body.receipt);
    if (err) return res.status(400).json({ error: err });

    await db.updateExpense(req.params.id, {
      date: req.body.date,
      description: (req.body.description || '').trim(),
      amount: Math.round(Number(req.body.amount)),
      payerId: req.body.payerId,
      shareMemberIds: req.body.shareMemberIds.filter((id) => members.some((m) => m.id === id)),
      receipt: req.body.receipt || null,
    });
    res.json(await buildState(req));
  })
);

app.delete(
  '/api/expenses/:id',
  auth.requireAdmin,
  asyncRoute(async (req, res) => {
    const exists = await db.expenseExists(req.params.id);
    if (!exists) return res.status(404).json({ error: 'Không tìm thấy khoản chi' });
    await db.deleteExpense(req.params.id);
    res.json(await buildState(req));
  })
);

// ---- Thanh toán (admin ghi nhận trực tiếp -> approved ngay; người khác gửi
//      yêu cầu -> pending, chờ admin duyệt) ----

function validateSettlementInput(body, members) {
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Số tiền phải lớn hơn 0';
  }
  if (!body.fromId || !members.some((m) => m.id === body.fromId)) {
    return 'Vui lòng chọn người trả nợ hợp lệ';
  }
  if (!body.toId || !members.some((m) => m.id === body.toId)) {
    return 'Vui lòng chọn người nhận hợp lệ';
  }
  if (body.fromId === body.toId) {
    return 'Người trả nợ và người nhận phải khác nhau';
  }
  if (!body.date) {
    return 'Vui lòng chọn ngày';
  }
  return null;
}

app.post(
  '/api/settlements',
  auth.requireAdmin,
  asyncRoute(async (req, res) => {
    const members = await db.getMembers();
    const err = validateSettlementInput(req.body, members);
    if (err) return res.status(400).json({ error: err });

    await db.addSettlement({
      date: req.body.date,
      fromId: req.body.fromId,
      toId: req.body.toId,
      amount: Math.round(Number(req.body.amount)),
      status: 'approved',
    });
    res.json(await buildState(req));
  })
);

// ---- Yêu cầu ghi nhận đã trả nợ (ai cũng gửi được, chờ admin duyệt) ----

app.post(
  '/api/settlement-requests',
  asyncRoute(async (req, res) => {
    const members = await db.getMembers();
    const err = validateSettlementInput(req.body, members);
    if (err) return res.status(400).json({ error: err });

    await db.addSettlement({
      date: req.body.date,
      fromId: req.body.fromId,
      toId: req.body.toId,
      amount: Math.round(Number(req.body.amount)),
      status: 'pending',
    });
    res.json(await buildState(req));
  })
);

app.post(
  '/api/settlement-requests/:id/approve',
  auth.requireAdmin,
  asyncRoute(async (req, res) => {
    const s = await db.getSettlementById(req.params.id);
    if (!s) return res.status(404).json({ error: 'Không tìm thấy yêu cầu thanh toán' });
    await db.setSettlementStatus(req.params.id, 'approved');
    res.json(await buildState(req));
  })
);

app.post(
  '/api/settlement-requests/:id/reject',
  auth.requireAdmin,
  asyncRoute(async (req, res) => {
    const s = await db.getSettlementById(req.params.id);
    if (!s) return res.status(404).json({ error: 'Không tìm thấy yêu cầu thanh toán' });
    await db.setSettlementStatus(req.params.id, 'rejected');
    res.json(await buildState(req));
  })
);

// ---- Xoá sạch dữ liệu (giữ lại danh sách thành viên, chỉ admin) ----

app.post(
  '/api/reset',
  auth.requireAdmin,
  asyncRoute(async (req, res) => {
    await db.resetData();
    res.json(await buildState(req));
  })
);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Có lỗi phía server' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Ứng dụng đang chạy tại: http://localhost:${PORT}`);
    console.log(`Dữ liệu được lưu tại: ${db.DB_URL}`);
    if (!auth.ADMIN_PASSWORD) {
      console.warn('CẢNH BÁO: chưa đặt biến môi trường ADMIN_PASSWORD — không ai đăng nhập admin được.');
    }
  });
}

module.exports = app;
