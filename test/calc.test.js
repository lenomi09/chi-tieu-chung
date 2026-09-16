'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { computeSummary, computeDebts, explainSettlement, explainDebt, checkSettlements } = require('../server/lib/calc');

const members = [
  { id: 'lan', name: 'Lan' },
  { id: 'minh', name: 'Minh' },
  { id: 'huy', name: 'Huy' },
];

const expenses = [
  {
    id: 'e1',
    date: '2026-09-01',
    description: 'Đồ dùng chung 1',
    amount: 150000,
    payerId: 'lan',
    shareMemberIds: ['lan', 'minh', 'huy'],
  },
  {
    id: 'e2',
    date: '2026-09-02',
    description: 'Đồ dùng chung 2',
    amount: 100000,
    payerId: 'minh',
    shareMemberIds: ['minh', 'huy'],
  },
];

function findDebt(debts, fromId, toId) {
  return debts.find((d) => d.fromId === fromId && d.toId === toId);
}

test('bộ số liệu mẫu: số dư trước khi thanh toán', () => {
  const summary = computeSummary(members, expenses, []);
  const byId = Object.fromEntries(summary.map((s) => [s.id, s]));

  assert.equal(byId.lan.balance, 100000);
  assert.equal(byId.minh.balance, 0);
  assert.equal(byId.huy.balance, -100000);
});

test('bộ số liệu mẫu: ai nợ ai trước khi thanh toán', () => {
  const debts = computeDebts(members, expenses, []);

  assert.equal(debts.length, 3);
  assert.equal(findDebt(debts, 'minh', 'lan').amount, 50000);
  assert.equal(findDebt(debts, 'huy', 'lan').amount, 50000);
  assert.equal(findDebt(debts, 'huy', 'minh').amount, 50000);
});

test('sau khi Huy trả 50.000đ cho Lan: số dư cập nhật đúng', () => {
  const settlements = [
    { id: 's1', date: '2026-09-05', fromId: 'huy', toId: 'lan', amount: 50000 },
  ];
  const summary = computeSummary(members, expenses, settlements);
  const byId = Object.fromEntries(summary.map((s) => [s.id, s]));

  assert.equal(byId.lan.balance, 50000);
  assert.equal(byId.huy.balance, -50000);
  assert.equal(byId.minh.balance, 0);
});

test('sau khi Huy trả 50.000đ cho Lan: "Đã trả"/"Phải chịu" cũng phải cộng thêm thanh toán, khớp đúng số dư', () => {
  const settlements = [
    { id: 's1', date: '2026-09-05', fromId: 'huy', toId: 'lan', amount: 50000 },
  ];
  const summary = computeSummary(members, expenses, settlements);
  const byId = Object.fromEntries(summary.map((s) => [s.id, s]));

  // Huy (nguoi gui) "da tra" cong them 50.000; Lan (nguoi nhan) "phai chiu" cong them 50.000.
  assert.equal(byId.huy.totalPaid, 0 + 50000); // von khong tra khoan chi nao
  assert.equal(byId.lan.totalOwed, 50000 + 50000); // phan chia goc 50.000 + 50.000 da nhan
  // "Da tra" - "Phai chiu" phai luon khop dung so du, ke ca sau khi co thanh toan.
  for (const s of summary) {
    assert.equal(s.totalPaid - s.totalOwed, s.balance, `${s.name}: Đã trả - Phải chịu phải khớp balance`);
  }
});

test('sau khi Huy trả 50.000đ cho Lan: "Huy nợ Lan" biến mất, "Huy nợ Minh" còn nguyên', () => {
  const settlements = [
    { id: 's1', date: '2026-09-05', fromId: 'huy', toId: 'lan', amount: 50000 },
  ];
  const debts = computeDebts(members, expenses, settlements);

  assert.equal(findDebt(debts, 'huy', 'lan'), undefined);
  const huyNoMinh = findDebt(debts, 'huy', 'minh');
  assert.ok(huyNoMinh, 'Huy vẫn nợ Minh');
  assert.equal(huyNoMinh.amount, 50000);
  // Minh nợ Lan 50k và được Huy nợ 50k => số dư Minh = 0, nhưng khoản nợ Minh->Lan vẫn tồn tại riêng
  const minhNoLan = findDebt(debts, 'minh', 'lan');
  assert.ok(minhNoLan);
  assert.equal(minhNoLan.amount, 50000);
  assert.equal(debts.length, 2);
});

