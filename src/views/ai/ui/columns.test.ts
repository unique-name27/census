import { describe, expect, it } from 'vitest'
import { visibleColumns } from '@/lib/export/columns'
import { CATALOG_COLUMNS } from './catalogColumns'

describe('the agent catalog figure', () => {
  it('keeps every sheet column on screen and in Excel and CSV', () => {
    expect(visibleColumns(CATALOG_COLUMNS, false, 'sheets').map((c) => c.label)).toEqual([
      'Name',
      'HR area',
      'Audience',
      'Status',
      'Description',
      'Use it for',
      "Don't use it for",
      'Example prompts',
      'Data sources',
      'Owner team',
      'Glean link',
    ])
  })

  it('leaves the long-text columns off a slide, so the table fits', () => {
    expect(visibleColumns(CATALOG_COLUMNS, false, 'slides').map((c) => c.label)).toEqual([
      'Name',
      'HR area',
      'Audience',
      'Status',
      'Description',
      'Owner team',
    ])
  })
})
