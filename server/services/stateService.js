'use strict';

const db = require('../lib/db');
const auth = require('../lib/auth');
const { computeSummary, computeDebts } = require('../lib/calc');

// Trạng thái đầy đủ trả về sau MỌI thao tác (kể cả không liên quan trực tiếp)
// để frontend luôn có bản mới nhất mà không cần gọi thêm request — giữ đúng
// hành vi/shape cũ của response, KHÔNG đổi contract API.
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

module.exports = { buildState };