test('chia riêng cho vài người không ảnh hưởng người không được tick', () => {
  const expensesRiêng = [
    {
      id: 'e1',
      date: '2026-09-01',
      description: 'Chỉ Lan và Minh dùng',
      amount: 80000,
      payerId: 'lan',
      shareMemberIds: ['lan', 'minh'],
    },
  ];
  const summary = computeSummary(members, expensesRiêng, []);
  const byId = Object.fromEntries(summary.map((s) => [s.id, s]));
  assert.equal(byId.huy.totalOwed, 0);
  assert.equal(byId.huy.balance, 0);
});

test('thanh toán vượt quá số nợ thực tế: nợ về đúng 0, KHÔNG tạo nợ ngược', () => {
  const settlements = [
    { id: 's1', date: '2026-09-05', fromId: 'huy', toId: 'lan', amount: 200000 },
  ];
  const debts = computeDebts(members, expenses, settlements);
  const summary = computeSummary(members, expenses, settlements);
  const byId = Object.fromEntries(summary.map((s) => [s.id, s]));

  // Huy trả dư 150.000đ cho Lan (Huy chỉ nợ Lan 50.000): duyệt thanh toán = tất
  // toán, nợ 2 người về đúng 0 — Lan KHÔNG nợ ngược lại Huy phần dư đó.
  assert.equal(findDebt(debts, 'huy', 'lan'), undefined);
  assert.equal(findDebt(debts, 'lan', 'huy'), undefined);
  // Huy vẫn còn nợ Minh 50.000 (không liên quan) -> số dư Huy chỉ cải thiện đúng
  // bằng phần nợ Lan đã xoá (50.000), không phải toàn bộ 200.000 đã trả.
  assert.equal(byId.huy.balance, -50000);
  assert.equal(byId.lan.balance, 50000);
});

test('thanh toán một phần vẫn tất toán về 0 (duyệt = xác nhận đã trả xong, không trừ dần theo số tiền)', () => {
  const settlements = [
    // Huy nợ Lan 50.000 nhưng chỉ ghi nhận đã trả 10.000 (trả thiếu/làm tròn ngoài đời) — vẫn coi là đã xong.
    { id: 's1', date: '2026-09-05', fromId: 'huy', toId: 'lan', amount: 10000 },
  ];
  const debts = computeDebts(members, expenses, settlements);
  const summary = computeSummary(members, expenses, settlements);
  const byId = Object.fromEntries(summary.map((s) => [s.id, s]));

  assert.equal(findDebt(debts, 'huy', 'lan'), undefined);
  assert.equal(findDebt(debts, 'lan', 'huy'), undefined);
  assert.equal(byId.huy.balance, -50000);
  assert.equal(byId.lan.balance, 50000);
});

test('chia riêng (shareAmounts): mỗi người nợ đúng số tiền riêng, không chia đều', () => {
  const expensesRiêng = [
    {
      id: 'e1',
      date: '2026-09-01',
      description: 'Winmart, mỗi người mua đồ khác nhau',
      amount: 150000,
      payerId: 'lan',
      shareMemberIds: ['lan', 'minh', 'huy'],
      shareAmounts: { lan: 50000, minh: 30000, huy: 70000 },
    },
  ];
  const summary = computeSummary(members, expensesRiêng, []);
  const byId = Object.fromEntries(summary.map((s) => [s.id, s]));
  const debts = computeDebts(members, expensesRiêng, []);

  assert.equal(byId.minh.totalOwed, 30000);
  assert.equal(byId.huy.totalOwed, 70000);
  assert.equal(findDebt(debts, 'minh', 'lan').amount, 30000);
  assert.equal(findDebt(debts, 'huy', 'lan').amount, 70000);
  // Lan tự trả phần của mình (50.000) nên không nợ ai vì khoản này.
  assert.equal(byId.lan.balance, 100000);
});

