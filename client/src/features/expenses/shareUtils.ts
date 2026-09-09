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

export interface SplitItem {
  id: string
  name: string
  amountText: string
  memberIds: string[]
}

// "Chia theo món": vài món chỉ chia cho 1 nhóm nhỏ (vd 2-3 người ăn chung 1
// món), phần tiền còn lại (không thuộc món nào) chia đều cho 1 nhóm người tự
// chọn (mặc định là tất cả "Chia cho", nhưng có thể thu hẹp lại — vd 1 món
// chia đều cho tất cả + phần còn lại chỉ chia cho 1 vài người, không phải
// ai cũng chia phần còn lại). Trả về số tiền từng người phải chịu, làm tròn
// đến đồng và tổng luôn khớp đúng tổng tiền — không dùng số thập phân lẻ.
export function computeItemBasedShares(
  items: SplitItem[],
  remainingMemberIds: string[],
  shareMemberIds: string[],
  totalAmount: number
): Record<string, number> {
  const raw: Record<string, number> = {}
  for (const id of shareMemberIds) raw[id] = 0

  let itemsTotal = 0
  for (const item of items) {
    const amt = parseSumExpression(item.amountText)
    const members = item.memberIds.filter((id) => shareMemberIds.includes(id))
    if (amt <= 0 || members.length === 0) continue
    itemsTotal += amt
    const per = amt / members.length
    for (const id of members) raw[id] += per
  }

  const remaining = totalAmount - itemsTotal
  const validRemainingMembers = remainingMemberIds.filter((id) => shareMemberIds.includes(id))
  if (remaining > 0 && validRemainingMembers.length > 0) {
    const perRemaining = remaining / validRemainingMembers.length
    for (const id of validRemainingMembers) raw[id] += perRemaining
  }

  // Làm tròn xuống từng người rồi rải phần dư (do làm tròn) 1 đồng một cho
  // người có phần lẻ lớn nhất trước — đảm bảo tổng sau làm tròn luôn khớp
  // Math.round(totalAmount) như luật validate phía server yêu cầu.
  const floors: Record<string, number> = {}
  let flooredSum = 0
  const fracs: { id: string; frac: number }[] = []
  for (const id of shareMemberIds) {
    const v = raw[id]
    const f = Math.floor(v)
    floors[id] = f
    flooredSum += f
    fracs.push({ id, frac: v - f })
  }
  let leftover = Math.round(totalAmount) - flooredSum
  fracs.sort((a, b) => b.frac - a.frac)
  for (let i = 0; i < fracs.length && leftover > 0; i++) {
    floors[fracs[i].id] += 1
    leftover -= 1
  }
  return floors
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
