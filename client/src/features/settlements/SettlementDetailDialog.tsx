import { Loader2 } from 'lucide-react'
import * as React from 'react'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { useAppState } from '@/context/AppStateContext'
import { api } from '@/lib/api'
import { formatCurrency, formatDate, formatDateOnly } from '@/lib/format'
import type { Settlement, SettlementExplain } from '@/lib/types'

interface SettlementDetailDialogProps {
  settlement: Settlement | null
  memberName: Map<string, string>
  isAdmin: boolean
  onOpenChange: (open: boolean) => void
}

function SettlementDetailDialog({ settlement, memberName, isAdmin, onOpenChange }: SettlementDetailDialogProps) {
  const { mutate } = useAppState()
  const [explain, setExplain] = React.useState<SettlementExplain | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [fixing, setFixing] = React.useState(false)
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
              <DialogDescription>
                {formatCurrency(settlement.amount)} · Ngày duyệt {formatDate(settlement.date)}
              </DialogDescription>
            </DialogHeader>

            {loading ? (
              <div className="flex h-24 items-center justify-center text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              </div>
            ) : !explain ? (
              <EmptyState title="Không tải được chi tiết" description="Thử mở lại sau." />
            ) : (
              <div className="flex flex-col gap-3 text-sm">
                {(() => {
                  const expected = explain.debtBeforeAToB > 0 ? explain.debtBeforeAToB : explain.debtBeforeBToA
                  const diff = explain.paidAmount - expected
                  const matches = Math.abs(diff) <= 1
                  const handleFix = async () => {
                    if (!settlementId) return
                    setFixing(true)
                    try {
                      await mutate(() => api.fixSettlementAmount(settlementId))
                      onOpenChange(false)
                    } catch (err) {
                      console.error(err)
                    } finally {
                      setFixing(false)
                    }
                  }
                  return matches ? (
                    <Alert variant="success">
                      <AlertTitle>Khớp đúng số nợ ({formatCurrency(expected)})</AlertTitle>
                    </Alert>
                  ) : (
                    <Alert variant="warning">
                      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <AlertTitle>
                            {diff > 0 ? `Trả dư ${formatCurrency(diff)}` : `Trả thiếu ${formatCurrency(-diff)}`}
                          </AlertTitle>
                          <p className="text-xs opacity-90">Nợ thực tế lúc đó: {formatCurrency(expected)}</p>
                        </div>
                        {isAdmin && (
                          <Button type="button" size="sm" variant="outline" loading={fixing} onClick={handleFix}>
                            Sửa đúng số tiền
                          </Button>
                        )}
                      </div>
                    </Alert>
                  )
                })()}

                <div className="flex flex-col gap-1.5">
                  <p className="text-xs text-muted-foreground">
                    Tính nợ từ{' '}
                    {explain.sinceDate
                      ? formatDate(explain.sinceDate)
                      : explain.items.length > 0
                        ? formatDateOnly(explain.items[0].date)
                        : formatDateOnly(settlement.effectiveAt || settlement.date)}{' '}
                    đến {formatDateOnly(settlement.effectiveAt || settlement.date)}
                    {settlement.effectiveAt && formatDateOnly(settlement.effectiveAt) !== formatDate(settlement.date) && (
                      <span className="text-warning"> (đã điều chỉnh)</span>
                    )}{' '}
                    · {explain.items.length === 0 ? 'không có khoản chi nào' : `${explain.items.length} khoản chi`}
                  </p>
                  {explain.items.length === 0 ? (
                    <p className="rounded-md border px-3 py-2 text-muted-foreground">
                      Số tiền trả lần này không ứng với khoản chi nào cả.
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
