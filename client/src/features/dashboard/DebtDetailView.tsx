import { Loader2 } from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/format'
import type { Debt, DebtExplain } from '@/lib/types'

interface DebtDetailViewProps {
  debt: Debt
  memberName: Map<string, string>
}

// Mặc định chỉ hiện chừng này khoản, bấm "Xem thêm" mới mở hết — tránh modal
// dài lê thê ngay từ đầu khi 1 khoản nợ gồm rất nhiều khoản chi nhỏ lẻ.
const PREVIEW_COUNT = 8

// Nội dung "khoản nợ này gồm những khoản chi nào" — chỉ là nội dung, KHÔNG tự
// mở Dialog riêng (dùng lồng trong DialogContent đang mở sẵn của
// MemberDebtDialog, tránh 2 modal đè lên nhau).
function DebtDetailView({ debt, memberName }: DebtDetailViewProps) {
  const [explain, setExplain] = React.useState<DebtExplain | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [expanded, setExpanded] = React.useState(false)

  React.useEffect(() => {
    setExplain(null)
    setExpanded(false)
    let cancelled = false
    setLoading(true)
    api
      .explainDebt(debt.fromId, debt.toId)
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
  }, [debt.fromId, debt.toId])

  const fromName = memberName.get(debt.fromId) ?? '?'
  const toName = memberName.get(debt.toId) ?? '?'

  return (
    <>
      <div>
        <DialogTitle className="pr-6">
          {fromName} nợ {toName}
        </DialogTitle>
        <DialogDescription>{formatCurrency(debt.amount)}</DialogDescription>
      </div>

      {loading ? (
        <div className="flex h-24 items-center justify-center text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        </div>
      ) : !explain ? (
        <EmptyState title="Không tải được chi tiết" description="Thử mở lại sau." />
      ) : (
        (() => {
          // Hiện khoản mới nhất lên đầu — dễ nhìn ra khoản chi gần đây nhất,
          // trong khi tính toán bên trong (explain.items) vẫn giữ đúng thứ tự
          // thời gian tăng dần cần thiết cho logic tất toán/nợ chồng chéo.
          const sortedItems = [...explain.items].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
          const visibleItems = expanded ? sortedItems : sortedItems.slice(0, PREVIEW_COUNT)
          const remaining = sortedItems.length - visibleItems.length
          return (
            <div className="flex flex-col gap-2">
              {/* Tiêu đề "X nợ Y" ở trên luôn đứng yên (nằm ngoài khung này) —
                  chỉ riêng danh sách khoản chi tự cuộn trong chiều cao giới
                  hạn khi mở hết, không kéo cả tiêu đề trôi mất theo. */}
              <div className="flex max-h-[50vh] flex-col divide-y overflow-y-auto rounded-md border text-sm">
                {visibleItems.map((item) => (
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
              {remaining > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(true)}>
                  Xem thêm {remaining} khoản
                </Button>
              )}
            </div>
          )
        })()
      )}
    </>
  )
}

export { DebtDetailView }
