import { useEffect } from 'react'
import { scrollBehavior } from './motion'

/** A message under one field (`FieldError`), or a field marked invalid. */
const FIELD_ERROR = '.field-error, [aria-invalid="true"]'
/** A message for the whole form (`Status`, a form's own alert). */
const FORM_ERROR = '.form-error, [role="alert"]'
const FOCUSABLE = 'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, button:not([disabled])'

/** How long after a submit an error may still show up: the server can be slow to wake. */
const WATCH_MS = 30_000

const hasText = (element: Element) => !!element.textContent?.trim()

/** When a page last brought a problem into view itself, so the submit watch below leaves the screen where it is. */
let shownAt = -1

/** The first error message shown in the element, in page order: a field's own before the form's. */
export function firstError(root: ParentNode): HTMLElement | null {
  const visible = (selector: string) => [...root.querySelectorAll<HTMLElement>(selector)].find((e) => e.matches('[aria-invalid="true"]') || hasText(e))
  return visible(FIELD_ERROR) ?? visible(FORM_ERROR) ?? null
}

/** The control the error is about: the one it describes (`aria-describedby`), or the one next to it. */
function fieldOf(error: HTMLElement, root: ParentNode): HTMLElement | null {
  const focusable = (element: Element | null) =>
    !element ? null : element.matches(FOCUSABLE) ? (element as HTMLElement) : element.querySelector<HTMLElement>(FOCUSABLE)
  if (error.matches('[aria-invalid="true"]')) return focusable(error)
  if (!error.matches('.field-error')) return null
  if (error.id) {
    const described = root.querySelector(`[aria-describedby~="${error.id.replace(/["\\]/g, '\\$&')}"]`)
    if (described) return focusable(described)
  }
  // Otherwise the field the message sits in, or the one right before it.
  return focusable(error.closest('label, fieldset, .field')) ?? focusable(error.previousElementSibling)
}

/** Opens every closed `<details>` around the element, so what is inside it can be seen. */
function reveal(element: HTMLElement) {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    // A summary is seen with its own details closed.
    const ownSummary = parent === element.parentElement && element.matches('summary')
    if (parent instanceof HTMLDetailsElement && !parent.open && !ownSummary) parent.open = true
  }
}

/** A page that settles a problem right where the client is (not by moving to a field) tells the submit watch to leave the screen alone. */
export function holdScroll() {
  shownAt = performance.now()
}

/** Brings an element to the middle of the screen and gives it the focus, without the focus scrolling again. */
export function bringIntoView(element: HTMLElement) {
  shownAt = performance.now()
  reveal(element)
  element.scrollIntoView?.({ behavior: scrollBehavior(), block: 'center' })
  element.focus?.({ preventScroll: true })
}

/** Scrolls to the first error in the element and focuses its field. Says whether there was one. */
export function scrollToFirstError(root: ParentNode): boolean {
  const error = firstError(root)
  if (!error) return false
  const field = fieldOf(error, root)
  if (field) bringIntoView(field)
  else {
    shownAt = performance.now()
    reveal(error)
    error.scrollIntoView?.({ behavior: scrollBehavior(), block: 'center' })
  }
  return true
}

/**
 * On every form of the site and the admin: when a submit ends with errors, scrolls to the first one and focuses its
 * field. The forms check on submit (theirs or the server's answer) and show `FieldError`/`Status` messages, so this
 * watches the submitted form until a message shows up, the visitor edits it, or a while has passed. A page that shows
 * a problem outside the form calls `bringIntoView` itself, and the watch stops there.
 */
export function useScrollToInvalid() {
  useEffect(() => {
    let stop = () => {}

    function onSubmit(event: Event) {
      stop()
      const form = event.target
      if (!(form instanceof HTMLFormElement)) return

      let watching = true
      const since = performance.now()
      const check = () => {
        if (watching && (shownAt >= since || (form.isConnected && scrollToFirstError(form)))) stop()
      }
      const observer = new MutationObserver(check)
      const timer = window.setTimeout(() => stop(), WATCH_MS)
      const edited = () => stop()
      stop = () => {
        watching = false
        observer.disconnect()
        window.clearTimeout(timer)
        form.removeEventListener('input', edited)
        form.removeEventListener('change', edited)
        stop = () => {}
      }
      observer.observe(form, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-invalid'] })
      form.addEventListener('input', edited)
      form.addEventListener('change', edited)
      // Messages from a check in the submit handler itself are on the page once the event is over.
      window.setTimeout(check)
    }

    // Capturing, so the watch starts before the form's own handler runs.
    document.addEventListener('submit', onSubmit, true)
    return () => {
      document.removeEventListener('submit', onSubmit, true)
      stop()
    }
  }, [])
}
