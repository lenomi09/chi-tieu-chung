import { zodResolver } from '@hookform/resolvers/zod'
import { UserPlus } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAppState } from '@/context/AppStateContext'
import { api, ApiError } from '@/lib/api'
import { type MemberNameFormValues, memberNameSchema } from './schema'

function AddMemberForm() {
  const { mutate } = useAppState()
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<MemberNameFormValues>({
    resolver: zodResolver(memberNameSchema),
    defaultValues: { name: '' },
  })

  const onSubmit = async (values: MemberNameFormValues) => {
    try {
      await mutate(() => api.addMember(values.name))
      reset()
    } catch (err) {
      setError('name', { message: err instanceof ApiError ? err.message : 'Không thêm được thành viên' })
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-1.5" noValidate>
      <Label htmlFor="add-member-name">Thêm thành viên</Label>
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <Input
            id="add-member-name"
            placeholder="Tên thành viên mới"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'add-member-name-message' : undefined}
            {...register('name')}
          />
          {errors.name && (
            <p id="add-member-name-message" role="alert" className="mt-1.5 text-xs text-destructive">
              {errors.name.message}
            </p>
          )}
        </div>
        <Button type="submit" loading={isSubmitting}>
          <UserPlus />
          Thêm
        </Button>
      </div>
    </form>
  )
}

export { AddMemberForm }