test('xoá khoản chi sau khi đã ghi nhận thanh toán: nợ liên quan biến mất, không để lại nợ ảo', () => {
  // Chỉ còn expense2 (Minh trả 100k, chia Minh/Huy) — coi như đã xoá expense1 (Lan trả 150k)
  const remainingExpenses = [expenses[1]];
  const settlements = [
    { id: 's1', date: '2026-09-05', fromId: 'huy', toId: 'lan', amount: 50000 },
  ];
  const debts = computeDebts(members, remainingExpenses, settlements);
  const summary = computeSummary(members, remainingExpenses, settlements);
  const byId = Object.fromEntries(summary.map((s) => [s.id, s]));

  // Không còn khoản chi nào liên quan tới Lan -> thanh toán Huy->Lan không còn tác dụng gì,
  // tuyệt đối không được biến thành "Lan nợ Huy".
  assert.equal(findDebt(debts, 'lan', 'huy'), undefined);
  assert.equal(findDebt(debts, 'huy', 'lan'), undefined);
  assert.equal(byId.lan.balance, 0);

  // Khoản nợ Huy->Minh (từ expense2) không liên quan gì tới Lan nên vẫn giữ nguyên.
  const huyNoMinh = findDebt(debts, 'huy', 'minh');
  assert.ok(huyNoMinh);
  assert.equal(huyNoMinh.amount, 50000);
  assert.equal(byId.huy.balance, -50000);
  assert.equal(byId.minh.balance, 50000);
});

test('explainSettlement: liệt kê đúng các khoản chi giữa 2 người kể từ lần tất toán trước', () => {
  const settlements = [
    { id: 's1', date: '2026-09-05', fromId: 'huy', toId: 'lan', amount: 50000 },
  ];
  // Lần đầu tất toán (từ đầu tới s1): chỉ có expense1 (Huy nợ Lan 50.000 từ e1).
  const explain1 = explainSettlement(members, expenses, settlements, 's1');
  assert.equal(explain1.items.length, 1);
  assert.equal(explain1.items[0].expenseId, 'e1');
  assert.equal(explain1.items[0].ower, 'huy');
  assert.equal(explain1.items[0].amount, 50000);
  assert.equal(explain1.debtBeforeAToB, 50000);
  assert.equal(explain1.debtBeforeBToA, 0);
  assert.equal(explain1.paidAmount, 50000);
  assert.equal(explain1.sinceDate, null); // chưa từng tất toán trước đó -> từ đầu

  // Thêm 1 khoản chi mới SAU s1 rồi tất toán lần 2 (s2) -> chỉ liệt kê khoản mới đó.
  const laterExpense = {
    id: 'e3',
    date: '2026-09-06',
    description: 'Đồ dùng chung 3',
    amount: 20000,
    payerId: 'lan',
    shareMemberIds: ['lan', 'huy'],
  };
  const settlements2 = [
    ...settlements,
    { id: 's2', date: '2026-09-07', fromId: 'huy', toId: 'lan', amount: 10000 },
  ];
  const explain2 = explainSettlement(members, [...expenses, laterExpense], settlements2, 's2');
  assert.equal(explain2.items.length, 1);
  assert.equal(explain2.items[0].expenseId, 'e3');
  assert.equal(explain2.debtBeforeAToB, 10000);
  assert.equal(explain2.sinceDate, '2026-09-05'); // tính từ ngày tất toán lần trước (s1)

  // Thanh toán không tồn tại -> null.
  assert.equal(explainSettlement(members, expenses, settlements, 'khong-ton-tai'), null);
});

