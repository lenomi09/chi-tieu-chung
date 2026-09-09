import { ArrowRight, CheckCircle2 } from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useAppState } from '@/context/AppStateContext'
import { api } from '@/lib/api'
import { formatCurrency, todayIso } from '@/lib/format'
import type { Debt } from '@/lib/types'

interface DebtRowProps {
  debt: Debt
  fromName: string
  toName: string
  isAdmin: boolean
  /** Đã có 1 yêu cầu ghi nhận trả nợ (cùng người trả/nhận) đang chờ duyệt. */
  isPending: boolean
}

// Bấm thẳng trên dòng nợ để ghi nhận đã trả — KHÔNG có form nhập tay người
// trả/người nhận/số tiền, để tránh ghi nhầm: số tiền luôn đúng bằng đúng số nợ
// đang hiện tại thời điểm bấm.
function DebtRow({ debt, fromName, toName, isAdmin, isPending }: DebtRowProps) {
  const { mutate } = useAppState()
  const confirm = useConfirm()
  const [busy, setBusy] = React.useState(false)
  // Chặn bấm lần 2 ngay lập tức (đồng bộ, không cần đợi React render lại) —
  // disabled={loading} trên Button chỉ có tác dụng SAU 1 lần render, nên bấm
  // rất nhanh 2 lần (đặc biệt lúc hộp xác nhận vừa mở) có thể lọt qua, tạo 2
  // yêu cầu ghi nhận trùng nhau cho cùng 1 khoản nợ.
  const submittingRef = React.useRef(false)

  const handleSettle = async () => {
    if (submittingRef.current || isPending) return
    submittingRef.current = true
    try {
      const ok = await confirm({
        title: isAdmin ? 'Ghi nhận đã trả nợ?' : 'Gửi yêu cầu ghi nhận đã trả nợ?',
        description: `${fromName} đã trả ${formatCurrency(debt.amount)} cho ${toName}.`,
        confirmLabel: isAdmin ? 'Ghi nhận' : 'Gửi yêu cầu',
      })
      if (!ok) return
      setBusy(true)
      const payload = { date: todayIso(), fromId: debt.fromId, toId: debt.toId, amount: debt.amount }
      if (isAdmin) {
        await mutate(() => api.addSettlement(payload))
      } else {
        await mutate(() => api.addSettlementRequest(payload))
      }
    } catch (err) {
      console.error(err)
    } finally {
      submittingRef.current = false
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-medium">{fromName}</span>
        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate font-medium">{toName}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-semibold text-destructive">{formatCurrency(debt.amount)}</span>
        {isPending ? (
          <span className="rounded-md border border-input px-2.5 py-1.5 text-xs text-muted-foreground">
            Đang chờ duyệt
          </span>
        ) : (
          <Button type="button" size="sm" variant="outline" loading={busy} onClick={handleSettle}>
            <CheckCircle2 />
            {isAdmin ? 'Đã trả' : 'Báo đã trả'}
          </Button>
        )}
      </div>
    </div>
  )
}

export { DebtRow }
