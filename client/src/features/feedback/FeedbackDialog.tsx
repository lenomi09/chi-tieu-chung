import { MessageSquareText, Send } from 'lucide-react'
import * as React from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { Textarea } from '@/components/ui/textarea'

// Key công khai của Web3Forms (https://web3forms.com), dùng để gửi form thẳng
// từ trình duyệt tới email đã đăng ký — không cần backend, key này được thiết
// kế để lộ ra ở phía client (giống site key reCAPTCHA), không phải bí mật.
// TODO: thay bằng access key thật sau khi đăng ký tại web3forms.com.
const WEB3FORMS_ACCESS_KEY = 'REPLACE_WITH_YOUR_WEB3FORMS_ACCESS_KEY'

function FeedbackDialog() {
  const [open, setOpen] = React.useState(false)
  const [message, setMessage] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [sent, setSent] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const reset = () => {
    setMessage('')
    setSubmitting(false)
    setSent(false)
    setError(null)
  }

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!message.trim()) {
      setError('Vui lòng nhập nội dung góp ý')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_key: WEB3FORMS_ACCESS_KEY,
          subject: 'Góp ý từ Chi tiêu chung',
          from_name: 'Chi tiêu chung',
          message,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Gửi góp ý thất bại')
      }
      setSent(true)
      setMessage('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gửi góp ý thất bại, vui lòng thử lại')
    } finally {
      setSubmitting(false)
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
          <MessageSquareText />
          Góp ý
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gửi góp ý</DialogTitle>
          <DialogDescription>Báo lỗi hoặc đề xuất tính năng, mình sẽ nhận được qua email.</DialogDescription>
        </DialogHeader>
        {sent ? (
          <Alert variant="success">
            <AlertDescription>Đã gửi góp ý, cảm ơn bạn!</AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <FormField id="feedback-message" label="Nội dung" required error={error ?? undefined}>
              <Textarea
                id="feedback-message"
                placeholder="Mô tả lỗi hoặc góp ý của bạn..."
                autoFocus
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                aria-invalid={!!error}
                aria-describedby="feedback-message-message"
              />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Huỷ
              </Button>
              <Button type="submit" loading={submitting}>
                {!submitting && <Send />}
                Gửi
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

export { FeedbackDialog }
