import { screen } from '@testing-library/react'
import type userEvent from '@testing-library/user-event'

/** Confirms every ordered unit that offers add-ons as it is, like a client who wants none. */
export async function confirmNoAdjustments(user: ReturnType<typeof userEvent.setup>) {
  for (const button of screen.queryAllByRole('button', { name: 'אישור ללא התאמות' })) await user.click(button)
}