test('checkSettlements: phát hiện đúng khoản trả thiếu/trả dư so với nợ thực tế', () => {
  const settlementsMixed = [
    // Đúng khớp: Huy nợ Lan 50.000, trả đủ 50.000.
    { id: 's1', date: '2026-09-05', fromId: 'huy', toId: 'lan', amount: 50000 },
  ];
  const [check1] = checkSettlements(members, expenses, settlementsMixed);
  assert.equal(check1.expectedAmount, 50000);
  assert.equal(check1.matches, true);

  const settlementsThieu = [
    // Trả thiếu: nợ 50.000 nhưng chỉ ghi nhận 30.000.
    { id: 's2', date: '2026-09-05', fromId: 'huy', toId: 'lan', amount: 30000 },
  ];
  const [check2] = checkSettlements(members, expenses, settlementsThieu);
  assert.equal(check2.expectedAmount, 50000);
  assert.equal(check2.matches, false);

  const settlementsDu = [
    // Trả dư: nợ 50.000 nhưng ghi nhận những 80.000.
    { id: 's3', date: '2026-09-05', fromId: 'huy', toId: 'lan', amount: 80000 },
  ];
  const [check3] = checkSettlements(members, expenses, settlementsDu);
  assert.equal(check3.expectedAmount, 50000);
  assert.equal(check3.matches, false);
});

test('explainDebt: liệt kê đúng khoản chi tạo nên nợ hiện tại giữa 2 người', () => {
  // Bộ số liệu mẫu, chưa thanh toán gì -> Huy nợ Lan 50.000 (tính từ đầu).
  const explain1 = explainDebt(members, expenses, [], 'huy', 'lan');
  assert.equal(explain1.amount, 50000);
  assert.equal(explain1.sinceDate, null);
  assert.equal(explain1.items.length, 1);
  assert.equal(explain1.items[0].expenseId, 'e1');

  // Sau khi Huy trả đủ 50.000 -> nợ hiện tại về 0, không còn khoản nào.
  const settlements = [{ id: 's1', date: '2026-09-05', fromId: 'huy', toId: 'lan', amount: 50000 }];
  const explain2 = explainDebt(members, expenses, settlements, 'huy', 'lan');
  assert.equal(explain2.amount, 0);
  assert.equal(explain2.items.length, 0);
  assert.equal(explain2.sinceDate, '2026-09-05');

  // Thêm khoản chi mới SAU khi tất toán -> nợ hiện tại chỉ tính từ đó.
  const laterExpense = {
    id: 'e3',
    date: '2026-09-06',
    description: 'Đồ dùng chung 3',
    amount: 20000,
    payerId: 'lan',
    shareMemberIds: ['lan', 'huy'],
  };
  const explain3 = explainDebt(members, [...expenses, laterExpense], settlements, 'huy', 'lan');
  assert.equal(explain3.amount, 10000);
  assert.equal(explain3.items.length, 1);
  assert.equal(explain3.items[0].expenseId, 'e3');
});

test('explainDebt/explainSettlement: items[].date luôn là ngày sạch (không kèm giờ), dù khoản chi có effectiveAt riêng', () => {
  // effectiveAt kèm giờ (như thực tế đã gặp) chỉ được dùng để SẮP XẾP, không
  // được lộ ra ngoài items[].date — nếu không, client hiện thẳng chuỗi thô
  // "2026-09-15T23:59:59" thay vì ngày bình thường.
  const expensesWithEffectiveAt = [
    { ...expenses[0], effectiveAt: '2026-09-15T23:59:59' },
    expenses[1],
  ];
  const explain = explainDebt(members, expensesWithEffectiveAt, [], 'huy', 'lan');
  const item = explain.items.find((i) => i.expenseId === 'e1');
  assert.ok(item);
  assert.equal(item.date, '2026-09-01'); // dung date goc, khong phai effectiveAt
});

test('cùng ngày với thanh toán: khoản chi duyệt SAU (approvedAt muộn hơn) phải tính thành nợ mới, không bị tất toán cuốn mất', () => {
  // Trước khi có approved_at, cùng 1 ngày luôn coi khoản chi có trước thanh
  // toán — nên 1 khoản chi thêm SAU KHI đã duyệt thanh toán (nhưng cùng ngày)
  // sẽ bị "nuốt" mất, không hiện thành nợ mới (đúng bug người dùng gặp thực
  // tế). Có approvedAt rồi thì phải tính đúng theo thứ tự thực đã xảy ra.
  const settlement = {
    id: 's1',
    date: '2026-09-16',
    fromId: 'huy',
    toId: 'lan',
    amount: 20000,
    approvedAt: '2026-09-16T08:00:00.000Z',
  };
  const laterExpense = {
    id: 'e-later',
    date: '2026-09-16',
    description: 'Thêm sau khi đã duyệt',
    amount: 30000,
    payerId: 'lan',
    shareMemberIds: ['huy'],
    approvedAt: '2026-09-16T09:00:00.000Z',
  };
  const debts = computeDebts(members, [laterExpense], [settlement]);
  assert.equal(findDebt(debts, 'huy', 'lan').amount, 30000);
});

