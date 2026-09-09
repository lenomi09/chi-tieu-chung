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
const db = require('../server/lib/db');

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

test('bộ số liệu mẫu qua API thật + yêu cầu thêm khoản chi cần admin duyệt mới tính vào số dư', async () => {
  const { cookie } = await api('/api/login', { method: 'POST', body: { password: 'test-password' } });

  const addMember = async (name) => {
    const r = await api('/api/members', { method: 'POST', cookie, body: { name } });
    return r.data.members.find((m) => m.name === name).id;
  };
  const lan = await addMember('Lan');
  const minh = await addMember('Minh');
  const huy = await addMember('Huy');

  // Admin thêm trực tiếp -> approved ngay
  await api('/api/expenses', {
    method: 'POST',
    cookie,
    body: { date: '2026-09-01', amount: 150000, payerId: lan, shareMemberIds: [lan, minh, huy] },
  });

  const balanceOf = (state, name) => state.summary.find((s) => s.name === name).balance;
  // Lan trả 150.000đ chia đều 3 người (mỗi người 50.000đ) -> Lan được nhận lại 100.000đ
  const afterFirst = (await api('/api/state')).data;
  assert.equal(balanceOf(afterFirst, 'Lan'), 100000);
  assert.equal(balanceOf(afterFirst, 'Minh'), -50000);
  assert.equal(balanceOf(afterFirst, 'Huy'), -50000);

  // Minh (chưa đăng nhập) gửi yêu cầu thêm khoản chi mình đã trả -> chỉ pending, chưa tính vào số dư
  const reqRes = await api('/api/expense-requests', {
    method: 'POST',
    body: { date: '2026-09-02', amount: 100000, payerId: minh, shareMemberIds: [minh, huy] },
  });
  assert.equal(reqRes.status, 200);
  const pendingId = reqRes.data.expenses.find((e) => e.status === 'pending').id;

  const stillPending = (await api('/api/state')).data;
  assert.equal(balanceOf(stillPending, 'Lan'), 100000, 'chưa duyệt thì số dư không đổi');
  assert.equal(balanceOf(stillPending, 'Minh'), -50000);
  assert.equal(balanceOf(stillPending, 'Huy'), -50000);

  // người ngoài không được tự duyệt
  const forbiddenApprove = await api(`/api/expense-requests/${pendingId}/approve`, { method: 'POST' });
  assert.equal(forbiddenApprove.status, 401);

  // admin duyệt -> đúng bộ số liệu mẫu Lan/Minh/Huy
  await api(`/api/expense-requests/${pendingId}/approve`, { method: 'POST', cookie });
  const afterApprove = (await api('/api/state')).data;
  assert.equal(balanceOf(afterApprove, 'Lan'), 100000);
  assert.equal(balanceOf(afterApprove, 'Minh'), 0);
  assert.equal(balanceOf(afterApprove, 'Huy'), -100000);

  const debtsAfter = afterApprove.debts;
  const nameOf = (id) => afterApprove.members.find((m) => m.id === id).name;
  assert.equal(
    debtsAfter.filter((d) => nameOf(d.fromId) === 'Minh' && nameOf(d.toId) === 'Lan')[0]?.amount,
    50000
  );
  assert.equal(
    debtsAfter.filter((d) => nameOf(d.fromId) === 'Huy' && nameOf(d.toId) === 'Lan')[0]?.amount,
    50000
  );

  // admin ghi nhận Huy trả Lan 50.000đ trực tiếp (không cần duyệt vì admin làm)
  await api('/api/settlements', {
    method: 'POST',
    cookie,
    body: { date: '2026-09-05', fromId: huy, toId: lan, amount: 50000 },
  });
  const afterSettle = (await api('/api/state')).data;
  assert.equal(balanceOf(afterSettle, 'Lan'), 50000);
  assert.equal(balanceOf(afterSettle, 'Huy'), -50000);
  assert.equal(
    afterSettle.debts.some((d) => nameOf(d.fromId) === 'Huy' && nameOf(d.toId) === 'Lan'),
    false,
    '"Huy nợ Lan" phải biến mất'
  );

  // Minh gửi yêu cầu thêm khoản chi nhưng bị admin từ chối -> không đổi số dư, vẫn lưu lịch sử
  const req2 = await api('/api/expense-requests', {
    method: 'POST',
    body: { date: '2026-09-06', amount: 60000, payerId: minh, shareMemberIds: [minh, huy] },
  });
  const pendingId2 = req2.data.expenses.find((e) => e.status === 'pending').id;

  await api(`/api/expense-requests/${pendingId2}/reject`, { method: 'POST', cookie });
  const afterReject = (await api('/api/state')).data;
  assert.equal(balanceOf(afterReject, 'Minh'), 0, 'từ chối thì số dư không đổi so với trước đó');
  assert.equal(balanceOf(afterReject, 'Lan'), 50000);
  assert.equal(balanceOf(afterReject, 'Huy'), -50000);

  const rejectedEntry = afterReject.expenses.find((e) => e.id === pendingId2);
  assert.equal(rejectedEntry.status, 'rejected');
});

