import { Outlet } from 'react-router'
import { TopBar } from './TopBar'

export function ClientLayout() {
  return (
    <>
      <TopBar />
      <main className="page">
        <Outlet />
      </main>
    </>
  )
}
