import type { Expense } from '@/lib/types'

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
