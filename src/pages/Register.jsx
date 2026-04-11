import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Register() {
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    name: '',
    email: '',
    agency: '',
    phone: '',
    password: '',
    confirmPassword: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    try {
      await signUp(form.email.trim(), form.password, {
        name: form.name.trim(),
        agency: form.agency.trim(),
        phone: form.phone.trim(),
      })
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const fields = [
    { id: 'name',            label: 'Full name',       type: 'text',     placeholder: 'Jane Smith' },
    { id: 'email',           label: 'Email',           type: 'email',    placeholder: 'you@example.com' },
    { id: 'agency',          label: 'Agency name',     type: 'text',     placeholder: 'Smith Talent Group' },
    { id: 'phone',           label: 'Phone',           type: 'tel',      placeholder: '+1 (555) 000-0000' },
    { id: 'password',        label: 'Password',        type: 'password', placeholder: '••••••••' },
    { id: 'confirmPassword', label: 'Confirm password', type: 'password', placeholder: '••••••••' },
  ]

  return (
    <div className="min-h-svh bg-gray-50 flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">SplitPoint</h1>
          <p className="text-gray-400 mt-1 text-sm">Create your agent account</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          {fields.map(({ id, label, type, placeholder }) => (
            <div key={id}>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor={id}>
                {label}
              </label>
              <input
                id={id}
                type={type}
                required={id !== 'phone'}
                value={form[id]}
                onChange={(e) => set(id, e.target.value)}
                placeholder={placeholder}
                autoComplete={
                  id === 'password' ? 'new-password' :
                  id === 'confirmPassword' ? 'new-password' :
                  id === 'email' ? 'email' : 'off'
                }
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          ))}

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2.5">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-indigo-600 text-white text-sm font-semibold py-2.5 hover:bg-indigo-700 transition-colors disabled:opacity-60"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-indigo-600 font-medium hover:text-indigo-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
