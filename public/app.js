'use strict';

let state = { isAdmin: false, members: [], expenses: [], settlements: [], summary: [], debts: [] };
let editingExpenseId = null;

const $ = (sel) => document.querySelector(sel);

const STATUS_LABEL = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
};

function fmtMoney(n) {
  return Math.round(n).toLocaleString('vi-VN') + ' đ';
}

function nameOf(id) {
  const m = state.members.find((x) => x.id === id);
  return m ? m.name : '(đã xoá)';
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function showError(msg) {
  const box = $('#errorBox');
  box.textContent = msg;
  box.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function clearError() {
  const box = $('#errorBox');
  box.hidden = true;
  box.textContent = '';
}

async function api(path, options) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Có lỗi xảy ra');
  }
  return data;
}

async function loadState() {
  state = await api('/api/state');
  renderAll();
}

function renderAll() {
  renderAuth();
  renderMembers();
  renderExpenseForm();
  renderExpenseTable();
  renderSummary();
  renderDebts();
  renderSettlementForm();
  renderSettlementTable();
}

// ---- Đăng nhập admin ----

function renderAuth() {
  const status = $('#authStatus');
  const loginBtn = $('#loginBtn');
  const logoutBtn = $('#logoutBtn');

  if (state.isAdmin) {
    status.textContent = 'Đang đăng nhập với quyền admin';
    status.classList.add('is-admin');
    loginBtn.hidden = true;
    logoutBtn.hidden = false;
  } else {
    status.textContent = 'Đang xem ở chế độ chỉ xem';
    status.classList.remove('is-admin');
    loginBtn.hidden = false;
    logoutBtn.hidden = true;
  }

  for (const el of document.querySelectorAll('.admin-only')) {
    el.hidden = !state.isAdmin;
  }
}

