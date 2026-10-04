/**
 * The original sheet and import log of a dataset's current version, loaded from this browser on
 * demand. Shared by the Raw, Mapping and Quality panels of one dataset.
 */
import { useEffect, useState } from 'react'
import type { DatasetVersion, RawRecord } from '@/data/quality'
import type { DatasetKey } from '@/data/schema'
import { useCensus } from '@/data/store'

export interface RawState {
  raw: RawRecord | null
  /** Still reading from storage. */
  loading: boolean
}

export function useRawRecord(key: DatasetKey, version: DatasetVersion | undefined): RawState {
  const getRaw = useCensus((s) => s.getRaw)
  const versionId = version?.versionId ?? null
  const hasRaw = !!version?.hasRaw
  const [state, setState] = useState<{ id: string | null; raw: RawRecord | null }>({ id: null, raw: null })
  useEffect(() => {
    if (!versionId || !hasRaw) return
    let live = true
    void getRaw(key, versionId).then((raw) => {
      if (live) setState({ id: versionId, raw })
    })
    return () => {
      live = false
    }
  }, [getRaw, key, versionId, hasRaw])
  if (!versionId || !hasRaw) return { raw: null, loading: false }
  return state.id === versionId ? { raw: state.raw, loading: false } : { raw: null, loading: true }
}
