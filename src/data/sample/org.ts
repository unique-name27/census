/**
 * Builds today's reporting structure, CEO down to individual contributors: the generic team
 * builder for each department (with the planted span outliers), and the hand-built Executive Office
 * and People teams whose HRBPs, recruiters and HR operations agents appear across other datasets.
 * Hire dates, leavers and history are added later by `employees.ts`.
 */
import { type Level, siteByLocation } from '../schema'
import { day } from './calendar'
import { CORP, DEPTS, type DeptSpec, deptSpec, EO, EXEC_SLOTS, GTM, OPS, SE, SS } from './departments'
import { newPerson, type Person, type RecruiterDesk, type Tag, type World } from './model'
import type { NameBook } from './names'
import type { Rng } from './prng'
import { assignIcRole, drawIcLevel } from './titles'

interface Team {
  site: string
  members: string[]
  tag?: Tag
}

interface Ctx {
  rng: Rng
  names: NameBook
  people: Person[]
  execs: Map<string, number>
}

function add(ctx: Ctx, init: Parameters<typeof newPerson>[1]): Person {
  const p = newPerson(ctx.people.length, init)
  ctx.people.push(p)
  return p
}

/** Split n into whole-number parts proportional to weights (largest remainder). */
function apportion(n: number, weights: readonly number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0 || n <= 0) return weights.map(() => 0)
  const raw = weights.map((w) => (n * w) / total)
  const out = raw.map(Math.floor)
  let left = n - out.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1])
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k][1]]++
  return out
}

/** Even split of n into k teams, with a little variation, kept within [lo, hi]. */
function splitTeams(n: number, k: number, rng: Rng, lo = 4, hi = 8): number[] {
  const sizes = apportion(n, Array(k).fill(1))
  for (let s = 0; s < k * 2; s++) {
    const a = rng.int(0, k - 1)
    const b = rng.int(0, k - 1)
    if (a !== b && sizes[a] > lo && sizes[b] < hi) {
      sizes[a]--
      sizes[b]++
    }
  }
  return sizes
}

function planTeams(spec: DeptSpec, nIc: number, nMgr: number, rng: Rng): Team[] {
  const forced = spec.plants?.teams ?? []
  const teams: Team[] = forced.map((f) => ({ site: f.site, members: Array(f.size).fill(f.site), tag: f.tag }))
  const freeIc = nIc - forced.reduce((a, f) => a + f.size, 0)
  const freeMgr = nMgr - forced.length
  const sites = spec.sites.map(([s]) => s)
  const siteIc = apportion(
    freeIc,
    spec.sites.map(([, w]) => w),
  )
  const eligible = sites.map((_, i) => (siteIc[i] >= 3 ? siteIc[i] : 0))
  const siteMgr = apportion(freeMgr, eligible)
  // Every eligible site needs a manager when there are enough to go around.
  for (let i = 0; i < sites.length; i++) {
    if (eligible[i] && !siteMgr[i]) {
      const donor = siteMgr.indexOf(Math.max(...siteMgr))
      if (siteMgr[donor] > 1) {
        siteMgr[donor]--
        siteMgr[i]++
      }
    }
  }
  const free: Team[] = []
  const floating: string[] = []
  for (let i = 0; i < sites.length; i++) {
    if (!siteMgr[i]) {
      for (let k = 0; k < siteIc[i]; k++) floating.push(sites[i])
      continue
    }
    for (const size of splitTeams(siteIc[i], siteMgr[i], rng))
      free.push({ site: sites[i], members: Array(size).fill(sites[i]) })
  }
  // ICs at sites too small for a local manager report remotely to the smallest teams.
  for (const s of floating) {
    const t = free.reduce((a, b) => (b.members.length < a.members.length ? b : a))
    t.members.push(s)
  }
  // Keep unplanted spans within 3-8.
  for (let guard = 0; guard < 200; guard++) {
    const big = free.find((t) => t.members.length > 8)
    if (!big) break
    const small = free.reduce((a, b) => (b.members.length < a.members.length ? b : a))
    small.members.push(big.members.pop()!)
  }
  return [...teams, ...free]
}

function directorTitle(spec: DeptSpec, k: number, site: string): string {
  if (spec.directorTitles?.[k]) return spec.directorTitles[k]
  const country = siteByLocation.get(site)?.country
  return country && country !== 'United States'
    ? `Director, ${spec.name}, ${country}`
    : `Director, ${spec.name}`
}

