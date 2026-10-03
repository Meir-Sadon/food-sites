import { useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { IMAGE_TYPES, MAX_DISH_IMAGES, MAX_IMAGE_BYTES, dishesApi, type Dish } from '../../api/catalog'
import { ConfirmRemove, MoveButtons, Section, Status } from '../ui'
import { useErrorMessage } from '../hooks'

export function DishImagesSection({ dish, onChange }: { dish: Dish; onChange: (dish: Dish) => void }) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const full = dish.images.length >= MAX_DISH_IMAGES

  async function run(action: () => Promise<Dish>) {
    setBusy(true)
    setError(null)
    try {
      onChange(await action())
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_IMAGE_BYTES) {
      setError(t('errors.imageTooLarge'))
      return
    }
    void run(() => dishesApi.addImage(dish.id, file))
  }

  return (
    <Section title={t('admin.dishes.images')} hint={t('admin.settings.imageHint')}>
      <ol className="image-list">
        {dish.images.map((image, index) => {
          const name = t('admin.dishes.imageN', { n: index + 1 })
          return (
            <li key={image.id} className="image-list__item">
              <img src={image.url} alt={`${dish.name} – ${name}`} />
              <span className="row">
                <MoveButtons
                  name={name}
                  first={index === 0}
                  last={index === dish.images.length - 1}
                  onMove={(direction) => run(() => dishesApi.moveImage(dish.id, image.id, direction))}
                />
                <ConfirmRemove name={name} onConfirm={() => run(() => dishesApi.removeImage(dish.id, image.id))} />
              </span>
            </li>
          )
        })}
      </ol>
      {full ? (
        <p className="hint">{t('admin.dishes.imagesFull')}</p>
      ) : (
        <label className="button-file">
          {t('admin.settings.chooseImage')}
          <input type="file" accept={IMAGE_TYPES} onChange={handleFile} disabled={busy} />
        </label>
      )}
      {busy && <p role="status">{t('admin.settings.uploading')}</p>}
      {error && <Status message={error} error />}
    </Section>
  )
}
