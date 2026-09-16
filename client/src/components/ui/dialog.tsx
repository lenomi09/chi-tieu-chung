import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'

// Đếm số Dialog đang khoá cuộn cùng lúc (phòng trường hợp 1 Dialog mở đè lên
// Dialog khác, ví dụ hộp xác nhận xoá mở từ trong 1 modal khác) — chỉ thật sự
// khoá lúc đếm từ 0 lên 1, chỉ mở khoá lúc đếm về đúng 0, để đóng Dialog con
// không lỡ tay mở khoá luôn cho Dialog cha vẫn đang mở.
let scrollLockCount = 0;
let savedScrollY = 0;

// react-remove-scroll (Radix dùng sẵn bên trong) chỉ set overflow:hidden lên
// <body> — trên Safari iOS, ngón tay vuốt bên trong modal vẫn có thể kéo trôi
// cả trang phía sau lớp nền tối (đã xác nhận trên máy thật), vì overflow:
// hidden không chặn được cử chỉ vuốt cấp visual viewport của iOS. Khoá thêm
// bằng kỹ thuật position:fixed cho <body> (đưa hẳn body ra khỏi luồng tài
// liệu). 2 điều cần lưu ý (đã dò ra qua kiểm tra thực tế, không chỉ suy luận):
// 1) Chính react-remove-scroll-bar (phụ thuộc của Radix) tự chèn 1 CSS rule
//    `body[data-scroll-locked] { position: relative !important; ... }` — nếu
//    chỉ gán qua `style.position = 'fixed'` (không !important) thì bị rule đó
//    đè ngược lại ngay, ĐỨNG NHÌN THÌ TƯỞNG ĐÃ ÁP DỤNG (style attribute vẫn
//    ghi "fixed") nhưng compute ra vẫn là "relative" — phải setProperty kèm
//    'important' mới thắng được.
// 2) Dự án này <html> có sẵn overflow-y:scroll CỐ ĐỊNH (giữ chỗ thanh cuộn,
//    xem index.css) — khi <html> đã tự khai overflow riêng thì trình duyệt
//    KHÔNG còn "mượn" overflow của <body> cho viewport nữa, nên dù body đã
//    fixed, <html> vẫn tự cuộn được bình thường nếu không khoá thêm.
function useBodyScrollLock(locked: boolean) {
  React.useEffect(() => {
    if (!locked) return;
    if (scrollLockCount === 0) {
      savedScrollY = window.scrollY;
      const bodyStyle = document.body.style;
      bodyStyle.setProperty('position', 'fixed', 'important');
      bodyStyle.setProperty('top', `-${savedScrollY}px`, 'important');
      bodyStyle.setProperty('left', '0', 'important');
      bodyStyle.setProperty('right', '0', 'important');
      document.documentElement.style.setProperty('overflow', 'hidden', 'important');
    }
    scrollLockCount++;
    return () => {
      scrollLockCount--;
      if (scrollLockCount === 0) {
        const bodyStyle = document.body.style;
        bodyStyle.removeProperty('position');
        bodyStyle.removeProperty('top');
        bodyStyle.removeProperty('left');
        bodyStyle.removeProperty('right');
        document.documentElement.style.removeProperty('overflow');
        window.scrollTo(0, savedScrollY);
      }
    };
  }, [locked]);
}

function Dialog({ open, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Root>) {
  useBodyScrollLock(!!open);
  return <DialogPrimitive.Root open={open} {...props} />;
}
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
          'relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-lg',
          className
        )}
      >
        {/* Thanh cuộn phải nằm sát mép ngoài của thẻ (div này), không bị thụt
            vào theo khoảng đệm (padding) của nội dung — nên padding đặt ở div
            con bên trong (div nội dung), còn div cuộn ở đây không có padding
            riêng, chiếm trọn bề ngang của thẻ. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className={cn('grid gap-4 p-6', className)}>{children}</div>
        </div>
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
