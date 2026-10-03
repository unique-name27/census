/** STUB: replaced by the app shell builder. */
import { useEffect } from 'react'
import { AnalyticsProvider } from '@/data/context'
import { useCensus } from '@/data/store'
import { VIEWS } from '@/views/registry'

export function App() {
  const ready = useCensus((s) => s.ready)
  const init = useCensus((s) => s.init)
  useEffect(() => {
    void init()
  }, [init])
  if (!ready) return null
  return (
    <AnalyticsProvider>
      <main className="p-8">
        {VIEWS.map((v) => (
          <v.View key={v.key} tab="" />
        ))}
      </main>
    </AnalyticsProvider>
  )
}
