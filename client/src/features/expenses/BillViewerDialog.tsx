import * as React from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface BillViewerDialogProps {
  src: string | null
  onOpenChange: (open: boolean) => void
}

const MIN_ZOOM = 1
const MAX_ZOOM = 4

// Xem ảnh bill phóng to: cuộn chuột/pinch để zoom, kéo để di chuyển khi đã zoom.
// offset luôn bị giới hạn (clamp) theo mức zoom hiện tại — nên khi zoom nhỏ lại,
// ảnh tự trôi mượt về đúng vị trí giữa thay vì bị lệch/tràn khung.
function BillViewerDialog({ src, onOpenChange }: BillViewerDialogProps) {
  const [zoom, setZoom] = React.useState(1)
  const [offset, setOffset] = React.useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const dragState = React.useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null)

  React.useEffect(() => {
    if (src) {
      setZoom(1)
      setOffset({ x: 0, y: 0 })
    }
  }, [src])

  const clampOffset = React.useCallback((raw: { x: number; y: number }, z: number) => {
    const el = containerRef.current
    if (!el || z <= 1) return { x: 0, y: 0 }
    const maxX = (el.clientWidth * (z - 1)) / 2
    const maxY = (el.clientHeight * (z - 1)) / 2
    return {
      x: Math.min(maxX, Math.max(-maxX, raw.x)),
      y: Math.min(maxY, Math.max(-maxY, raw.y)),
    }
  }, [])

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom - e.deltaY * 0.0015))
    setZoom(next)
    setOffset((o) => clampOffset(o, next))
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (zoom <= 1) return
    setIsDragging(true)
    dragState.current = { x: e.clientX, y: e.clientY, offsetX: offset.x, offsetY: offset.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState.current) return
    const dx = e.clientX - dragState.current.x
    const dy = e.clientY - dragState.current.y
    setOffset(clampOffset({ x: dragState.current.offsetX + dx, y: dragState.current.offsetY + dy }, zoom))
  }

  const handlePointerUp = () => {
    dragState.current = null
    setIsDragging(false)
  }

  const handleDoubleClick = () => {
    const next = zoom > 1 ? 1 : 2
    setZoom(next)
    setOffset(clampOffset({ x: 0, y: 0 }, next))
  }

  return (
    <Dialog open={!!src} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl overflow-hidden p-0" hideClose>
        <DialogTitle className="sr-only">Ảnh bill</DialogTitle>
        {src && (
          <div
            ref={containerRef}
            className="flex h-[80vh] max-h-[80vh] items-center justify-center overflow-hidden bg-black/90"
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onDoubleClick={handleDoubleClick}
            style={{
              cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
              touchAction: 'none',
            }}
          >
            <img
              src={src}
              alt="Ảnh bill phóng to — cuộn để zoom, kéo để di chuyển, bấm đúp để reset"
              className={cn(
                'max-h-full max-w-full select-none object-contain will-change-transform',
                !isDragging && 'transition-transform duration-200 ease-out'
              )}
              style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
              draggable={false}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export { BillViewerDialog }
