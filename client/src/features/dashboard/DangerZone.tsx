import { AlertTriangle } from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useAppState } from '@/context/AppStateContext'
import { api } from '@/lib/api'

function DangerZone() {
  const { mutate } = useAppState()
  const confirm = useConfirm()
  const [busy, setBusy] = React.useState(false)

  const handleReset = async () => {
    const ok = await confirm({
      title: 'Xoá toàn bộ khoản chi và thanh toán?',
      description: 'Danh sách thành viên được giữ nguyên, nhưng mọi khoản chi và thanh toán sẽ bị xoá vĩnh viễn. Không thể hoàn tác.',
      confirmLabel: 'Xoá hết dữ liệu',
      destructive: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      await mutate(() => api.reset())
    } catch (err) {
      console.error(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-destructive">
        <AlertTriangle className="size-4" aria-hidden="true" />
        Khu vực nguy hiểm
      </div>
      <p className="text-xs text-muted-foreground">
        Xoá toàn bộ khoản chi và thanh toán, giữ lại danh sách thành viên.
      </p>
      <Button type="button" variant="destructive" size="sm" className="self-start" loading={busy} onClick={handleReset}>
        Xoá toàn bộ dữ liệu
      </Button>
    </div>
  )
}

export { DangerZone }
