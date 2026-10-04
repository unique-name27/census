import { describe, expect, it } from 'vitest'
import { agentsWorkbook, readAgentsFile } from './excel'
import { SAMPLE_AGENTS } from './sample'
import {
  agentRow,
  catalogRows,
  isAgentSheet,
  lineItems,
  readAgentRows,
  SHEET_COLUMNS,
  SHEET_NAME,
  splitList,
} from './sheet'
import { blankDraft } from './validate'

const HEADERS = SHEET_COLUMNS.map((c) => c.label)

/** Sheet rows keyed by header label, as the importer's parser returns them. */
const asSheetRows = (rows: ReturnType<typeof catalogRows>) =>
  rows.map((r) => Object.fromEntries(SHEET_COLUMNS.map((c) => [c.label, r[c.key] === '' ? null : r[c.key]])))

describe('the "AI agents" sheet', () => {
  it('round-trips through Excel: write with ExcelJS, read with the importer, same catalog', async () => {
    const bytes = await agentsWorkbook(SAMPLE_AGENTS)
    const read = readAgentsFile(bytes, 'census-ai-agents.xlsx')
    expect(read.sheetName).toBe(SHEET_NAME)
    expect(read.issues).toEqual([])
    expect(read.skipped).toBe(0)
    expect(read.agents).toEqual(SAMPLE_AGENTS)
  })

  it('round-trips the table export, whose lists are separated by semicolons', () => {
    const rows = catalogRows(SAMPLE_AGENTS, '; ')
    const read = readAgentRows(HEADERS, asSheetRows(rows))
    expect(read.issues).toEqual([])
    expect(read.agents).toEqual(SAMPLE_AGENTS)
  })

  it('writes the catalog columns in order, with area and audience labels', () => {
    const row = agentRow(SAMPLE_AGENTS.find((a) => a.area === 'hrbp')!, '\n')
    expect(Object.keys(row)).toEqual(SHEET_COLUMNS.map((c) => c.key))
    expect(row.area).toBe('People stats')
    expect(row.audience).toBe('HR team')
    expect(isAgentSheet(HEADERS)).toBe(true)
    expect(isAgentSheet(['Employee ID', 'Name'])).toBe(false)
  })

  it('splits list cells by line, or by semicolon when a cell has no line breaks, and drops bullets', () => {
    expect(splitList('- First\n• Second; still second\n\n3. Third')).toEqual([
      'First',
      'Second; still second',
      'Third',
    ])
    expect(splitList('One; Two;Three')).toEqual(['One', 'Two', 'Three'])
    expect(splitList('')).toEqual([])
  })

  it('reads typed list items in the dialog the way an import reads them, bullets dropped', () => {
    const typed = '- Never paste case details into it.\n  • Counts only.\n\n2) Ask the ER team.'
    expect(lineItems(typed)).toEqual([
      'Never paste case details into it.',
      'Counts only.',
      'Ask the ER team.',
    ])
    // Saved from the dialog, exported and imported back: the same items.
    expect(splitList(lineItems(typed).join('\n'))).toEqual(lineItems(typed))
    // Semicolons inside one typed line stay in that item.
    expect(lineItems('Leave; benefits')).toEqual(['Leave; benefits'])
  })

  it('accepts familiar spellings and reports what it fixed or left out', () => {
    const rows = [
      {
        Agent: 'Pay letter helper',
        Area: 'HR business partners',
        Audience: 'HR, people managers, contractors',
        Status: 'live',
        Description: 'Drafts letters.',
        'Use for': 'Letters',
        Guardrails: 'Not for pay decisions.',
        Link: 'glean.example.com/agents/pay-letter',
      },
      {
        Agent: 'Finance bot',
        Area: 'Finance',
        Description: 'Books.',
        'Use for': 'Ledgers',
        Guardrails: 'None.',
      },
      {
        Agent: 'Bad link',
        Area: 'Talent',
        Status: 'Beta',
        Description: 'Coaching.',
        'Use for': 'Reviews',
        Guardrails: 'Not for ratings.',
        Link: 'javascript:alert(1)',
      },
      { Agent: 'pay letter HELPER', Area: 'Talent', Description: 'Dup.', 'Use for': 'x', Guardrails: 'y' },
      { Agent: 'No guardrail', Area: 'Talent', Description: 'Missing.', 'Use for': 'x' },
      { Agent: null, Area: null, Description: null },
    ]
    const headers = ['Agent', 'Area', 'Audience', 'Status', 'Description', 'Use for', 'Guardrails', 'Link']
    const read = readAgentRows(headers, rows)
    expect(read.agents.map((a) => a.name)).toEqual(['Pay letter helper', 'Bad link'])
    expect(read.agents[0]).toMatchObject({
      area: 'hrbp',
      audience: ['hr', 'managers'],
      status: 'Live',
      url: 'https://glean.example.com/agents/pay-letter',
      id: 'pay-letter-helper',
    })
    expect(read.agents[1]).toMatchObject({ status: 'Pilot', url: '', audience: ['hr'] })
    expect(read.skipped).toBe(3)
    const text = read.issues.map((i) => i.message).join('\n')
    expect(text).toMatch(/Row 2 \(Pay letter helper\): audience "contractors" not recognized/)
    expect(text).toMatch(/Row 3 \(Finance bot\) left out: "Finance" is not an HR area/)
    expect(text).toMatch(/Row 4 \(Bad link\): status "Beta" not recognized, set to Pilot/)
    expect(text).toMatch(/Row 4 \(Bad link\): the link is not a web link/)
    expect(text).toMatch(/Row 5 \(pay letter HELPER\) left out: another agent already has this name/)
    expect(text).toMatch(/Row 6 \(No guardrail\) left out: add at least one guardrail/)
    // The blank row is ignored, not reported.
    expect(text).not.toMatch(/Row 7/)
  })

  it('sets a missing status to Pilot, as the Add dialog does, and says so', () => {
    const base = {
      'HR area': 'Talent',
      Audience: 'Managers',
      Description: 'Coaching.',
      'Use it for': 'Reviews',
      'Not for': 'Ratings.',
    }
    const headers = ['Name', 'HR area', 'Audience', 'Status', 'Description', 'Use it for', 'Not for']
    const blank = readAgentRows(headers, [{ Name: 'Coach', ...base, Status: '' }])
    expect(blank.agents[0].status).toBe('Pilot')
    expect(blank.agents[0].status).toBe(blankDraft().status)
    expect(blank.issues.map((i) => i.message)).toEqual(['Row 2 (Coach): no status given, set to Pilot.'])

    // No Status column at all: one note for the sheet, not one per row, and never "Sample".
    const noColumn = readAgentRows(
      headers.filter((h) => h !== 'Status'),
      [
        { Name: 'Coach', ...base },
        { Name: 'Tutor', ...base },
      ],
    )
    expect(noColumn.agents.map((a) => a.status)).toEqual(['Pilot', 'Pilot'])
    expect(noColumn.issues).toEqual([
      { row: null, message: 'The sheet has no "Status" column, so every agent is set to Pilot.' },
    ])
  })

  it('refuses a sheet without the required columns, saying which', () => {
    const read = readAgentRows(['Name', 'Owner'], [{ Name: 'x', Owner: 'y' }])
    expect(read.agents).toEqual([])
    expect(read.issues[0].message).toMatch(/"HR area" or "Description"/)
  })

  it('reports a workbook with no catalog sheet', async () => {
    const { loadExcel } = await import('@/lib/export/xlsx')
    const Excel = await loadExcel()
    const wb = new Excel.Workbook()
    wb.addWorksheet('Headcount').addRows([
      ['Employee ID', 'Department'],
      ['E10001', 'Design'],
    ])
    const buf = await wb.xlsx.writeBuffer()
    const read = readAgentsFile(Uint8Array.from(buf as unknown as ArrayLike<number>), 'other.xlsx')
    expect(read.sheetName).toBeNull()
    expect(read.issues[0].message).toMatch(/No sheet in "other.xlsx"/)
  })
})
