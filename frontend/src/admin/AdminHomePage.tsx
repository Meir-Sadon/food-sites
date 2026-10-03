import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { adminLogout } from '../api/admin'

export function AdminHomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  async function handleLogout() {
    await adminLogout().catch(() => undefined)
    navigate('/admin/login', { replace: true })
  }

  return (
    <main className="page">
      <h1>{t('admin.title')}</h1>
      <p>{t('admin.welcome')}</p>
      <button type="button" onClick={handleLogout}>
        {t('admin.logout')}
      </button>
    </main>
  )
}
