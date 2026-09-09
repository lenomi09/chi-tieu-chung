'use strict';

function validateSettlementInput(body, members) {
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Số tiền phải lớn hơn 0';
  }
  if (!body.fromId || !members.some((m) => m.id === body.fromId)) {
    return 'Vui lòng chọn người trả nợ hợp lệ';
  }
  if (!body.toId || !members.some((m) => m.id === body.toId)) {
    return 'Vui lòng chọn người nhận hợp lệ';
  }
  if (body.fromId === body.toId) {
    return 'Người trả nợ và người nhận phải khác nhau';
  }
  if (!body.date) {
    return 'Vui lòng chọn ngày';
  }
  return null;
}

module.exports = { validateSettlementInput };