function buildDept(spec: DeptSpec, ctx: Ctx): void {
  const { rng, names, people } = ctx
  const seated = people.filter((p) => p.dept === spec.name).length
  const n = spec.size - seated
  const single = spec.plants?.singleDirector
  const regularDirs = spec.directors - (single ? 1 : 0)
  const dirIcs = regularDirs * spec.dirIcs
  const body = n - spec.directors - dirIcs
  const nMgr = spec.managers ?? Math.max((spec.plants?.teams?.length ?? 0) + 1, Math.round(body / 6.8))
  const teams = planTeams(spec, body - nMgr, nMgr, rng)
  const boss = ctx.execs.get(spec.boss)!

  // Group teams under directors by site; the planted single-report director gets exactly one team.
  const groups: { teams: Team[]; single: boolean }[] = []
  const lone = single
    ? (teams.find((t) => !t.tag && t.site === single && t.members.length >= 4) ?? teams.find((t) => !t.tag)!)
    : null
  if (regularDirs > 0) {
    const order = new Map(spec.sites.map(([s], i) => [s, i]))
    const sorted = teams.filter((t) => t !== lone).sort((a, b) => order.get(a.site)! - order.get(b.site)!)
    let at = 0
    for (const size of apportion(sorted.length, Array(regularDirs).fill(1))) {
      groups.push({ teams: sorted.slice(at, at + size), single: false })
      at += size
    }
  }
  if (lone) groups.push({ teams: [lone], single: true })

  const addManagerTeam = (team: Team, bossIdx: number) => {
    const m = add(ctx, {
      name: names.name(team.site),
      bu: spec.bu,
      dept: spec.name,
      site: team.site,
      level: 'M1',
      title: spec.manager,
      role: spec.manager,
      mgr: bossIdx,
      perf: rng.normal(0.2, 0.9),
    })
    if (team.tag) m.tags.add(team.tag)
    for (const site of team.members) {
      const ic = add(ctx, {
        name: names.name(site),
        bu: spec.bu,
        dept: spec.name,
        site,
        level: 'L3',
        mgr: m.idx,
        perf: rng.normal(),
      })
      assignIcRole(ic, spec, drawIcLevel(spec, site, rng), rng)
    }
  }

  if (spec.directors === 0) {
    for (const t of teams) addManagerTeam(t, boss)
    return
  }
  groups.forEach((g, k) => {
    const siteCount = new Map<string, number>()
    for (const t of g.teams) siteCount.set(t.site, (siteCount.get(t.site) ?? 0) + 1)
    const site = [...siteCount].sort((a, b) => b[1] - a[1])[0]?.[0] ?? spec.sites[0][0]
    const titleIndex = g.single ? spec.directors - 1 : k
    const d = add(ctx, {
      name: names.name(site),
      bu: spec.bu,
      dept: spec.name,
      site,
      level: 'M2',
      title: directorTitle(spec, titleIndex, site),
      role: 'Director',
      mgr: boss,
      perf: rng.normal(0.3, 0.8),
    })
    if (g.single) d.tags.add('span-single')
    else {
      for (let i = 0; i < spec.dirIcs; i++) {
        const ic = add(ctx, {
          name: names.name(site),
          bu: spec.bu,
          dept: spec.name,
          site,
          level: 'L5',
          mgr: d.idx,
          perf: rng.normal(0.3, 0.9),
        })
        assignIcRole(ic, spec, rng.chance(0.6) ? 'L6' : 'L5', rng)
      }
    }
    for (const t of g.teams) addManagerTeam(t, d.idx)
  })
}

function buildExecutiveOffice(ctx: Ctx): void {
  const { names, rng } = ctx
  const ceo = ctx.execs.get('ceo')!
  const base = { bu: EO, dept: 'Executive Office', site: 'San Jose' }
  const cos = add(ctx, {
    ...base,
    name: names.name('San Jose'),
    level: 'M2',
    title: 'Chief of Staff',
    role: 'Chief of Staff',
    marketKey: 'Corporate strategy',
    mgr: ceo,
    perf: rng.normal(0.5, 0.6),
    hire: day('2019-04-08'),
  })
  const staff: [string, Level, string, number, string][] = [
    ['Executive Business Partner', 'L4', 'Executive administration', ceo, '2016-09-12'],
    ['Executive Business Partner', 'L4', 'Executive administration', cos.idx, '2021-03-01'],
    ['Strategy and Operations Lead', 'L5', 'Corporate strategy', cos.idx, '2020-08-03'],
    ['Strategy Analyst II', 'L3', 'Corporate strategy', cos.idx, '2023-06-05'],
    ['Communications Lead', 'L5', 'Communications', cos.idx, '2018-11-05'],
  ]
  for (const [title, level, family, mgr, hire] of staff) {
    add(ctx, {
      ...base,
      name: names.name('San Jose'),
      level,
      title,
      role: title,
      marketKey: family,
      mgr,
      perf: rng.normal(0.2, 0.8),
      hire: day(hire),
    }).tags.add('named')
  }
  cos.tags.add('named')
}

