import { Button, IconCopy, toast } from '@/components'
import { useAnalytics } from '@/data/context'
import { writeClipboard } from '@/lib/export/clipboard'
import { talkingPoints } from '../engine'
import { hrbpFor } from './model'

/** "Copy talking points": 5 to 7 plain-text bullets for a leader 1:1, on the clipboard. */
export function HeaderActions() {
  const ctx = useAnalytics()
  const copy = async () => {
    const text = talkingPoints(hrbpFor(ctx))
    const bullets = text.split('\n').filter((l) => l.startsWith('- ')).length
    try {
      await writeClipboard(text)
      toast('Talking points copied', {
        tone: 'good',
        description: `${bullets} bullets for ${ctx.scopeLabel}. Paste them into your 1:1 notes.`,
      })
    } catch {
      toast('The browser blocked copying', {
        tone: 'critical',
        description: 'Allow clipboard access for this page, or try again from a click.',
      })
    }
  }
  return (
    <Button size="sm" icon={<IconCopy />} onClick={() => void copy()} disabled={!ctx.data.employees.length}>
      Copy talking points
    </Button>
  )
}
