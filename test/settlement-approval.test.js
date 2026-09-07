'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Mỗi lần chạy test dùng 1 file SQLite tạm riêng biệt, tách khỏi data.db thật.
const tmpDbFile = path.join(os.tmpdir(), `chi-tieu-chung-test-${process.pid}-${Date.now()}.db`);
process.env.TURSO_DATABASE_URL = `file:${tmpDbFile}`;
process.env.ADMIN_PASSWORD = 'test-password';
process.env.SESSION_SECRET = 'test-session-secret';

const app = require('../server');
const db = require('../lib/db');

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.closeDb();
  for (const suffix of ['', '-shm', '-wal']) {
    try {
      fs.rmSync(`${tmpDbFile}${suffix}`, { force: true });
    } catch {
      // Best-effort cleanup — không để lỗi xoá file tạm làm fail cả bộ test.
    }
  }
});

function getCookie(res) {
  const raw = res.headers.get('set-cookie') || '';
  return raw.split(';')[0];
}

async function api(pathname, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data, cookie: getCookie(res) };
}

test('luồng đăng nhập admin và phân quyền', async () => {
  const noAuth = await api('/api/expenses', {
    method: 'POST',
    body: { date: '2026-09-01', amount: 1000, payerId: 'x', shareMemberIds: ['x'] },
  });
  assert.equal(noAuth.status, 401);

  const wrongPass = await api('/api/login', { method: 'POST', body: { password: 'sai' } });
  assert.equal(wrongPass.status, 401);

  const login = await api('/api/login', { method: 'POST', body: { password: 'test-password' } });
  assert.equal(login.status, 200);
  assert.ok(login.cookie, 'phải nhận được cookie session');
});

test('bộ số liệu mẫu qua API thật + yêu cầu thanh toán cần admin duyệt mới tính vào số dư', async () => {
  const { cookie } = await api('/api/login', { method: 'POST', body: { password: 'test-password' } });

  const addMember = async (name) => {
    const r = await api('/api/members', { method: 'POST', cookie, body: { name } });
    return r.data.members.find((m) => m.name === name).id;
  };
  const lan = await addMember('Lan');
  const minh = await addMember('Minh');
  const huy = await addMember('Huy');

  await api('/api/expenses', {
    method: 'POST',
    cookie,
    body: { date: '2026-09-01', amount: 150000, payerId: lan, shareMemberIds: [lan, minh, huy] },
  });
  await api('/api/expenses', {
    method: 'POST',
    cookie,
    body: { date: '2026-09-02', amount: 100000, payerId: minh, shareMemberIds: [minh, huy] },
  });

  const before = (await api('/api/state')).data;
  const balanceOf = (state, name) => state.summary.find((s) => s.name === name).balance;
  assert.equal(balanceOf(before, 'Lan'), 100000);
  assert.equal(balanceOf(before, 'Minh'), 0);
  assert.equal(balanceOf(before, 'Huy'), -100000);

  // Huy (không đăng nhập) gửi yêu cầu trả Lan 50.000đ -> chỉ pending
  const reqRes = await api('/api/settlement-requests', {
    method: 'POST',
    body: { date: '2026-09-05', fromId: huy, toId: lan, amount: 50000 },
  });
  const pendingId = reqRes.data.settlements.find((s) => s.status === 'pending').id;

  const stillPending = (await api('/api/state')).data;
  assert.equal(balanceOf(stillPending, 'Lan'), 100000, 'chưa duyệt thì số dư không đổi');
  assert.equal(balanceOf(stillPending, 'Huy'), -100000);

  // người ngoài không được tự duyệt
  const forbiddenApprove = await api(`/api/settlement-requests/${pendingId}/approve`, { method: 'POST' });
  assert.equal(forbiddenApprove.status, 401);

  // admin duyệt
  await api(`/api/settlement-requests/${pendingId}/approve`, { method: 'POST', cookie });
  const afterApprove = (await api('/api/state')).data;
  assert.equal(balanceOf(afterApprove, 'Lan'), 50000);
  assert.equal(balanceOf(afterApprove, 'Huy'), -50000);
  assert.equal(balanceOf(afterApprove, 'Minh'), 0);

  const debtsAfter = afterApprove.debts;
  const nameOf = (id) => afterApprove.members.find((m) => m.id === id).name;
  assert.equal(debtsAfter.find((d) => d.fromId === huy)?.toId, minh);
  assert.equal(debtsAfter.some((d) => d.fromId === huy && d.toId === lan), false, '"Huy nợ Lan" phải biến mất');
  assert.equal(
    debtsAfter.find((d) => nameOf(d.fromId) === 'Huy' && nameOf(d.toId) === 'Minh').amount,
    50000
  );

  // Minh gửi yêu cầu trả Lan 50.000đ nhưng admin từ chối -> không đổi số dư, vẫn lưu lịch sử
  const req2 = await api('/api/settlement-requests', {
    method: 'POST',
    body: { date: '2026-09-06', fromId: minh, toId: lan, amount: 50000 },
  });
  const pendingId2 = req2.data.settlements.find((s) => s.status === 'pending').id;

  await api(`/api/settlement-requests/${pendingId2}/reject`, { method: 'POST', cookie });
  const afterReject = (await api('/api/state')).data;
  assert.equal(balanceOf(afterReject, 'Lan'), 50000, 'từ chối thì số dư không đổi');
  assert.equal(balanceOf(afterReject, 'Minh'), 0);

  const rejectedEntry = afterReject.settlements.find((s) => s.id === pendingId2);
  assert.equal(rejectedEntry.status, 'rejected');
});
