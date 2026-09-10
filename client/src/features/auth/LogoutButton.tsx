import { LogOut } from 'lucide-react'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { useAppState } from '@/context/AppStateContext'
import { api } from '@/lib/api'

function LogoutButton() {
  const { refetch } = useAppState()
  const [loading, setLoading] = React.useState(false)

  const handleLogout = async () => {
    setLoading(true)
    try {
      await api.logout()
      await refetch()
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleLogout} loading={loading} aria-label="Đăng xuất">
      {!loading && <LogOut />}
      <span className="hidden sm:inline">Đăng xuất</span>
    </Button>
  )
}

export { LogoutButton }
