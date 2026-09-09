import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]',
      'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { hideClose?: boolean }
>(({ className, children, hideClose, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    {/* Content chỉ lo việc định vị (fixed, phủ kín màn hình, căn giữa bằng
        flex) — KHÔNG tự cuộn.
        Khối thẻ (viền/bóng đổ, div "card" bên dưới) cũng KHÔNG tự cuộn —
        chỉ overflow-hidden để cắt góc bo tròn. Vùng cuộn thật sự nằm ở 1 div
        con riêng (div "scroll") bên trong card.
        Lý do tách 3 lớp: nếu để chính khối thẻ (có viền/bóng đổ nhìn thấy
        được) vừa là fixed/căn giữa vừa tự cuộn overflow-y-auto, hiệu ứng
        "nảy" (rubber-band overscroll) của Safari iOS khi ngón tay kéo chạm
        biên vùng cuộn sẽ làm chính khối thẻ đó trông như bị kéo trôi theo
        (đã xác nhận trên máy thật: viền thẻ trôi, nền tối phía sau đứng yên).
        Cô lập vùng cuộn vào 1 div con bị "card" cha overflow-hidden che lại
        thì khi nảy, phần vượt ra ngoài bị cắt mất — viền/bóng đổ của card
        không còn hiển thị bị trôi nữa. */}
    <DialogPrimitive.Content
      ref={ref}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
      {...props}
    >
      <DialogPrimitive.Close
        className="absolute inset-0"
        tabIndex={-1}
        aria-hidden="true"
      />
      <div
        className={cn(
          'relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border bg-card p-6 text-card-foreground shadow-lg',
          className
        )}
      >
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain">{children}</div>
        {!hideClose && (
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none">
            <X className="size-4" />
            <span className="sr-only">Đóng</span>
          </DialogPrimitive.Close>
        )}
      </div>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 text-left', className)} {...props} />
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  )
}

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold', className)} {...props} />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
