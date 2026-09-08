'use strict';

let state = { isAdmin: false, members: [], expenses: [], settlements: [], summary: [], debts: [] };
let editingExpenseId = null;
let currentReceipt = null; // data URL ảnh bill đang gắn với form khoản chi (null = không có)

const PAGE_SIZE = 5;
let expenseFilters = { q: '', payerId: '', shareMemberId: '', status: '', from: '', to: '' };
let expensePage = 1;
let settlementFilters = { fromId: '', toId: '', status: '', from: '', to: '' };
let settlementPage = 1;

const $ = (sel) => document.querySelector(sel);

// ---- Giao diện sáng/tối ----
// Mặc định theo hệ thống (prefers-color-scheme). Bấm nút thì ghi đè bằng
// thuộc tính data-theme trên <html> + lưu localStorage để lần sau mở lại
// vẫn giữ đúng lựa chọn (index.html đã có script nhỏ áp lại giá trị này
// ngay từ đầu để tránh nhấp nháy sáng rồi mới chuyển tối lúc tải trang).
const THEME_STORAGE_KEY = 'chi-tieu-chung-theme';

function isDarkActive() {
  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit === 'dark') return true;
  if (explicit === 'light') return false;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function renderThemeToggle() {
  const btn = $('#themeToggleBtn');
  if (!btn) return;
  const dark = isDarkActive();
  btn.textContent = dark ? '☀️' : '🌙';
  btn.title = dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';
}

$('#themeToggleBtn').addEventListener('click', () => {
  const next = isDarkActive() ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch (e) {
    // Trình duyệt chặn localStorage (chế độ ẩn danh...) — vẫn đổi giao diện
    // được cho phiên hiện tại, chỉ là không nhớ được cho lần sau.
  }
  renderThemeToggle();
});

renderThemeToggle();

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

// So sánh ngày mới nhất lên trước. Bắt buộc trả về 0 khi bằng nhau — nếu
// không, Array.sort mất tính ổn định với các phần tử cùng ngày (rất hay gặp)
// và có thể xáo trộn thứ tự thay vì giữ đúng "mới thêm/sửa gần nhất trước".
function byDateNewestFirst(a, b) {
  if (a.date < b.date) return 1;
  if (a.date > b.date) return -1;
  return 0;
}

// Render thanh phân trang dùng chung cho bảng khoản chi và bảng thanh toán.
// `page` có thể bị lệch (vd sau khi lọc còn ít dòng hơn) nên hàm này tự kẹp lại
// trong khoảng hợp lệ và trả về giá trị đã kẹp để nơi gọi cập nhật state.
function renderPagination(container, { total, page, pageSize, onChange }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(1, page), totalPages);

  container.innerHTML = '';

  const info = document.createElement('span');
  if (total === 0) {
    info.textContent = 'Không có dòng nào';
  } else {
    const start = (clampedPage - 1) * pageSize + 1;
    const end = Math.min(total, clampedPage * pageSize);
    info.textContent = `Hiện ${start}–${end} / ${total}`;
  }

  const nav = document.createElement('div');
  nav.className = 'pagination-nav';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'secondary';
  prevBtn.textContent = '‹ Trước';
  prevBtn.disabled = clampedPage <= 1;
  prevBtn.addEventListener('click', () => onChange(clampedPage - 1));

  const pageInfo = document.createElement('span');
  pageInfo.textContent = `Trang ${clampedPage}/${totalPages}`;

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'secondary';
  nextBtn.textContent = 'Sau ›';
  nextBtn.disabled = clampedPage >= totalPages;
  nextBtn.addEventListener('click', () => onChange(clampedPage + 1));

  nav.append(prevBtn, pageInfo, nextBtn);
  container.append(info, nav);

  return clampedPage;
}

// Đổ danh sách thành viên vào 1 <select> bộ lọc, giữ lại lựa chọn hiện tại
// (đọc từ `selected`, không đọc từ DOM) để không bị nhảy về "Tất cả" khi
// danh sách thành viên thay đổi.
function populateMemberFilterSelect(select, selected, allLabel) {
  select.innerHTML = `<option value="">${allLabel}</option>`;
  for (const m of state.members) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    select.appendChild(opt);
  }
  select.value = selected;
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

// ---- Modal xác nhận / nhập liệu / toast (thay cho confirm()/prompt()/alert() gốc) ----

function showConfirm(message, { okLabel = 'Xác nhận', danger = false } = {}) {
  return new Promise((resolve) => {
    const dialog = $('#confirmDialog');
    const form = $('#confirmForm');
    const okBtn = $('#confirmOkBtn');
    const cancelBtn = $('#confirmCancelBtn');
    $('#confirmMessage').textContent = message;
    okBtn.textContent = okLabel;
    okBtn.className = danger ? 'danger' : '';

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      form.removeEventListener('submit', onSubmit);
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
      dialog.close();
      resolve(result);
    };
    const onSubmit = (ev) => {
      ev.preventDefault();
      finish(true);
    };
    const onCancel = () => finish(false);
    const onClose = () => finish(false);

    form.addEventListener('submit', onSubmit);
    cancelBtn.addEventListener('click', onCancel, { once: true });
    dialog.addEventListener('cancel', onCancel, { once: true });
    dialog.addEventListener('close', onClose, { once: true });
    dialog.showModal();
  });
}

function showPrompt(message, defaultValue = '') {
  return new Promise((resolve) => {
    const dialog = $('#promptDialog');
    const form = $('#promptForm');
    const cancelBtn = $('#promptCancelBtn');
    const input = $('#promptInput');
    $('#promptMessage').textContent = message;
    input.value = defaultValue;

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      form.removeEventListener('submit', onSubmit);
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
      dialog.close();
      resolve(result);
    };
    const onSubmit = (ev) => {
      ev.preventDefault();
      finish(input.value);
    };
    const onCancel = () => finish(null);
    const onClose = () => finish(null);

    form.addEventListener('submit', onSubmit);
    cancelBtn.addEventListener('click', onCancel, { once: true });
    dialog.addEventListener('cancel', onCancel, { once: true });
    dialog.addEventListener('close', onClose, { once: true });
    dialog.showModal();
    input.focus();
    input.select();
  });
}