/** The People team is built by hand: its HRBPs, recruiters and HR operations agents appear across other datasets. */
function buildPeopleTeam(ctx: Ctx): Pick<World, 'hrbp' | 'recruiters' | 'coordinators' | 'agents'> {
  const { names, rng } = ctx
  const cpo = ctx.execs.get('cpo')!
  const person = (title: string, level: Level, site: string, mgr: number, family: string): Person => {
    const p = add(ctx, {
      name: names.name(site),
      bu: CORP,
      dept: 'People',
      site,
      level,
      title,
      role: title,
      marketKey: family,
      mgr,
      perf: rng.normal(0.2, 0.8),
    })
    p.tags.add('named')
    return p
  }
  const dirHrbp = person('Director, HR Business Partners', 'M2', 'San Jose', cpo, 'HR business partnering')
  const hrbpSe = person(
    'Principal HR Business Partner',
    'L6',
    'San Jose',
    dirHrbp.idx,
    'HR business partnering',
  )
  const hrbpSs = person('Senior HR Business Partner', 'L5', 'San Jose', dirHrbp.idx, 'HR business partnering')
  const hrbpOps = person('Senior HR Business Partner', 'L5', 'Hsinchu', dirHrbp.idx, 'HR business partnering')
  const hrbpGtm = person(
    'Senior HR Business Partner',
    'L5',
    'San Jose',
    dirHrbp.idx,
    'HR business partnering',
  )
  const hrbpCorp = person('HR Business Partner', 'L4', 'Austin', dirHrbp.idx, 'HR business partnering')
  person('HR Business Partner', 'L4', 'Bengaluru', dirHrbp.idx, 'HR business partnering')
  person('Learning and Development Partner', 'L4', 'San Jose', dirHrbp.idx, 'Learning and development')
  person('Learning and Development Partner', 'L3', 'Bengaluru', dirHrbp.idx, 'Learning and development')

  const dirTa = person('Director, Talent Acquisition', 'M2', 'San Jose', cpo, 'Talent acquisition')
  const taAm = person(
    'Talent Acquisition Manager, Americas',
    'M1',
    'San Jose',
    dirTa.idx,
    'Talent acquisition',
  )
  const taIntl = person(
    'Talent Acquisition Manager, International',
    'M1',
    'Bengaluru',
    dirTa.idx,
    'Talent acquisition',
  )
  const rec = (title: string, level: Level, site: string, mgr: Person) =>
    person(title, level, site, mgr.idx, 'Talent acquisition')
  const r1 = rec('Senior Technical Recruiter', 'L4', 'San Jose', taAm)
  const r2 = rec('Senior Technical Recruiter', 'L4', 'San Jose', taAm)
  const r3 = rec('Technical Recruiter II', 'L3', 'Austin', taAm)
  const r4 = rec('Technical Recruiter II', 'L3', 'Toronto', taAm)
  const r9 = rec('Recruiter II', 'L3', 'San Jose', taAm)
  const c1 = rec('Recruiting Coordinator II', 'L2', 'San Jose', taAm)
  const c2 = rec('Recruiting Coordinator II', 'L2', 'Austin', taAm)
  const r5 = rec('Senior Technical Recruiter', 'L4', 'Bengaluru', taIntl)
  const r6 = rec('Technical Recruiter II', 'L3', 'Bengaluru', taIntl)
  const r7 = rec('Technical Recruiter II', 'L3', 'Hsinchu', taIntl)
  const r8 = rec('Technical Recruiter II', 'L3', 'Munich', taIntl)
  const c3 = rec('Recruiting Coordinator II', 'L2', 'Bengaluru', taIntl)
  const c4 = rec('Recruiting Coordinator', 'L1', 'Hsinchu', taIntl)

  const dirPo = person('Director, People Operations', 'M2', 'San Jose', cpo, 'People operations')
  const poAm = person('People Operations Manager, Americas', 'M1', 'Austin', dirPo.idx, 'People operations')
  const poApac = person(
    'People Operations Manager, Asia Pacific',
    'M1',
    'Bengaluru',
    dirPo.idx,
    'People operations',
  )
  const agents: World['agents'] = []
  const agent = (title: string, level: Level, site: string, mgr: number, family: string, team: string) => {
    const p = person(title, level, site, mgr, family)
    agents.push({ idx: p.idx, team, apac: site === 'Bengaluru' || site === 'Hsinchu' })
  }
  agent('Payroll Specialist II', 'L3', 'Austin', poAm.idx, 'Payroll', 'Payroll')
  agent('Senior Payroll Specialist', 'L4', 'San Jose', poAm.idx, 'Payroll', 'Payroll')
  agent('Benefits Specialist II', 'L3', 'Austin', poAm.idx, 'Benefits', 'Benefits')
  agent(
    'Leave and Accommodation Specialist II',
    'L3',
    'Austin',
    poAm.idx,
    'People operations',
    'Leave & accommodation',
  )
  agent('HR Operations Specialist', 'L2', 'Austin', poAm.idx, 'People operations', 'People operations')
  agent('HRIS Analyst II', 'L3', 'San Jose', poAm.idx, 'HRIS', 'HRIS')
  agent('Senior HRIS Analyst', 'L4', 'Raleigh', poAm.idx, 'HRIS', 'HRIS')
  agent('HR Operations Specialist', 'L2', 'Bengaluru', poApac.idx, 'People operations', 'People operations')
  agent('HR Operations Specialist II', 'L3', 'Hsinchu', poApac.idx, 'People operations', 'People operations')
  agent('Benefits Specialist', 'L2', 'Bengaluru', poApac.idx, 'Benefits', 'Benefits')
  agent(
    'Leave and Accommodation Specialist II',
    'L3',
    'Bengaluru',
    poApac.idx,
    'People operations',
    'Leave & accommodation',
  )
  agent(
    'Senior Global Mobility Specialist',
    'L4',
    'San Jose',
    dirPo.idx,
    'Global mobility',
    'Global mobility',
  )
  agent(
    'Lead Employee Relations Partner',
    'L5',
    'San Jose',
    dirPo.idx,
    'Employee relations',
    'Employee relations',
  )
  agent(
    'Compensation and Equity Specialist II',
    'L3',
    'San Jose',
    dirPo.idx,
    'Total rewards',
    'Total rewards',
  )

  const tr = person('Total Rewards Manager', 'M1', 'San Jose', cpo, 'Total rewards')
  person('Compensation Analyst II', 'L3', 'San Jose', tr.idx, 'Total rewards')
  person('Senior Compensation Analyst', 'L4', 'San Jose', tr.idx, 'Total rewards')

  const americas = new Set(['San Jose', 'Austin', 'Raleigh', 'Boulder', 'Seattle'])
  const canada = new Set(['Toronto', 'Vancouver'])
  const desk = (p: Person, covers: RecruiterDesk['covers']): RecruiterDesk => ({ idx: p.idx, covers })
  const recruiters: RecruiterDesk[] = [
    desk(r5, (bu, _d, s) => s === 'Bengaluru' && bu === SE),
    desk(r6, (_b, _d, s) => s === 'Bengaluru'),
    desk(r7, (_b, _d, s) => s === 'Hsinchu' || s === 'Shanghai' || s === 'Ho Chi Minh City'),
    desk(r8, (_b, _d, s) => s === 'Munich' || s === 'Haifa'),
    desk(r9, (bu) => bu === GTM || bu === CORP || bu === EO),
    desk(r1, (bu, d) => bu === SE && ['Architecture', 'Digital Design', 'Design Verification'].includes(d)),
    desk(r2, (bu) => bu === SE),
    desk(r4, (bu, _d, s) => bu === SS && (canada.has(s) || s === 'Seattle')),
    desk(r3, (bu, _d, s) => americas.has(s) || canada.has(s) || bu === OPS),
  ]
  return {
    hrbp: new Map([
      [SE, hrbpSe.idx],
      [SS, hrbpSs.idx],
      [OPS, hrbpOps.idx],
      [GTM, hrbpGtm.idx],
      [CORP, hrbpCorp.idx],
      [EO, dirHrbp.idx],
    ]),
    recruiters,
    coordinators: [
      { idx: c1.idx, region: 'Americas' },
      { idx: c2.idx, region: 'Americas' },
      { idx: c3.idx, region: 'India' },
      { idx: c4.idx, region: 'International' },
    ],
    agents,
  }
}

/** Build today's active organization (no hire dates yet except fixed executive and office roles). */
export function buildOrg(rng: Rng, names: NameBook): World {
  const ctx: Ctx = { rng, names, people: [], execs: new Map() }
  for (const s of EXEC_SLOTS) {
    const spec = deptSpec(s.dept)
    const p = add(ctx, {
      name: names.name(s.site),
      bu: spec.bu,
      dept: s.dept,
      site: s.site,
      level: s.level,
      title: s.title,
      role: s.title,
      marketKey: 'Executive leadership',
      hire: day(s.hire),
      mgr: s.boss ? ctx.execs.get(s.boss)! : null,
      perf: rng.normal(0.5, 0.6),
    })
    p.tags.add('exec')
    ctx.execs.set(s.key, p.idx)
  }
  buildExecutiveOffice(ctx)
  for (const spec of DEPTS) if (!spec.explicit) buildDept(spec, ctx)
  const hr = buildPeopleTeam(ctx)
  return { people: ctx.people, execs: ctx.execs, ...hr }
}
