import { useEffect, useRef } from 'react'

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

interface GoogleIdentity {
  initialize: (config: { client_id: string; callback: (response: { credential?: string }) => void }) => void
  renderButton: (parent: HTMLElement, options: Record<string, string | number>) => void
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentity } }
  }
}

let loading: Promise<void> | null = null

/** Loads Google's sign-in script once. A failed load (blocked, offline) clears itself so the next visit tries again. */
function loadScript(): Promise<void> {
  if (window.google) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      loading = null
      script.remove()
      reject(new Error('Google sign-in failed to load'))
    }
    document.head.appendChild(script)
  })
  return loading
}

/** Google's own "Sign in with Google" button; `onCredential` gets the signed ID token the server verifies. */
export function GoogleSignInButton({ clientId, onCredential }: { clientId: string; onCredential: (credential: string) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const callback = useRef(onCredential)
  callback.current = onCredential

  useEffect(() => {
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !host.current || !window.google) return
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => response.credential && callback.current(response.credential),
        })
        window.google.accounts.id.renderButton(host.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          locale: 'iw',
          width: 280,
        })
      })
      .catch(() => {
        // The button just stays away; phone login still works.
      })
    return () => {
      cancelled = true
    }
  }, [clientId])

  return <div ref={host} className="google-signin" />
}
