import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/',        label: 'Home',    icon: '🏠' },
  { to: '/artists', label: 'Artists', icon: '🎤' },
  { to: '/tours',   label: 'Tours',   icon: '🗺️' },
  { to: '/venues',  label: 'Venues',  icon: '🏟️' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-gray-200 flex safe-bottom">
      {navItems.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center justify-center py-3 text-xs font-medium transition-colors ${
              isActive ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
            }`
          }
        >
          <span className="text-lg leading-none mb-0.5">{icon}</span>
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