$('#loginBtn').addEventListener('click', async () => {
  const password = prompt('Nhập mật khẩu admin:');
  if (!password) return;
  try {
    clearError();
    await api('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
    await loadState();
  } catch (e) {
    showError(e.message);
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  try {
    clearError();
    await api('/api/logout', { method: 'POST' });
    await loadState();
  } catch (e) {
    showError(e.message);
  }
});

// ---- Thành viên ----

function renderMembers() {
  const ul = $('#memberList');
  ul.innerHTML = '';
  if (state.members.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Chưa có thành viên nào';
    li.style.background = 'transparent';
    li.style.border = 'none';
    ul.appendChild(li);
    return;
  }
  for (const m of state.members) {
    const li = document.createElement('li');

    const nameSpan = document.createElement('span');
    nameSpan.className = 'member-name';
    nameSpan.textContent = m.name;

    if (state.isAdmin) {
      nameSpan.title = 'Bấm để sửa tên';
      nameSpan.addEventListener('click', async () => {
        const newName = prompt('Sửa tên thành viên:', m.name);
        if (newName === null) return;
        const trimmed = newName.trim();
        if (!trimmed || trimmed === m.name) return;
        try {
          clearError();
          state = await api(`/api/members/${m.id}`, {
            method: 'PUT',
            body: JSON.stringify({ name: trimmed }),
          });
          renderAll();
        } catch (e) {
          showError(e.message);
        }
      });

      const delBtn = document.createElement('button');
      delBtn.textContent = '×';
      delBtn.title = `Xoá ${m.name}`;
      delBtn.addEventListener('click', async () => {
        if (!confirm(`Xoá thành viên "${m.name}"?`)) return;
        try {
          clearError();
          state = await api(`/api/members/${m.id}`, { method: 'DELETE' });
          renderAll();
        } catch (e) {
          showError(e.message);
        }
      });
      li.appendChild(nameSpan);
      li.appendChild(delBtn);
    } else {
      li.appendChild(nameSpan);
    }

    ul.appendChild(li);
  }
}

$('#memberForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const input = $('#memberName');
  const name = input.value.trim();
  if (!name) return;
  try {
    clearError();
    state = await api('/api/members', { method: 'POST', body: JSON.stringify({ name }) });
    input.value = '';
    renderAll();
  } catch (e) {
    showError(e.message);
  }
});

// ---- Form khoản chi (admin) ----

function renderExpenseForm() {
  const payerSelect = $('#expensePayer');
  const prevPayer = payerSelect.value;
  payerSelect.innerHTML = '<option value="">-- Chọn người trả --</option>';
  for (const m of state.members) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    payerSelect.appendChild(opt);
  }
  if (state.members.some((m) => m.id === prevPayer)) payerSelect.value = prevPayer;

  const shareBox = $('#shareCheckboxes');
  const previouslyChecked = new Set(
    Array.from(shareBox.querySelectorAll('input:checked')).map((el) => el.value)
  );
  const isFreshForm = editingExpenseId === null && previouslyChecked.size === 0 && shareBox.dataset.touched !== 'true';

  shareBox.innerHTML = '';
  for (const m of state.members) {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = m.id;
    cb.checked = isFreshForm ? true : previouslyChecked.has(m.id);
    cb.addEventListener('change', () => {
      shareBox.dataset.touched = 'true';
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(m.name));
    shareBox.appendChild(label);
  }

  if (!$('#expenseDate').value) $('#expenseDate').value = todayStr();

  if (state.isAdmin) {
    $('#expenseFormTitle').textContent = editingExpenseId ? 'Sửa khoản chi' : 'Thêm khoản chi';
    $('#expenseFormHint').hidden = true;
    if (!editingExpenseId) $('#expenseSubmitBtn').textContent = '+ Thêm khoản chi';
  } else {
    $('#expenseFormTitle').textContent = 'Gửi yêu cầu thêm khoản chi';
    $('#expenseFormHint').hidden = false;
    $('#expenseSubmitBtn').textContent = 'Gửi yêu cầu';
  }
}

$('#checkAll').addEventListener('click', () => {
  $('#shareCheckboxes').dataset.touched = 'true';
  document.querySelectorAll('#shareCheckboxes input').forEach((cb) => (cb.checked = true));
});
$('#uncheckAll').addEventListener('click', () => {
  $('#shareCheckboxes').dataset.touched = 'true';
  document.querySelectorAll('#shareCheckboxes input').forEach((cb) => (cb.checked = false));
});

function resetExpenseForm() {
  editingExpenseId = null;
  $('#expenseId').value = '';
  $('#expenseDesc').value = '';
  $('#expenseAmount').value = '';
  $('#expenseDate').value = todayStr();
  $('#shareCheckboxes').dataset.touched = 'false';
  $('#expenseSubmitBtn').textContent = '+ Thêm khoản chi';
  $('#expenseCancelEdit').hidden = true;
  renderExpenseForm();
}

$('#expenseCancelEdit').addEventListener('click', resetExpenseForm);

$('#expenseForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const shareMemberIds = Array.from(
    document.querySelectorAll('#shareCheckboxes input:checked')
  ).map((el) => el.value);

  const payload = {
    date: $('#expenseDate').value,
    description: $('#expenseDesc').value.trim(),
    amount: Number($('#expenseAmount').value),
    payerId: $('#expensePayer').value,
    shareMemberIds,
  };

  try {
    clearError();
    if (editingExpenseId) {
      state = await api(`/api/expenses/${editingExpenseId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } else {
      const endpoint = state.isAdmin ? '/api/expenses' : '/api/expense-requests';
      state = await api(endpoint, { method: 'POST', body: JSON.stringify(payload) });
    }
    const isAdmin = state.isAdmin;
    resetExpenseForm();
    renderAll();
    if (!isAdmin) {
      alert('Đã gửi yêu cầu, chờ admin duyệt.');
    }
  } catch (e) {
    showError(e.message);
  }
});

function startEditExpense(id) {
  const e = state.expenses.find((x) => x.id === id);
  if (!e) return;
  editingExpenseId = id;
  $('#expenseId').value = id;
  $('#expenseDate').value = e.date;
  $('#expenseDesc').value = e.description;
  $('#expenseAmount').value = Math.round(e.amount);
  $('#expensePayer').value = e.payerId;
  $('#shareCheckboxes').dataset.touched = 'true';
  renderExpenseForm();
  document.querySelectorAll('#shareCheckboxes input').forEach((cb) => {
    cb.checked = e.shareMemberIds.includes(cb.value);
  });
  $('#expenseSubmitBtn').textContent = 'Lưu thay đổi';
  $('#expenseCancelEdit').hidden = false;
  $('#expenseForm').scrollIntoView({ behavior: 'smooth' });
}

// ---- Bảng khoản chi ----

function renderExpenseTable() {
  const tbody = $('#expenseTableBody');
  tbody.innerHTML = '';
  const sorted = [...state.expenses].sort((a, b) => (a.date < b.date ? 1 : -1));

  if (sorted.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="7" class="empty-msg">Chưa có khoản chi nào</td>';
    tbody.appendChild(tr);
    return;
  }

  for (const e of sorted) {
    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.textContent = e.date;

    const tdDesc = document.createElement('td');
    tdDesc.className = 'wrap';
    tdDesc.textContent = e.description || '(không có mô tả)';

    const tdAmount = document.createElement('td');
    tdAmount.className = 'amount';
    tdAmount.textContent = fmtMoney(e.amount);

    const tdPayer = document.createElement('td');
    tdPayer.textContent = nameOf(e.payerId);

    const tdShare = document.createElement('td');
    tdShare.className = 'wrap';
    const shareCount = e.shareMemberIds.length;
    const perAmount = shareCount > 0 ? e.amount / shareCount : 0;
    const shareWrap = document.createElement('div');
    shareWrap.className = 'share-chips';
    for (const mid of e.shareMemberIds) {
      const chip = document.createElement('span');
      chip.className = 'share-chip';
      chip.textContent = `${nameOf(mid)}: ${fmtMoney(perAmount)}`;
      shareWrap.appendChild(chip);
    }
    tdShare.appendChild(shareWrap);

    const tdStatus = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `status-badge ${e.status}`;
    badge.textContent = STATUS_LABEL[e.status] || e.status;
    tdStatus.appendChild(badge);

    const tdActions = document.createElement('td');
    if (state.isAdmin) {
      const actionsWrap = document.createElement('div');
      actionsWrap.className = 'row-actions';

      if (e.status === 'pending') {
        const approveBtn = document.createElement('button');
        approveBtn.textContent = 'Duyệt';
        approveBtn.addEventListener('click', async () => {
          try {
            clearError();
            state = await api(`/api/expense-requests/${e.id}/approve`, { method: 'POST' });
            renderAll();
          } catch (err) {
            showError(err.message);
          }
        });

        const rejectBtn = document.createElement('button');
        rejectBtn.className = 'danger';
        rejectBtn.textContent = 'Từ chối';
        rejectBtn.addEventListener('click', async () => {
          try {
            clearError();
            state = await api(`/api/expense-requests/${e.id}/reject`, { method: 'POST' });
            renderAll();
          } catch (err) {
            showError(err.message);
          }
        });

        actionsWrap.appendChild(approveBtn);
        actionsWrap.appendChild(rejectBtn);
      }

      const editBtn = document.createElement('button');
      editBtn.className = 'secondary';
      editBtn.textContent = 'Sửa';
      editBtn.addEventListener('click', () => startEditExpense(e.id));

      const delBtn = document.createElement('button');
      delBtn.className = 'danger';
      delBtn.textContent = 'Xoá';
      delBtn.addEventListener('click', async () => {
        if (!confirm('Xoá khoản chi này?')) return;
        try {
          clearError();
          state = await api(`/api/expenses/${e.id}`, { method: 'DELETE' });
          if (editingExpenseId === e.id) resetExpenseForm();
          renderAll();
        } catch (err) {
          showError(err.message);
        }
      });

      actionsWrap.appendChild(editBtn);
      actionsWrap.appendChild(delBtn);
      tdActions.appendChild(actionsWrap);
    }

    tr.append(tdDate, tdDesc, tdAmount, tdPayer, tdShare, tdStatus, tdActions);
    tbody.appendChild(tr);
  }
}

// ---- Tổng kết ----

function renderSummary() {
  const tbody = $('#summaryTableBody');
  tbody.innerHTML = '';

  if (state.summary.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="4" class="empty-msg">Chưa có dữ liệu</td>';
    tbody.appendChild(tr);
    return;
  }

  for (const s of state.summary) {
    const tr = document.createElement('tr');
    const balClass = s.balance > 0 ? 'positive' : s.balance < 0 ? 'negative' : '';
    tr.innerHTML = `
      <td>${escapeHtml(s.name)}</td>
      <td class="amount">${fmtMoney(s.totalPaid)}</td>
      <td class="amount">${fmtMoney(s.totalOwed)}</td>
      <td class="amount ${balClass}">${s.balance >= 0 ? '+' : ''}${fmtMoney(s.balance)}</td>
    `;
    tbody.appendChild(tr);
  }
}

// ---- Ai nợ ai ----

function renderDebts() {
  const ul = $('#debtList');
  const emptyMsg = $('#debtEmpty');
  ul.innerHTML = '';

  if (state.debts.length === 0) {
    emptyMsg.hidden = false;
    return;
  }
  emptyMsg.hidden = true;

  for (const d of state.debts) {
    const li = document.createElement('li');

    const text = document.createElement('span');
    text.className = 'debt-text';
    text.innerHTML = `${escapeHtml(nameOf(d.fromId))} nợ <b>${escapeHtml(
      nameOf(d.toId)
    )}</b>: <b>${fmtMoney(d.amount)}</b>`;

    li.appendChild(text);

    if (state.isAdmin) {
      const actions = document.createElement('div');
      actions.className = 'debt-actions';

      const settleBtn = document.createElement('button');
      settleBtn.className = 'secondary';
      settleBtn.textContent = 'Ghi nhận đã trả';
      settleBtn.addEventListener('click', () => {
        $('#settleFrom').value = d.fromId;
        $('#settleTo').value = d.toId;
        $('#settleAmount').value = Math.round(d.amount);
        $('#settlementForm').scrollIntoView({ behavior: 'smooth' });
      });

      actions.appendChild(settleBtn);
      li.appendChild(actions);
    }

    ul.appendChild(li);
  }
}

// ---- Thanh toán ----

function renderSettlementForm() {
  const fromSelect = $('#settleFrom');
  const toSelect = $('#settleTo');
  const prevFrom = fromSelect.value;
  const prevTo = toSelect.value;

  for (const sel of [fromSelect, toSelect]) {
    sel.innerHTML = '<option value="">-- Chọn --</option>';
    for (const m of state.members) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      sel.appendChild(opt);
    }
  }
  if (state.members.some((m) => m.id === prevFrom)) fromSelect.value = prevFrom;
  if (state.members.some((m) => m.id === prevTo)) toSelect.value = prevTo;
  if (!$('#settleDate').value) $('#settleDate').value = todayStr();
}

$('#settlementForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const payload = {
    fromId: $('#settleFrom').value,
    toId: $('#settleTo').value,
    amount: Number($('#settleAmount').value),
    date: $('#settleDate').value,
  };
  try {
    clearError();
    state = await api('/api/settlements', { method: 'POST', body: JSON.stringify(payload) });
    $('#settleAmount').value = '';
    renderAll();
  } catch (e) {
    showError(e.message);
  }
});

function renderSettlementTable() {
  const tbody = $('#settlementTableBody');
  tbody.innerHTML = '';
  const sorted = [...state.settlements].sort((a, b) => (a.date < b.date ? 1 : -1));

  if (sorted.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="4" class="empty-msg">Chưa có thanh toán nào</td>';
    tbody.appendChild(tr);
    return;
  }

  for (const s of sorted) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${s.date}</td>
      <td>${escapeHtml(nameOf(s.fromId))}</td>
      <td>${escapeHtml(nameOf(s.toId))}</td>
      <td class="amount">${fmtMoney(s.amount)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---- Xoá sạch dữ liệu ----

$('#resetAllBtn').addEventListener('click', async () => {
  const confirmed = confirm(
    'Xoá sạch TOÀN BỘ khoản chi và lịch sử thanh toán?\n' +
      'Danh sách thành viên vẫn được giữ lại. Thao tác này KHÔNG THỂ hoàn tác.'
  );
  if (!confirmed) return;

  const typed = prompt('Gõ "XOA" (không dấu) để xác nhận:');
  if (!typed || typed.trim().toUpperCase() !== 'XOA') {
    alert('Đã huỷ, không có gì bị xoá.');
    return;
  }

  try {
    clearError();
    state = await api('/api/reset', { method: 'POST' });
    resetExpenseForm();
    renderAll();
    alert('Đã xoá sạch dữ liệu chi tiêu. Danh sách thành viên vẫn được giữ nguyên.');
  } catch (e) {
    showError(e.message);
  }
});

loadState().catch((e) => showError(e.message));
