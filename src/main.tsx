import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { applyTheme } from './app/useShell'
import { useCensus } from './data/store'
import './styles/index.css'

// Pin a saved light/dark choice before the first paint so the page never flashes the other theme.
applyTheme(useCensus.getState().theme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
