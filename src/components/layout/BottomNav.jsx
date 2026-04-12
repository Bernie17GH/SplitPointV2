import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/',         label: 'Home',     icon: '🏠' },
  { to: '/artists',  label: 'Artists',  icon: '🎤' },
  { to: '/tours',    label: 'Tours',    icon: '🗺️' },
  { to: '/venues',   label: 'Venues',   icon: '🏟️' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

export default function BottomNav() {
  return (
    <nav className="
      fixed bottom-0 left-1/2 -translate-x-1/2 z-40
      w-full max-w-md bg-white border-t border-gray-200 flex safe-bottom
      md:inset-y-0 md:left-0 md:right-auto md:w-56 md:h-screen md:translate-x-0
      md:flex-col md:border-t-0 md:border-r md:border-gray-200 md:py-6 md:justify-start
    ">
      {/* Brand — desktop only */}
      <div className="hidden md:block px-5 mb-6">
        <p className="text-base font-bold text-gray-900 tracking-tight">SplitPoint</p>
        <p className="text-xs text-gray-400 mt-0.5">Tour Management</p>
      </div>

      {/* Nav items */}
      <div className="flex w-full md:flex-col md:gap-0.5 md:px-2">
        {navItems.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center py-3 text-xs font-medium transition-colors
               md:flex-none md:flex-row md:w-full md:items-center md:justify-start md:px-3 md:py-2.5 md:rounded-xl md:text-sm md:gap-3
               ${isActive
                 ? 'text-indigo-600 md:bg-indigo-50 md:text-indigo-700'
                 : 'text-gray-400 hover:text-gray-600 md:text-gray-600 md:hover:bg-gray-100'
               }`
            }
          >
            <span className="text-lg leading-none mb-0.5 md:mb-0">{icon}</span>
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
