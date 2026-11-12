/** Real-world time in Nairobi, independent of the adjustable in-game sun. */
const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Nairobi',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
export function nairobiTime(now: Date): string {
  return formatter.format(now)
}
