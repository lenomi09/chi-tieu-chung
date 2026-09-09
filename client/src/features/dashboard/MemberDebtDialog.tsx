import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import type { Debt, Member } from '@/lib/types'
import { DebtRow } from './DebtRow'

interface MemberDebtDialogProps {
  member: Member | null
  debts: Debt[]
  members: Member[]
  isAdmin: boolean
  onOpenChange: (open: boolean) => void
}

// Bấm vào 1 người trong "Tổng kết" để xem người đó đang nợ ai và ai đang nợ
// người đó — gộp thẳng vào đây thay vì tách riêng thành mục "Ai nợ ai".
function MemberDebtDialog({ member, debts, members, isAdmin, onOpenChange }: MemberDebtDialogProps) {
  const memberName = new Map(members.map((m) => [m.id, m.name]))
  const owedByMember = member ? debts.filter((d) => d.fromId === member.id) : []
  const owedToMember = member ? debts.filter((d) => d.toId === member.id) : []

  return (
    <Dialog open={!!member} onOpenChange={onOpenChange}>
      <DialogContent>
        {member && (
          <>
            <DialogHeader>
              <DialogTitle>{member.name}</DialogTitle>
              <DialogDescription>Các khoản nợ liên quan tới {member.name}.</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-muted-foreground">{member.name} còn nợ</p>
                {owedByMember.length === 0 ? (
                  <EmptyState title={`${member.name} không nợ ai`} />
                ) : (
                  <div className="flex flex-col divide-y rounded-lg border">
                    {owedByMember.map((d) => (
                      <DebtRow
                        key={`${d.fromId}-${d.toId}`}
                        debt={d}
                        fromName={memberName.get(d.fromId) ?? '?'}
                        toName={memberName.get(d.toId) ?? '?'}
                        isAdmin={isAdmin}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-muted-foreground">Nợ {member.name}</p>
                {owedToMember.length === 0 ? (
                  <EmptyState title={`Không ai nợ ${member.name}`} />
                ) : (
                  <div className="flex flex-col divide-y rounded-lg border">
                    {owedToMember.map((d) => (
                      <DebtRow
                        key={`${d.fromId}-${d.toId}`}
                        debt={d}
                        fromName={memberName.get(d.fromId) ?? '?'}
                        toName={memberName.get(d.toId) ?? '?'}
                        isAdmin={isAdmin}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export { MemberDebtDialog }
