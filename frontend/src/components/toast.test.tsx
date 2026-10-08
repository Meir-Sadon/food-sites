import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TOAST_MS, ToastProvider } from './ToastProvider'
import { useToast } from './toast'

function Saver({ message }: { message: string }) {
  const toast = useToast()
  return (
    <button type="button" onClick={() => toast(message)}>
      save
    </button>
  )
}

describe('Toasts', () => {
  afterEach(() => vi.useRealTimers())

  it('shows a message in the live region and hides it after a while', () => {
    vi.useFakeTimers()
    render(
      <ToastProvider>
        <Saver message="נשמר." />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    expect(screen.getByRole('status')).toHaveTextContent('נשמר.')

    // Saving again shows one message, not two.
    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    expect(screen.getAllByText('נשמר.')).toHaveLength(1)

    act(() => vi.advanceTimersByTime(TOAST_MS))
    expect(screen.queryByText('נשמר.')).not.toBeInTheDocument()
  })

  it('closes on the close button', () => {
    render(
      <ToastProvider>
        <Saver message="נשמר." />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    fireEvent.click(screen.getByRole('button', { name: 'סגירת ההודעה' }))
    expect(screen.queryByText('נשמר.')).not.toBeInTheDocument()
  })
})
