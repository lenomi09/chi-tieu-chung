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

// Áp 1 khoản thanh toán i<->j: coi như 2 người đã TẤT TOÁN nợ với nhau tại thời
// điểm này — set thẳng nợ cả 2 chiều về 0, KHÔNG trừ theo đúng số tiền `amount`.
// Lý do: thanh toán trong app này là hành động "xác nhận đã trả xong" (người
// dùng duyệt 1 lần cho gọn), không phải trả góp nhiều lần theo từng đồng —
// nên dù số tiền ghi có lệch (làm tròn, trả thiếu/dư ngoài đời thực) thì nợ
// giữa 2 người vẫn phải về đúng 0, không được để sót/dư lại một phía.
function applySettlement(debt, i, j) {
  debt[i][j] = 0;
  debt[j][i] = 0;
}

/**
 * Ma trận nợ "ai nợ ai" — nền tảng chung cho cả computeSummary và computeDebts,
 * để 2 phần luôn khớp nhau tuyệt đối.
 *
 * Nguyên tắc: xử lý khoản chi & thanh toán THEO THỨ TỰ THỜI GIAN (không phải
 * cộng dồn tổng cả đời rồi mới trừ 1 lần ở cuối). Mỗi thanh toán giữa 2 người
 * là một mốc "tất toán" — nợ giữa 2 người đó set thẳng về 0 tại thời điểm ấy
 * (không trừ dần theo số tiền). Nhờ vậy:
 * - Duyệt thanh toán xong, nợ giữa 2 người về đúng 0 — không còn sót lại dù
 *   số tiền ghi nhận có lệch với nợ thực tế (làm tròn, trả thiếu/dư).
 * - Khoản chi phát sinh SAU thời điểm đó được tính là nợ mới hoàn toàn, không
 *   bị một thanh toán cũ âm thầm bù trừ tiếp.
 * - Cùng ngày: ưu tiên so theo đúng mốc giờ:phút:giây lúc từng khoản được
 *   DUYỆT (approvedAt) để ra đúng thứ tự thực tế đã xảy ra. Chỉ khi 1 trong 2
 *   khoản thiếu mốc này (dữ liệu cũ trước khi có cột approved_at) mới lùi về
 *   quy tắc cũ: khoản chi luôn tính trước thanh toán trong ngày đó (coi thanh
 *   toán như "chốt sổ cuối ngày").
 */
// Chỉ được gọi khi a.date === b.date (trùng khớp tuyệt đối chuỗi dùng để sắp
// xếp) nên không cần quan tâm approvedAt thuộc ngày nào — dùng 2 mốc "ảo" ở 2
// đầu cực (luôn nhỏ/lớn hơn MỌI ISO string thật) cho khoản thiếu approvedAt,
// để việc so sánh luôn bắc cầu (transitive) dù trộn lẫn dữ liệu cũ (không có
// approvedAt) với dữ liệu mới (có approvedAt) trong cùng 1 ngày — nếu chỉ so
// "khi cả 2 cùng có" rồi lùi kind riêng lẻ cho từng cặp thiếu, kết quả sort
// tổng thể có thể không nhất quán (a<b, b<c nhưng c<a).
const NO_APPROVED_AT_EXPENSE = '0000-00-00T00:00:00.000Z'; // trước MỌI mốc thật — giữ đúng quy tắc cũ: khoản chi luôn trước
const NO_APPROVED_AT_SETTLEMENT = '9999-99-99T99:99:99.999Z'; // sau MỌI mốc thật — giữ đúng quy tắc cũ: thanh toán "chốt sổ cuối ngày"

