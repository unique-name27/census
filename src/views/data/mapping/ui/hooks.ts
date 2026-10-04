/**
 * Hooks for the Categories & mapping tab: container width for the diagrams, the chart tooltip,
 * the raw spellings of every stored upload, and the name shown in the change list.
 */
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { placeTip, renderTip, type TipContent } from '@/charts'
import type { ImportIssue } from '@/data/import/types'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { RawSpelling } from '@/data/reference'
import { DATASET_KEYS, type DatasetKey } from '@/data/schema'
import { useCensus } from '@/data/store'
import { loadReviewerName, saveReviewerName } from '../../state/room'

/** Width of an element; keeps the last real width while it is hidden (table view), so exports still work. */
export function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const w = Math.floor(el.getBoundingClientRect().width)
      if (w > 0) setWidth(w)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

/** Tooltip bound to a positioned container: show at a pointer event, or at an element (keyboard focus). */
export function useTip() {
  const boxRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const at = (content: TipContent, x: number, y: number) => {
    const tip = tipRef.current
    const box = boxRef.current
    if (!tip || !box) return
    renderTip(tip, content)
    tip.hidden = false
    placeTip(tip, box, x, y)
  }
  return {
    boxRef,
    tipRef,
    show(content: TipContent, e: { clientX: number; clientY: number }) {
      const box = boxRef.current
      if (!box) return
      const r = box.getBoundingClientRect()
      at(content, e.clientX - r.left, e.clientY - r.top)
    },
    showAt(content: TipContent, el: Element) {
      const box = boxRef.current
      if (!box) return
      const r = box.getBoundingClientRect()
      const b = el.getBoundingClientRect()
      at(content, b.left - r.left + b.width / 2, b.top - r.top + Math.min(b.height / 2, 24))
    },
    hide() {
      if (tipRef.current) tipRef.current.hidden = true
    },
  }
}

export interface RawLogs {
  /** Raw spellings per categorical field of every stored upload, as the importer read them. */
  spellings: Partial<Record<FieldRef, RawSpelling[]>>
  /** The import log of each dataset's current version. */
  issues: Partial<Record<DatasetKey, readonly ImportIssue[]>>
  loading: boolean
}

const EMPTY: RawLogs = { spellings: {}, issues: {}, loading: false }

/**
 * The stored original sheet of each dataset's current version, read for its spellings. The
 * spelling reader runs the importer's normalizers, so it loads only when there is a sheet to read.
 */
export function useRawLogs(): RawLogs {
  const versions = useCensus((s) => s.versions)
  const getRaw = useCensus((s) => s.getRaw)
  const [state, setState] = useState<{ key: string; logs: RawLogs }>({ key: '', logs: EMPTY })
  const stored = DATASET_KEYS.filter((k) => versions[k]?.hasRaw)
  const key = stored.map((k) => `${k}:${versions[k].versionId}`).join('|')

  useEffect(() => {
    if (!key) return
    let live = true
    void (async () => {
      const spellings: RawLogs['spellings'] = {}
      const issues: RawLogs['issues'] = {}
      try {
        const { rawSpellings } = await import('@/data/reference/spellings')
        for (const k of key.split('|').map((p) => p.split(':')[0] as DatasetKey)) {
          const v = useCensus.getState().versions[k]
          const rec = await getRaw(k).catch(() => null)
          if (!rec || !v) continue
          issues[k] = rec.issues
          Object.assign(spellings, rawSpellings(k, rec.sheet, v.mapping, v.applyOptions))
        }
      } catch (err) {
        console.error('Reading the stored sheets for their spellings failed', err)
      }
      if (live) setState({ key, logs: { spellings, issues, loading: false } })
    })()
    return () => {
      live = false
    }
  }, [key, getRaw])

  return key && state.key === key ? state.logs : key ? { ...EMPTY, loading: true } : EMPTY
}

/** Where an earlier version kept the change-list name, before it shared the reviewer's. */
const OLD_NAME_KEY = 'census:mapping-name'

/** The one name the Data room remembers (confirm, certify and the change list), moving an older one over. */
function readName(): string {
  const shared = loadReviewerName()
  if (shared) return shared
  try {
    const old = localStorage.getItem(OLD_NAME_KEY) ?? ''
    if (old) {
      saveReviewerName(old)
      localStorage.removeItem(OLD_NAME_KEY)
    }
    return old
  } catch {
    return ''
  }
}

/**
 * Your name for the change list: the same name the Data room uses to confirm and certify,
 * remembered in this browser. Blank reads "you" and leaves the remembered name as it is.
 */
export function useYourName(): [string, (name: string) => void] {
  const [name, setName] = useState(readName)
  const save = (next: string) => {
    setName(next)
    saveReviewerName(next)
  }
  return [name, save]
}

/** Smooth scrolling, unless motion is reduced (by the OS or in Settings). */
export function scrollBehavior(): ScrollBehavior {
  const reduce =
    document.documentElement.getAttribute('data-motion') === 'reduce' ||
    (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  return reduce ? 'auto' : 'smooth'
}