test('ảnh bill: lưu và đọc lại đúng, sửa khoản chi không kèm ảnh sẽ xoá ảnh cũ, ảnh sai định dạng bị từ chối', async () => {
  const { cookie } = await api('/api/login', { method: 'POST', body: { password: 'test-password' } });
  const addMember = async (name) => {
    const r = await api('/api/members', { method: 'POST', cookie, body: { name } });
    return r.data.members.find((m) => m.name === name).id;
  };
  const an = await addMember('An');

  const fakeReceipt = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAAAAAAAD//2Q==';

  const created = await api('/api/expenses', {
    method: 'POST',
    cookie,
    body: {
      date: '2026-09-10',
      amount: 20000,
      payerId: an,
      shareMemberIds: [an],
      receipt: fakeReceipt,
    },
  });
  assert.equal(created.status, 200);
  // /api/state không còn trả ảnh thật (chỉ cờ hasReceipt) — ảnh tải riêng qua
  // GET /api/expenses/:id/receipt, chỉ khi thật sự cần xem (xem db.getExpenses()).
  const expenseId = created.data.expenses.find((e) => e.hasReceipt === true).id;
  const fetchedReceipt = await api(`/api/expenses/${expenseId}/receipt`, { cookie });
  assert.equal(fetchedReceipt.data.receipt, fakeReceipt);

  // Sửa lại khoản chi nhưng KHÔNG gửi kèm receipt -> ảnh cũ bị xoá (đúng hành vi hiện tại,
  // vì client luôn gửi lại giá trị receipt hiện có/rỗng cùng payload).
  const updated = await api(`/api/expenses/${expenseId}`, {
    method: 'PUT',
    cookie,
    body: { date: '2026-09-10', amount: 25000, payerId: an, shareMemberIds: [an] },
  });
  assert.equal(updated.data.expenses.find((e) => e.id === expenseId).hasReceipt, false);
  const fetchedAfterUpdate = await api(`/api/expenses/${expenseId}/receipt`, { cookie });
  assert.equal(fetchedAfterUpdate.data.receipt, null);

  // Ảnh không đúng định dạng data URL -> bị từ chối
  const invalid = await api('/api/expenses', {
    method: 'POST',
    cookie,
    body: {
      date: '2026-09-10',
      amount: 10000,
      payerId: an,
      shareMemberIds: [an],
      receipt: 'khong-phai-data-url',
    },
  });
  assert.equal(invalid.status, 400);
});

test('chia riêng số tiền (shareAmounts): lưu đúng, tính đúng số dư, và bị từ chối nếu tổng sai', async () => {
  const { cookie } = await api('/api/login', { method: 'POST', body: { password: 'test-password' } });
  const addMember = async (name) => {
    const r = await api('/api/members', { method: 'POST', cookie, body: { name } });
    return r.data.members.find((m) => m.name === name).id;
  };
  const binh = await addMember('Bình');
  const chi = await addMember('Chi');
  const dung = await addMember('Dũng');

  // Bình trả 150.000đ hộ cả 3, nhưng mỗi người mua đồ khác giá -> chia riêng.
  const created = await api('/api/expenses', {
    method: 'POST',
    cookie,
    body: {
      date: '2026-09-08',
      amount: 150000,
      payerId: binh,
      shareMemberIds: [binh, chi, dung],
      shareAmounts: { [binh]: 50000, [chi]: 30000, [dung]: 70000 },
    },
  });
  assert.equal(created.status, 200);
  const saved = created.data.expenses.find((e) => e.payerId === binh && e.amount === 150000);
  assert.deepEqual(saved.shareAmounts, { [binh]: 50000, [chi]: 30000, [dung]: 70000 });

  const balanceOf = (state, id) => state.summary.find((s) => s.id === id).balance;
  const state = (await api('/api/state')).data;
  assert.equal(balanceOf(state, chi), -30000);
  assert.equal(balanceOf(state, dung), -70000);
  assert.equal(balanceOf(state, binh), 100000);

  // Tổng chia riêng (30.000 + 70.000 = 100.000) không khớp amount (100.000) — thử sai để chắc bị chặn.
  const mismatched = await api('/api/expenses', {
    method: 'POST',
    cookie,
    body: {
      date: '2026-09-08',
      amount: 100000,
      payerId: binh,
      shareMemberIds: [chi, dung],
      shareAmounts: { [chi]: 30000, [dung]: 60000 },
    },
  });
  assert.equal(mismatched.status, 400);

  // shareAmounts không khớp danh sách người được tick -> cũng bị chặn.
  const mismatchedMembers = await api('/api/expenses', {
    method: 'POST',
    cookie,
    body: {
      date: '2026-09-08',
      amount: 100000,
      payerId: binh,
      shareMemberIds: [chi, dung],
      shareAmounts: { [chi]: 100000 },
    },
  });
  assert.equal(mismatchedMembers.status, 400);
});
