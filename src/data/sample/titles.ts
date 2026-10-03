/**
 * Career tracks and job titles: IC level draws per department and site, title ladders, and the
 * title a person held at another level or in another department.
 */
import type { Level } from '../schema'
import { type DeptSpec, deptSpec, IC_LEVELS, type IcLevel, type Ladder, type Track } from './departments'
import type { Person } from './model'
import type { Rng } from './prng'

const icIndex = (l: string): number => IC_LEVELS.indexOf(l as IcLevel)

const LADDERS: Record<Ladder, Record<IcLevel, (r: string) => string>> = {
  eng: {
    L1: (r) => `Associate ${r}`,
    L2: (r) => r,
    L3: (r) => `${r} II`,
    L4: (r) => `Senior ${r}`,
    L5: (r) => `Staff ${r}`,
    L6: (r) => `Principal ${r}`,
  },
  biz: {
    L1: (r) => `Associate ${r}`,
    L2: (r) => r,
    L3: (r) => `${r} II`,
    L4: (r) => `Senior ${r}`,
    L5: (r) => `Lead ${r}`,
    L6: (r) => `Principal ${r}`,
  },
  tech: {
    L1: (r) => r,
    L2: (r) => `${r} II`,
    L3: (r) => `Senior ${r}`,
    L4: (r) => `Lead ${r}`,
    L5: (r) => `Lead ${r}`,
    L6: (r) => `Lead ${r}`,
  },
}

export function titleFor(track: Track, level: Level): string {
  if (!level.startsWith('L')) return track.role
  const l = level as IcLevel
  return track.titles?.[l] ?? LADDERS[track.ladder ?? 'eng'][l](track.role)
}

const fits = (t: Track, l: IcLevel): boolean =>
  icIndex(l) >= icIndex(t.min ?? 'L1') && icIndex(l) <= icIndex(t.max ?? 'L6')

/** Pick a career track for an IC level in a department; the level is clamped into the track's range. */
export function roleFor(spec: DeptSpec, level: IcLevel, rng: Rng): { track: Track; level: IcLevel } {
  const ok = spec.tracks.filter((t) => fits(t, level))
  if (ok.length)
    return {
      track: rng.weighted(
        ok,
        ok.map((t) => t.w),
      ),
      level,
    }
  const track = rng.weighted(
    spec.tracks,
    spec.tracks.map((t) => t.w),
  )
  const lo = icIndex(track.min ?? 'L1')
  const hi = icIndex(track.max ?? 'L6')
  return { track, level: IC_LEVELS[Math.min(hi, Math.max(lo, icIndex(level)))] }
}

const JUNIOR_SITES = new Set(['Bengaluru', 'Ho Chi Minh City', 'Shanghai'])

/** Draw an IC level from the department mix; offshore engineering centers skew a step junior. */
export function drawIcLevel(spec: DeptSpec, site: string, rng: Rng): IcLevel {
  let i = icIndex(rng.weighted(IC_LEVELS, spec.mix))
  if (JUNIOR_SITES.has(site) && i > 0 && rng.chance(0.3)) i--
  return IC_LEVELS[i]
}

/** Give a person an IC role and title in their department. */
export function assignIcRole(p: Person, spec: DeptSpec, level: IcLevel, rng: Rng): void {
  const { track, level: l } = roleFor(spec, level, rng)
  p.level = l
  p.role = track.role
  p.family = track.family ?? spec.name
  p.title = titleFor(track, l)
}

/** Title a person held (or would hold) in a department at a level, for history and requisitions. */
export function titleAt(p: Person, dept: string, level: Level): string {
  if (dept === p.dept && level === p.level) return p.title
  const spec = deptSpec(dept)
  if (level === 'M1') return spec.manager
  if (level === 'M2') return spec.directorTitles?.[0] ?? `Director, ${dept}`
  if (!level.startsWith('L')) return p.title
  const own = dept === p.dept ? spec.tracks.find((t) => t.role === p.role) : undefined
  const track = own ?? spec.tracks[0]
  return titleFor(track, level)
}
