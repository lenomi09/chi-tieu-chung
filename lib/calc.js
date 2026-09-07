'use strict';

// Tất cả số tiền được làm tròn về số nguyên (đồng VNĐ không có phần thập phân).
function round(n) {
  return Math.round(n);
}

/**
 * Tính tổng kết theo từng người: đã trả hộ, phải chịu, số dư.
 * Số dư có tính cả các khoản thanh toán (settlements) đã ghi nhận.
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

  const settledSent = new Map(members.map((m) => [m.id, 0]));
  const settledReceived = new Map(members.map((m) => [m.id, 0]));
  for (const s of settlements) {
    if (settledSent.has(s.fromId)) settledSent.set(s.fromId, settledSent.get(s.fromId) + s.amount);
    if (settledReceived.has(s.toId)) settledReceived.set(s.toId, settledReceived.get(s.toId) + s.amount);
  }

  return members.map((m) => {
    const totalPaid = paid.get(m.id) || 0;
    const totalOwed = owed.get(m.id) || 0;
    const sent = settledSent.get(m.id) || 0;
    const received = settledReceived.get(m.id) || 0;
    const balance = totalPaid - totalOwed + sent - received;
    return {
      id: m.id,
      name: m.name,
      totalPaid: round(totalPaid),
      totalOwed: round(totalOwed),
      balance: round(balance),
    };
  });
}

/**
 * Tính "ai nợ ai" dạng net (đã trừ 2 chiều + trừ luôn các khoản đã thanh toán).
 * Trả về danh sách { fromId, toId, amount } chỉ gồm amount > 0.
 */
function computeDebts(members, expenses, settlements) {
  const ids = members.map((m) => m.id);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;

  // raw[i][j] = tổng tiền mà người i nợ người j chỉ tính riêng từ các khoản chi
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

  // net[i][j] = i nợ j (đã trừ raw[j][i]), có thể âm
  const net = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      net[i][j] = raw[i][j] - raw[j][i];
    }
  }

  // Áp dụng các khoản đã thanh toán: from trả cho to => giảm nợ from->to
  for (const s of settlements) {
    const i = idx.get(s.fromId);
    const j = idx.get(s.toId);
    if (i === undefined || j === undefined) continue;
    net[i][j] -= s.amount;
    net[j][i] += s.amount;
  }

  const debts = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const amount = round(net[i][j]);
      if (amount > 0.001) {
        debts.push({ fromId: ids[i], toId: ids[j], amount });
      }
    }
  }
  return debts;
}

module.exports = { computeSummary, computeDebts, round };
