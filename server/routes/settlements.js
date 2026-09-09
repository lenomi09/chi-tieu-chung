'use strict';

// Gộp /api/settlements (admin) và /api/settlement-requests (chờ duyệt) — mount
// thẳng ở /api để giữ đúng URL gốc (giống expenses.js).

const express = require('express');
const db = require('../lib/db');
const requireAdmin = require('../middleware/requireAdmin');
const asyncRoute = require('../middleware/asyncRoute');
const { buildState } = require('../services/stateService');
const { validateSettlementInput } = require('../services/settlementService');

const router = express.Router();

// ---- Thanh toán (admin ghi nhận trực tiếp -> approved ngay) ----

router.post(
  '/settlements',
  requireAdmin,
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

router.post(
  '/settlement-requests',
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

router.post(
  '/settlement-requests/:id/approve',
  requireAdmin,
  asyncRoute(async (req, res) => {
    // Gộp kiểm tra tồn tại + ghi vào 1 round-trip (xem lý do ở expenses.js).
    const ok = await db.setSettlementStatus(req.params.id, 'approved');
    if (!ok) return res.status(404).json({ error: 'Không tìm thấy yêu cầu thanh toán' });
    res.json(await buildState(req));
  })
);

router.post(
  '/settlement-requests/:id/reject',
  requireAdmin,
  asyncRoute(async (req, res) => {
    const ok = await db.setSettlementStatus(req.params.id, 'rejected');
    if (!ok) return res.status(404).json({ error: 'Không tìm thấy yêu cầu thanh toán' });
    res.json(await buildState(req));
  })
);

module.exports = router;
