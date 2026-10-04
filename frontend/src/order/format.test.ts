import type { TFunction } from 'i18next'
import { describe, expect, it } from 'vitest'
import { menuDish } from '../test/catalogData'
import { unitLabel } from './format'

const t = ((key: string) => key) as unknown as TFunction

describe('unitLabel', () => {
  it('shows kilos only when the client picks a free weight', () => {
    expect(unitLabel(menuDish(1, 'בשר', 1, { sellBy: 'Weight', choiceMode: 'Free' }), t)).toBe('order.kilo')
  })

  it('shows no unit when the amount multiplies a set option, even for weight dishes', () => {
    expect(unitLabel(menuDish(2, 'קוסקוס', 1, { sellBy: 'Weight', choiceMode: 'Fixed' }), t)).toBe('')
    expect(unitLabel(menuDish(3, 'עוף', 1), t)).toBe('')
  })
})
