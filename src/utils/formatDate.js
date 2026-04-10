const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

const TIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

export function formatDate(date) {
  return DATE_FORMAT.format(new Date(date))
}

export function formatTime(date) {
  return TIME_FORMAT.format(new Date(date))
}

export function formatDateTime(date) {
  return `${formatDate(date)} at ${formatTime(date)}`
}
