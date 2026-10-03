import { useEffect, useState } from 'react'
import { applyMapping, type ImportResult } from '@/data/import'
import { datasetDef, type Employee } from '@/data/schema'
import { useCensus } from '@/data/store'
import type { Draft, SessionSheet } from '../../state/session'

interface Checked {
  token: string
  roster: readonly Employee[]
  result: ImportResult
}

/**
 * Run the full import of the current sheet (coerce, default, de-duplicate, link) for the
 * validation summary. It runs off the click, after a paint, and is re-run only when the sheet,
 * the person's choices or the roster it links to change.
 */
export function useCheck(item: SessionSheet | null, draft: Draft | null, enabled: boolean) {
  const roster = useCensus((s) => s.data.employees)
  const [checked, setChecked] = useState<Checked | null>(null)
  const token = item && draft ? `${item.id}|${draft.dataset ?? ''}|${draft.version}` : ''
  const current = checked && checked.token === token && checked.roster === roster ? checked.result : null

  useEffect(() => {
    if (!enabled || !item || !draft?.dataset || !draft.mapping || current) return
    const { dataset, mapping, options } = draft
    const handle = window.setTimeout(() => {
      const result = applyMapping({
        sheet: item.sheet,
        def: datasetDef(dataset),
        mapping,
        // The roster links everything else; a new roster links its own managers.
        roster: dataset === 'employees' ? undefined : roster,
        options,
      })
      setChecked({ token, roster, result })
    }, 30)
    return () => window.clearTimeout(handle)
  }, [enabled, item, draft, roster, token, current])

  return { result: current, pending: enabled && !!draft?.dataset && !current }
}
