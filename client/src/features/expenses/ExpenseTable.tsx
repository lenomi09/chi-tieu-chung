import { Check, ImageIcon, Loader2, Pencil, Trash2, X } from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Pagination } from '@/components/ui/pagination'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAppState } from '@/context/AppStateContext'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/format'
import type { Expense, Member } from '@/lib/types'
import { cn } from '@/lib/utils'
import { BillViewerDialog } from './BillViewerDialog'
import { ExpenseDetailDialog } from './ExpenseDetailDialog'
import { ExpenseForm } from './ExpenseForm'
import { ExpenseStatusBadge } from './ExpenseStatusBadge'

const PAGE_SIZE = 10

function ExpenseRowActions({ expense, isAdmin }: { expense: Expense; isAdmin: boolean }) {
  const { mutate } = useAppState()
  const confirm = useConfirm()
  const [editing, setEditing] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

  if (!isAdmin) return null

  return (
    <div className="flex items-center justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
      {expense.status === 'pending' && (
        <>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 hover:text-success"
            disabled={busy}
            aria-label="Duyệt khoản chi"
            onClick={() => run(() => mutate(() => api.approveExpenseRequest(expense.id)))}
          >
            <Check className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 hover:text-destructive"
            disabled={busy}
            aria-label="Từ chối khoản chi"
            onClick={() => run(() => mutate(() => api.rejectExpenseRequest(expense.id)))}
          >
            <X className="size-3.5" />
          </Button>
        </>
      )}
      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Sửa khoản chi" onClick={() => setEditing(true)}>
        <Pencil className="size-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 hover:text-destructive"
        disabled={busy}
        aria-label="Xoá khoản chi"
        onClick={async () => {
          const ok = await confirm({
            title: 'Xoá khoản chi này?',
            description: `"${expense.description}" — ${formatCurrency(expense.amount)}. Không thể hoàn tác.`,
            confirmLabel: 'Xoá',
            destructive: true,
          })
          if (!ok) return
          run(() => mutate(() => api.deleteExpense(expense.id)))
        }}
      >
        <Trash2 className="size-3.5" />
      </Button>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Sửa khoản chi</DialogTitle>
          </DialogHeader>
          <EditExpenseFormBridge expense={expense} onDone={() => setEditing(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Tách riêng để lấy danh sách members từ context state thay vì phải truyền qua nhiều lớp props.
function EditExpenseFormBridge({ expense, onDone }: { expense: Expense; onDone: () => void }) {
  const { state } = useAppState()
  return <ExpenseForm members={state?.members ?? []} expense={expense} mode="admin" onDone={onDone} />
}

interface ExpenseTableProps {
  expenses: Expense[]
  members: Member[]
  isAdmin: boolean
}

function ExpenseTable({ expenses, members, isAdmin }: ExpenseTableProps) {
  const [search, setSearch] = React.useState('')
  const [payerFilter, setPayerFilter] = React.useState('all')
  const [shareFilter, setShareFilter] = React.useState('all')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const [billSrc, setBillSrc] = React.useState<string | null>(null)
  const [billLoadingId, setBillLoadingId] = React.useState<string | null>(null)
  const [detailExpense, setDetailExpense] = React.useState<Expense | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = React.useState(false)
  const { refetch } = useAppState()
  const confirm = useConfirm()

  const memberName = React.useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members])

  // Ảnh bill tải riêng theo yêu cầu (không còn kèm sẵn trong state — xem
  // client/src/lib/types.ts). billLoadingId chỉ để hiện spinner đúng nút
  // đang tải, không chặn các nút khác.
  const openBill = async (expenseId: string) => {
    setBillLoadingId(expenseId)
    try {
      const { receipt } = await api.getExpenseReceipt(expenseId)
      setBillSrc(receipt)
    } finally {
      setBillLoadingId(null)
    }
  }

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return expenses.filter((e) => {
      if (q && !e.description.toLowerCase().includes(q)) return false
      if (payerFilter !== 'all' && e.payerId !== payerFilter) return false
      if (shareFilter !== 'all' && !e.shareMemberIds.includes(shareFilter)) return false
      if (statusFilter !== 'all' && e.status !== statusFilter) return false
      return true
    })
  }, [expenses, search, payerFilter, shareFilter, statusFilter])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  React.useEffect(() => {
    setPage(1)
    setSelectedIds(new Set())
  }, [search, payerFilter, shareFilter, statusFilter])

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const pageIdsAllSelected = pageItems.length > 0 && pageItems.every((e) => selectedIds.has(e.id))
  const toggleSelectAllOnPage = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const e of pageItems) {
        if (checked) next.add(e.id)
        else next.delete(e.id)
      }
      return next
    })
  }

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    const ok = await confirm({
      title: `Xoá ${ids.length} khoản chi đã chọn?`,
      description: 'Không thể hoàn tác.',
      confirmLabel: 'Xoá tất cả',
      destructive: true,
    })
    if (!ok) return
    setBulkDeleting(true)
    try {
      // Xoá song song (mỗi khoản chi là 1 dòng độc lập, không tranh chấp nhau) rồi
      // tải lại state 1 lần — nhanh hơn nhiều so với xoá tuần tự từng cái với DB ở xa.
      await Promise.all(ids.map((id) => api.deleteExpense(id)))
      await refetch()
      setSelectedIds(new Set())
    } catch (err) {
      console.error(err)
      await refetch()
    } finally {
      setBulkDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder="Tìm theo mô tả..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Tìm khoản chi theo mô tả"
        />
        <Select value={payerFilter} onValueChange={setPayerFilter}>
          <SelectTrigger aria-label="Lọc theo người trả">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả người trả</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={shareFilter} onValueChange={setShareFilter}>
          <SelectTrigger aria-label="Lọc theo người được chia">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả người được chia</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger aria-label="Lọc theo trạng thái">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            <SelectItem value="approved">Đã duyệt</SelectItem>
            <SelectItem value="pending">Chờ duyệt</SelectItem>
            <SelectItem value="rejected">Từ chối</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isAdmin && selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-lg border bg-accent/40 px-3 py-2">
          <span className="text-sm font-medium">Đã chọn {selectedIds.size} khoản chi</span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              Bỏ chọn
            </Button>
            <Button type="button" variant="destructive" size="sm" loading={bulkDeleting} onClick={handleBulkDelete}>
              {!bulkDeleting && <Trash2 />}
              Xoá đã chọn
            </Button>
          </div>
        </div>
      )}

      {pageItems.length === 0 ? (
        <EmptyState title="Không có khoản chi nào" description="Thử đổi bộ lọc hoặc thêm khoản chi mới." />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  {isAdmin && (
                    <th className="px-3 py-2">
                      <Checkbox
                        checked={pageIdsAllSelected}
                        onCheckedChange={(v) => toggleSelectAllOnPage(v === true)}
                        aria-label="Chọn tất cả khoản chi trong trang này"
                      />
                    </th>
                  )}
                  <th className="px-3 py-2 font-medium">Ngày</th>
                  <th className="px-3 py-2 font-medium">Mô tả</th>
                  <th className="px-3 py-2 text-right font-medium">Số tiền</th>
                  <th className="px-3 py-2 font-medium">Người trả</th>
                  <th className="px-3 py-2 font-medium">Trạng thái</th>
                  <th className="px-3 py-2 font-medium" />
                  <th className="px-3 py-2 text-right font-medium">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((e) => (
                  <tr
                    key={e.id}
                    className="cursor-pointer border-t outline-none hover:bg-accent/40 focus-visible:bg-accent/40"
                    tabIndex={0}
                    onClick={() => setDetailExpense(e)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault()
                        setDetailExpense(e)
                      }
                    }}
                  >
                    {isAdmin && (
                      <td className="px-3 py-2" onClick={(ev) => ev.stopPropagation()}>
                        <Checkbox
                          checked={selectedIds.has(e.id)}
                          onCheckedChange={(v) => toggleSelected(e.id, v === true)}
                          aria-label={`Chọn khoản chi "${e.description}"`}
                        />
                      </td>
                    )}
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{formatDate(e.date)}</td>
                    <td className="max-w-[240px] truncate px-3 py-2">{e.description}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium">{formatCurrency(e.amount)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{memberName.get(e.payerId) ?? '?'}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <ExpenseStatusBadge status={e.status} />
                    </td>
                    <td className="px-3 py-2" onClick={(ev) => ev.stopPropagation()}>
                      {e.hasReceipt && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          aria-label="Xem ảnh bill"
                          disabled={billLoadingId === e.id}
                          onClick={() => openBill(e.id)}
                        >
                          {billLoadingId === e.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <ImageIcon className="size-3.5" />
                          )}
                        </Button>
                      )}
                    </td>
                    <td className="px-3 py-2" onClick={(ev) => ev.stopPropagation()}>
                      <ExpenseRowActions expense={e} isAdmin={isAdmin} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2 md:hidden">
            {pageItems.map((e) => (
              <div
                key={e.id}
                className="cursor-pointer rounded-lg border p-3 outline-none hover:bg-accent/40 focus-visible:bg-accent/40"
                role="button"
                tabIndex={0}
                onClick={() => setDetailExpense(e)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault()
                    setDetailExpense(e)
                  }
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    {isAdmin && (
                      <Checkbox
                        className="mt-0.5"
                        checked={selectedIds.has(e.id)}
                        onCheckedChange={(v) => toggleSelected(e.id, v === true)}
                        onClick={(ev) => ev.stopPropagation()}
                        aria-label={`Chọn khoản chi "${e.description}"`}
                      />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{e.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(e.date)} · {memberName.get(e.payerId) ?? '?'} đã trả
                      </p>
                    </div>
                  </div>
                  <span className={cn('shrink-0 font-medium')}>{formatCurrency(e.amount)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ExpenseStatusBadge status={e.status} />
                    {e.hasReceipt && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        aria-label="Xem ảnh bill"
                        disabled={billLoadingId === e.id}
                        onClick={(ev) => {
                          ev.stopPropagation()
                          openBill(e.id)
                        }}
                      >
                        {billLoadingId === e.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <ImageIcon className="size-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                  <ExpenseRowActions expense={e} isAdmin={isAdmin} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
      <BillViewerDialog src={billSrc} onOpenChange={(open) => !open && setBillSrc(null)} />
      <ExpenseDetailDialog
        expense={detailExpense}
        memberName={memberName}
        onOpenChange={(open) => !open && setDetailExpense(null)}
        onViewReceipt={setBillSrc}
      />
    </div>
  )
}

export { ExpenseTable }
