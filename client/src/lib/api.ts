import type { AppState, ExpensePayload, SettlementPayload } from './types'

export class ApiError extends Error {}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })

  const text = await res.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
  }

  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : 'Có lỗi xảy ra, vui lòng thử lại'
    throw new ApiError(message)
  }

  return body as T
}

export const api = {
  getState: () => request<AppState>('/api/state'),

  // Lưu ý: 2 endpoint này KHÔNG trả về AppState như mọi mutation khác — chỉ
  // {ok:true}. Gọi refetch() ở AppStateContext sau khi login/logout thành công.
  login: (password: string) =>
    request<{ ok: true }>('/api/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => request<{ ok: true }>('/api/logout', { method: 'POST' }),

  addMember: (name: string) => request<AppState>('/api/members', { method: 'POST', body: JSON.stringify({ name }) }),
  renameMember: (id: string, name: string) =>
    request<AppState>(`/api/members/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  deleteMember: (id: string) => request<AppState>(`/api/members/${id}`, { method: 'DELETE' }),

  addExpense: (payload: ExpensePayload) =>
    request<AppState>('/api/expenses', { method: 'POST', body: JSON.stringify(payload) }),
  // Ảnh bill không kèm trong AppState nữa (nặng, xem server/lib/db.js) — tải
  // riêng khi người dùng thực sự bấm xem.
  getExpenseReceipt: (id: string) => request<{ receipt: string | null }>(`/api/expenses/${id}/receipt`),
  addExpenseRequest: (payload: ExpensePayload) =>
    request<AppState>('/api/expense-requests', { method: 'POST', body: JSON.stringify(payload) }),
  approveExpenseRequest: (id: string) => request<AppState>(`/api/expense-requests/${id}/approve`, { method: 'POST' }),
  rejectExpenseRequest: (id: string) => request<AppState>(`/api/expense-requests/${id}/reject`, { method: 'POST' }),
  updateExpense: (id: string, payload: ExpensePayload) =>
    request<AppState>(`/api/expenses/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteExpense: (id: string) => request<AppState>(`/api/expenses/${id}`, { method: 'DELETE' }),

  addSettlement: (payload: SettlementPayload) =>
    request<AppState>('/api/settlements', { method: 'POST', body: JSON.stringify(payload) }),
  addSettlementRequest: (payload: SettlementPayload) =>
    request<AppState>('/api/settlement-requests', { method: 'POST', body: JSON.stringify(payload) }),
  approveSettlementRequest: (id: string) =>
    request<AppState>(`/api/settlement-requests/${id}/approve`, { method: 'POST' }),
  rejectSettlementRequest: (id: string) =>
    request<AppState>(`/api/settlement-requests/${id}/reject`, { method: 'POST' }),

  reset: () => request<AppState>('/api/reset', { method: 'POST' }),
}
