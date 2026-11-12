import { expect, it } from 'vitest'
import { nairobiTime } from './nairobiTime'

it('shows real Nairobi time, including midnight rollover, independently of game time', () => {
  expect(nairobiTime(new Date('2026-11-10T12:45:00Z'))).toBe('15:45')
  expect(nairobiTime(new Date('2026-11-10T21:05:00Z'))).toBe('00:05')
})
