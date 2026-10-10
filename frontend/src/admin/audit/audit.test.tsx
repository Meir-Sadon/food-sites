import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { AuditEntry } from '../../api/admin'
import { adminSession, fakeApi } from '../../test/fakeApi'
import { renderAt } from '../../test/render'

const entry = (id: number, overrides: Partial<AuditEntry> = {}): AuditEntry => ({
  id,
  at: '2026-10-10T18:30:00Z',
  actor: 'owner',
  action: 'Modified',
  entityType: 'Category',
  entityId: String(id),
  label: `קטגוריה ${id}`,
  changes: [],
  ...overrides,
})

describe('audit trail', () => {
  it('shows who changed what, with the old and new values', async () => {
    fakeApi({
      ...adminSession,
      'GET /api/admin/audit\\?(.*)': () => [
        entry(3, {
          actor: 'master',
          entityType: 'DishOption',
          label: 'קוסקוס › מנה',
          changes: [
            { field: 'Price', from: '40.00', to: '45.00', secret: false },
            { field: 'IsDefault', from: 'false', to: 'true', secret: false },
          ],
        }),
        entry(2, {
          entityType: 'Settings',
          label: null,
          changes: [{ field: 'AdminPasswordHash', from: null, to: null, secret: true }],
        }),
        entry(1, { action: 'LoggedIn', entityType: null, entityId: null, label: null }),
      ],
    })
    renderAt('/admin/audit')

    expect(await screen.findByRole('heading', { level: 1, name: 'יומן שינויים' })).toBeInTheDocument()
    await screen.findByText('קוסקוס › מנה')
    const rows = screen.getAllByRole('listitem').filter((li) => li.classList.contains('audit-entry'))
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('מנהל ראשי עדכן/ה אפשרות מנה: קוסקוס › מנה')
    expect(rows[0]).toHaveTextContent('מחיר: היה: 40.00 · עכשיו: 45.00')
    expect(rows[0]).toHaveTextContent('ברירת מחדל: היה: לא · עכשיו: כן')
    expect(rows[1]).toHaveTextContent('בעל העסק עדכן/ה הגדרות')
    expect(rows[1]).toHaveTextContent('סיסמת בעל העסק שונתה')
    expect(rows[2]).toHaveTextContent('בעל העסק נכנס/ה לאזור הניהול')
    // Read-only: nothing on the page edits or removes an entry.
    expect(within(screen.getByRole('main')).queryByRole('button')).toBeNull()
  })

  it('loads earlier entries page by page', async () => {
    const firstPage = Array.from({ length: 50 }, (_, i) => entry(100 - i))
    const api = fakeApi({
      ...adminSession,
      'GET /api/admin/audit\\?(.*)': ([, query]) =>
        new URLSearchParams(query).get('before') === '51' ? [entry(50), entry(49)] : firstPage,
    })
    renderAt('/admin/audit')

    await userEvent.setup().click(await screen.findByRole('button', { name: 'הצגת שינויים קודמים' }))

    expect(await screen.findByText('קטגוריה 49')).toBeInTheDocument()
    expect(api.calls.filter((c) => c.path.startsWith('/api/admin/audit')).map((c) => c.path)).toEqual([
      '/api/admin/audit?limit=50',
      '/api/admin/audit?limit=50&before=51',
    ])
    expect(screen.queryByRole('button', { name: 'הצגת שינויים קודמים' })).not.toBeInTheDocument()
  })

  it('says when nothing was recorded yet', async () => {
    fakeApi({ ...adminSession, 'GET /api/admin/audit\\?(.*)': () => [] })
    renderAt('/admin/audit')

    expect(await screen.findByText('עוד לא נרשמו שינויים.')).toBeInTheDocument()
  })
})
