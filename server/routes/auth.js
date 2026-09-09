'use strict';

const express = require('express');
const auth = require('../lib/auth');

const router = express.Router();

router.post('/login', (req, res) => {
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

router.post('/logout', (req, res) => {
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

module.exports = router;