test('cùng ngày với thanh toán: khoản chi duyệt TRƯỚC (approvedAt sớm hơn) vẫn bị tất toán cuốn theo như cũ', () => {
  const settlement = {
    id: 's1',
    date: '2026-09-16',
    fromId: 'huy',
    toId: 'lan',
    amount: 20000,
    approvedAt: '2026-09-16T09:00:00.000Z',
  };
  const earlierExpense = {
    id: 'e-earlier',
    date: '2026-09-16',
    description: 'Thêm trước khi duyệt',
    amount: 30000,
    payerId: 'lan',
    shareMemberIds: ['huy'],
    approvedAt: '2026-09-16T08:00:00.000Z',
  };
  const debts = computeDebts(members, [earlierExpense], [settlement]);
  assert.equal(findDebt(debts, 'huy', 'lan'), undefined);
});

test('dữ liệu cũ thiếu approvedAt: lùi về đúng quy tắc cũ (khoản chi luôn tính trước thanh toán cùng ngày)', () => {
  const settlement = { id: 's1', date: '2026-09-16', fromId: 'huy', toId: 'lan', amount: 20000 };
  const sameDayExpense = {
    id: 'e-legacy',
    date: '2026-09-16',
    description: 'Không có approvedAt',
    amount: 30000,
    payerId: 'lan',
    shareMemberIds: ['huy'],
  };
  const debts = computeDebts(members, [sameDayExpense], [settlement]);
  assert.equal(findDebt(debts, 'huy', 'lan'), undefined);
});

test('trộn lẫn dữ liệu cũ (thiếu approvedAt) với dữ liệu mới (có approvedAt) cùng ngày: thứ tự vẫn nhất quán, không tự mâu thuẫn', () => {
  // Mô phỏng đúng tình huống thực tế: 1 thanh toán CŨ (duyệt trước khi có cột
  // approved_at) cùng ngày với 1 CẶP thanh toán+khoản chi MỚI (có approvedAt
  // đầy đủ). Thanh toán cũ luôn bị coi là "chốt sổ cuối ngày" (mốc ảo 9999)
  // nên vẫn tất toán về 0 — không phải bug, chỉ để đảm bảo việc so sánh giữa
  // các khoản có/không có approvedAt không bị lộn xộn (mất tính bắc cầu).
  const legacyExpense = {
    id: 'e-legacy',
    date: '2026-09-16',
    description: 'Khoản chi cũ',
    amount: 5000,
    payerId: 'lan',
    shareMemberIds: ['huy'],
  };
  const legacySettlement = { id: 's-legacy', date: '2026-09-16', fromId: 'huy', toId: 'lan', amount: 5000 };
  const freshSettlement = {
    id: 's-fresh',
    date: '2026-09-16',
    fromId: 'huy',
    toId: 'lan',
    amount: 20000,
    approvedAt: '2026-09-16T08:00:00.000Z',
  };
  const freshExpense = {
    id: 'e-fresh',
    date: '2026-09-16',
    description: 'Khoản chi mới, thêm sau khi duyệt',
    amount: 30000,
    payerId: 'lan',
    shareMemberIds: ['huy'],
    approvedAt: '2026-09-16T09:00:00.000Z',
  };
  const debts = computeDebts(members, [legacyExpense, freshExpense], [legacySettlement, freshSettlement]);
  // Thanh toán cũ (không có approvedAt) luôn đứng cuối ngày -> tất toán sạch,
  // kể cả khoản chi mới thêm sau đó trong cùng ngày.
  assert.equal(findDebt(debts, 'huy', 'lan'), undefined);
});
