'use strict';

// Gộp cả /api/expenses (admin) và /api/expense-requests (ai cũng gửi được,
// chờ duyệt) trong 1 router — 2 nhóm path khác tiền tố nên router này được
// mount thẳng ở /api (không phải /api/expenses) để giữ đúng URL gốc.

const express = require('express');
const db = require('../lib/db');
const requireAdmin = require('../middleware/requireAdmin');
const asyncRoute = require('../middleware/asyncRoute');
const { buildState } = require('../services/stateService');
const {
  validateExpenseInput,
  validateReceipt,
  validateSplitItems,
  buildExpensePayload,
} = require('../services/expenseService');

const router = express.Router();

// ---- Khoản chi (admin thêm thẳng -> approved ngay) ----

router.post(
  '/expenses',
  requireAdmin,
  asyncRoute(async (req, res) => {
    const members = await db.getMembers();
    const err = validateExpenseInput(req.body, members) || validateReceipt(req.body.receipt) || validateSplitItems(req.body.splitItems);
    if (err) return res.status(400).json({ error: err });

    await db.addExpense({
      ...buildExpensePayload(req.body, members),
      status: 'approved',
    });
    res.json(await buildState(req));
  })
);

// ---- Yêu cầu thêm khoản chi (ai cũng gửi được, chờ admin duyệt) ----

router.post(
  '/expense-requests',
  asyncRoute(async (req, res) => {
    const members = await db.getMembers();
    const err = validateExpenseInput(req.body, members) || validateReceipt(req.body.receipt) || validateSplitItems(req.body.splitItems);
    if (err) return res.status(400).json({ error: err });

    await db.addExpense({
      ...buildExpensePayload(req.body, members),
      status: 'pending',
    });
    res.json(await buildState(req));
  })
);

router.post(
  '/expense-requests/:id/approve',
  requireAdmin,
  asyncRoute(async (req, res) => {
    // Gộp bước kiểm tra tồn tại + ghi vào 1 round-trip DB duy nhất (UPDATE ...
    // rồi xét rowsAffected) thay vì SELECT trước rồi mới UPDATE — bớt 1 lượt
    // đi-về tới Turso mỗi lần duyệt, độ trễ vốn cộng dồn từ nhiều bước tuần tự.
    const ok = await db.setExpenseStatus(req.params.id, 'approved');
    if (!ok) return res.status(404).json({ error: 'Không tìm thấy yêu cầu khoản chi' });
    res.json(await buildState(req));
  })
);

router.post(
  '/expense-requests/:id/reject',
  requireAdmin,
  asyncRoute(async (req, res) => {
    const ok = await db.setExpenseStatus(req.params.id, 'rejected');
    if (!ok) return res.status(404).json({ error: 'Không tìm thấy yêu cầu khoản chi' });
    res.json(await buildState(req));
  })
);

// Ảnh bill tải riêng theo yêu cầu (xem db.getExpenses() — không còn kèm sẵn
// trong /api/state để tránh kéo theo hàng MB ảnh mỗi lần lấy state).
router.get(
  '/expenses/:id/receipt',
  asyncRoute(async (req, res) => {
    const receipt = await db.getExpenseReceipt(req.params.id);
    if (receipt === undefined) return res.status(404).json({ error: 'Không tìm thấy khoản chi' });
    res.json({ receipt });
  })
);

router.put(
  '/expenses/:id',
  requireAdmin,
  asyncRoute(async (req, res) => {
    const exists = await db.expenseExists(req.params.id);
    if (!exists) return res.status(404).json({ error: 'Không tìm thấy khoản chi' });

    const members = await db.getMembers();
    const err = validateExpenseInput(req.body, members) || validateReceipt(req.body.receipt) || validateSplitItems(req.body.splitItems);
    if (err) return res.status(400).json({ error: err });

    await db.updateExpense(req.params.id, buildExpensePayload(req.body, members));
    res.json(await buildState(req));
  })
);

router.delete(
  '/expenses/:id',
  requireAdmin,
  asyncRoute(async (req, res) => {
    const ok = await db.deleteExpense(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Không tìm thấy khoản chi' });
    res.json(await buildState(req));
  })
);

module.exports = router;
