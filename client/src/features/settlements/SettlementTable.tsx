import { Check, Trash2, X } from 'lucide-react'
import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAppState } from '@/context/AppStateContext'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/format'
import type { Member, RequestStatus, Settlement } from '@/lib/types'

const PAGE_SIZE = 10

const statusLabel: Record<RequestStatus, string> = {
  approved: 'Đã duyệt',
  pending: 'Chờ duyệt',
  rejected: 'Từ chối',
}
const statusVariant: Record<RequestStatus, 'success' | 'warning' | 'destructive'> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'destructive',
}

function SettlementRowActions({ settlement, isAdmin }: { settlement: Settlement; isAdmin: boolean }) {
  const { mutate } = useAppState()
  const confirm = useConfirm()
  const [busy, setBusy] = React.useState(false)

  if (!isAdmin) return null

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

  return (
    <div className="flex items-center justify-end gap-1">
      {settlement.status === 'pending' && (
        <>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 hover:text-success"
            disabled={busy}
            aria-label="Duyệt thanh toán"
            onClick={() => run(() => mutate(() => api.approveSettlementRequest(settlement.id)))}
          >
            <Check className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 hover:text-destructive"
            disabled={busy}
            aria-label="Từ chối thanh toán"
            onClick={() => run(() => mutate(() => api.rejectSettlementRequest(settlement.id)))}
          >
            <X className="size-3.5" />
          </Button>
        </>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 hover:text-destructive"
        disabled={busy}
        aria-label="Xoá thanh toán"
        onClick={async () => {
          const ok = await confirm({
            title: 'Xoá thanh toán này?',
            description: `${formatCurrency(settlement.amount)}. Không thể hoàn tác.`,
            confirmLabel: 'Xoá',
            destructive: true,
          })
          if (!ok) return
          run(() => mutate(() => api.deleteSettlement(settlement.id)))
        }}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}

interface SettlementTableProps {
  settlements: Settlement[]
  members: Member[]
  isAdmin: boolean
}

function SettlementTable({ settlements, members, isAdmin }: SettlementTableProps) {
  const [fromFilter, setFromFilter] = React.useState('all')
  const [toFilter, setToFilter] = React.useState('all')
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = React.useState(false)
  const { refetch } = useAppState()
  const confirm = useConfirm()
  const memberName = React.useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members])

  const filtered = React.useMemo(
    () =>
      settlements.filter((s) => {
        if (fromFilter !== 'all' && s.fromId !== fromFilter) return false
        if (toFilter !== 'all' && s.toId !== toFilter) return false
        if (statusFilter !== 'all' && s.status !== statusFilter) return false
        return true
      }),
    [settlements, fromFilter, toFilter, statusFilter]
  )
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  React.useEffect(() => {
    setPage(1)
    setSelectedIds(new Set())
  }, [fromFilter, toFilter, statusFilter])

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const pageIdsAllSelected = pageItems.length > 0 && pageItems.every((s) => selectedIds.has(s.id))
  const toggleSelectAllOnPage = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const s of pageItems) {
        if (checked) next.add(s.id)
        else next.delete(s.id)
      }
      return next
    })
  }

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds)
    const ok = await confirm({
      title: `Xoá ${ids.length} thanh toán đã chọn?`,
      description: 'Không thể hoàn tác.',
      confirmLabel: 'Xoá tất cả',
      destructive: true,
    })
    if (!ok) return
    setBulkDeleting(true)
    try {
      // Xoá song song (mỗi thanh toán là 1 dòng độc lập, không tranh chấp
      // nhau) rồi tải lại state 1 lần — giống hệt cách làm ở ExpenseTable.
      await Promise.all(ids.map((id) => api.deleteSettlement(id)))
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
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Select value={fromFilter} onValueChange={setFromFilter}>
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
        <Select value={toFilter} onValueChange={setToFilter}>
          <SelectTrigger aria-label="Lọc theo người được trả">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả người được trả</SelectItem>
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
          <span className="text-sm font-medium">Đã chọn {selectedIds.size} thanh toán</span>
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

      {isAdmin && pageItems.length > 0 && (
        <label className="flex w-fit cursor-pointer items-center gap-1.5 px-1 text-xs text-muted-foreground">
          <Checkbox
            checked={pageIdsAllSelected}
            onCheckedChange={(v) => toggleSelectAllOnPage(v === true)}
            aria-label="Chọn tất cả thanh toán trong trang này"
          />
          Chọn tất cả trong trang này
        </label>
      )}

      {pageItems.length === 0 ? (
        <EmptyState title="Chưa có thanh toán nào" description="Ghi nhận thanh toán đầu tiên ở bên dưới." />
      ) : (
        <div className="flex flex-col gap-2">
          {pageItems.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
              <div className="flex min-w-0 items-center gap-2">
                {isAdmin && (
                  <Checkbox
                    checked={selectedIds.has(s.id)}
                    onCheckedChange={(v) => toggleSelected(s.id, v === true)}
                    aria-label={`Chọn thanh toán ${memberName.get(s.fromId) ?? '?'} trả ${memberName.get(s.toId) ?? '?'}`}
                  />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm">
                    <span className="font-medium">{memberName.get(s.fromId) ?? '?'}</span> trả cho{' '}
                    <span className="font-medium">{memberName.get(s.toId) ?? '?'}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDate(s.date)}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-medium">{formatCurrency(s.amount)}</span>
                <Badge variant={statusVariant[s.status]}>{statusLabel[s.status]}</Badge>
                <SettlementRowActions settlement={s} isAdmin={isAdmin} />
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
    </div>
  )
}

export { SettlementTable }
