import type { Expense } from '@/lib/types'

// Cho phép gõ biểu thức cộng dồn kiểu "7000+7000" trong ô chia riêng số tiền
// (vd mua 2 món cùng giá) — input number của trình duyệt coi "+" là ký tự
// không hợp lệ và tự trả value rỗng, nên ô này phải là type="text" và tự
// parse/cộng ở đây thay vì dựa vào Number(input.value).
export function parseSumExpression(raw: string): number {
  const total = raw
    .split('+')
    .map((part) => Number(part.trim().replace(/,/g, '')))
    .filter((n) => Number.isFinite(n))
    .reduce((sum, n) => sum + n, 0)
  return total
}

// Số tiền mỗi người chịu trong 1 khoản chi — khớp đúng resolveShares() ở
// server/lib/calc.js: dùng shareAmounts (chia riêng) nếu có, không thì chia
// đều amount cho shareMemberIds.
export function resolveShares(expense: Expense): { memberId: string; amount: number }[] {
  if (expense.shareAmounts) {
    return Object.entries(expense.shareAmounts).map(([memberId, amount]) => ({ memberId, amount }))
  }
  const count = expense.shareMemberIds.length
  if (count === 0) return []
  const per = expense.amount / count
  return expense.shareMemberIds.map((memberId) => ({ memberId, amount: per }))
}
