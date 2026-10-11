import { useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { IMAGE_TYPES, MAX_DISH_IMAGES, MAX_IMAGE_BYTES, dishesApi, type Dish } from '../../api/catalog'
import { ConfirmRemove, DragHandle, MoveButtons, Section, Status } from '../ui'
import { useErrorMessage } from '../hooks'
import { moved, useDragSort } from '../sortable'

export function DishImagesSection({ dish, onChange }: { dish: Dish; onChange: (dish: Dish) => void }) {
  const { t } = useTranslation()
  const errorMessage = useErrorMessage()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const full = dish.images.length >= MAX_DISH_IMAGES
  const sort = useDragSort(dish.images, (image) => image.id, reorder, 'grid')

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

  // Shows the new order at once; the saved dish replaces it, or the old one comes back with an error.
  function reorder(imageIds: number[]) {
    const byId = new Map(dish.images.map((image) => [image.id, image]))
    onChange({ ...dish, images: imageIds.map((id, displayOrder) => ({ ...byId.get(id)!, displayOrder })) })
    void run(async () => {
      try {
        return await dishesApi.reorderImages(dish.id, imageIds)
      } catch (err) {
        onChange(dish)
        throw err
      }
    })
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
      {dish.images.length > 1 && <p className="hint">{t('admin.dishes.imagesOrderHint')}</p>}
      <ol className="image-list">
        {sort.items.map((image, index) => {
          const name = t('admin.dishes.imageN', { n: index + 1 })
          return (
            <li
              key={image.id}
              ref={sort.itemRef(image.id)}
              className={`image-list__item${sort.dragging === image.id ? ' is-dragging' : ''}`}
            >
              <span className="image-list__picture">
                <img src={image.url} alt={`${dish.name} – ${name}`} draggable={false} />
                {index === 0 && <span className="badge image-list__main">{t('admin.dishes.mainImage')}</span>}
              </span>
              <span className="row">
                {dish.images.length > 1 && <DragHandle {...sort.handleProps(image.id)} />}
                <MoveButtons
                  name={name}
                  first={index === 0}
                  last={index === dish.images.length - 1}
                  onMove={(direction) => reorder(moved(dish.images.map((i) => i.id), index, direction))}
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
