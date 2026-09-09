'use strict';

const express = require('express');
const db = require('../lib/db');
const requireAdmin = require('../middleware/requireAdmin');
const asyncRoute = require('../middleware/asyncRoute');
const { buildState } = require('../services/stateService');

const router = express.Router();

router.post(
  '/',
  requireAdmin,
  asyncRoute(async (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Tên thành viên không được để trống' });
    await db.addMember(name);
    res.json(await buildState(req));
  })
);

router.put(
  '/:id',
  requireAdmin,
  asyncRoute(async (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Tên thành viên không được để trống' });
    const ok = await db.renameMember(req.params.id, name);
    if (!ok) return res.status(404).json({ error: 'Không tìm thấy thành viên' });
    res.json(await buildState(req));
  })
);

router.delete(
  '/:id',
  requireAdmin,
  asyncRoute(async (req, res) => {
    const id = req.params.id;
    // Bỏ bước kiểm tra tồn tại riêng — memberIsReferenced() với id không tồn
    // tại tự nhiên trả về false (không khớp dòng nào), và deleteMember() tự
    // báo lại có xoá được dòng nào không — dựa vào đó suy ra 404, khỏi cần
    // round-trip SELECT tồn tại riêng.
    const referenced = await db.memberIsReferenced(id);
    if (referenced) {
      return res.status(400).json({
        error: 'Không thể xoá thành viên này vì đã có khoản chi hoặc thanh toán liên quan. Hãy sửa/xoá các khoản đó trước.',
      });
    }

    const ok = await db.deleteMember(id);
    if (!ok) return res.status(404).json({ error: 'Không tìm thấy thành viên' });
    res.json(await buildState(req));
  })
);

module.exports = router;
