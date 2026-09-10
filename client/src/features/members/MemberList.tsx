import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Pencil, Trash2, X } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { useAppState } from '@/context/AppStateContext'
import { api, ApiError } from '@/lib/api'
import type { Member } from '@/lib/types'
import { type MemberNameFormValues, memberNameSchema } from './schema'

function MemberRow({ member, isAdmin }: { member: Member; isAdmin: boolean }) {
  const { mutate } = useAppState()
  const confirm = useConfirm()
  const [editing, setEditing] = React.useState(false)
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<MemberNameFormValues>({
    resolver: zodResolver(memberNameSchema),
    defaultValues: { name: member.name },
  })

  const onRename = async (values: MemberNameFormValues) => {
    if (values.name === member.name) {
      setEditing(false)
      return
    }
    try {
      await mutate(() => api.renameMember(member.id, values.name))
      setEditing(false)
    } catch (err) {
      setError('name', { message: err instanceof ApiError ? err.message : 'Không đổi tên được' })
    }
  }

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Xoá thành viên "${member.name}"?`,
      description: 'Chỉ xoá được nếu thành viên này chưa có khoản chi hoặc thanh toán liên quan.',
      confirmLabel: 'Xoá',
      destructive: true,
    })
    if (!ok) return
    try {
      await mutate(() => api.deleteMember(member.id))
    } catch (err) {
      console.error(err)
    }
  }

  if (editing) {
    return (
      <form onSubmit={handleSubmit(onRename)} className="flex flex-col gap-1 rounded-md border border-input bg-background p-1">
        <div className="flex items-center gap-1">
          <Input
            className="h-8 min-w-0 flex-1"
            autoFocus
            aria-label={`Tên mới cho ${member.name}`}
            aria-invalid={!!errors.name}
            {...register('name')}
          />
          <Button type="submit" size="icon" variant="ghost" className="h-8 w-8 shrink-0" loading={isSubmitting}>
            {!isSubmitting && <Check className="text-success" />}
            <span className="sr-only">Lưu</span>
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            onClick={() => {
              reset()
              setEditing(false)
            }}
          >
            <X />
            <span className="sr-only">Huỷ</span>
          </Button>
        </div>
        {errors.name && (
          <p role="alert" className="px-1 text-xs text-destructive">
            {errors.name.message}
          </p>
        )}
      </form>
    )
  }

  return (
    <div className="flex items-start justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50">
      <span className="min-w-0 break-words text-sm">{member.name}</span>
      {isAdmin && (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setEditing(true)}
            aria-label={`Đổi tên ${member.name}`}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 hover:text-destructive"
            onClick={handleDelete}
            aria-label={`Xoá ${member.name}`}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}

function MemberList({ members, isAdmin }: { members: Member[]; isAdmin: boolean }) {
  if (members.length === 0) {
    return <EmptyState title="Chưa có thành viên nào" description="Thêm thành viên đầu tiên ở bên dưới." />
  }
  return (
    <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
      {members.map((m) => (
        <MemberRow key={m.id} member={m} isAdmin={isAdmin} />
      ))}
    </div>
  )
}

export { MemberList }
