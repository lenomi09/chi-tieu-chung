import { Loader2 } from 'lucide-react'
import * as React from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/format'
import type { Debt, DebtExplain } from '@/lib/types'

interface DebtDetailDialogProps {
  debt: Debt | null
  memberName: Map<string, string>
  onOpenChange: (open: boolean) => void
}

// Bấm vào 1 dòng "ai nợ ai" để xem khoản nợ đó gồm đúng những khoản chi nào,
// tính từ lần tất toán gần nhất giữa 2 người (hoặc từ đầu) tới hiện tại.
function DebtDetailDialog({ debt, memberName, onOpenChange }: DebtDetailDialogProps) {
  const [explain, setExplain] = React.useState<DebtExplain | null>(null)
  const [loading, setLoading] = React.useState(false)
  const fromId = debt?.fromId
  const toId = debt?.toId

  React.useEffect(() => {
    setExplain(null)
    if (!fromId || !toId) return
    let cancelled = false
    setLoading(true)
    api
      .explainDebt(fromId, toId)
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
  }, [fromId, toId])

  const fromName = debt ? (memberName.get(debt.fromId) ?? '?') : ''
  const toName = debt ? (memberName.get(debt.toId) ?? '?') : ''

  return (
    <Dialog open={!!debt} onOpenChange={onOpenChange}>
      <DialogContent>
        {debt && (
          <>
            <DialogHeader>
              <DialogTitle className="pr-6">
                {fromName} nợ {toName}
              </DialogTitle>
              <DialogDescription>{formatCurrency(debt.amount)}</DialogDescription>
            </DialogHeader>

            {loading ? (
              <div className="flex h-24 items-center justify-center text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              </div>
            ) : !explain ? (
              <EmptyState title="Không tải được chi tiết" description="Thử mở lại sau." />
            ) : (
              <div className="flex flex-col gap-1.5 text-sm">
                <p className="text-xs text-muted-foreground">
                  Tính từ {explain.sinceDate ? formatDate(explain.sinceDate) : explain.items.length > 0 ? formatDate(explain.items[0].date) : 'trước tới nay'}{' '}
                  · {explain.items.length === 0 ? 'không có khoản chi nào' : `${explain.items.length} khoản chi`}
                </p>
                {explain.items.length === 0 ? (
                  <p className="rounded-md border px-3 py-2 text-muted-foreground">Không có khoản chi nào.</p>
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
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export { DebtDetailDialog }
