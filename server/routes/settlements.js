'use strict';

// Gộp /api/settlements (admin) và /api/settlement-requests (chờ duyệt) — mount
// thẳng ở /api để giữ đúng URL gốc (giống expenses.js).

const express = require('express');
const db = require('../lib/db');
const calc = require('../lib/calc');
const requireAdmin = require('../middleware/requireAdmin');
const asyncRoute = require('../middleware/asyncRoute');
const { buildState } = require('../services/stateService');
const { validateSettlementInput } = require('../services/settlementService');

const router = express.Router();

// ---- Giải thích 1 thanh toán: khoản chi nào đã được nó tất toán ----

router.get(
  '/settlements/:id/explain',
  asyncRoute(async (req, res) => {
    const { members, expenses, settlements } = await db.getState();
    const approvedExpenses = expenses.filter((e) => e.status === 'approved');
    const approvedSettlements = settlements.filter((s) => s.status === 'approved');
    const result = calc.explainSettlement(members, approvedExpenses, approvedSettlements, req.params.id);
    if (!result) return res.status(404).json({ error: 'Không tìm thấy thanh toán (hoặc chưa được duyệt)' });
    res.json(result);
  })
);

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

// Chỉ cho sửa NGÀY — không cho sửa người trả/người nhận/số tiền, để giữ đúng
// nguyên tắc "số tiền luôn tự khớp đúng nợ lúc bấm Đã trả" (xem DebtRow.tsx),
// tránh mở lại đường gõ tay gây lệch số như các lần đã gặp phải. Sửa ngày thì
// xoá luôn effective_at cũ (nếu có) vì mốc kỹ thuật đó gắn với ngày cũ, không
// còn đúng nữa sau khi người dùng tự sửa lại ngày.
router.put(
  '/settlements/:id/date',
  requireAdmin,
  asyncRoute(async (req, res) => {
    if (!req.body.date) return res.status(400).json({ error: 'Vui lòng chọn ngày' });
    const ok = await db.correctSettlementTiming(req.params.id, { date: req.body.date, effectiveAt: null });
    if (!ok) return res.status(404).json({ error: 'Không tìm thấy thanh toán' });
    res.json(await buildState(req));
  })
);

router.delete(
  '/settlements/:id',
  requireAdmin,
  asyncRoute(async (req, res) => {
    const ok = await db.deleteSettlement(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Không tìm thấy thanh toán' });
    res.json(await buildState(req));
  })
);

module.exports = router;
