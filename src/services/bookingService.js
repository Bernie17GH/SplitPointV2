const BASE_URL = import.meta.env.VITE_API_URL ?? ''

export async function fetchAvailability(date) {
  const res = await fetch(`${BASE_URL}/api/availability?date=${date}`)
  if (!res.ok) throw new Error('Failed to fetch availability')
  return res.json()
}

export async function createBooking(payload) {
  const res = await fetch(`${BASE_URL}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Failed to create booking')
  return res.json()
}
