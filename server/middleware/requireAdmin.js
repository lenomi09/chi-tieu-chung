'use strict';

// Middleware chặn route chỉ-admin. Logic xác thực (ký/kiểm session) nằm ở
// lib/auth.js — file này chỉ re-export đúng middleware đó để routes/ import
// từ đúng chỗ "middleware" theo quy ước thư mục, không tách rời khỏi logic
// session (tránh 2 nơi phải đồng bộ tay).
const auth = require('../lib/auth');

module.exports = auth.requireAdmin;
