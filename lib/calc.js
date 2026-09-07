'use strict';

// Tất cả số tiền được làm tròn về số nguyên (đồng VNĐ không có phần thập phân).
function round(n) {
  return Math.round(n);
}

/**
 * Ma trận nợ "ai nợ ai" — nền tảng chung cho cả computeSummary và computeDebts,
 * để 2 phần luôn khớp nhau tuyệt đối.
 *
 * Nguyên tắc: nợ giữa 2 người được xác định TRƯỚC HẾT từ khoản chi (raw). Thanh
 * toán (settlement) chỉ có tác dụng làm GIẢM khoản nợ đó xuống tối thiểu là 0 —
 * không bao giờ vượt quá để tạo ra nợ chiều ngược lại. Vì vậy:
 * - Xoá 1 khoản chi thì nợ liên quan biến mất thật sự (không để lại nợ ảo).
 * - Thanh toán dư (nhiều hơn nợ thực tế, hoặc nợ gốc đã bị xoá) sẽ chỉ "hết tác
 *   dụng" chứ không biến thành nợ ngược.
 */
function computeDebtMatrix(members, expenses, settlements) {
  const ids = members.map((m) => m.id);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;

  // raw[i][j] = tổng tiền mà người i nợ người j chỉ tính riêng từ khoản chi
  // (i được tick chia, j là người trả)
  const raw = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const e of expenses) {
    const jPayer = idx.get(e.payerId);
    if (jPayer === undefined) continue;
    const shareCount = e.shareMemberIds.length;
    if (shareCount === 0) continue;
    const per = e.amount / shareCount;
    for (const mid of e.shareMemberIds) {
      const iOwer = idx.get(mid);
      if (iOwer === undefined || iOwer === jPayer) continue;
      raw[iOwer][jPayer] += per;
    }
  }

  // settled[i][j] = tổng tiền i đã thanh toán cho j
  const settled = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const s of settlements) {
    const i = idx.get(s.fromId);
    const j = idx.get(s.toId);
    if (i === undefined || j === undefined) continue;
    settled[i][j] += s.amount;
  }

  // debt[i][j] = i còn nợ j bao nhiêu, sau khi trừ thanh toán, tối thiểu là 0.
  const debt = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const expenseNet = Math.max(0, raw[i][j] - raw[j][i]);
      const settlementNet = Math.max(0, settled[i][j] - settled[j][i]);
      debt[i][j] = Math.max(0, expenseNet - settlementNet);
    }
  }

  return { ids, debt };
}

/**
 * Tính tổng kết theo từng người: đã trả hộ, phải chịu (thuần từ khoản chi),
 * và số dư (suy ra trực tiếp từ ma trận "ai nợ ai" để luôn khớp với mục đó).
 */
function computeSummary(members, expenses, settlements) {
  const paid = new Map(members.map((m) => [m.id, 0]));
  const owed = new Map(members.map((m) => [m.id, 0]));

  for (const e of expenses) {
    if (paid.has(e.payerId)) {
      paid.set(e.payerId, paid.get(e.payerId) + e.amount);
    }
    const n = e.shareMemberIds.length;
    if (n === 0) continue;
    const per = e.amount / n;
    for (const mid of e.shareMemberIds) {
      if (owed.has(mid)) {
        owed.set(mid, owed.get(mid) + per);
      }
    }
  }

  const { ids, debt } = computeDebtMatrix(members, expenses, settlements);
  const n = ids.length;
  const balanceByIndex = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      // Người khác nợ mình (debt[j][i]) làm tăng số dư; mình nợ người khác (debt[i][j]) làm giảm.
      balanceByIndex[i] += debt[j][i] - debt[i][j];
    }
  }

  return members.map((m, i) => ({
    id: m.id,
    name: m.name,
    totalPaid: round(paid.get(m.id) || 0),
    totalOwed: round(owed.get(m.id) || 0),
    balance: round(balanceByIndex[i]),
  }));
}

/**
 * Tính "ai nợ ai": danh sách { fromId, toId, amount } chỉ gồm amount > 0,
 * lấy trực tiếp từ ma trận nợ dùng chung với computeSummary.
 */
function computeDebts(members, expenses, settlements) {
  const { ids, debt } = computeDebtMatrix(members, expenses, settlements);
  const n = ids.length;
  const debts = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const amount = round(debt[i][j]);
      if (amount > 0) {
        debts.push({ fromId: ids[i], toId: ids[j], amount });
      }
    }
  }
  return debts;
}

module.exports = { computeSummary, computeDebts, round };
