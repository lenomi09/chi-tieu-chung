export type RequestStatus = 'approved' | 'pending' | 'rejected'

export interface Member {
  id: string
  name: string
}

export interface SplitItemRecord {
  name: string
  amount: number
  memberIds: string[]
}

/** Danh sách món gốc của "Chia theo món" — chỉ để hiện lại UI khi mở sửa, không dùng để tính tiền (shareAmounts mới là nguồn số liệu thật). */
export interface SplitItemsData {
  items: SplitItemRecord[]
  remainingMemberIds: string[]
}

export interface Expense {
  id: string
  date: string
  description: string
  amount: number
  payerId: string
  status: RequestStatus
  /** Ảnh bill (nếu có) không kèm sẵn ở đây — tải riêng qua api.getExpenseReceipt(id) khi cần xem. */
  hasReceipt: boolean
  shareMemberIds: string[]
  shareAmounts: Record<string, number> | null
  splitItems: SplitItemsData | null
}

export interface Settlement {
  id: string
  date: string
  fromId: string
  toId: string
  amount: number
  status: RequestStatus
}

export interface MemberSummary {
  id: string
  name: string
  totalPaid: number
  totalOwed: number
  balance: number
}

export interface Debt {
  fromId: string
  toId: string
  amount: number
}

export interface AppState {
  isAdmin: boolean
  members: Member[]
  expenses: Expense[]
  settlements: Settlement[]
  summary: MemberSummary[]
  debts: Debt[]
}

export interface ExpensePayload {
  date: string
  description: string
  amount: number
  payerId: string
  shareMemberIds: string[]
  shareAmounts: Record<string, number> | null
  receipt: string | null
  splitItems: SplitItemsData | null
}

export interface SettlementPayload {
  date: string
  fromId: string
  toId: string
  amount: number
}
