import { expect, test } from 'vitest'
import { displayName, greetingFor } from './greeting'

const at = (hour: number) => new Date(2026, 0, 1, hour, 0, 0)

test('greeting follows the time of day', () => {
  expect(greetingFor(at(2))).toBe('Still up')
  expect(greetingFor(at(9))).toBe('Good morning')
  expect(greetingFor(at(14))).toBe('Good afternoon')
  expect(greetingFor(at(21))).toBe('Good evening')
})

test('name falls back through what Clerk actually has', () => {
  expect(displayName({ firstName: 'Ada' })).toBe('Ada')
  expect(displayName({ firstName: null, fullName: 'Ada Lovelace' })).toBe('Ada')
  expect(displayName({ firstName: null, username: 'ada' })).toBe('ada')
  expect(
    displayName({ primaryEmailAddress: { emailAddress: 'ada.lovelace@example.com' } }),
  ).toBe('Ada')
})

test('no usable name yields undefined, never a broken greeting', () => {
  expect(displayName(null)).toBeUndefined()
  expect(displayName({})).toBeUndefined()
  expect(displayName({ firstName: '   ' })).toBeUndefined()
})