function showToast(message) {
  const container = $('#toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  }, 2800);
}

// Khoá 1 nút/phần tử trong lúc handler đang chạy (vd: đang gọi API) để tránh
// bấm nhiều lần liên tiếp tạo ra nhiều request/bản ghi trùng nhau.
function withGuard(el, handler) {
  return async (...args) => {
    const ev = args[0];
    if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
    if (!el || el.dataset.busy === 'true') return;
    el.dataset.busy = 'true';
    if ('disabled' in el) el.disabled = true;
    try {
      await handler(...args);
    } finally {
      el.dataset.busy = 'false';
      if ('disabled' in el) el.disabled = false;
    }
  };
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

// Tính lại "Tổng kết" và "Ai nợ ai" ngay trên trình duyệt, dùng chung logic với
// server (window.calc, nạp từ /calc.js) — để cập nhật giao diện lạc quan
// (optimistic) ngay khi bấm nút, không cần chờ round-trip mạng tới Turso.
function recomputeDerived() {
  const approvedExpenses = state.expenses.filter((e) => e.status === 'approved');
  const approvedSettlements = state.settlements.filter((s) => s.status === 'approved');
  state.summary = calc.computeSummary(state.members, approvedExpenses, approvedSettlements);
  state.debts = calc.computeDebts(state.members, approvedExpenses, approvedSettlements);
}

// Áp dụng thay đổi ngay lập tức (apply) + render, rồi mới gửi request thật lên
// server. Nếu request lỗi, khôi phục lại đúng trạng thái trước đó và báo lỗi.
async function optimisticMutate(apply, request) {
  const snapshot = structuredClone(state);
  apply();
  recomputeDerived();
  renderAll();
  try {
    state = await request();
    renderAll();
  } catch (e) {
    state = snapshot;
    renderAll();
    throw e;
  }
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
  renderSettlementTable();
}

// ---- Đăng nhập admin ----

function renderAuth() {
  const status = $('#authStatus');
  const loginBtn = $('#loginBtn');
  const logoutBtn = $('#logoutBtn');

  if (state.isAdmin) {
    status.textContent = 'Admin';
    status.classList.add('is-admin');
    loginBtn.hidden = true;
    logoutBtn.hidden = false;
  } else {
    status.textContent = 'Chỉ xem';
    status.classList.remove('is-admin');
    loginBtn.hidden = false;
    logoutBtn.hidden = true;
  }

  for (const el of document.querySelectorAll('.admin-only')) {
    el.hidden = !state.isAdmin;
  }
}

$('#loginBtn').addEventListener('click', () => {
  const dialog = $('#loginDialog');
  const passwordInput = $('#loginPassword');
  const dialogError = $('#loginError');
  passwordInput.value = '';
  dialogError.hidden = true;
  dialog.showModal();
  passwordInput.focus();
});

$('#loginCancelBtn').addEventListener('click', () => {
  $('#loginDialog').close();
});

$('#loginForm').addEventListener(
  'submit',
  withGuard($('#loginSubmitBtn'), async (ev) => {
    ev.preventDefault();
    const dialog = $('#loginDialog');
    const dialogError = $('#loginError');
    const password = $('#loginPassword').value;
    dialogError.hidden = true;
    try {
      await api('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
      dialog.close();
      clearError();
      await loadState();
    } catch (e) {
      dialogError.textContent = e.message;
      dialogError.hidden = false;
    }
  })
);

$('#logoutBtn').addEventListener(
  'click',
  withGuard($('#logoutBtn'), async () => {
    try {
      clearError();
      await api('/api/logout', { method: 'POST' });
      await loadState();
    } catch (e) {
      showError(e.message);
    }
  })
);

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
      nameSpan.addEventListener(
        'click',
        withGuard(nameSpan, async () => {
          const newName = await showPrompt('Sửa tên thành viên:', m.name);
          if (newName === null) return;
          const trimmed = newName.trim();
          if (!trimmed || trimmed === m.name) return;
          try {
            clearError();
            await optimisticMutate(
              () => {
                const mem = state.members.find((x) => x.id === m.id);
                if (mem) mem.name = trimmed;
              },
              () => api(`/api/members/${m.id}`, { method: 'PUT', body: JSON.stringify({ name: trimmed }) })
            );
          } catch (e) {
            showError(e.message);
          }
        })
      );

      const delBtn = document.createElement('button');
      delBtn.textContent = '×';
      delBtn.title = `Xoá ${m.name}`;
      delBtn.addEventListener(
        'click',
        withGuard(delBtn, async () => {
          const ok = await showConfirm(`Xoá thành viên "${m.name}"?`, { okLabel: 'Xoá', danger: true });
          if (!ok) return;
          try {
            clearError();
            await optimisticMutate(
              () => {
                state.members = state.members.filter((x) => x.id !== m.id);
              },
              () => api(`/api/members/${m.id}`, { method: 'DELETE' })
            );
          } catch (e) {
            showError(e.message);
          }
        })
      );
      li.appendChild(nameSpan);
      li.appendChild(delBtn);
    } else {
      li.appendChild(nameSpan);
    }

    ul.appendChild(li);
  }
}

