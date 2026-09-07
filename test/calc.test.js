'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { computeSummary, computeDebts } = require('../lib/calc');

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

test('thanh toán vượt quá số nợ thực tế: phần dư bị bỏ qua, KHÔNG tạo nợ ngược', () => {
  const settlements = [
    { id: 's1', date: '2026-09-05', fromId: 'huy', toId: 'lan', amount: 200000 },
  ];
  const debts = computeDebts(members, expenses, settlements);
  const summary = computeSummary(members, expenses, settlements);
  const byId = Object.fromEntries(summary.map((s) => [s.id, s]));

  // Huy trả dư 150.000đ cho Lan (Huy chỉ nợ Lan 50.000): 50.000 nợ thật được xoá,
  // 150.000 dư ra bị bỏ qua — Lan KHÔNG nợ ngược lại Huy phần dư đó.
  assert.equal(findDebt(debts, 'huy', 'lan'), undefined);
  assert.equal(findDebt(debts, 'lan', 'huy'), undefined);
  // Huy vẫn còn nợ Minh 50.000 (không liên quan) -> số dư Huy chỉ cải thiện đúng
  // bằng phần nợ Lan đã xoá (50.000), không phải toàn bộ 200.000 đã trả.
  assert.equal(byId.huy.balance, -50000);
  assert.equal(byId.lan.balance, 50000);
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
