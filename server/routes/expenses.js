'use strict';

// Gộp cả /api/expenses (admin) và /api/expense-requests (ai cũng gửi được,
// chờ duyệt) trong 1 router — 2 nhóm path khác tiền tố nên router này được
// mount thẳng ở /api (không phải /api/expenses) để giữ đúng URL gốc.

const express = require('express');
const db = require('../lib/db');
const requireAdmin = require('../middleware/requireAdmin');
const asyncRoute = require('../middleware/asyncRoute');
const { buildState } = require('../services/stateService');
const { validateExpenseInput, validateReceipt, buildExpensePayload } = require('../services/expenseService');

const router = express.Router();

// ---- Khoản chi (admin thêm thẳng -> approved ngay) ----

router.post(
  '/expenses',
  requireAdmin,
  asyncRoute(async (req, res) => {
    const members = await db.getMembers();
    const err = validateExpenseInput(req.body, members) || validateReceipt(req.body.receipt);
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
    const err = validateExpenseInput(req.body, members) || validateReceipt(req.body.receipt);
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
    const e = await db.getExpenseById(req.params.id);
    if (!e) return res.status(404).json({ error: 'Không tìm thấy yêu cầu khoản chi' });
    await db.setExpenseStatus(req.params.id, 'approved');
    res.json(await buildState(req));
  })
);

router.post(
  '/expense-requests/:id/reject',
  requireAdmin,
  asyncRoute(async (req, res) => {
    const e = await db.getExpenseById(req.params.id);
    if (!e) return res.status(404).json({ error: 'Không tìm thấy yêu cầu khoản chi' });
    await db.setExpenseStatus(req.params.id, 'rejected');
    res.json(await buildState(req));
  })
);

router.put(
  '/expenses/:id',
  requireAdmin,
  asyncRoute(async (req, res) => {
    const exists = await db.expenseExists(req.params.id);
    if (!exists) return res.status(404).json({ error: 'Không tìm thấy khoản chi' });

    const members = await db.getMembers();
    const err = validateExpenseInput(req.body, members) || validateReceipt(req.body.receipt);
    if (err) return res.status(400).json({ error: err });

    await db.updateExpense(req.params.id, buildExpensePayload(req.body, members));
    res.json(await buildState(req));
  })
);

router.delete(
  '/expenses/:id',
  requireAdmin,
  asyncRoute(async (req, res) => {
    const exists = await db.expenseExists(req.params.id);
    if (!exists) return res.status(404).json({ error: 'Không tìm thấy khoản chi' });
    await db.deleteExpense(req.params.id);
    res.json(await buildState(req));
  })
);

module.exports = router;
