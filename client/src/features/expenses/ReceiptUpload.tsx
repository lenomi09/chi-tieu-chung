import { ImagePlus, Loader2, X } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { compressImageFile, isImageFile } from './receiptUtils'

interface ReceiptUploadProps {
  value: string | null
  onChange: (value: string | null) => void
  onErrorMessage: (message: string) => void
}

// Ô chọn ảnh bill: kéo-thả, bấm để chọn, hoặc dán (Ctrl+V) ảnh từ clipboard.
// Ảnh được nén phía trình duyệt trước khi lưu vào form (xem receiptUtils.ts).
function ReceiptUpload({ value, onChange, onErrorMessage }: ReceiptUploadProps) {
  const [dragActive, setDragActive] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleFile = React.useCallback(
    async (file: File | undefined | null) => {
      if (!file) return
      if (!isImageFile(file)) {
        onErrorMessage('Chỉ nhận file ảnh (JPEG, PNG,...)')
        return
      }
      setLoading(true)
      try {
        const dataUrl = await compressImageFile(file)
        onChange(dataUrl)
      } catch (err) {
        onErrorMessage(err instanceof Error ? err.message : 'Không xử lý được ảnh')
      } finally {
        setLoading(false)
      }
    },
    [onChange, onErrorMessage]
  )

  React.useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((it) => it.type.startsWith('image/'))
      if (item) {
        handleFile(item.getAsFile())
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [handleFile])

  if (value) {
    return (
      <div className="relative w-full max-w-[220px] overflow-hidden rounded-md border border-input">
        <img src={value} alt="Ảnh bill đã đính kèm" className="block max-h-52 w-full object-contain" />
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white outline-none hover:bg-black/80 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3.5" />
          <span className="sr-only">Xoá ảnh bill</span>
        </button>
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setDragActive(true)
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragActive(false)
        handleFile(e.dataTransfer.files[0])
      }}
      className={cn(
        'flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground outline-none transition-colors',
        'hover:border-primary/50 hover:bg-accent/40',
        'focus-visible:ring-2 focus-visible:ring-ring/40',
        dragActive && 'border-primary bg-accent/50'
      )}
    >
      {loading ? (
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
      ) : (
        <ImagePlus className="size-4 shrink-0" aria-hidden="true" />
      )}
      <span>{loading ? 'Đang xử lý ảnh...' : 'Kéo-thả, dán hoặc bấm để chọn ảnh'}</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </div>
  )
}

export { ReceiptUpload }
