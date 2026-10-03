/**
 * One upload session: the files read, the plan of which sheet goes where, the person's choices
 * per sheet (dataset, columns, reading options, value fixes) and what has been applied. The
 * import library is loaded on first use so the spreadsheet reader stays out of the main bundle.
 */
import { create } from 'zustand'
import { toast } from '@/components/toast'
import type { ApplyOptions, FileFormat, ImportResult, Mapping, ParsedSheet } from '@/data/import'
import { DATASET_KEYS, type DatasetKey, datasetDef } from '@/data/schema'
import { useCensus } from '@/data/store'
import { blockingFields, learnedPicks, replacedMessage, type Step } from '../engine/flow'
import { nextPending, type PlannedSheet, planSheets, type SheetInfo, type SheetStatus } from '../engine/plan'
import { useImportLogs } from './importLog'

type ImportLib = typeof import('@/data/import')
let libPromise: Promise<ImportLib> | null = null
/** The import library, loaded once on demand. */
export const loadImportLib = (): Promise<ImportLib> => {
  libPromise ??= import('@/data/import')
  return libPromise
}

/** File types the drop zone and file picker accept. */
export const ACCEPTED_FILE = /\.(xlsx|xlsm|xls|csv|tsv)$/i
export const ACCEPT_ATTR = '.xlsx,.xlsm,.xls,.csv,.tsv'

export interface Draft {
  dataset: DatasetKey | null
  mapping: Mapping | null
  /** The person's overrides only; anything absent is detected from the data. */
  options: ApplyOptions
  /** Fields whose column the person picked (remembered as synonyms on apply). */
  overrides: string[]
  /** The mapping came from a profile saved for this header layout. */
  fromProfile: boolean
  /** A saved profile exists but no longer covers a required field. */
  profileStale: boolean
  step: Step
  /** Bumped on every change so derived work can tell whether it is current. */
  version: number
}

export interface SessionSheet extends PlannedSheet {
  sheet: ParsedSheet
  format: FileFormat
}

export interface ReadProgress {
  fileName: string
  index: number
  total: number
}

interface SessionState {
  phase: 'idle' | 'reading' | 'review'
  reading: ReadProgress | null
  sheets: SessionSheet[]
  status: Record<string, SheetStatus>
  currentId: string | null
  drafts: Record<string, Draft>
  /** Plain notes about the files (empty sheets left out). */
  notes: string[]
  /** An apply is being written. */
  busy: boolean
  start: (files: readonly File[], target?: DatasetKey | null) => Promise<void>
  goto: (id: string) => Promise<void>
  setDataset: (id: string, dataset: DatasetKey | null) => Promise<void>
  update: (id: string, patch: (d: Draft) => Partial<Draft>) => void
  skip: (id: string) => Promise<void>
  apply: (id: string, result: ImportResult) => Promise<void>
  close: () => void
}

const IDLE = {
  phase: 'idle' as const,
  reading: null,
  sheets: [],
  status: {},
  currentId: null,
  drafts: {},
  notes: [],
  busy: false,
}

/** Let the browser paint progress between heavy steps. */
const nextFrame = () => new Promise<void>((r) => setTimeout(r, 0))

async function makeDraft(lib: ImportLib, item: SessionSheet, dataset: DatasetKey | null): Promise<Draft> {
  const base = {
    options: {},
    overrides: [],
    fromProfile: false,
    profileStale: false,
    step: 'columns' as Step,
    version: 0,
  }
  if (!dataset) return { ...base, dataset: null, mapping: null }
  const def = datasetDef(dataset)
  const saved = await lib.loadProfile(dataset, item.sheet.headers)
  if (saved) {
    const { mapping, options } = lib.applyProfile(saved, item.sheet.headers, def)
    const stale = blockingFields(lib.applyMapping, item.sheet, def, mapping).length > 0
    return {
      ...base,
      dataset,
      mapping,
      options,
      fromProfile: true,
      profileStale: stale,
      step: stale ? 'columns' : 'check',
    }
  }
  const mapping = lib.autoMap(item.sheet.headers, item.sheet.rows, def, lib.loadLearnedSynonyms(dataset))
  return { ...base, dataset, mapping }
}

interface ReadBook {
  fileName: string
  format: FileFormat
  sheets: ParsedSheet[]
}

