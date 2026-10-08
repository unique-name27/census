/**
 * One upload session: the files read, the plan of which sheet goes where, the person's choices
 * per sheet (dataset, columns, reading options, value fixes) and what has been applied. The
 * import library is loaded on first use so the spreadsheet reader stays out of the main bundle.
 */
import { create } from 'zustand'
import { toast } from '@/components/toast'
import type { ApplyOptions, FileFormat, ImportResult, Mapping, ParsedSheet } from '@/data/import'
import type { DatasetVersion } from '@/data/quality'
import { DATASET_KEYS, type DatasetKey, datasetDef } from '@/data/schema'
import { useCensus } from '@/data/store'
import { defaultFills } from '../engine/fills'
import { blockingFields, learnedPicks, replacedMessage, type Step } from '../engine/flow'
import { draftMapping } from '../engine/lineage'
import {
  isNotCensus,
  nextPending,
  type PlannedSheet,
  planSheets,
  type SheetInfo,
  type SheetStatus,
  usableSheets,
} from '../engine/plan'
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
  /**
   * Fields the columns step changed from the saved profile (a Workday layout saved before job
   * families held job functions), marked for the person to confirm once.
   */
  changed?: string[]
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

/** What a re-map starts from: a version and the original sheet stored with it. */
export interface RemapSource {
  key: DatasetKey
  sheet: ParsedSheet
  version: Pick<DatasetVersion, 'mapping' | 'applyOptions' | 'fileName' | 'sheetName'>
}

interface SessionState {
  phase: 'idle' | 'reading' | 'review'
  /** 'remap': one stored sheet opened again to change its mapping; nothing is uploaded. */
  mode: 'upload' | 'remap'
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
  /** Open the mapping step on a version's stored sheet, starting from the mapping it was read with. */
  remap: (src: RemapSource) => Promise<void>
  goto: (id: string) => Promise<void>
  setDataset: (id: string, dataset: DatasetKey | null) => Promise<void>
  update: (id: string, patch: (d: Draft) => Partial<Draft>) => void
  skip: (id: string) => Promise<void>
  apply: (id: string, result: ImportResult) => Promise<void>
  close: () => void
}

const IDLE = {
  phase: 'idle' as const,
  mode: 'upload' as const,
  reading: null,
  sheets: [],
  status: {},
  currentId: null,
  drafts: {},
  notes: [],
  busy: false,
}

/** The reader's format for a stored file name (a re-map has no file to sniff). */
export function formatOfName(fileName: string): FileFormat {
  const ext = /\.([a-z]+)$/i.exec(fileName)?.[1]?.toLowerCase()
  return ext === 'csv' ? 'csv' : ext === 'tsv' ? 'tsv' : ext === 'xls' ? 'xls' : 'xlsx'
}

/** The single-sheet session a re-map opens: the stored sheet, its dataset fixed. */
export function remapSheet(src: RemapSource): SessionSheet {
  const fileName = src.version.fileName ?? `${datasetDef(src.key).label} extract`
  return {
    id: 'remap',
    fileName,
    sheetName: src.version.sheetName ?? src.sheet.name,
    rows: src.sheet.rows.length,
    guesses: [{ key: src.key, confidence: 1 }],
    dataset: src.key,
    reason: 'target',
    sheet: src.sheet,
    format: formatOfName(fileName),
  }
}

/** Let the browser paint progress between heavy steps. */
const nextFrame = () => new Promise<void>((r) => setTimeout(r, 0))

/**
 * An .xlsx or .xlsm file is a zip archive, so it starts with "PK". A text file renamed to .xlsx
 * would otherwise be read as one blank sheet. Other types are left to the reader.
 */
