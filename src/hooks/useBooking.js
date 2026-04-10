import { useState } from 'react'

export function useBooking() {
  const [bookings, setBookings] = useState([])

  function addBooking(booking) {
    setBookings((prev) => [...prev, { ...booking, id: Date.now() }])
  }

  function removeBooking(id) {
    setBookings((prev) => prev.filter((b) => b.id !== id))
  }

  return { bookings, addBooking, removeBooking }
}
