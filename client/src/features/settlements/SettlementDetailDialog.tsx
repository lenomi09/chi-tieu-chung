import { Loader2 } from 'lucide-react'
import * as React from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { api } from '@/lib/api'
import { formatCurrency, formatDate, formatDateOnly } from '@/lib/format'
import type { Settlement, SettlementExplain } from '@/lib/types'

interface SettlementDetailDialogProps {
  settlement: Settlement | null
  memberName: Map<string, string>
  onOpenChange: (open: boolean) => void
}

function SettlementDetailDialog({ settlement, memberName, onOpenChange }: SettlementDetailDialogProps) {
  const [explain, setExplain] = React.useState<SettlementExplain | null>(null)
  const [loading, setLoading] = React.useState(false)
  const settlementId = settlement?.id

  React.useEffect(() => {
    setExplain(null)
    if (!settlementId) return
    let cancelled = false
    setLoading(true)
    api
      .explainSettlement(settlementId)
      .then((data) => {
        if (!cancelled) setExplain(data)
      })
      .catch(() => {
        if (!cancelled) setExplain(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [settlementId])

  const fromName = settlement ? (memberName.get(settlement.fromId) ?? '?') : ''
  const toName = settlement ? (memberName.get(settlement.toId) ?? '?') : ''

  return (
    <Dialog open={!!settlement} onOpenChange={onOpenChange}>
      <DialogContent>
        {settlement && (
          <>
            <DialogHeader>
              <DialogTitle className="pr-6">
                {fromName} trả cho {toName}
              </DialogTitle>
              <DialogDescription>{formatCurrency(settlement.amount)}</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Ngày duyệt thanh toán</p>
                <p className="font-medium">{formatDate(settlement.date)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tính nợ đến ngày</p>
                <p className="font-medium">
                  {formatDateOnly(settlement.effectiveAt || settlement.date)}
                  {settlement.effectiveAt && formatDateOnly(settlement.effectiveAt) !== formatDate(settlement.date) && (
                    <span className="ml-1 text-xs font-normal text-warning">(đã điều chỉnh)</span>
                  )}
                </p>
              </div>
            </div>

            {loading ? (
              <div className="flex h-24 items-center justify-center text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              </div>
            ) : !explain ? (
              <EmptyState title="Không tải được chi tiết" description="Thử mở lại sau." />
            ) : (
              <div className="flex flex-col gap-4 text-sm">
                {(() => {
                  const expected = explain.debtBeforeAToB > 0 ? explain.debtBeforeAToB : explain.debtBeforeBToA
                  const diff = explain.paidAmount - expected
                  const matches = Math.abs(diff) <= 1
                  return matches ? (
                    <Alert variant="success">
                      <AlertTitle>Khớp đúng số nợ</AlertTitle>
                    </Alert>
                  ) : (
                    <Alert variant="warning">
                      <AlertTitle>{diff > 0 ? `Trả dư ${formatCurrency(diff)}` : `Trả thiếu ${formatCurrency(-diff)}`}</AlertTitle>
                      <AlertDescription>
                        So với nợ thực tế ({formatCurrency(expected)}) ngay trước khi tất toán.
                      </AlertDescription>
                    </Alert>
                  )
                })()}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Nợ trước khi tất toán</p>
                    <p className="font-semibold">
                      {explain.debtBeforeAToB > 0
                        ? `${fromName} nợ ${toName} ${formatCurrency(explain.debtBeforeAToB)}`
                        : explain.debtBeforeBToA > 0
                          ? `${toName} nợ ${fromName} ${formatCurrency(explain.debtBeforeBToA)}`
                          : 'Không ai nợ ai'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Đã trả</p>
                    <p className="font-semibold">{formatCurrency(explain.paidAmount)}</p>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <p className="text-xs text-muted-foreground">
                    Khoản chi được tất toán ({explain.items.length === 0 ? 'không có' : `${explain.items.length} khoản`}
                    )
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Tính nợ từ ngày{' '}
                    <span className="font-medium text-foreground">
                      {explain.sinceDate ? formatDate(explain.sinceDate) : 'lúc bắt đầu'}
                    </span>{' '}
                    đến ngày{' '}
                    <span className="font-medium text-foreground">
                      {formatDateOnly(settlement.effectiveAt || settlement.date)}
                    </span>
                  </p>
                  {explain.items.length === 0 ? (
                    <p className="rounded-md border px-3 py-2 text-muted-foreground">
                      Không có khoản chi nào — số tiền trả lần này coi như dư/không cần thiết.
                    </p>
                  ) : (
                    <div className="flex flex-col divide-y rounded-md border">
                      {explain.items.map((item) => (
                        <div key={item.expenseId} className="flex items-center justify-between gap-2 px-3 py-1.5">
                          <div className="min-w-0">
                            <p className="truncate">{item.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(item.date)} · {memberName.get(item.ower) ?? '?'} chịu phần này
                            </p>
                          </div>
                          <span className="shrink-0 font-medium">{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export { SettlementDetailDialog }
