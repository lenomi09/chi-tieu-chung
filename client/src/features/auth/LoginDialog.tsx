import { zodResolver } from '@hookform/resolvers/zod'
import { LogIn } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { useAppState } from '@/context/AppStateContext'
import { api, ApiError } from '@/lib/api'
import { type LoginFormValues, loginSchema } from './schema'

function LoginDialog() {
  const [open, setOpen] = React.useState(false)
  const { refetch } = useAppState()
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, touchedFields },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { password: '' },
  })

  const onSubmit = async (values: LoginFormValues) => {
    try {
      await api.login(values.password)
      await refetch()
      reset()
      setOpen(false)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Không đăng nhập được, vui lòng thử lại'
      setError('password', { message })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <LogIn />
          Đăng nhập admin
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đăng nhập admin</DialogTitle>
          <DialogDescription>Nhập mật khẩu admin để thêm/sửa/xoá và duyệt yêu cầu.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <FormField id="login-password" label="Mật khẩu" required error={errors.password?.message}>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              aria-invalid={!!errors.password}
              aria-describedby="login-password-message"
              data-valid={touchedFields.password && !errors.password ? 'true' : undefined}
              {...register('password')}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Đăng nhập
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export { LoginDialog }
