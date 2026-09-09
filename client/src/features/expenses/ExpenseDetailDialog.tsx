import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatCurrency, formatDate } from '@/lib/format'
import type { Expense } from '@/lib/types'
import { ExpenseStatusBadge } from './ExpenseStatusBadge'
import { resolveShares } from './shareUtils'

interface ExpenseDetailDialogProps {
  expense: Expense | null
  memberName: Map<string, string>
  onOpenChange: (open: boolean) => void
  onViewReceipt: (src: string) => void
}

function ExpenseDetailDialog({ expense, memberName, onOpenChange, onViewReceipt }: ExpenseDetailDialogProps) {
  return (
    <Dialog open={!!expense} onOpenChange={onOpenChange}>
      <DialogContent>
        {expense && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 pr-6">
                <DialogTitle className="min-w-0 flex-1 truncate">{expense.description}</DialogTitle>
                <ExpenseStatusBadge status={expense.status} />
              </div>
              <DialogDescription>{formatDate(expense.date)}</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Số tiền</p>
                  <p className="font-semibold">{formatCurrency(expense.amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Người trả</p>
                  <p className="font-medium">{memberName.get(expense.payerId) ?? '?'}</p>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground">Chia cho</p>
                <div className="flex flex-col divide-y rounded-md border">
                  {resolveShares(expense).map(({ memberId, amount }) => (
                    <div key={memberId} className="flex items-center justify-between px-3 py-1.5">
                      <span>{memberName.get(memberId) ?? '?'}</span>
                      <span className="font-medium">{formatCurrency(Math.round(amount))}</span>
                    </div>
                  ))}
                </div>
              </div>

              {expense.receipt && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs text-muted-foreground">Ảnh bill</p>
                  <button
                    type="button"
                    onClick={() => onViewReceipt(expense.receipt!)}
                    className="w-fit overflow-hidden rounded-md border border-input outline-none transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <img src={expense.receipt} alt="Ảnh bill — bấm để phóng to" className="block max-h-48 max-w-[200px] object-contain" />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export { ExpenseDetailDialog }