function looksLikeItsType(fileName: string, buffer: ArrayBuffer): boolean {
  if (!/\.(xlsx|xlsm)$/i.test(fileName)) return true
  const head = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength))
  return head.length === 2 && head[0] === 0x50 && head[1] === 0x4b
}

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
    const { mapping: savedMapping, options } = lib.applyProfile(saved, item.sheet.headers, def)
    const pair = lib.profileJobPair(def, savedMapping, item.sheet.headers)
    const mapping = pair?.mapping ?? savedMapping
    const stale = blockingFields(lib.applyMapping, item.sheet, def, mapping).length > 0
    return {
      ...base,
      dataset,
      mapping,
      options,
      fromProfile: true,
      profileStale: stale,
      ...(pair ? { changed: pair.changed } : {}),
      step: stale || pair ? 'columns' : 'check',
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
        const buffer = await file.arrayBuffer()
        if (!looksLikeItsType(file.name, buffer)) {
          toast(`"${file.name}" could not be read. It is not an Excel workbook inside.`, {
            tone: 'critical',
            description: 'Open it in Excel and save it again as .xlsx or .csv.',
          })
          continue
        }
        const book = lib.readWorkbook(buffer, file.name)
        const { sheets, noRows } = usableSheets(book, lib.isTemplateHelpSheet)
        if (!sheets.length) {
          toast(`"${file.name}" has no rows to import.`, {
            tone: 'critical',
            description: noRows.length
              ? 'Its sheets have column headers but no rows. Fill in at least one sheet and add it again.'
              : undefined,
          })
          continue
        }
        books.push({ fileName: file.name, format: book.format, sheets })
        if (noRows.length)
          notes.push(
            `${noRows.length === 1 ? 'A sheet' : `${noRows.length} sheets`} in ${file.name} had no rows and ${noRows.length === 1 ? 'was' : 'were'} left out: ${noRows.join(', ')}.`,
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
    const open = async () => {
      set({ sheets, notes, status: Object.fromEntries(sheets.map((s) => [s.id, 'pending' as const])) })
      await show(sheets[0].id)
      set({ phase: 'review', reading: null })
    }
    // Nothing that looks like HR data: say so in one line instead of a dialog of 0% matches.
    if (!target && isNotCensus(sheets)) {
      set({ ...IDLE })
      const names = [...new Set(sheets.map((s) => s.fileName))]
      toast(
        `${names.length === 1 ? names[0] : `${names.length} files`} ${names.length === 1 ? 'doesn’t' : 'don’t'} match any Census dataset. Nothing was imported.`,
        {
          description:
            'Census reads rosters, job changes, requisitions, candidates, HR cases and the other datasets listed below.',
          action: {
            label: 'Import anyway',
            onClick: () => {
              if (get().phase !== 'idle') return
              set({ phase: 'reading' })
              void open().catch(() => set({ ...IDLE }))
            },
          },
          timeout: 10_000,
        },
      )
      return
    }
    await open()
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

    async remap(src) {
      if (get().phase !== 'idle') return
      set({ ...IDLE, phase: 'reading', mode: 'remap' })
      try {
        const lib = await loadImportLib()
        const def = datasetDef(src.key)
        const auto = lib.autoMap(src.sheet.headers, src.sheet.rows, def, lib.loadLearnedSynonyms(src.key))
        const item = remapSheet(src)
        const draft: Draft = {
          dataset: src.key,
          mapping: draftMapping(def, src.version.mapping, src.sheet.headers, auto),
          options: { ...(src.version.applyOptions ?? {}) },
          overrides: [],
          fromProfile: false,
          profileStale: false,
          step: 'columns',
          version: 0,
        }
        set({
          phase: 'review',
          mode: 'remap',
          sheets: [item],
          status: { [item.id]: 'pending' },
          currentId: item.id,
          drafts: { [item.id]: draft },
        })
      } catch {
        toast('The stored sheet could not be opened. Nothing was changed.', { tone: 'critical' })
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
        await useCensus.getState().replaceDataset(
          key,
          result.rows,
          {
            fileName: item.fileName,
            sheetName,
            importedAt,
            warnings: result.stats.rowsWithIssues,
            profileFingerprint: lib.headerFingerprint(item.sheet.headers),
          },
          {
            // The version keeps its sheet, so it can be re-mapped later without uploading again.
            raw: item.sheet,
            mapping: draft.mapping,
            options: { ...draft.options, ...result.used },
            issues: result.issues,
            rowsIn: result.stats.rowsIn,
          },
        )
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
          fills: defaultFills(def, result.rows, result.issues, draft.mapping),
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
