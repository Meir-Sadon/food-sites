import { useTranslation } from 'react-i18next'

interface Props {
  value: string
  onChange: (value: string) => void
}

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
)

/** The order page's dish search: typing a few letters swaps the categories for the matching dishes. */
export function DishSearch({ value, onChange }: Props) {
  const { t } = useTranslation()
  return (
    <div className="dish-search" role="search">
      <label className="visually-hidden" htmlFor="dish-search">
        {t('order.search.label')}
      </label>
      <SearchIcon />
      <input
        id="dish-search"
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        value={value}
        placeholder={t('order.search.placeholder')}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button type="button" className="dish-search__clear" aria-label={t('order.search.clear')} onClick={() => onChange('')}>
          ×
        </button>
      )}
    </div>
  )
}
