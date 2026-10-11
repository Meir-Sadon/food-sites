import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './i18n'
import './index.css'
// The looks a site can pick (Settings → style); each applies only under its <html data-style>.
import './styles/street.css'
// The site's palette, after the shared CSS so its variables win.
import '@site/theme.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
