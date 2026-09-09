import { Moon, Plus, Sun } from 'lucide-react'
import * as React from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { FullPageSpinner } from '@/components/ui/spinner'
import { useAppState } from '@/context/AppStateContext'
import { useTheme } from '@/context/ThemeContext'
import { LoginDialog } from '@/features/auth/LoginDialog'
import { LogoutButton } from '@/features/auth/LogoutButton'
import { ManageDialog } from '@/features/dashboard/ManageDialog'
import { SummaryPanel } from '@/features/dashboard/SummaryPanel'
import { ExpenseForm } from '@/features/expenses/ExpenseForm'
import { ExpenseTable } from '@/features/expenses/ExpenseTable'
import { SettlementTable } from '@/features/settlements/SettlementTable'

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  )
}

function AppShell() {
  const { state, loading, error, refetch } = useAppState()
  const [addExpenseOpen, setAddExpenseOpen] = React.useState(false)

  if (loading && !state) {
    return <FullPageSpinner label="Đang tải dữ liệu chi tiêu chung..." />
  }

  if (error && !state) {
    return (
      <div className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
        <Alert variant="destructive">
          <AlertTitle>Không tải được dữ liệu</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={() => refetch()}>Thử lại</Button>
      </div>
    )
  }

  if (!state) return null

  const isAdmin = state.isAdmin

  return (
    <div className="mx-auto flex min-h-svh max-w-[1400px] flex-col gap-4 p-4 sm:p-6 lg:px-10 lg:py-6">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-lg font-semibold sm:text-xl">Chi tiêu chung</h1>
          <p className="text-xs text-muted-foreground">Theo dõi chi tiêu và thanh toán trong nhóm</p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <ManageDialog />
          {isAdmin ? <LogoutButton /> : <LoginDialog />}
        </div>
      </header>

      {error && (
        <Alert variant="warning">
          <AlertDescription>{error} — dữ liệu hiển thị có thể chưa mới nhất.</AlertDescription>
        </Alert>
      )}

      {/* Thông tin quan trọng nhất — số dư mỗi người — luôn ở trên cùng, không cần cuộn mới thấy.
          Bấm vào 1 người để xem chi tiết ai nợ ai/họ nợ ai (thay cho mục "Ai nợ ai" riêng trước đây). */}
      <Card>
        <CardHeader>
          <CardTitle>Tổng kết</CardTitle>
          <CardDescription>Bấm vào 1 người để xem chi tiết nợ và ghi nhận đã trả.</CardDescription>
        </CardHeader>
        <CardContent>
          <SummaryPanel summary={state.summary} debts={state.debts} members={state.members} isAdmin={isAdmin} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Khoản chi</CardTitle>
          <Dialog open={addExpenseOpen} onOpenChange={setAddExpenseOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus />
                Thêm khoản chi
              </Button>
            </DialogTrigger>
            <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
              <DialogHeader>
                <DialogTitle>{isAdmin ? 'Thêm khoản chi' : 'Gửi yêu cầu thêm khoản chi'}</DialogTitle>
              </DialogHeader>
              <ExpenseForm
                members={state.members}
                mode={isAdmin ? 'admin' : 'request'}
                onDone={() => setAddExpenseOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <ExpenseTable expenses={state.expenses} members={state.members} isAdmin={isAdmin} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lịch sử thanh toán</CardTitle>
          <CardDescription>
            Để ghi nhận đã trả nợ, bấm vào người đó ở mục "Tổng kết" rồi bấm nút trên dòng nợ tương ứng —
            số tiền luôn khớp đúng, không cần nhập tay.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettlementTable settlements={state.settlements} members={state.members} isAdmin={isAdmin} />
        </CardContent>
      </Card>
    </div>
  )
}

export default AppShell
