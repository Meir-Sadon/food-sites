import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { publicApi, site } from '../test/catalogData'
import { fakeApi } from '../test/fakeApi'
import { renderAt } from '../test/render'

describe('first visit before the look is known', () => {
  it('keeps the page hidden until the site answered, then shows it', async () => {
    const hider = document.createElement('style')
    hider.id = 'theme-pending'
    document.head.appendChild(hider)
    fakeApi({ ...publicApi, 'GET /api/site': () => site({}) })
    renderAt('/about')
    await screen.findByRole('main')
    await waitFor(() => expect(document.getElementById('theme-pending')).toBeNull())
  })
})