function eventTieBreak(a, b) {
  const ta = a.approvedAt || (a.kind === 0 ? NO_APPROVED_AT_EXPENSE : NO_APPROVED_AT_SETTLEMENT);
  const tb = b.approvedAt || (b.kind === 0 ? NO_APPROVED_AT_EXPENSE : NO_APPROVED_AT_SETTLEMENT);
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.kind - b.kind;
}

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
      // effectiveAt (nếu có) ghi đè `date` chỉ để SẮP XẾP — dùng khi khoản chi
      // này cần tính trước/sau 1 khoản khác cùng ngày cho đúng thứ tự thực tế.
      // Đã có override thủ công thì bỏ qua approvedAt (mốc thật có thể thuộc
      // hẳn 1 ngày khác với ngày effectiveAt cố tình gán) — admin đã tự quyết
      // định thứ tự rồi, không để approvedAt ghi đè ngược lại quyết định đó.
      events.push({
        date: e.effectiveAt || e.date,
        kind: 0,
        approvedAt: e.effectiveAt ? null : e.approvedAt,
        i: iOwer,
        j: jPayer,
        amount,
      });
    }
  }
  for (const s of settlements) {
    const i = idx.get(s.fromId);
    const j = idx.get(s.toId);
    if (i === undefined || j === undefined) continue;
    // effectiveAt (nếu có) ghi đè `date` chỉ để SẮP XẾP — dùng khi thanh toán
    // được duyệt trong app trễ hơn ngày nó thực sự xảy ra, để không bị coi là
    // tất toán luôn cả những khoản chi mới phát sinh sau đó nhưng trước ngày duyệt.
    events.push({
      date: s.effectiveAt || s.date,
      kind: 1,
      approvedAt: s.effectiveAt ? null : s.approvedAt,
      i,
      j,
      amount: s.amount,
    });
  }
  // sort() ổn định (stable) nên cùng ngày + cùng loại + cùng thiếu approvedAt
  // vẫn giữ nguyên thứ tự gốc.
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : eventTieBreak(a, b)));

  const debt = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const ev of events) {
    if (ev.kind === 0) increaseDebt(debt, ev.i, ev.j, ev.amount);
    else applySettlement(debt, ev.i, ev.j);
  }

  return { ids, debt };
}

/**
 * Tính tổng kết theo từng người: đã trả (khoản chi + thanh toán đã gửi),
 * phải chịu (phần chia khoản chi + thanh toán đã nhận), và số dư (suy ra
 * trực tiếp từ ma trận "ai nợ ai" để luôn khớp với mục đó — kể cả sau khi có
 * thanh toán, "Đã trả" trừ "Phải chịu" luôn ra đúng số dư).
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
  // Thanh toán: người gửi coi như "đã trả" thêm đúng số đó (tiền ra khỏi túi
  // họ), người nhận coi như "phải chịu" thêm đúng số đó (đã được bù/tính vào
  // họ rồi) — để "Đã trả" - "Phải chịu" luôn khớp đúng số dư ở mọi lúc.
  for (const s of settlements) {
    if (paid.has(s.fromId)) {
      paid.set(s.fromId, paid.get(s.fromId) + s.amount);
    }
    if (owed.has(s.toId)) {
      owed.set(s.toId, owed.get(s.toId) + s.amount);
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

// Dựng danh sách event (khoản chi + thanh toán) trực tiếp GIỮA ĐÚNG 2 NGƯỜI
// A, B, đã sắp theo đúng thứ tự thời gian — dùng chung cho explainSettlement
// và explainDebt (chỉ khác nhau ở cách "đọc" kết quả replay các event này).
function buildPairEvents(expenses, settlements, A, B) {
  const events = [];
  for (const e of expenses) {
    for (const { memberId, amount } of resolveShares(e)) {
      if (memberId === e.payerId) continue;
      const eventDate = e.effectiveAt || e.date;
      // displayDate luôn là `date` gốc (không kèm giờ) — effectiveAt (nếu có)
      // chỉ dùng để SẮP XẾP, không phải để hiển thị (tránh in ra chuỗi kèm
      // giờ kiểu "2026-09-15T23:59:59" ở danh sách khoản chi cho người dùng).
      // Đã có effectiveAt override thì bỏ qua approvedAt (xem lý do ở
      // computeDebtMatrix) — giữ đúng quyết định thứ tự thủ công của admin.
      const approvedAt = e.effectiveAt ? null : e.approvedAt;
      if (memberId === A && e.payerId === B) {
        events.push({ date: eventDate, displayDate: e.date, kind: 0, approvedAt, ower: A, amount, expenseId: e.id, description: e.description });
      } else if (memberId === B && e.payerId === A) {
        events.push({ date: eventDate, displayDate: e.date, kind: 0, approvedAt, ower: B, amount, expenseId: e.id, description: e.description });
      }
    }
  }
  for (const s of settlements) {
    const between = (s.fromId === A && s.toId === B) || (s.fromId === B && s.toId === A);
    if (!between) continue;
    events.push({ date: s.effectiveAt || s.date, kind: 1, approvedAt: s.effectiveAt ? null : s.approvedAt, id: s.id, displayDate: s.date });
  }
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : eventTieBreak(a, b)));
  return events;
}

/**
 * Giải thích 1 thanh toán cụ thể: liệt kê các khoản chi GIỮA ĐÚNG 2 NGƯỜI đó
 * đã được nó tất toán — tính từ lần thanh toán liền trước giữa 2 người này
 * (hoặc từ đầu, nếu đây là lần đầu) cho tới chính thanh toán này. Chỉ cần xét
 * event trực tiếp giữa 2 người (không qua trung gian), vì mỗi ô trong ma trận
 * nợ chỉ bị ảnh hưởng bởi event của đúng cặp đó (xem computeDebtMatrix).
 */
