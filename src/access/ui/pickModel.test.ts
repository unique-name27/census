/**
 * The pick dialogs' rows and the words around a pick (docs/ROLES-V2.md 1.2 and 1.3): every kind's
 * rows and lines, "Every recruiter" first, a listed unit with nobody muted and not pickable, the
 * remembered pick found again (a recruiter by any spelling), the confirm button per row, the Mode
 * button's name and spoken label, Settings > Mode's pick line, and the disabled hints.
 */
import { describe, expect, it } from 'vitest'
import { EVERY_RECRUITER_CONFIRM, NOT_SECURITY_SHORT, PICKER_COPY } from '../copy'
import { EVERY_RECRUITER, MODES, type ModePicks, modeButtonLabel, NO_PICKS, PICK_OF } from '../modes'
import { emptyRegionScope } from '../scopes/region'
import type { OrgScope, RegionScope, ReqsScope, UnitScope } from '../scopes/types'
import {
  confirmLabel,
  currentRowKey,
  disabledHint,
  managerRows,
  modeSpoken,
  NOBODY_IN_UNIT,
  pickNameOf,
  pickText,
  recruiterRows,
  regionRows,
  rowMatches,
  showingLine,
  unitRows,
} from './pickModel'

const unit: UnitScope = {
  kind: 'unit',
  label: 'Silicon Engineering',
  size: 412,
  unit: 'Silicon Engineering',
  memberIds: new Set(),
  leaderIds: new Set(),
  otherDepartments: new Set(),
}
const region: RegionScope = {
  kind: 'region',
  label: 'APAC',
  size: 506,
  region: 'APAC',
  sites: ['Bengaluru', 'Hsinchu'],
  memberIds: new Set(),
}
const reqs: ReqsScope = {
  kind: 'reqs',
  label: "Maya Chen's reqs",
  size: 61,
  recruiter: 'Maya Chen',
  recruiterId: 'E10877',
  reqIds: new Set(['R1']),
  appIds: new Set(),
  startIds: new Set(),
  openReqs: 14,
  activeCandidates: 61,
  asOf: '2026-09-30',
}
const org: OrgScope = {
  kind: 'org',
  label: "Priya Raman's org",
  size: 42,
  managerId: 'E10421',
  managerName: 'Priya Raman',
  orgIds: new Set(['E10421']),
}

const picks = (p: Partial<ModePicks>): ModePicks => ({ ...NO_PICKS, ...p })

describe('pick rows', () => {
  it('lists managers with their title and org size, as the leader filter does', () => {
    const rows = managerRows([{ id: 'E1', name: 'Priya Raman', title: 'VP Design', size: 42 }])
    expect(rows).toEqual([
      {
        key: 'E1',
        name: 'Priya Raman',
        line: 'VP Design',
        aside: '42 employees',
        pickable: true,
        pick: { kind: 'manager', id: 'E1' },
        terms: 'VP Design',
      },
    ])
  })

  it('lists business units with people and locations; a listed unit with nobody is muted and not pickable', () => {
    const rows = unitRows([
      { unit: 'Silicon Engineering', employees: 412, locations: 7, pickable: true },
      { unit: 'Quantum', employees: 0, locations: 0, pickable: false },
    ])
    expect(rows.map((r) => [r.name, r.line, r.pickable])).toEqual([
      ['Silicon Engineering', '412 employees · 7 locations', true],
      ['Quantum', NOBODY_IN_UNIT, false],
    ])
    expect(rows[0].pick).toEqual({ kind: 'unit', unit: 'Silicon Engineering' })
  })

  it('lists regions with their people and sites, searchable by site', () => {
    const rows = regionRows({
      rows: [{ region: 'APAC', employees: 506, sites: ['Bengaluru', 'Hsinchu', 'Shanghai'] }],
      noRegionPeople: 3,
    })
    expect(rows[0].line).toBe('506 employees · Bengaluru, Hsinchu, Shanghai')
    expect(rowMatches(rows[0], 'hsin')).toBe(true)
    expect(rowMatches(rows[0], 'munich')).toBe(false)
  })

  it('puts "Every recruiter" first, then each recruiter with open reqs and active candidates', () => {
    const rows = recruiterRows([{ name: 'Maya Chen', id: 'E10877', openReqs: 14, activeCandidates: 61 }])
    expect(rows.map((r) => [r.key, r.name, r.line])).toEqual([
      [EVERY_RECRUITER, 'Every recruiter', 'For a talent acquisition lead: every req'],
      ['Maya Chen', 'Maya Chen', '14 open reqs · 61 active candidates'],
    ])
    expect(rows[0].pick).toEqual({ kind: 'recruiter', name: EVERY_RECRUITER, id: null })
    expect(rows[1].pick).toEqual({ kind: 'recruiter', name: 'Maya Chen', id: 'E10877' })
  })

  it('matches the search on the name, ignoring case and spaces around it', () => {
    const [row] = unitRows([{ unit: 'Go-to-Market', employees: 184, locations: 5, pickable: true }])
    expect(rowMatches(row, '  go-to ')).toBe(true)
    expect(rowMatches(row, '')).toBe(true)
  })
})

