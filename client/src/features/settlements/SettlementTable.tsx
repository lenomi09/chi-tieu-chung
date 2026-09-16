import { AlertTriangle, Check, Pencil, Trash2, X } from 'lucide-react'
import * as React from 'react'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { DatePicker } from '@/components/ui/date-picker'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAppState } from '@/context/AppStateContext'
import { api } from '@/lib/api'
import { dateToIso, formatCurrency, formatDate } from '@/lib/format'
import type { Member, RequestStatus, Settlement } from '@/lib/types'
import { SettlementDetailDialog } from './SettlementDetailDialog'

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

// Chỉ cho sửa NGÀY (xem lý do ở server/routes/settlements.js) — không cho sửa
// người trả/người nhận/số tiền, để giữ đúng nguyên tắc "số tiền luôn tự khớp
// đúng nợ lúc bấm Đã trả" (DebtRow.tsx), tránh mở lại đường gõ tay gây lệch số.
function EditSettlementDateDialog({
  settlement,
  onOpenChange,
}: {
  settlement: Settlement | null
  onOpenChange: (open: boolean) => void
}) {
  const { mutate } = useAppState()
  const [date, setDate] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    setDate(settlement?.date ?? '')
  }, [settlement])

  const handleSave = async () => {
    if (!settlement || !date) return
    setSaving(true)
    try {
      await mutate(() => api.updateSettlementDate(settlement.id, date))
      onOpenChange(false)
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!settlement} onOpenChange={onOpenChange}>
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
        {settlement && (
          <>
            <DialogHeader>
              <DialogTitle>Sửa ngày thanh toán</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <DatePicker value={date} onChange={setDate} placeholder="Chọn ngày" aria-label="Ngày thanh toán" />
              <Button type="button" loading={saving} disabled={!date} onClick={handleSave}>
                Lưu
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function SettlementRowActions({ settlement, isAdmin }: { settlement: Settlement; isAdmin: boolean }) {
  const { mutate } = useAppState()
  const confirm = useConfirm()
  const [busy, setBusy] = React.useState(false)
  const [editing, setEditing] = React.useState(false)

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
    <div className="flex items-center justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
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
        className="h-7 w-7"
        aria-label="Sửa ngày thanh toán"
        onClick={() => setEditing(true)}
      >
        <Pencil className="size-3.5" />
      </Button>
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
      <EditSettlementDateDialog settlement={editing ? settlement : null} onOpenChange={setEditing} />
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
  const [dateFrom, setDateFrom] = React.useState('')
  const [dateTo, setDateTo] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = React.useState(false)
  const [detailSettlement, setDetailSettlement] = React.useState<Settlement | null>(null)
  const { refetch } = useAppState()
  const confirm = useConfirm()
  const memberName = React.useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members])

  const mismatched = React.useMemo(() => settlements.filter((s) => s.matches === false), [settlements])

  const filtered = React.useMemo(
    () =>
      settlements.filter((s) => {
        if (fromFilter !== 'all' && s.fromId !== fromFilter) return false
        if (toFilter !== 'all' && s.toId !== toFilter) return false
        if (statusFilter !== 'all' && s.status !== statusFilter) return false
        if (dateFrom && s.date < dateFrom) return false
        if (dateTo && s.date > dateTo) return false
        return true
      }),
    [settlements, fromFilter, toFilter, statusFilter, dateFrom, dateTo]
  )
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  React.useEffect(() => {
    setPage(1)
    setSelectedIds(new Set())
  }, [fromFilter, toFilter, statusFilter, dateFrom, dateTo])

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

  const hasActiveFilter =
    fromFilter !== 'all' || toFilter !== 'all' || statusFilter !== 'all' || dateFrom !== '' || dateTo !== ''
  const clearFilters = () => {
    setFromFilter('all')
    setToFilter('all')
    setStatusFilter('all')
    setDateFrom('')
    setDateTo('')
  }

  return (
    <div className="flex flex-col gap-3">
      {mismatched.length > 0 && (
        <Alert variant="warning">
          <AlertTitle>{mismatched.length} khoản thanh toán chưa khớp số nợ — bấm vào để xem chi tiết</AlertTitle>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <DatePicker
            value={dateFrom}
            onChange={setDateFrom}
            placeholder="Từ ngày"
            aria-label="Từ ngày"
            disabled={dateTo ? (d) => dateToIso(d) > dateTo : undefined}
          />
          <DatePicker
            value={dateTo}
            onChange={setDateTo}
            placeholder="Đến ngày"
            aria-label="Đến ngày"
            disabled={dateFrom ? (d) => dateToIso(d) < dateFrom : undefined}
          />
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

        {hasActiveFilter && (
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            Xoá bộ lọc
          </Button>
        )}
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
        // Ẩn trên mobile (màn hẹp, tự tích từng dòng đã đủ dùng) — chỉ hiện
        // từ sm trở lên. pl-[13px] khớp đúng vị trí ô tích ở mỗi dòng bên
        // dưới: border (1px) + p-3 (12px) của khối dòng = 13px từ mép trái.
        <label className="hidden w-fit cursor-pointer items-center gap-1.5 py-1 pl-[13px] text-xs text-muted-foreground sm:flex">
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
        <>
          {/* Desktop/tablet: 1 hàng ngang, đủ rộng để không vỡ chữ. */}
          <div className="hidden flex-col gap-2 sm:flex">
            {pageItems.map((s) => (
              <div
                key={s.id}
                className="flex cursor-pointer items-start justify-between gap-2 rounded-lg border p-3 outline-none hover:bg-accent/40 focus-visible:bg-accent/40"
                role="button"
                tabIndex={0}
                onClick={() => setDetailSettlement(s)}
                onKeyDown={(ev) => {
                  if (ev.target !== ev.currentTarget) return
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault()
                    setDetailSettlement(s)
                  }
                }}
              >
                <div className="flex min-w-0 items-start gap-2">
                  {isAdmin && (
                    <Checkbox
                      className="mt-0.5"
                      checked={selectedIds.has(s.id)}
                      onCheckedChange={(v) => toggleSelected(s.id, v === true)}
                      onClick={(ev) => ev.stopPropagation()}
                      aria-label={`Chọn thanh toán ${memberName.get(s.fromId) ?? '?'} trả ${memberName.get(s.toId) ?? '?'}`}
                    />
                  )}
                  <div className="min-w-0">
                    <p className="break-words text-sm">
                      <span className="font-medium">{memberName.get(s.fromId) ?? '?'}</span> trả cho{' '}
                      <span className="font-medium">{memberName.get(s.toId) ?? '?'}</span>
                      {s.matches === false && (
                        <AlertTriangle
                          className="ml-1.5 inline size-3.5 align-text-top text-warning"
                          aria-label="Chưa khớp số nợ thực tế"
                        />
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">Ngày thanh toán: {formatDate(s.date)}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3" onClick={(ev) => ev.stopPropagation()}>
                  <span className="font-medium">{formatCurrency(s.amount)}</span>
                  <Badge variant={statusVariant[s.status]}>{statusLabel[s.status]}</Badge>
                  <SettlementRowActions settlement={s} isAdmin={isAdmin} />
                </div>
              </div>
            ))}
          </div>

          {/* Mobile: tách 2 hàng (tên+số tiền / ngày+trạng thái+thao tác) — dồn
              chung 1 hàng ở màn hẹp làm cột tên/ngày bị bóp, vỡ chữ. */}
          <div className="flex flex-col gap-2 sm:hidden">
            {pageItems.map((s) => (
              <div
                key={s.id}
                className="flex cursor-pointer flex-col gap-2 rounded-lg border p-3 outline-none hover:bg-accent/40 focus-visible:bg-accent/40"
                role="button"
                tabIndex={0}
                onClick={() => setDetailSettlement(s)}
                onKeyDown={(ev) => {
                  if (ev.target !== ev.currentTarget) return
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault()
                    setDetailSettlement(s)
                  }
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-2">
                    {isAdmin && (
                      <Checkbox
                        className="mt-0.5"
                        checked={selectedIds.has(s.id)}
                        onCheckedChange={(v) => toggleSelected(s.id, v === true)}
                        onClick={(ev) => ev.stopPropagation()}
                        aria-label={`Chọn thanh toán ${memberName.get(s.fromId) ?? '?'} trả ${memberName.get(s.toId) ?? '?'}`}
                      />
                    )}
                    <p className="break-words text-sm">
                      <span className="font-medium">{memberName.get(s.fromId) ?? '?'}</span> trả cho{' '}
                      <span className="font-medium">{memberName.get(s.toId) ?? '?'}</span>
                      {s.matches === false && (
                        <AlertTriangle
                          className="ml-1.5 inline size-3.5 align-text-top text-warning"
                          aria-label="Chưa khớp số nợ thực tế"
                        />
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 font-medium">{formatCurrency(s.amount)}</span>
                </div>

                <div className="flex items-end justify-between gap-2">
                  <div className="min-w-0 text-xs text-muted-foreground">
                    <p>Ngày thanh toán: {formatDate(s.date)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2" onClick={(ev) => ev.stopPropagation()}>
                    <Badge variant={statusVariant[s.status]}>{statusLabel[s.status]}</Badge>
                    <SettlementRowActions settlement={s} isAdmin={isAdmin} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
      <SettlementDetailDialog
        settlement={detailSettlement}
        memberName={memberName}
        isAdmin={isAdmin}
        onOpenChange={(open) => !open && setDetailSettlement(null)}
      />
    </div>
  )
}

export { SettlementTable }
