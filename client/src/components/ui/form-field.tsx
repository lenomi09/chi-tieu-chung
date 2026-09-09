import { AlertCircle, CheckCircle2 } from 'lucide-react'
import * as React from 'react'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface FormFieldProps {
  id: string
  label: React.ReactNode
  error?: string
  hint?: string
  valid?: boolean
  required?: boolean
  className?: string
  children: React.ReactNode
}

// Bọc quanh 1 input/select/textarea để hiển thị nhãn + thông báo lỗi/hint dưới
// dạng UI tuỳ chỉnh (không dùng bubble mặc định của trình duyệt). Input con cần
// tự gắn aria-invalid + aria-describedby={fieldId + '-message'} khi có lỗi.
function FormField({ id, label, error, hint, valid, required, className, children }: FormFieldProps) {
  const messageId = `${id}-message`
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {children}
      {error ? (
        <p id={messageId} role="alert" className="flex items-start gap-1 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      ) : valid ? (
        <p id={messageId} className="flex items-start gap-1 text-xs text-success">
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>Hợp lệ</span>
        </p>
      ) : hint ? (
        <p id={messageId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export { FormField }