$('#memberForm').addEventListener(
  'submit',
  withGuard($('#memberForm').querySelector('button[type="submit"]'), async (ev) => {
    ev.preventDefault();
    const input = $('#memberName');
    const name = input.value.trim();
    if (!name) return;
    input.value = '';
    try {
      clearError();
      await optimisticMutate(
        () => {
          state.members.push({ id: `temp-${Date.now()}`, name });
        },
        () => api('/api/members', { method: 'POST', body: JSON.stringify({ name }) })
      );
    } catch (e) {
      showError(e.message);
    }
  })
);

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
    Array.from(shareBox.querySelectorAll('input[type="checkbox"]:checked')).map((el) => el.value)
  );
  const previousExtras = new Map(
    Array.from(shareBox.querySelectorAll('.share-amount-input')).map((el) => [el.dataset.member, el.value])
  );
  const isFreshForm = editingExpenseId === null && previouslyChecked.size === 0 && shareBox.dataset.touched !== 'true';
  const customMode = $('#shareCustomToggle').checked;

  shareBox.innerHTML = '';
  for (const m of state.members) {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = m.id;
    cb.checked = isFreshForm ? true : previouslyChecked.has(m.id);
    cb.addEventListener('change', () => {
      shareBox.dataset.touched = 'true';
      refreshShareAmounts();
    });

    // Ô này chỉ nhập phần MUA THÊM RIÊNG của người đó (để trống = không mua
    // thêm gì). Phần chung còn lại sau khi trừ hết các khoản mua thêm sẽ tự
    // chia đều cho tất cả người được tick — khỏi phải tự tính nhẩm.
    // Dùng type="text" (không phải "number") để cho gõ được nhiều món cộng
    // dồn kiểu "15000+20000+8000" — parseSumExpression() sẽ tự cộng lại,
    // khỏi phải bấm máy tính rồi mới điền 1 số duy nhất vào đây.
    const extraInput = document.createElement('input');
    extraInput.type = 'text';
    extraInput.inputMode = 'decimal';
    extraInput.className = 'share-amount-input';
    extraInput.placeholder = '+ riêng';
    extraInput.title =
      'Số tiền người này mua thêm riêng, ngoài phần chia đều chung (để trống nếu không có). ' +
      'Gõ được nhiều món cộng dồn, vd: 15000+20000+8000 — tự cộng lại, khỏi cần tính tay.';
    extraInput.dataset.member = m.id;
    if (previousExtras.has(m.id)) extraInput.value = previousExtras.get(m.id);
    extraInput.hidden = !customMode || !cb.checked;
    extraInput.addEventListener('input', refreshShareAmounts);
    extraInput.addEventListener('click', (ev) => ev.stopPropagation());

    const finalNote = document.createElement('span');
    finalNote.className = 'share-final-note';
    finalNote.dataset.member = m.id;
    finalNote.hidden = !customMode || !cb.checked;

    label.appendChild(cb);
    label.appendChild(document.createTextNode(m.name));
    label.appendChild(extraInput);
    label.appendChild(finalNote);
    shareBox.appendChild(label);
  }
  refreshShareAmounts();

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

// ---- Chia riêng số tiền từng người (thay vì chia đều) ----
//
// Mô hình: mỗi người có 1 phần "mua thêm riêng" (mặc định 0, để trống). Phần
// còn lại của khoản chi — sau khi trừ hết các khoản mua thêm — tự CHIA ĐỀU
// cho TẤT CẢ người được tick (kể cả người có mua thêm). Số cuối mỗi người =
// phần chung + phần mua thêm riêng của họ.
//
// Nhờ vậy phủ được mọi trường hợp chỉ với 1 khoản chi:
// - Không ai gõ gì -> y hệt chia đều như trước.
// - Vài người có mua thêm riêng ngoài phần dùng chung -> gõ đúng phần thêm đó.
// - Mỗi người mua hẳn đồ riêng, không có gì dùng chung -> gõ đủ số tiền của
//   từng người (phần chung tự về 0, không ai bị chia thêm ngoài ý muốn).
// Tổng luôn tự khớp đúng số tiền khoản chi — không cần validate lệch tổng.

// Cho phép gõ nhiều món cộng (trừ) dồn vào ô "mua thêm riêng", vd:
// "15000+20000+8000" hoặc "20000-5000" (được giảm giá) — tự cộng lại thay vì
// bắt người dùng tính tay rồi mới điền 1 số. Cố tình KHÔNG dùng eval() — chỉ
// nhận số, dấu +/-, dấu chấm/phẩy và khoảng trắng, không có gì khác được thực
// thi. Chuỗi rỗng -> 0. Chuỗi không hợp lệ (có chữ...) -> NaN (nơi gọi tự coi
// NaN như 0 vì "NaN || 0" === 0).
function parseSumExpression(raw) {
  const str = String(raw ?? '').trim();
  if (str === '') return 0;
  if (!/^[\d+\-.,\s]+$/.test(str)) return NaN;
  const tokens = str.replace(/,/g, '').match(/[+-]?\s*\d+(\.\d+)?/g);
  if (!tokens) return NaN;
  return tokens.reduce((sum, t) => sum + parseFloat(t.replace(/\s/g, '')), 0);
}

function getShareRows() {
  return Array.from(document.querySelectorAll('#shareCheckboxes label'))
    .map((label) => ({
      cb: label.querySelector('input[type="checkbox"]'),
      extraInput: label.querySelector('.share-amount-input'),
      finalNote: label.querySelector('.share-final-note'),
    }))
    .filter((r) => r.cb && r.extraInput && r.finalNote);
}

// Tính phần chung (base) từ số tiền khoản chi và các phần mua thêm đã gõ.
// remainder (đồng lẻ chia không hết) được dồn cho vài người đầu tiên trong
// danh sách để tổng luôn khớp tuyệt đối.
function computeShareBase() {
  const amount = Math.round(Number($('#expenseAmount').value) || 0);
  const rows = getShareRows();
  const checkedRows = rows.filter((r) => r.cb.checked);
  const extraSum = checkedRows.reduce((sum, r) => sum + (Math.round(parseSumExpression(r.extraInput.value)) || 0), 0);
  const remaining = amount - extraSum;
  const n = checkedRows.length;
  const valid = n > 0 && amount > 0 && remaining >= 0;
  const base = valid ? Math.floor(remaining / n) : 0;
  const remainder = valid ? remaining - base * n : 0;
  return { amount, checkedRows, extraSum, remaining, n, valid, base, remainder };
}

// Trả về số cuối cùng của người thứ i (0-based, theo đúng thứ tự checkedRows
// của computeShareBase) — dùng chung cho hiển thị và lúc build payload submit.
function finalAmountAt(computed, i) {
  const { checkedRows, base, remainder } = computed;
  const extra = Math.round(parseSumExpression(checkedRows[i].extraInput.value)) || 0;
  return base + (i < remainder ? 1 : 0) + extra;
}

