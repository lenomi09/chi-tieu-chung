import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

function Spinner({ className, label = 'Đang tải...' }: { className?: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <Loader2 className={cn('size-4 animate-spin', className)} aria-hidden="true" />
      <span>{label}</span>
    </span>
  )
}

function FullPageSpinner({ label = 'Đang tải dữ liệu...' }: { label?: string }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-8 animate-spin" aria-hidden="true" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export { FullPageSpinner, Spinner }