export const useImportSession = create<SessionState>((set, get) => {
  /** Make sure a sheet has a draft, then show it. */
  async function show(id: string) {
    const lib = await loadImportLib()
    const item = get().sheets.find((s) => s.id === id)
    if (!item) return
    if (!get().drafts[id]) {
      const draft = await makeDraft(lib, item, item.dataset)
      set((s) => ({ drafts: { ...s.drafts, [id]: draft } }))
    }
    set({ currentId: id })
  }

  async function advance(fromId: string) {
    const { sheets, status } = get()
    const next = nextPending(sheets, status, fromId)
    if (next) await show(next)
    else set({ ...IDLE })
  }

  /** Read each file in turn, reporting the ones that can't be used. */
  async function readFiles(
    lib: ImportLib,
    files: readonly File[],
  ): Promise<{ books: ReadBook[]; notes: string[] }> {
    const books: ReadBook[] = []
    const notes: string[] = []
    for (const [index, file] of files.entries()) {
      set({ reading: { fileName: file.name, index, total: files.length } })
      await nextFrame()
      if (!ACCEPTED_FILE.test(file.name)) {
        toast(`"${file.name}" is not an Excel or CSV file, so it was left out.`, { tone: 'critical' })
        continue
      }
      try {
        const book = lib.readWorkbook(await file.arrayBuffer(), file.name)
        const sheets = book.sheets.filter((s) => !lib.isTemplateHelpSheet(s.name))
        if (!sheets.length) {
          toast(`"${file.name}" has no rows to import.`, { tone: 'critical' })
          continue
        }
        books.push({ fileName: file.name, format: book.format, sheets })
        if (book.emptySheets.length)
          notes.push(
            `Empty ${book.emptySheets.length === 1 ? 'sheet' : 'sheets'} in ${file.name} left out: ${book.emptySheets.join(', ')}.`,
          )
      } catch (err) {
        toast(err instanceof lib.WorkbookReadError ? err.message : `"${file.name}" could not be read.`, {
          tone: 'critical',
        })
      }
    }
    return { books, notes }
  }

  /** Read every file, match each sheet to a dataset, and open the first sheet to review. */
  async function readAndPlan(files: readonly File[], target: DatasetKey | null) {
    await nextFrame()
    const lib = await loadImportLib()
    const { books, notes } = await readFiles(lib, files)
    if (!books.length) {
      set({ ...IDLE })
      return
    }
    const learned = Object.fromEntries(DATASET_KEYS.map((k) => [k, lib.loadLearnedSynonyms(k)]))
    const planned: { fileName: string; sheets: Omit<SheetInfo, 'fileName'>[] }[] = []
    for (const b of books) {
      const sheets: Omit<SheetInfo, 'fileName'>[] = []
      for (const sheet of b.sheets) {
        sheets.push({
          sheetName: sheet.name,
          rows: sheet.rows.length,
          guesses: lib.guessDataset(sheet, learned),
        })
        await nextFrame()
      }
      planned.push({ fileName: b.fileName, sheets })
    }
    const byId = new Map<string, { sheet: ParsedSheet; format: FileFormat }>(
      books.flatMap((b, fi) =>
        b.sheets.map((sheet, si) => [`${fi}:${si}`, { sheet, format: b.format }] as const),
      ),
    )
    const sheets: SessionSheet[] = planSheets(planned, target).flatMap((p) => {
      const parsed = byId.get(p.id)
      return parsed ? [{ ...p, ...parsed }] : []
    })
    set({ sheets, notes, status: Object.fromEntries(sheets.map((s) => [s.id, 'pending' as const])) })
    await show(sheets[0].id)
    set({ phase: 'review', reading: null })
  }

  return {
    ...IDLE,

    async start(files, target = null) {
      if (get().phase !== 'idle' || !files.length) return
      set({ ...IDLE, phase: 'reading', reading: { fileName: files[0].name, index: 0, total: files.length } })
      try {
        await readAndPlan(files, target)
      } catch {
        toast('The files could not be read. Nothing was changed.', { tone: 'critical' })
        set({ ...IDLE })
      }
    },

    async goto(id) {
      if (get().status[id] !== 'pending') return
      await show(id)
    },

    async setDataset(id, dataset) {
      const lib = await loadImportLib()
      const item = get().sheets.find((s) => s.id === id)
      if (!item) return
      const draft = await makeDraft(lib, item, dataset)
      const prev = get().drafts[id]
      set((s) => ({
        sheets: s.sheets.map((x) => (x.id === id ? { ...x, dataset } : x)),
        drafts: { ...s.drafts, [id]: { ...draft, version: (prev?.version ?? 0) + 1 } },
      }))
    },

    update(id, patch) {
      set((s) => {
        const d = s.drafts[id]
        if (!d) return {}
        return { drafts: { ...s.drafts, [id]: { ...d, ...patch(d), version: d.version + 1 } } }
      })
    },

    async skip(id) {
      set((s) => ({ status: { ...s.status, [id]: 'skipped' } }))
      await advance(id)
    },

    async apply(id, result) {
      const item = get().sheets.find((s) => s.id === id)
      const draft = get().drafts[id]
      if (!item || !draft?.dataset || !draft.mapping || get().busy) return
      const key = draft.dataset
      const def = datasetDef(key)
      set({ busy: true })
      try {
        const lib = await loadImportLib()
        const importedAt = new Date().toISOString()
        const sheetName = item.format === 'csv' || item.format === 'tsv' ? undefined : item.sheetName
        await useCensus.getState().replaceDataset(key, result.rows, {
          fileName: item.fileName,
          sheetName,
          importedAt,
          warnings: result.stats.rowsWithIssues,
          profileFingerprint: lib.headerFingerprint(item.sheet.headers),
        })
        await lib.saveProfile(
          lib.makeProfile(key, item.sheet.headers, draft.mapping, { ...draft.options, ...result.used }),
        )
        for (const p of learnedPicks(draft.mapping, draft.overrides)) lib.learnSynonym(key, p.header, p.field)
        await useImportLogs.getState().save({
          dataset: key,
          fileName: item.fileName,
          sheetName: sheetName ?? '',
          importedAt,
          stats: result.stats,
          issues: result.issues,
        })
        toast(replacedMessage(def.label, result.rows.length), { tone: 'good' })
        set((s) => ({ status: { ...s.status, [id]: 'applied' } }))
      } catch {
        toast(`${def.label} could not be saved. Nothing was changed.`, { tone: 'critical' })
        set({ busy: false })
        return
      }
      set({ busy: false })
      await advance(id)
    },

    close() {
      set({ ...IDLE })
    },
  }
})
