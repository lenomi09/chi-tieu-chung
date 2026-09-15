'use strict';

const db = require('../lib/db');
const auth = require('../lib/auth');
const { computeSummary, computeDebts, checkSettlements } = require('../lib/calc');

// Trạng thái đầy đủ trả về sau MỌI thao tác (kể cả không liên quan trực tiếp)
// để frontend luôn có bản mới nhất mà không cần gọi thêm request — giữ đúng
// hành vi/shape cũ của response, KHÔNG đổi contract API.
async function buildState(req) {
  const { members, expenses, settlements } = await db.getState();
  const approvedExpenses = expenses.filter((e) => e.status === 'approved');
  const approvedSettlements = settlements.filter((s) => s.status === 'approved');
  const summary = computeSummary(members, approvedExpenses, approvedSettlements);
  const debts = computeDebts(members, approvedExpenses, approvedSettlements);

  // Đối chiếu từng thanh toán ĐÃ DUYỆT với đúng số nợ thực tế lúc nó tất toán
  // — thanh toán chờ duyệt/từ chối chưa được áp dụng nên không có gì để đối
  // chiếu (matches: null).
  const checks = new Map(
    checkSettlements(members, approvedExpenses, approvedSettlements).map((c) => [c.settlementId, c])
  );
  const settlementsWithCheck = settlements.map((s) => {
    const check = checks.get(s.id);
    return { ...s, expectedAmount: check ? check.expectedAmount : null, matches: check ? check.matches : null };
  });

  return {
    isAdmin: auth.isAdminRequest(req),
    members,
    expenses,
    settlements: settlementsWithCheck,
    summary,
    debts,
  };
}

module.exports = { buildState };
