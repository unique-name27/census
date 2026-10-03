import { useState } from 'react'
import { toast } from '@/components/toast'

/**
 * Track running actions by id (a download being prepared, a reset being written) so their
 * buttons can show progress and refuse a second click. Failures show one plain toast.
 */
export function useBusy() {
  const [running, setRunning] = useState<ReadonlySet<string>>(() => new Set())
  const isBusy = (id: string) => running.has(id)
  async function run(id: string, fn: () => Promise<void>, failure = 'That did not work. Try again.') {
    if (running.has(id)) return
    setRunning((s) => new Set(s).add(id))
    try {
      await fn()
    } catch {
      toast(failure, { tone: 'critical' })
    } finally {
      setRunning((s) => {
        const next = new Set(s)
        next.delete(id)
        return next
      })
    }
  }
  return { isBusy, run }
}
