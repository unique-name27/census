import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { applyTheme } from './app/useShell'
import { setSampleSeed, useCensus } from './data/store'
import './styles/index.css'

// Pin a saved light/dark choice before the first paint so the page never flashes the other theme.
applyTheme(useCensus.getState().theme)

// The sample arrives the way real data does: raw extracts with confirmations and certifications
// (src/data/sample/raw). The store awaits the starter state on init; the import of the raw
// extracts follows in the background. If it fails to load, the plain sample shows.
const messySample = import('./data/sample/raw/load').then((m) => m.messySampleLoader()).catch(() => ({}))
setSampleSeed(() => messySample)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
