import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import { useInactivityTimeout } from '../../hooks/useInactivityTimeout'

export default function AppLayout() {
  useInactivityTimeout()

  return (
    <div className="flex flex-col min-h-svh bg-gray-50 max-w-md mx-auto md:max-w-none md:mx-0 md:ml-56">
      <main className="flex-1 pb-20 md:pb-0">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
