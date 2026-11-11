import { useEffect, useRef, useState } from 'react'
import type { BannerFrame } from '../api/banner'
import { useReducedMotion } from './motion'
import { frameAt, scrollProgress } from './scrollFrames'

/**
 * The animation under the order page's banner: while the page scrolls through this tall section the pictures stay in
 * place and fade from one to the next, and back when the visitor scrolls up. A visitor who asked for less motion
 * sees the last picture only.
 */
export function ScrollAnimation({ frames, screens }: { frames: BannerFrame[]; screens: number }) {
  const section = useRef<HTMLElement>(null)
  const reduced = useReducedMotion()
  const [position, setPosition] = useState({ index: 0, mix: 0 })

  useEffect(() => {
    if (reduced) return
    let queued = false
    const update = () => {
      queued = false
      const el = section.current
      if (!el) return
      const { top, height } = el.getBoundingClientRect()
      setPosition(frameAt(scrollProgress(top, height, window.innerHeight), frames.length))
    }
    const onScroll = () => {
      if (queued) return
      queued = true
      requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [frames.length, reduced])

  if (reduced) {
    return (
      <section className="scroll-animation scroll-animation--still" data-testid="scroll-animation">
        <img src={frames[frames.length - 1].url} alt="" />
      </section>
    )
  }

  return (
    <section ref={section} className="scroll-animation" style={{ blockSize: `${screens * 100}svh` }} data-testid="scroll-animation">
      <div className="scroll-animation__stage">
        {frames.map((frame, i) => (
          <img
            key={frame.id}
            src={frame.url}
            alt=""
            style={{ opacity: i === position.index ? 1 : i === position.index + 1 ? position.mix : 0 }}
          />
        ))}
      </div>
    </section>
  )
}
