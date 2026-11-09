import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { TipPicker, noTip, tipAmount, type TipState } from './TipPicker'

function Harness({ onTip }: { onTip: (amount: number) => void }) {
  const [tip, setTip] = useState<TipState>(noTip)
  onTip(tipAmount(tip))
  return <TipPicker tip={tip} onChange={setTip} />
}

describe('tipAmount', () => {
  it('is 0 with no choice, the amount of a fixed choice, and the typed amount for another one', () => {
    expect(tipAmount(noTip)).toBe(0)
    expect(tipAmount({ choice: 15, custom: '' })).toBe(15)
    expect(tipAmount({ choice: 'other', custom: '12.5' })).toBe(12.5)
  })

  it('is 0 for a typed amount that is empty, negative or not a number', () => {
    for (const custom of ['', '-3', 'abc', '0']) expect(tipAmount({ choice: 'other', custom })).toBe(0)
  })
})

describe('TipPicker', () => {
  it('offers 5, 10, 15, 20 and another amount as radio buttons, and asks for the amount only for the last', async () => {
    let amount = 0
    render(<Harness onTip={(a) => (amount = a)} />)
    const user = userEvent.setup()

    expect(screen.getAllByRole('radio')).toHaveLength(5)
    expect(screen.queryByRole('spinbutton')).toBeNull()

    await user.click(screen.getByRole('radio', { name: '₪10' }))
    expect(amount).toBe(10)

    await user.click(screen.getByRole('radio', { name: 'סכום אחר' }))
    await user.type(screen.getByRole('spinbutton'), '7')
    expect(amount).toBe(7)
  })

  it('takes the tip off when the picked amount is pressed again', async () => {
    let amount = 0
    render(<Harness onTip={(a) => (amount = a)} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('radio', { name: '₪5' }))
    expect(amount).toBe(5)
    await user.click(screen.getByRole('radio', { name: '₪5' }))
    expect(amount).toBe(0)
  })
})