describe('the remembered pick in the dialog', () => {
  const recruiters = recruiterRows([
    { name: 'Maya Chen', id: null, openReqs: 3, activeCandidates: 9 },
    { name: 'Omar Haddad', id: null, openReqs: 1, activeCandidates: 2 },
  ])

  it('finds a recruiter by any spelling of the name, and every recruiter by its mark', () => {
    expect(
      currentRowKey('recruiter', picks({ recruiter: { name: ' maya  CHEN', id: null } }), recruiters),
    ).toBe('Maya Chen')
    expect(
      currentRowKey('recruiter', picks({ recruiter: { name: EVERY_RECRUITER, id: null } }), recruiters),
    ).toBe(EVERY_RECRUITER)
    expect(
      currentRowKey('recruiter', picks({ recruiter: { name: 'Gone', id: null } }), recruiters),
    ).toBeNull()
  })

  it('never preselects a row that cannot be picked, or a pick of another kind', () => {
    const units = unitRows([{ unit: 'Quantum', employees: 0, locations: 0, pickable: false }])
    expect(currentRowKey('unit', picks({ unit: 'Quantum' }), units)).toBeNull()
    expect(currentRowKey('unit', picks({ region: 'Quantum' }), units)).toBeNull()
    const managers = managerRows([{ id: 'E1', name: 'A', title: '', size: 4 }])
    expect(currentRowKey('manager', picks({ managerId: 'E1' }), managers)).toBe('E1')
  })

  it('confirms with the kind\'s words, and "Show every req" for every recruiter', () => {
    expect(confirmLabel('recruiter', EVERY_RECRUITER)).toBe(EVERY_RECRUITER_CONFIRM)
    expect(confirmLabel('recruiter', 'Maya Chen')).toBe('Show their reqs')
    expect(confirmLabel('region', null)).toBe('Show this region')
    expect(confirmLabel('unit', 'Silicon Engineering')).toBe('Show this business unit')
    expect(confirmLabel('manager', 'E1')).toBe('Show their org')
  })
})

describe('the pick on the Mode button, in the menu and in Settings', () => {
  it('names the pick in force, and nothing while the mode waits for one', () => {
    expect(pickNameOf('hrbp-unit', unit, false, picks({}))).toBe('Silicon Engineering')
    expect(pickNameOf('hrbp-region', region, false, picks({}))).toBe('APAC')
    expect(pickNameOf('recruiter', reqs, false, picks({}))).toBe('Maya Chen')
    expect(pickNameOf('manager', org, false, picks({}))).toBe('Priya Raman')
    expect(pickNameOf('hrbp-region', emptyRegionScope('EMEA'), true, picks({}))).toBeNull()
    expect(pickNameOf('finance', null, false, picks({}))).toBeNull()
    // Every recruiter has no reqs scope.
    expect(
      pickNameOf('recruiter', null, false, picks({ recruiter: { name: EVERY_RECRUITER, id: null } })),
    ).toBe(EVERY_RECRUITER)
  })

  it('reads as the contract writes the button, and speaks without a second colon', () => {
    expect(modeButtonLabel('hrbp-unit', pickNameOf('hrbp-unit', unit, false, picks({})))).toBe(
      'HRBP: Silicon Engineering',
    )
    expect(modeButtonLabel('recruiter', EVERY_RECRUITER)).toBe('Recruiter: every recruiter')
    expect(modeButtonLabel('hrbp-region', null)).toBe('HRBP mode')
    expect(modeSpoken('hrbp-region', 'APAC')).toBe('Mode: HRBP for a region, APAC')
    expect(modeSpoken('recruiter', EVERY_RECRUITER)).toBe('Mode: Recruiter, every recruiter')
    expect(modeSpoken('finance', null)).toBe('Mode: Finance')
    expect(pickText(EVERY_RECRUITER)).toBe('Every recruiter')
    expect(pickText('APAC')).toBe('APAC')
  })

  it("writes Settings > Mode's pick line for each kind, and says when nothing is picked", () => {
    expect(showingLine('hrbp-unit', unit, false, picks({}))).toBe('Showing Census for Silicon Engineering')
    expect(showingLine('hrbp-region', region, false, picks({}))).toBe('Showing Census for APAC')
    expect(showingLine('recruiter', reqs, false, picks({}))).toBe("Showing Census for Maya Chen's reqs")
    expect(showingLine('manager', org, false, picks({}))).toBe("Showing Census for Priya Raman's org")
    expect(
      showingLine('recruiter', null, false, picks({ recruiter: { name: EVERY_RECRUITER, id: null } })),
    ).toBe("Showing Census for every recruiter's reqs")
    expect(showingLine('hrbp-region', emptyRegionScope('EMEA'), true, picks({}))).toBe(
      'No region picked yet.',
    )
    expect(showingLine('hr', null, false, picks({}))).toBeNull()
  })

  it('greys out a mode only when its pick kind has nothing to pick', () => {
    const none = { manager: false, unit: false, region: false, recruiter: false }
    const every = { manager: true, unit: true, region: true, recruiter: true }
    for (const m of MODES) {
      const kind = PICK_OF[m]
      expect(disabledHint(m, every)).toBeNull()
      expect(disabledHint(m, none)).toBe(kind ? PICKER_COPY[kind].disabled : null)
    }
  })

  it('keeps every line it adds free of em dashes and of the words that sound like security', () => {
    const lines = [
      NOBODY_IN_UNIT,
      NOT_SECURITY_SHORT,
      ...MODES.map((m) => showingLine(m, null, true, picks({})) ?? ''),
      modeSpoken('hrbp-unit', 'Silicon Engineering'),
    ]
    for (const l of lines) {
      expect(l).not.toMatch(/—/)
      expect(l.toLowerCase()).not.toMatch(/\b(access|permission|restricted|secure|authorized)\b/)
    }
  })
})
