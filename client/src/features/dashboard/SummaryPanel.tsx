import * as React from 'react'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency } from '@/lib/format'
import type { Debt, Member, MemberSummary, Settlement } from '@/lib/types'
import { cn } from '@/lib/utils'
import { MemberDebtDialog } from './MemberDebtDialog'

interface SummaryPanelProps {
  summary: MemberSummary[]
  debts: Debt[]
  members: Member[]
  settlements: Settlement[]
  isAdmin: boolean
}

function SummaryPanel({ summary, debts, members, settlements, isAdmin }: SummaryPanelProps) {
  const [selectedMember, setSelectedMember] = React.useState<Member | null>(null)

  if (summary.length === 0) {
    return <EmptyState title="Chưa có dữ liệu" description="Thêm thành viên và khoản chi để xem tổng kết." />
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {summary.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSelectedMember(members.find((m) => m.id === s.id) ?? null)}
            className="flex flex-col gap-1 rounded-lg border p-3 text-left outline-none transition-colors hover:bg-accent/50 focus-visible:bg-accent/50"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-medium">{s.name}</p>
              <p
                className={cn(
                  'shrink-0 text-sm font-semibold',
                  s.balance > 0 ? 'text-success' : s.balance < 0 ? 'text-destructive' : 'text-muted-foreground'
                )}
              >
                {s.balance > 0 ? '+' : ''}
                {formatCurrency(s.balance)}
              </p>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              Đã trả {formatCurrency(s.totalPaid)} · Phải chịu {formatCurrency(s.totalOwed)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {s.balance > 0 ? 'được nhận lại' : s.balance < 0 ? 'còn phải trả' : 'đã cân bằng'}
            </p>
          </button>
        ))}
      </div>
      <MemberDebtDialog
        member={selectedMember}
        debts={debts}
        members={members}
        settlements={settlements}
        isAdmin={isAdmin}
        onOpenChange={(open) => !open && setSelectedMember(null)}
      />
    </>
  )
}

export { SummaryPanel }
