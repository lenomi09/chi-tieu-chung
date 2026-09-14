'use strict';

// Tất cả số tiền được làm tròn về số nguyên (đồng VNĐ không có phần thập phân).
function round(n) {
  return Math.round(n);
}

// Phần mỗi người phải chịu trong 1 khoản chi: dùng shareAmounts (chia riêng số
// tiền khác nhau từng người) nếu có, không thì chia đều amount cho shareMemberIds
// như mặc định. Dùng chung cho computeDebtMatrix và computeSummary để 2 nơi luôn
// khớp nhau tuyệt đối.
function resolveShares(e) {
  if (e.shareAmounts && typeof e.shareAmounts === 'object') {
    return Object.entries(e.shareAmounts).map(([memberId, amount]) => ({ memberId, amount }));
  }
  const shareCount = e.shareMemberIds.length;
  if (shareCount === 0) return [];
  const per = e.amount / shareCount;
  return e.shareMemberIds.map((memberId) => ({ memberId, amount: per }));
}

// Tăng nợ i->j thêm `amount`: trừ vào nợ chiều ngược (j->i) trước nếu có, phần
// dư mới thật sự cộng thành nợ mới — giữ bất biến "1 trong 2 chiều luôn bằng 0".
function increaseDebt(debt, i, j, amount) {
  if (debt[j][i] > 0) {
    const cancel = Math.min(debt[j][i], amount);
    debt[j][i] -= cancel;
    amount -= cancel;
  }
  debt[i][j] += amount;
}

// Áp 1 khoản thanh toán i->j: chỉ được làm giảm nợ i->j hiện có, tối thiểu 0 —
// trả dư (hoặc trả khi không nợ) thì phần dư "mất tác dụng", không biến thành
// nợ chiều ngược (khớp đúng ý nghĩa 1 lần thanh toán, không phải khoản chi).
function applySettlement(debt, i, j, amount) {
  const reduce = Math.min(debt[i][j], amount);
  debt[i][j] -= reduce;
}

/**
 * Ma trận nợ "ai nợ ai" — nền tảng chung cho cả computeSummary và computeDebts,
 * để 2 phần luôn khớp nhau tuyệt đối.
 *
 * Nguyên tắc: xử lý khoản chi & thanh toán THEO THỨ TỰ THỜI GIAN (không phải
 * cộng dồn tổng cả đời rồi mới trừ 1 lần ở cuối) — mỗi thanh toán chỉ xoá nợ
 * đã phát sinh TÍNH ĐẾN THỜI ĐIỂM ĐÓ. Nhờ vậy:
 * - Thanh toán xong, nợ về đúng 0 (không âm thầm để lại phần dư).
 * - Khoản chi phát sinh SAU đó được tính là nợ mới hoàn toàn, không bị một
 *   thanh toán cũ (đã dùng hết hoặc dư ra trước đó) âm thầm bù trừ tiếp.
 * - Cùng ngày: khoản chi được tính trước thanh toán trong ngày đó (coi thanh
 *   toán như "chốt sổ cuối ngày").
 */
function computeDebtMatrix(members, expenses, settlements) {
  const ids = members.map((m) => m.id);
  const idx = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;

  const events = [];
  for (const e of expenses) {
    const jPayer = idx.get(e.payerId);
    if (jPayer === undefined) continue;
    for (const { memberId, amount } of resolveShares(e)) {
      const iOwer = idx.get(memberId);
      if (iOwer === undefined || iOwer === jPayer) continue;
      events.push({ date: e.date, kind: 0, i: iOwer, j: jPayer, amount });
    }
  }
  for (const s of settlements) {
    const i = idx.get(s.fromId);
    const j = idx.get(s.toId);
    if (i === undefined || j === undefined) continue;
    events.push({ date: s.date, kind: 1, i, j, amount: s.amount });
  }
  // sort() ổn định (stable) nên cùng ngày + cùng loại vẫn giữ nguyên thứ tự gốc.
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind - b.kind));

  const debt = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const ev of events) {
    if (ev.kind === 0) increaseDebt(debt, ev.i, ev.j, ev.amount);
    else applySettlement(debt, ev.i, ev.j, ev.amount);
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
    for (const { memberId, amount } of resolveShares(e)) {
      if (owed.has(memberId)) {
        owed.set(memberId, owed.get(memberId) + amount);
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

// File này được dùng chung cho cả server (require qua Node) và trình duyệt (nạp
// thẳng qua thẻ <script>, xem route GET /calc.js ở server.js) — để 2 bên không
// bao giờ lệch logic tính toán.
(function (root, api) {
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.calc = api;
  }
})(typeof window !== 'undefined' ? window : this, { computeSummary, computeDebts, round });
