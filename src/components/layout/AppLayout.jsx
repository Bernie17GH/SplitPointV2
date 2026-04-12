import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import { useInactivityTimeout } from '../../hooks/useInactivityTimeout'

export default function AppLayout() {
  useInactivityTimeout()

  return (
    <div className="flex flex-col min-h-svh max-w-md mx-auto bg-gray-50">
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