// Ẩn/hiện ô "mua thêm riêng" theo (đang bật chia riêng) && (người đó có được
// tick). Ô nào vừa bị ẩn thì xoá sạch giá trị để lần bật lại sau không giữ số
// cũ vô nghĩa.
function syncShareAmountVisibility() {
  const customMode = $('#shareCustomToggle').checked;
  for (const { cb, extraInput, finalNote } of getShareRows()) {
    const shouldShow = customMode && cb.checked;
    extraInput.hidden = !shouldShow;
    finalNote.hidden = !shouldShow;
    if (!shouldShow) extraInput.value = '';
  }
}

function updateShareFinalNotes() {
  if (!$('#shareCustomToggle').checked) return;
  const computed = computeShareBase();
  computed.checkedRows.forEach((r, i) => {
    r.finalNote.textContent = computed.valid ? `= ${fmtMoney(finalAmountAt(computed, i))}` : '';
  });
}

function updateShareAmountsTotal() {
  const box = $('#shareAmountsTotal');
  if (!$('#shareCustomToggle').checked) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const { amount, n, extraSum, valid, base } = computeShareBase();
  if (n === 0) {
    box.textContent = 'Chọn ít nhất 1 người để chia riêng.';
    box.classList.remove('ok');
    box.classList.add('mismatch');
    return;
  }
  if (!valid) {
    box.textContent = `Tổng mua thêm riêng (${fmtMoney(extraSum)}) đã vượt quá số tiền khoản chi (${fmtMoney(amount)}).`;
    box.classList.remove('ok');
    box.classList.add('mismatch');
    return;
  }
  box.textContent = `Phần chung còn lại: ${fmtMoney(base)}/người (chia đều cho ${n} người)`;
  box.classList.add('ok');
  box.classList.remove('mismatch');
}

function refreshShareAmounts() {
  syncShareAmountVisibility();
  updateShareFinalNotes();
  updateShareAmountsTotal();
}

$('#shareCustomToggle').addEventListener('change', refreshShareAmounts);
$('#expenseAmount').addEventListener('input', refreshShareAmounts);

// Nén ảnh bill xuống kích thước/dung lượng nhỏ ngay trên trình duyệt trước khi
// gửi lên (Turso free tier có hạn dung lượng) — trả về data URL JPEG.
function compressImageFile(file, { maxDim = 1600, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được file ảnh'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('File không phải ảnh hợp lệ'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function showReceiptPreview(dataUrl) {
  $('#receiptPreviewImg').src = dataUrl;
  $('#receiptPreviewWrap').hidden = false;
}

function clearReceiptField() {
  currentReceipt = null;
  $('#expenseReceiptInput').value = '';
  $('#receiptPreviewWrap').hidden = true;
  $('#receiptPreviewImg').src = '';
}

async function handleReceiptFile(file) {
  try {
    clearError();
    currentReceipt = await compressImageFile(file);
    showReceiptPreview(currentReceipt);
  } catch (e) {
    showError(e.message);
    clearReceiptField();
  }
}

$('#receiptDropzone').addEventListener('click', () => $('#expenseReceiptInput').click());
$('#receiptDropzone').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' || ev.key === ' ') {
    ev.preventDefault();
    $('#expenseReceiptInput').click();
  }
});

// Kéo thả file ảnh trực tiếp vào vùng dropzone.
const receiptDropzoneEl = $('#receiptDropzone');
['dragenter', 'dragover'].forEach((type) => {
  receiptDropzoneEl.addEventListener(type, (ev) => {
    ev.preventDefault();
    receiptDropzoneEl.classList.add('drag-over');
  });
});
['dragleave', 'dragend'].forEach((type) => {
  receiptDropzoneEl.addEventListener(type, () => {
    receiptDropzoneEl.classList.remove('drag-over');
  });
});
receiptDropzoneEl.addEventListener('drop', (ev) => {
  ev.preventDefault();
  receiptDropzoneEl.classList.remove('drag-over');
  const file = Array.from(ev.dataTransfer?.files || []).find((f) => f.type.startsWith('image/'));
  if (file) handleReceiptFile(file);
});

$('#expenseReceiptInput').addEventListener('change', (ev) => {
  const file = ev.target.files[0];
  if (file) handleReceiptFile(file);
});

$('#receiptRemoveBtn').addEventListener('click', clearReceiptField);

// Dán ảnh trực tiếp từ clipboard (Ctrl+V) khi đang thao tác trong form khoản chi.
$('#expenseForm').addEventListener('paste', (ev) => {
  const items = ev.clipboardData && ev.clipboardData.items;
  if (!items) return;
  const imageItem = Array.from(items).find((item) => item.type.startsWith('image/'));
  if (!imageItem) return;
  ev.preventDefault();
  const file = imageItem.getAsFile();
  if (file) handleReceiptFile(file);
});

$('#checkAll').addEventListener('click', () => {
  $('#shareCheckboxes').dataset.touched = 'true';
  document.querySelectorAll('#shareCheckboxes input[type="checkbox"]').forEach((cb) => (cb.checked = true));
  refreshShareAmounts();
});
$('#uncheckAll').addEventListener('click', () => {
  $('#shareCheckboxes').dataset.touched = 'true';
  document.querySelectorAll('#shareCheckboxes input[type="checkbox"]').forEach((cb) => (cb.checked = false));
  refreshShareAmounts();
});

function resetExpenseForm() {
  editingExpenseId = null;
  $('#expenseId').value = '';
  $('#expenseDesc').value = '';
  $('#expenseAmount').value = '';
  $('#expenseDate').value = todayStr();
  $('#shareCheckboxes').dataset.touched = 'false';
  $('#shareCustomToggle').checked = false;
  $('#expenseSubmitBtn').textContent = '+ Thêm khoản chi';
  $('#expenseCancelEdit').hidden = true;
  clearReceiptField();
  renderExpenseForm();
}

$('#expenseCancelEdit').addEventListener('click', resetExpenseForm);

