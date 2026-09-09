import { Settings, Users } from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useAppState } from '@/context/AppStateContext'
import { AddMemberForm } from '@/features/members/AddMemberForm'
import { MemberList } from '@/features/members/MemberList'
import { DangerZone } from './DangerZone'

// Gom danh sách thành viên (ai cũng xem được) + việc admin làm không thường
// xuyên (thêm/sửa/xoá thành viên, xoá dữ liệu) vào 1 dialog riêng, thay vì
// luôn chiếm chỗ trên trang chính.
function ManageDialog() {
  const { state } = useAppState()
  const [open, setOpen] = React.useState(false)

  if (!state) return null
  const isAdmin = state.isAdmin

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {isAdmin ? <Settings /> : <Users />}
          {isAdmin ? 'Quản lý' : 'Thành viên'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isAdmin ? 'Quản lý' : 'Thành viên'}</DialogTitle>
          <DialogDescription>
            {isAdmin ? 'Thành viên và các thao tác quản trị khác.' : 'Danh sách thành viên trong nhóm.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <MemberList members={state.members} isAdmin={isAdmin} />
            {isAdmin && <AddMemberForm />}
          </div>
          {isAdmin && <DangerZone />}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export { ManageDialog }
