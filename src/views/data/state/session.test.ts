import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyMapping, type ParsedSheet } from '@/data/import'
import { datasetDef } from '@/data/schema'
import { useCensus } from '@/data/store'
import { formatOfName, remapSheet, useImportSession } from './session'

const idb = new Map<string, unknown>()
vi.mock('idb-keyval', () => ({
  get: async (k: string) => idb.get(k),
  set: async (k: string, v: unknown) => {
    idb.set(k, v)
  },
  del: async (k: string) => {
    idb.delete(k)
  },
  delMany: async (ks: string[]) => {
    for (const k of ks) idb.delete(k)
  },
  keys: async () => [...idb.keys()],
}))

const sheet: ParsedSheet = {
  name: 'Learning',
  headerRow: 0,
  headers: ['Person', 'Course name', 'Kind', 'Given on', 'Done on', 'Hrs'],
  rows: [
    {
      Person: 'E1',
      'Course name': 'Safety',
      Kind: 'Compliance',
      'Given on': '2026-01-05',
      'Done on': null,
      Hrs: 2,
    },
    {
      Person: 'E2',
      'Course name': 'Leading',
      Kind: 'Leadership',
      'Given on': '2026-02-01',
      'Done on': '2026-02-20',
      Hrs: 6,
    },
  ],
  rowNumbers: [2, 3],
}

const version = {
  mapping: {
    employeeId: { header: 'Person', confidence: 'medium' as const, confirmed: true },
    course: { header: 'Course name', confidence: 'high' as const, confirmed: true },
    assignedDate: { header: 'Given on', confidence: 'low' as const, confirmed: false },
  },
  applyOptions: { dateOrders: { 'Given on': 'DMY' as const } },
  fileName: 'lms-export.csv',
  sheetName: null,
}

describe('re-map helpers', () => {
  it('reads the format from the stored file name', () => {
    expect(formatOfName('roster.CSV')).toBe('csv')
    expect(formatOfName('a.tsv')).toBe('tsv')
    expect(formatOfName('old.xls')).toBe('xls')
    expect(formatOfName('book.xlsx')).toBe('xlsx')
    expect(formatOfName('no extension')).toBe('xlsx')
  })

  it('builds one sheet with its dataset fixed', () => {
    const item = remapSheet({ key: 'learning', sheet, version })
    expect(item).toMatchObject({
      id: 'remap',
      fileName: 'lms-export.csv',
      sheetName: 'Learning',
      rows: 2,
      dataset: 'learning',
      reason: 'target',
      format: 'csv',
    })
    expect(remapSheet({ key: 'learning', sheet, version: { ...version, fileName: null } }).fileName).toBe(
      'Learning extract',
    )
  })
})

describe('useImportSession', () => {
  beforeEach(() => {
    idb.clear()
    useImportSession.getState().close()
  })

  it('opens the columns step on the stored sheet with the stored mapping and options', async () => {
    await useImportSession.getState().remap({ key: 'learning', sheet, version })
    const s = useImportSession.getState()
    expect(s).toMatchObject({ phase: 'review', mode: 'remap', currentId: 'remap' })
    const d = s.drafts.remap
    expect(d.step).toBe('columns')
    expect(d.mapping?.employeeId).toMatchObject({ header: 'Person', confidence: 'high' })
    expect(d.mapping?.assignedDate.header).toBe('Given on')
    expect(d.options.dateOrders).toEqual({ 'Given on': 'DMY' })
  })

  it('keeps the sheet, mapping, options and log with the new version on apply', async () => {
    const replaceDataset = vi.fn(async () => {})
    useCensus.setState({ replaceDataset })
    await useImportSession.getState().remap({ key: 'learning', sheet, version })
    const draft = useImportSession.getState().drafts.remap
    const result = applyMapping({
      sheet,
      def: datasetDef('learning'),
      mapping: draft.mapping!,
      options: draft.options,
    })
    await useImportSession.getState().apply('remap', result)
    expect(replaceDataset).toHaveBeenCalledTimes(1)
    const [key, rows, meta, extra] = replaceDataset.mock.calls[0] as unknown as [
      string,
      unknown[],
      { fileName: string },
      Record<string, unknown>,
    ]
    expect(key).toBe('learning')
    expect(rows).toHaveLength(result.rows.length)
    expect(meta.fileName).toBe('lms-export.csv')
    expect(extra.raw).toBe(sheet)
    expect(extra.mapping).toBe(draft.mapping)
    expect(extra.options).toMatchObject({ dateOrders: { 'Given on': 'DMY' } })
    expect(extra.issues).toBe(result.issues)
    expect(extra.rowsIn).toBe(2)
    expect(useImportSession.getState().phase).toBe('idle')
  })
})
