'use strict';

// Validate + chuẩn hoá dữ liệu khoản chi trước khi ghi DB. Logic giữ NGUYÊN Y
// HỆT bản gốc (server.js cũ) — chỉ chuyển vị trí để routes/expenses.js không
// phải tự validate tay.

const MAX_RECEIPT_LENGTH = 4 * 1024 * 1024; // ~4MB chuỗi base64
const MAX_SPLIT_ITEMS_LENGTH = 20 * 1024; // dư sức cho vài chục món

// Chia riêng từng người (thay vì chia đều): shareAmounts là { memberId: số tiền }.
// Không bắt buộc — không gửi (hoặc gửi rỗng) thì coi như chia đều như cũ.
function validateShareAmounts(shareAmounts, validShareIds, amount) {
  if (shareAmounts === undefined || shareAmounts === null) return null;
  if (typeof shareAmounts !== 'object' || Array.isArray(shareAmounts)) {
    return 'Dữ liệu chia riêng không hợp lệ';
  }
  const keys = Object.keys(shareAmounts);
  if (keys.length === 0) return null;

  const sameSet = keys.length === validShareIds.length && validShareIds.every((id) => keys.includes(id));
  if (!sameSet) {
    return 'Danh sách chia riêng phải khớp đúng với danh sách người được chọn ở trên';
  }

  let sum = 0;
  for (const id of keys) {
    const v = Number(shareAmounts[id]);
    if (!Number.isFinite(v) || v <= 0) {
      return 'Số tiền chia riêng cho mỗi người phải lớn hơn 0';
    }
    sum += v;
  }
  if (Math.round(sum) !== Math.round(amount)) {
    return 'Tổng số tiền chia riêng phải bằng đúng số tiền khoản chi';
  }
  return null;
}

// Đã validate hợp lệ (hoặc null) ở validateShareAmounts rồi — hàm này chỉ chuẩn
// hoá về dạng lưu DB: null nếu không chia riêng, object số nguyên nếu có.
function normalizeShareAmounts(shareAmounts) {
  if (!shareAmounts || typeof shareAmounts !== 'object' || Object.keys(shareAmounts).length === 0) {
    return null;
  }
  const out = {};
  for (const [id, v] of Object.entries(shareAmounts)) {
    out[id] = Math.round(Number(v));
  }
  return out;
}

function validateExpenseInput(body, members) {
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Số tiền phải lớn hơn 0';
  }
  if (!body.payerId || !members.some((m) => m.id === body.payerId)) {
    return 'Vui lòng chọn người trả hợp lệ';
  }
  const shareMemberIds = Array.isArray(body.shareMemberIds) ? body.shareMemberIds : [];
  const validShareIds = shareMemberIds.filter((id) => members.some((m) => m.id === id));
  if (validShareIds.length === 0) {
    return 'Vui lòng chọn ít nhất 1 người tham gia chia khoản chi này';
  }
  if (!body.date) {
    return 'Vui lòng chọn ngày';
  }
  return validateShareAmounts(body.shareAmounts, validShareIds, amount);
}

function validateReceipt(receipt) {
  if (receipt === null || receipt === undefined || receipt === '') return null;
  if (typeof receipt !== 'string' || !receipt.startsWith('data:image/')) {
    return 'Ảnh bill không hợp lệ';
  }
  if (receipt.length > MAX_RECEIPT_LENGTH) {
    return 'Ảnh bill quá lớn';
  }
  return null;
}

// Danh sách món gốc của "Chia theo món" — chỉ dùng để hiện lại UI khi mở sửa
// (xem client ExpenseForm.tsx), KHÔNG dùng để tính tiền (shareAmounts vẫn là
// nguồn số liệu thật, đã validate riêng ở validateShareAmounts) nên chỉ cần
// kiểm tra hình dạng dữ liệu cơ bản + giới hạn kích thước, không cần khớp số.
function validateSplitItems(splitItems) {
  if (splitItems === null || splitItems === undefined) return null;
  if (typeof splitItems !== 'object' || Array.isArray(splitItems)) {
    return 'Dữ liệu danh sách món không hợp lệ';
  }
  if (!Array.isArray(splitItems.items) || !Array.isArray(splitItems.remainingMemberIds)) {
    return 'Dữ liệu danh sách món không hợp lệ';
  }
  let str;
  try {
    str = JSON.stringify(splitItems);
  } catch {
    return 'Dữ liệu danh sách món không hợp lệ';
  }
  if (str.length > MAX_SPLIT_ITEMS_LENGTH) {
    return 'Danh sách món quá lớn';
  }
  return null;
}

// Ghép sẵn payload để routes/expenses.js dùng chung cho cả 3 chỗ tạo/sửa
// khoản chi (admin thêm thẳng, người khác gửi yêu cầu, admin sửa).
function buildExpensePayload(body, members) {
  return {
    date: body.date,
    description: (body.description || '').trim(),
    amount: Math.round(Number(body.amount)),
    payerId: body.payerId,
    shareMemberIds: body.shareMemberIds.filter((id) => members.some((m) => m.id === id)),
    shareAmounts: normalizeShareAmounts(body.shareAmounts),
    receipt: body.receipt || null,
    splitItems: body.splitItems || null,
  };
}

module.exports = {
  validateExpenseInput,
  validateReceipt,
  validateSplitItems,
  normalizeShareAmounts,
  buildExpensePayload,
};
