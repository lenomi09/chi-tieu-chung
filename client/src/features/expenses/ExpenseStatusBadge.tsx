import { Badge } from '@/components/ui/badge'
import type { RequestStatus } from '@/lib/types'

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

function ExpenseStatusBadge({ status }: { status: RequestStatus }) {
  return <Badge variant={statusVariant[status]}>{statusLabel[status]}</Badge>
}

export { ExpenseStatusBadge, statusLabel }
