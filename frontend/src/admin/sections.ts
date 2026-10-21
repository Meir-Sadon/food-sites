import type { Feature } from '../api/site'

export type Tab = { to: string; key: string; feature?: Feature }

/** The admin's pages in three sections: the top bar picks a section, the row under it a page in that section. */
export const sections: { key: string; tabs: Tab[] }[] = [
  {
    key: 'reports',
    tabs: [
      { to: '/admin/orders', key: 'admin.nav.orders' },
      { to: '/admin/reports', key: 'admin.nav.reports' },
      { to: '/admin/usage', key: 'admin.nav.usage' },
      { to: '/admin/audit', key: 'admin.nav.audit' },
    ],
  },
  {
    key: 'display',
    tabs: [
      { to: '/admin/dishes', key: 'admin.nav.dishes' },
      { to: '/admin/categories', key: 'admin.nav.categories' },
      { to: '/admin/dish-groups', key: 'admin.nav.dishGroups' },
      { to: '/admin/appearance', key: 'admin.nav.appearance' },
      { to: '/admin/popup', key: 'admin.nav.popup' },
      { to: '/admin/social', key: 'admin.nav.social' },
      { to: '/admin/contacts', key: 'admin.nav.contacts' },
      { to: '/admin/reviews', key: 'admin.nav.reviews', feature: 'reviews' },
    ],
  },
  {
    key: 'site',
    tabs: [
      { to: '/admin/settings', key: 'admin.nav.settings' },
      { to: '/admin/messages', key: 'admin.nav.messages' },
      { to: '/admin/feedback', key: 'admin.nav.feedback' },
    ],
  },
]

/** The section a page belongs to, by its path or the path of the page it opens from (such as /admin/dishes/12). */
export function sectionOf(pathname: string) {
  return sections.find((section) => section.tabs.some((tab) => pathname === tab.to || pathname.startsWith(`${tab.to}/`)))
}
