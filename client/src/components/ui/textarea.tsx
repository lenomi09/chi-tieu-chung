import * as React from 'react'
import { cn } from '@/lib/utils'

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        // text-base (16px) trên mobile — iOS Safari tự phóng to trang khi bấm
        // vào input có font-size < 16px, từ sm trở lên trả về text-sm như cũ.
        'flex min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm transition-[color,box-shadow,border-color] outline-none sm:text-sm',
        'placeholder:text-muted-foreground',
        'hover:border-foreground/30',
        'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted',
        'aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/25',
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = 'Textarea'

export { Textarea }
