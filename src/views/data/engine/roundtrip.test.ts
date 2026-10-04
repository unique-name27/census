/**
 * The Data room's flow end to end on the sample workbook it offers for download: read every
 * sheet, plan them (Employees first), map, check values and apply each one against the roster
 * applied before it. The sample must come back exactly, with nothing to fix and nothing to flag.
 */
import { describe, expect, it } from 'vitest'
import {
  applyMapping,
  autoMap,
  buildTemplateWorkbook,
  guessDataset,
  isTemplateHelpSheet,
  readWorkbook,
  summarizeValues,
} from '@/data/import'
import { generateSample, SAMPLE_AS_OF } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Datasets, datasetDef } from '@/data/schema'
import type { SourceMeta } from '@/data/store'
import { blockingFields, issueCounts, openValues, sampleWorkbookDatasets, valueFields } from './flow'
import { buildManifest } from './manifest'
import { planSheets } from './plan'

describe('sample workbook round trip', () => {
  it('imports all ten sheets exactly, Employees first', async () => {
    const sample = generateSample()
    const blob = await buildTemplateWorkbook({
      sample,
      sampleRows: Number.MAX_SAFE_INTEGER,
      includePay: true,
    })
    const book = readWorkbook(new Uint8Array(await blob.arrayBuffer()), 'census-sample.xlsx')
    const sheets = book.sheets.filter((s) => !isTemplateHelpSheet(s.name))
    expect(sheets).toHaveLength(10)

    // The template lists Employees first; reverse it so the plan has to reorder.
    const reversed = [...sheets].reverse()
    const plan = planSheets([
      {
        fileName: book.fileName,
        sheets: reversed.map((s) => ({ sheetName: s.name, rows: s.rows.length, guesses: guessDataset(s) })),
      },
    ])
    expect(plan[0].dataset).toBe('employees')
    expect(plan.every((p) => p.reason === 'detected')).toBe(true)
    expect(new Set(plan.map((p) => p.dataset)).size).toBe(10)

    const loaded: Datasets = { ...sample }
    const sources = {} as Record<DatasetKey, SourceMeta>
    for (const p of plan) {
      const key = p.dataset as DatasetKey
      const sheet = reversed.find((s) => s.name === p.sheetName)!
      const def = datasetDef(key)
      const mapping = autoMap(sheet.headers, sheet.rows, def)
      expect(blockingFields(applyMapping, sheet, def, mapping), key).toEqual([])
      for (const f of valueFields(def, mapping))
        expect(
          openValues(summarizeValues(sheet, mapping[f.key].header!, def, f.key), undefined),
          `${key}.${f.key}`,
        ).toBe(0)
      const result = applyMapping({
        sheet,
        def,
        mapping,
        roster: key === 'employees' ? undefined : loaded.employees,
      })
      expect(issueCounts(result.issues).total, key).toBe(0)
      expect(result.rows.length, key).toBe(sample[key].length)
      ;(loaded as unknown as Record<string, unknown>)[key] = result.rows
      sources[key] = {
        kind: 'upload',
        rowCount: result.rows.length,
        fileName: book.fileName,
        sheetName: sheet.name,
      }
    }

    const strip = (rows: readonly object[]) =>
      rows.map((r) =>
        JSON.stringify(
          Object.entries(r)
            .filter(([, v]) => v != null)
            .sort(),
        ),
      )
    for (const k of DATASET_KEYS) expect(strip(loaded[k]), k).toEqual(strip(sample[k]))

    const manifest = buildManifest({ data: loaded, sources, asOf: SAMPLE_AS_OF })
    expect(manifest.every((r) => r.source.kind === 'upload' && r.checks.length === 0)).toBe(true)
  }, 60_000)

  it('with pay amounts off, leaves Compensation out and every other sheet still imports cleanly', async () => {
    const sample = generateSample()
    const blob = await buildTemplateWorkbook({
      sample,
      datasets: sampleWorkbookDatasets(false),
      sampleRows: Number.MAX_SAFE_INTEGER,
      includePay: false,
    })
    const book = readWorkbook(new Uint8Array(await blob.arrayBuffer()), 'census-sample.xlsx')
    const sheets = book.sheets.filter((s) => !isTemplateHelpSheet(s.name))
    expect(sheets).toHaveLength(9)
    const plan = planSheets([
      {
        fileName: book.fileName,
        sheets: sheets.map((s) => ({ sheetName: s.name, rows: s.rows.length, guesses: guessDataset(s) })),
      },
    ])
    expect(plan.map((p) => p.dataset)).not.toContain('comp')
    let roster = sample.employees
    for (const p of plan) {
      const key = p.dataset as DatasetKey
      const sheet = sheets.find((s) => s.name === p.sheetName)!
      const def = datasetDef(key)
      const mapping = autoMap(sheet.headers, sheet.rows, def)
      expect(blockingFields(applyMapping, sheet, def, mapping), key).toEqual([])
      const result = applyMapping({ sheet, def, mapping, roster: key === 'employees' ? undefined : roster })
      expect(issueCounts(result.issues).total, key).toBe(0)
      expect(result.rows.length, key).toBe(sample[key].length)
      if (key === 'employees') roster = result.rows as typeof roster
    }
  }, 60_000)
})
