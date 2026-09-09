export type RequestStatus = 'approved' | 'pending' | 'rejected'

export interface Member {
  id: string
  name: string
}

export interface Expense {
  id: string
  date: string
  description: string
  amount: number
  payerId: string
  status: RequestStatus
  receipt: string | null
  shareMemberIds: string[]
  shareAmounts: Record<string, number> | null
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
}

export interface SettlementPayload {
  date: string
  fromId: string
  toId: string
  amount: number
}