function explainSettlement(members, expenses, settlements, settlementId) {
  const target = settlements.find((s) => s.id === settlementId);
  if (!target) return null;
  const A = target.fromId;
  const B = target.toId;

  const events = buildPairEvents(expenses, settlements, A, B);

  let debtAB = 0; // A nợ B
  let debtBA = 0; // B nợ A
  let items = [];
  let sinceDate = null; // ngày của lần tất toán liền trước (null = từ đầu, chưa từng tất toán)

  for (const ev of events) {
    if (ev.kind === 0) {
      if (ev.ower === A) {
        const cancel = Math.min(debtBA, ev.amount);
        debtBA -= cancel;
        debtAB += ev.amount - cancel;
      } else {
        const cancel = Math.min(debtAB, ev.amount);
        debtAB -= cancel;
        debtBA += ev.amount - cancel;
      }
      items.push({
        expenseId: ev.expenseId,
        description: ev.description,
        date: ev.displayDate,
        ower: ev.ower,
        amount: round(ev.amount),
      });
    } else if (ev.id === settlementId) {
      return {
        fromId: A,
        toId: B,
        items,
        sinceDate,
        debtBeforeAToB: round(debtAB),
        debtBeforeBToA: round(debtBA),
        paidAmount: round(target.amount),
        settlementDate: target.date,
      };
    } else {
      debtAB = 0;
      debtBA = 0;
      items = [];
      sinceDate = ev.displayDate;
    }
  }
  return null;
}

/**
 * Giải thích khoản nợ ĐANG HIỆN TẠI giữa đúng 2 người (fromId nợ toId, đúng
 * 1 chiều trong ma trận nợ) — liệt kê các khoản chi đã góp phần tạo nên số nợ
 * này, tính từ lần tất toán gần nhất giữa 2 người (hoặc từ đầu). Khác
 * explainSettlement ở chỗ: đọc hết TOÀN BỘ event tới cuối (không dừng ở 1
 * thanh toán cụ thể) — kết quả chính là số nợ hiện đang hiển thị.
 */
function explainDebt(members, expenses, settlements, fromId, toId) {
  const A = fromId;
  const B = toId;
  const events = buildPairEvents(expenses, settlements, A, B);

  let debtAB = 0; // A nợ B
  let debtBA = 0; // B nợ A
  let items = [];
  let sinceDate = null;

  for (const ev of events) {
    if (ev.kind === 0) {
      if (ev.ower === A) {
        const cancel = Math.min(debtBA, ev.amount);
        debtBA -= cancel;
        debtAB += ev.amount - cancel;
      } else {
        const cancel = Math.min(debtAB, ev.amount);
        debtAB -= cancel;
        debtBA += ev.amount - cancel;
      }
      items.push({
        expenseId: ev.expenseId,
        description: ev.description,
        date: ev.displayDate,
        ower: ev.ower,
        amount: round(ev.amount),
      });
    } else {
      debtAB = 0;
      debtBA = 0;
      items = [];
      sinceDate = ev.displayDate;
    }
  }

  return { fromId: A, toId: B, items, sinceDate, amount: round(debtAB) };
}

/**
 * Kiểm tra TỪNG thanh toán: số tiền ghi nhận (paidAmount) có khớp đúng số nợ
 * thực tế NGAY TRƯỚC lúc nó tất toán (expectedAmount) không — dựa trên
 * explainSettlement(). Lệch có thể do: trả thiếu/dư ngoài đời, tính nhầm khi
 * quên trừ 1 khoản chi khác cùng lúc, hoặc chỉ là số dư nhỏ do làm tròn.
 * Dung sai 1đ (làm tròn nhiều lần khi chia hết cho số lẻ người).
 */
function checkSettlements(members, expenses, settlements) {
  const TOLERANCE = 1;
  return settlements.map((s) => {
    const ex = explainSettlement(members, expenses, settlements, s.id);
    if (!ex) return { settlementId: s.id, expectedAmount: null, matches: null };
    const expectedAmount = ex.debtBeforeAToB > 0 ? ex.debtBeforeAToB : ex.debtBeforeBToA;
    return {
      settlementId: s.id,
      expectedAmount,
      matches: Math.abs(expectedAmount - ex.paidAmount) <= TOLERANCE,
    };
  });
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
})(typeof window !== 'undefined' ? window : this, {
  computeSummary,
  computeDebts,
  explainSettlement,
  explainDebt,
  checkSettlements,
  round,
});
