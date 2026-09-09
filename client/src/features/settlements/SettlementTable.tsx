import { Check, X } from 'lucide-react'
import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  const [busy, setBusy] = React.useState(false)

  if (!isAdmin || settlement.status !== 'pending') return null

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
    </div>
  )
}

interface SettlementTableProps {
  settlements: Settlement[]
  members: Member[]
  isAdmin: boolean
}

function SettlementTable({ settlements, members, isAdmin }: SettlementTableProps) {
  const [statusFilter, setStatusFilter] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const memberName = React.useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members])

  const filtered = React.useMemo(
    () => settlements.filter((s) => statusFilter === 'all' || s.status === statusFilter),
    [settlements, statusFilter]
  )
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  React.useEffect(() => {
    setPage(1)
  }, [statusFilter])

  return (
    <div className="flex flex-col gap-3">
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="sm:w-[160px]" aria-label="Lọc theo trạng thái">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả trạng thái</SelectItem>
          <SelectItem value="approved">Đã duyệt</SelectItem>
          <SelectItem value="pending">Chờ duyệt</SelectItem>
          <SelectItem value="rejected">Từ chối</SelectItem>
        </SelectContent>
      </Select>

      {pageItems.length === 0 ? (
        <EmptyState title="Chưa có thanh toán nào" description="Ghi nhận thanh toán đầu tiên ở bên dưới." />
      ) : (
        <div className="flex flex-col gap-2">
          {pageItems.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm">
                  <span className="font-medium">{memberName.get(s.fromId) ?? '?'}</span> trả cho{' '}
                  <span className="font-medium">{memberName.get(s.toId) ?? '?'}</span>
                </p>
                <p className="text-xs text-muted-foreground">{formatDate(s.date)}</p>
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