$('#expenseForm').addEventListener(
  'submit',
  withGuard($('#expenseSubmitBtn'), async (ev) => {
    ev.preventDefault();
    const amount = Number($('#expenseAmount').value);

    let shareMemberIds;
    let shareAmounts = null;
    if ($('#shareCustomToggle').checked) {
      const computed = computeShareBase();
      if (computed.n === 0) {
        showError('Chia riêng: vui lòng chọn ít nhất 1 người.');
        return;
      }
      if (!computed.valid) {
        showError(
          `Chia riêng: tổng mua thêm riêng (${fmtMoney(computed.extraSum)}) đã vượt quá số tiền khoản chi (${fmtMoney(computed.amount)}).`
        );
        return;
      }
      shareMemberIds = [];
      shareAmounts = {};
      computed.checkedRows.forEach((r, i) => {
        shareMemberIds.push(r.cb.value);
        shareAmounts[r.cb.value] = finalAmountAt(computed, i);
      });
    } else {
      shareMemberIds = Array.from(
        document.querySelectorAll('#shareCheckboxes input[type="checkbox"]:checked')
      ).map((el) => el.value);
    }

    const payload = {
      date: $('#expenseDate').value,
      description: $('#expenseDesc').value.trim(),
      amount,
      payerId: $('#expensePayer').value,
      shareMemberIds,
      shareAmounts,
      receipt: currentReceipt,
    };

    const wasAdmin = state.isAdmin;
    const editingId = editingExpenseId;

    try {
      clearError();
      if (editingId) {
        await optimisticMutate(
          () => {
            const exp = state.expenses.find((x) => x.id === editingId);
            if (exp) Object.assign(exp, payload);
          },
          () => api(`/api/expenses/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) })
        );
      } else {
        const tempId = `temp-${Date.now()}`;
        const endpoint = wasAdmin ? '/api/expenses' : '/api/expense-requests';
        await optimisticMutate(
          () => {
            // unshift (không phải push) để khoản vừa thêm hiện ngay ở đầu danh
            // sách trong lúc chờ server phản hồi, khớp với thứ tự "mới nhất
            // lên đầu" thay vì phải đợi tải lại mới đúng vị trí.
            state.expenses.unshift({ id: tempId, ...payload, status: wasAdmin ? 'approved' : 'pending' });
          },
          () => api(endpoint, { method: 'POST', body: JSON.stringify(payload) })
        );
      }
      resetExpenseForm();
      renderAll();
      if (!wasAdmin) {
        showToast('Đã gửi yêu cầu, chờ admin duyệt.');
      }
    } catch (e) {
      showError(e.message);
    }
  })
);

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
  $('#shareCustomToggle').checked = !!e.shareAmounts;
  renderExpenseForm();
  document.querySelectorAll('#shareCheckboxes input[type="checkbox"]').forEach((cb) => {
    cb.checked = e.shareMemberIds.includes(cb.value);
  });
  if (e.shareAmounts) {
    // Nạp lại đúng số cuối đã lưu làm "mua thêm riêng" cho mọi người — phần
    // chung tự tính về 0 (vì đã trừ hết), nên số cuối hiển thị vẫn khớp y hệt
    // bản gốc. Sửa lại từ đây vẫn hoạt động bình thường như nhập mới.
    document.querySelectorAll('#shareCheckboxes .share-amount-input').forEach((input) => {
      const v = e.shareAmounts[input.dataset.member];
      if (v !== undefined) input.value = Math.round(v);
    });
  }
  refreshShareAmounts();
  if (e.receipt) {
    currentReceipt = e.receipt;
    showReceiptPreview(e.receipt);
  } else {
    clearReceiptField();
  }
  $('#expenseSubmitBtn').textContent = 'Lưu thay đổi';
  $('#expenseCancelEdit').hidden = false;
  $('#expenseForm').scrollIntoView({ behavior: 'smooth' });
}

// ---- Bảng khoản chi ----

function filterExpenses(list) {
  const q = expenseFilters.q.trim().toLowerCase();
  return list.filter((e) => {
    if (q && !(e.description || '').toLowerCase().includes(q)) return false;
    if (expenseFilters.payerId && e.payerId !== expenseFilters.payerId) return false;
    if (expenseFilters.shareMemberId && !e.shareMemberIds.includes(expenseFilters.shareMemberId)) return false;
    if (expenseFilters.status && e.status !== expenseFilters.status) return false;
    if (expenseFilters.from && e.date < expenseFilters.from) return false;
    if (expenseFilters.to && e.date > expenseFilters.to) return false;
    return true;
  });
}

function renderExpenseTable() {
  const payerSelect = $('#expenseFilterPayer');
  populateMemberFilterSelect(payerSelect, expenseFilters.payerId, 'Tất cả người trả');
  const shareMemberSelect = $('#expenseFilterShareMember');
  populateMemberFilterSelect(shareMemberSelect, expenseFilters.shareMemberId, 'Tất cả người chia');

  const tbody = $('#expenseTableBody');
  tbody.innerHTML = '';
  const filtered = filterExpenses(state.expenses).sort(byDateNewestFirst);

  expensePage = renderPagination($('#expensePagination'), {
    total: filtered.length,
    page: expensePage,
    pageSize: PAGE_SIZE,
    onChange: (p) => {
      expensePage = p;
      renderExpenseTable();
    },
  });
  const pageItems = filtered.slice((expensePage - 1) * PAGE_SIZE, expensePage * PAGE_SIZE);

  if (pageItems.length === 0) {
    const tr = document.createElement('tr');
    const msg = state.expenses.length === 0 ? 'Chưa có khoản chi nào' : 'Không có khoản chi nào khớp bộ lọc';
    tr.innerHTML = `<td colspan="8" class="empty-msg">${msg}</td>`;
    tbody.appendChild(tr);
    return;
  }

  for (const e of pageItems) {
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

    if (e.shareAmounts) {
      // Chia riêng — mỗi người 1 số tiền khác nhau nên phải liệt kê đủ.
      const shareWrap = document.createElement('div');
      shareWrap.className = 'share-chips';
      for (const mid of e.shareMemberIds) {
        const chip = document.createElement('span');
        chip.className = 'share-chip';
        chip.textContent = `${nameOf(mid)}: ${fmtMoney(e.shareAmounts[mid] || 0)}`;
        shareWrap.appendChild(chip);
      }
      tdShare.appendChild(shareWrap);
      const note = document.createElement('div');
      note.className = 'share-per-amount';
      note.textContent = 'Chia riêng';
      tdShare.appendChild(note);
    } else if (shareCount > 0 && shareCount === state.members.length) {
      // Chia đều cho cả nhóm — khỏi liệt kê từng người, chỉ 1 dòng gọn.
      const perAmount = e.amount / shareCount;
      const summary = document.createElement('span');
      summary.className = 'share-summary';
      summary.textContent = `Cả nhóm (${shareCount}) · ${fmtMoney(perAmount)}/người`;
      tdShare.appendChild(summary);
    } else {
      const perAmount = shareCount > 0 ? e.amount / shareCount : 0;
      const shareWrap = document.createElement('div');
      shareWrap.className = 'share-chips';
      for (const mid of e.shareMemberIds) {
        const chip = document.createElement('span');
        chip.className = 'share-chip';
        chip.textContent = nameOf(mid);
        shareWrap.appendChild(chip);
      }
      tdShare.appendChild(shareWrap);
      if (shareCount > 0) {
        const perNote = document.createElement('div');
        perNote.className = 'share-per-amount';
        perNote.textContent = `${fmtMoney(perAmount)}/người`;
        tdShare.appendChild(perNote);
      }
    }

    const tdBill = document.createElement('td');
    if (e.receipt) {
      const thumbBtn = document.createElement('button');
      thumbBtn.type = 'button';
      thumbBtn.className = 'bill-thumb-btn';
      thumbBtn.title = 'Xem bill';
      const thumbImg = document.createElement('img');
      thumbImg.src = e.receipt;
      thumbImg.alt = 'Bill';
      thumbBtn.appendChild(thumbImg);
      thumbBtn.addEventListener('click', () => openBillDialog(e.receipt));
      tdBill.appendChild(thumbBtn);
    } else {
      tdBill.textContent = '—';
    }

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
        approveBtn.addEventListener(
          'click',
          withGuard(approveBtn, async () => {
            try {
              clearError();
              await optimisticMutate(
                () => {
                  const exp = state.expenses.find((x) => x.id === e.id);
                  if (exp) exp.status = 'approved';
                },
                () => api(`/api/expense-requests/${e.id}/approve`, { method: 'POST' })
              );
            } catch (err) {
              showError(err.message);
            }
          })
        );

        const rejectBtn = document.createElement('button');
        rejectBtn.className = 'danger';
        rejectBtn.textContent = 'Từ chối';
        rejectBtn.addEventListener(
          'click',
          withGuard(rejectBtn, async () => {
            try {
              clearError();
              await optimisticMutate(
                () => {
                  const exp = state.expenses.find((x) => x.id === e.id);
                  if (exp) exp.status = 'rejected';
                },
                () => api(`/api/expense-requests/${e.id}/reject`, { method: 'POST' })
              );
            } catch (err) {
              showError(err.message);
            }
          })
        );

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
      delBtn.addEventListener(
        'click',
        withGuard(delBtn, async () => {
          const ok = await showConfirm('Xoá khoản chi này?', { okLabel: 'Xoá', danger: true });
          if (!ok) return;
          try {
            clearError();
            await optimisticMutate(
              () => {
                state.expenses = state.expenses.filter((x) => x.id !== e.id);
              },
              () => api(`/api/expenses/${e.id}`, { method: 'DELETE' })
            );
            if (editingExpenseId === e.id) resetExpenseForm();
          } catch (err) {
            showError(err.message);
          }
        })
      );

      actionsWrap.appendChild(editBtn);
      actionsWrap.appendChild(delBtn);
      tdActions.appendChild(actionsWrap);
    }

    tr.append(tdDate, tdDesc, tdAmount, tdPayer, tdShare, tdBill, tdStatus, tdActions);
    tbody.appendChild(tr);
  }
}

// ---- Tổng kết ----

function renderSummary() {
  const ul = $('#summaryList');
  ul.innerHTML = '';

  if (state.summary.length === 0) {
    ul.innerHTML = '<li class="empty-msg">Chưa có dữ liệu</li>';
    return;
  }

  for (const s of state.summary) {
    const li = document.createElement('li');
    const balClass = s.balance > 0 ? 'positive' : s.balance < 0 ? 'negative' : '';
    li.innerHTML = `
      <div class="summary-row-top">
        <span class="summary-name">${escapeHtml(s.name)}</span>
        <span class="amount ${balClass}">${s.balance >= 0 ? '+' : ''}${fmtMoney(s.balance)}</span>
      </div>
      <div class="summary-row-sub">
        Đã trả hộ ${fmtMoney(s.totalPaid)} · Phải chịu ${fmtMoney(s.totalOwed)}
      </div>
    `;
    ul.appendChild(li);
  }
}

// ---- Ai nợ ai ----

const DEBT_LIST_LIMIT = 6;
let debtListExpanded = false;

function renderDebts() {
  const ul = $('#debtList');
  const emptyMsg = $('#debtEmpty');
  ul.innerHTML = '';

  if (state.debts.length === 0) {
    emptyMsg.hidden = false;
    return;
  }
  emptyMsg.hidden = true;

  const visibleDebts = debtListExpanded ? state.debts : state.debts.slice(0, DEBT_LIST_LIMIT);

  for (const d of visibleDebts) {
    const li = document.createElement('li');

    const text = document.createElement('span');
    text.className = 'debt-text';
    text.innerHTML = `${escapeHtml(nameOf(d.fromId))} nợ <b>${escapeHtml(
      nameOf(d.toId)
    )}</b>: <b>${fmtMoney(d.amount)}</b>`;

    li.appendChild(text);

    const actions = document.createElement('div');
    actions.className = 'debt-actions';

    const settleBtn = document.createElement('button');
    settleBtn.className = 'secondary';
    settleBtn.textContent = state.isAdmin ? 'Ghi đã trả' : 'Báo đã trả';
    settleBtn.addEventListener(
      'click',
      withGuard(settleBtn, async () => {
        const amount = Math.round(d.amount);
        const confirmed = await showConfirm(
          state.isAdmin
            ? `Ghi nhận "${nameOf(d.fromId)}" đã trả "${nameOf(d.toId)}" ${fmtMoney(amount)}?`
            : `Gửi yêu cầu xác nhận "${nameOf(d.fromId)}" đã trả "${nameOf(d.toId)}" ${fmtMoney(amount)}? Admin sẽ duyệt trước khi số dư cập nhật.`,
          { okLabel: state.isAdmin ? 'Ghi nhận' : 'Gửi yêu cầu' }
        );
        if (!confirmed) return;
        const date = todayStr();
        const endpoint = state.isAdmin ? '/api/settlements' : '/api/settlement-requests';
        const status = state.isAdmin ? 'approved' : 'pending';
        try {
          clearError();
          await optimisticMutate(
            () => {
              state.settlements.unshift({ id: `temp-${Date.now()}`, fromId: d.fromId, toId: d.toId, amount, date, status });
            },
            () =>
              api(endpoint, {
                method: 'POST',
                body: JSON.stringify({ fromId: d.fromId, toId: d.toId, amount, date }),
              })
          );
          if (!state.isAdmin) {
            showToast('Đã gửi yêu cầu, chờ admin duyệt.');
          }
        } catch (e) {
          showError(e.message);
        }
      })
    );

    actions.appendChild(settleBtn);
    li.appendChild(actions);

    ul.appendChild(li);
  }

  if (state.debts.length > DEBT_LIST_LIMIT) {
    const li = document.createElement('li');
    li.className = 'debt-toggle';
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'secondary';
    toggleBtn.textContent = debtListExpanded ? 'Thu gọn' : `Xem thêm (${state.debts.length - DEBT_LIST_LIMIT})`;
    toggleBtn.addEventListener('click', () => {
      debtListExpanded = !debtListExpanded;
      renderDebts();
    });
    li.appendChild(toggleBtn);
    ul.appendChild(li);
  }
}

// ---- Thanh toán ----

function filterSettlements(list) {
  return list.filter((s) => {
    if (settlementFilters.fromId && s.fromId !== settlementFilters.fromId) return false;
    if (settlementFilters.toId && s.toId !== settlementFilters.toId) return false;
    if (settlementFilters.status && s.status !== settlementFilters.status) return false;
    if (settlementFilters.from && s.date < settlementFilters.from) return false;
    if (settlementFilters.to && s.date > settlementFilters.to) return false;
    return true;
  });
}

function renderSettlementTable() {
  populateMemberFilterSelect($('#settlementFilterFromMember'), settlementFilters.fromId, 'Tất cả người trả nợ');
  populateMemberFilterSelect($('#settlementFilterToMember'), settlementFilters.toId, 'Tất cả người nhận');

  const tbody = $('#settlementTableBody');
  tbody.innerHTML = '';
  const filtered = filterSettlements(state.settlements).sort(byDateNewestFirst);

  settlementPage = renderPagination($('#settlementPagination'), {
    total: filtered.length,
    page: settlementPage,
    pageSize: PAGE_SIZE,
    onChange: (p) => {
      settlementPage = p;
      renderSettlementTable();
    },
  });
  const pageItems = filtered.slice((settlementPage - 1) * PAGE_SIZE, settlementPage * PAGE_SIZE);

  if (pageItems.length === 0) {
    const tr = document.createElement('tr');
    const msg = state.settlements.length === 0 ? 'Chưa có thanh toán nào' : 'Không có thanh toán nào khớp bộ lọc';
    tr.innerHTML = `<td colspan="6" class="empty-msg">${msg}</td>`;
    tbody.appendChild(tr);
    return;
  }

  for (const s of pageItems) {
    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.textContent = s.date;
    const tdFrom = document.createElement('td');
    tdFrom.textContent = nameOf(s.fromId);
    const tdTo = document.createElement('td');
    tdTo.textContent = nameOf(s.toId);
    const tdAmount = document.createElement('td');
    tdAmount.className = 'amount';
    tdAmount.textContent = fmtMoney(s.amount);

    const tdStatus = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `status-badge ${s.status}`;
    badge.textContent = STATUS_LABEL[s.status] || s.status;
    tdStatus.appendChild(badge);

    const tdActions = document.createElement('td');
    if (state.isAdmin && s.status === 'pending') {
      const wrap = document.createElement('div');
      wrap.className = 'row-actions';

      const approveBtn = document.createElement('button');
      approveBtn.textContent = 'Duyệt';
      approveBtn.addEventListener(
        'click',
        withGuard(approveBtn, async () => {
          try {
            clearError();
            await optimisticMutate(
              () => {
                const st = state.settlements.find((x) => x.id === s.id);
                if (st) st.status = 'approved';
              },
              () => api(`/api/settlement-requests/${s.id}/approve`, { method: 'POST' })
            );
          } catch (err) {
            showError(err.message);
          }
        })
      );

      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'danger';
      rejectBtn.textContent = 'Từ chối';
      rejectBtn.addEventListener(
        'click',
        withGuard(rejectBtn, async () => {
          try {
            clearError();
            await optimisticMutate(
              () => {
                const st = state.settlements.find((x) => x.id === s.id);
                if (st) st.status = 'rejected';
              },
              () => api(`/api/settlement-requests/${s.id}/reject`, { method: 'POST' })
            );
          } catch (err) {
            showError(err.message);
          }
        })
      );

      wrap.appendChild(approveBtn);
      wrap.appendChild(rejectBtn);
      tdActions.appendChild(wrap);
    }

    tr.append(tdDate, tdFrom, tdTo, tdAmount, tdStatus, tdActions);
    tbody.appendChild(tr);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---- Xoá sạch dữ liệu ----

$('#resetAllBtn').addEventListener(
  'click',
  withGuard($('#resetAllBtn'), async () => {
    const confirmed = await showConfirm(
      'Xoá sạch TOÀN BỘ khoản chi và lịch sử thanh toán?\n' +
        'Danh sách thành viên vẫn được giữ lại. Thao tác này KHÔNG THỂ hoàn tác.',
      { okLabel: 'Tiếp tục', danger: true }
    );
    if (!confirmed) return;

    const typed = await showPrompt('Gõ "XOA" (không dấu) để xác nhận:');
    if (!typed || typed.trim().toUpperCase() !== 'XOA') return;

    try {
      clearError();
      await optimisticMutate(
        () => {
          state.expenses = [];
          state.settlements = [];
        },
        () => api('/api/reset', { method: 'POST' })
      );
      resetExpenseForm();
      showToast('Đã xoá sạch dữ liệu chi tiêu. Danh sách thành viên vẫn được giữ nguyên.');
    } catch (e) {
      showError(e.message);
    }
  })
);

// ---- Xem ảnh bill (zoom + kéo-giữ-thả để di chuyển) ----

let billZoom = 1;

function setBillZoom(zoom) {
  const img = $('#billImage');
  if (!img.naturalWidth) return;
  // Làm tròn 2 chữ số để tránh trôi số thập phân khi cộng dồn nhiều lần.
  billZoom = Math.round(Math.min(4, Math.max(0.25, zoom)) * 100) / 100;
  img.style.width = `${img.naturalWidth * billZoom}px`;
  img.style.height = `${img.naturalHeight * billZoom}px`;
}

function openBillDialog(src) {
  const dialog = $('#billViewDialog');
  const img = $('#billImage');
  const wrap = $('#billImageWrap');
  img.style.width = '';
  img.style.height = '';
  dialog.showModal();
  img.onload = () => {
    // Mặc định thu vừa khung xem (không phóng to ảnh nhỏ hơn khung).
    const fit = Math.min(1, wrap.clientWidth / img.naturalWidth, wrap.clientHeight / img.naturalHeight) || 1;
    setBillZoom(fit);
  };
  img.src = src;
}

$('#billCloseBtn').addEventListener('click', () => $('#billViewDialog').close());

$('#billImageWrap').addEventListener(
  'wheel',
  (ev) => {
    ev.preventDefault();
    setBillZoom(billZoom + (ev.deltaY < 0 ? 0.15 : -0.15));
  },
  { passive: false }
);

// Kéo-giữ-thả bằng chuột để di chuyển ảnh khi đã zoom. Phải chặn hành vi kéo-ảnh
// mặc định của trình duyệt (native image drag) — nếu không, mousemove sẽ ngừng
// bắn giữa chừng ngay khi trình duyệt tự chuyển sang chế độ kéo-thả file ảnh.
(() => {
  const wrap = $('#billImageWrap');
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startScrollX = 0;
  let startScrollY = 0;

  wrap.addEventListener('mousedown', (ev) => {
    ev.preventDefault();
    dragging = true;
    wrap.classList.add('dragging');
    startX = ev.clientX;
    startY = ev.clientY;
    startScrollX = wrap.scrollLeft;
    startScrollY = wrap.scrollTop;
  });
  window.addEventListener('mousemove', (ev) => {
    if (!dragging) return;
    wrap.scrollLeft = startScrollX - (ev.clientX - startX);
    wrap.scrollTop = startScrollY - (ev.clientY - startY);
  });
  window.addEventListener('mouseup', () => {
    dragging = false;
    wrap.classList.remove('dragging');
  });
})();

// ---- Bộ lọc bảng khoản chi ----

$('#expenseFilterQ').addEventListener('input', () => {
  expenseFilters.q = $('#expenseFilterQ').value;
  expensePage = 1;
  renderExpenseTable();
});
$('#expenseFilterPayer').addEventListener('change', () => {
  expenseFilters.payerId = $('#expenseFilterPayer').value;
  expensePage = 1;
  renderExpenseTable();
});
$('#expenseFilterShareMember').addEventListener('change', () => {
  expenseFilters.shareMemberId = $('#expenseFilterShareMember').value;
  expensePage = 1;
  renderExpenseTable();
});
$('#expenseFilterStatus').addEventListener('change', () => {
  expenseFilters.status = $('#expenseFilterStatus').value;
  expensePage = 1;
  renderExpenseTable();
});
$('#expenseFilterFrom').addEventListener('change', () => {
  expenseFilters.from = $('#expenseFilterFrom').value;
  expensePage = 1;
  renderExpenseTable();
});
$('#expenseFilterTo').addEventListener('change', () => {
  expenseFilters.to = $('#expenseFilterTo').value;
  expensePage = 1;
  renderExpenseTable();
});
$('#expenseFilterReset').addEventListener('click', () => {
  expenseFilters = { q: '', payerId: '', shareMemberId: '', status: '', from: '', to: '' };
  expensePage = 1;
  $('#expenseFilterQ').value = '';
  $('#expenseFilterStatus').value = '';
  $('#expenseFilterFrom').value = '';
  $('#expenseFilterTo').value = '';
  renderExpenseTable();
});

// ---- Bộ lọc bảng thanh toán ----

$('#settlementFilterFromMember').addEventListener('change', () => {
  settlementFilters.fromId = $('#settlementFilterFromMember').value;
  settlementPage = 1;
  renderSettlementTable();
});
$('#settlementFilterToMember').addEventListener('change', () => {
  settlementFilters.toId = $('#settlementFilterToMember').value;
  settlementPage = 1;
  renderSettlementTable();
});
$('#settlementFilterStatus').addEventListener('change', () => {
  settlementFilters.status = $('#settlementFilterStatus').value;
  settlementPage = 1;
  renderSettlementTable();
});
$('#settlementFilterFrom').addEventListener('change', () => {
  settlementFilters.from = $('#settlementFilterFrom').value;
  settlementPage = 1;
  renderSettlementTable();
});
$('#settlementFilterTo').addEventListener('change', () => {
  settlementFilters.to = $('#settlementFilterTo').value;
  settlementPage = 1;
  renderSettlementTable();
});
$('#settlementFilterReset').addEventListener('click', () => {
  settlementFilters = { fromId: '', toId: '', status: '', from: '', to: '' };
  settlementPage = 1;
  $('#settlementFilterStatus').value = '';
  $('#settlementFilterFrom').value = '';
  $('#settlementFilterTo').value = '';
  renderSettlementTable();
});

loadState().catch((e) => showError(e.message));
