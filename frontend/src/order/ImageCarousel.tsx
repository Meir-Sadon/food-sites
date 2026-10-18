import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useReducedMotion } from '../components/motion'

const INTERVAL_MS = 4500

/** Dish pictures that rotate every few seconds (not at all for people who asked for less motion). */
export function ImageCarousel({ images, name }: { images: string[]; name: string }) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)
  const many = images.length > 1
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (!many || reducedMotion) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % images.length), INTERVAL_MS)
    return () => clearInterval(timer)
  }, [many, reducedMotion, images.length])

  if (images.length === 0) return null
  const current = index % images.length

  return (
    <div className="carousel">
      <img src={images[current]} alt={many ? t('order.imageOf', { name, n: current + 1, count: images.length }) : name} loading="lazy" />
    </div>
  )
}
