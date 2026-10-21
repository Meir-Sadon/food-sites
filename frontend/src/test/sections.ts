import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/** A foldable admin section by its title, unfolded (they start folded). */
export async function openSection(name: string | RegExp) {
  const region = await screen.findByRole('region', { name })
  const toggle = region.querySelector<HTMLButtonElement>('.admin-section__toggle')
  if (toggle?.getAttribute('aria-expanded') === 'false') await userEvent.click(toggle)
  return region
}
