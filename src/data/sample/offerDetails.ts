/**
 * Offer details on the sample's Candidates (docs/ANALYSES.md, 3.10), from their own stream right
 * after recruiting: whether the candidate held a competing offer, whether we revised the offer,
 * and where it sat in the pay range (a ratio, never an amount). All three are recorded for offers
 * resolved since 1 Oct 2025 and blank before, as an ATS field added that day would be.
 *
 * - Competing offers: most "Accepted competing offer" declines, about a third of the
 *   "Compensation below expectations" ones, none of the counteroffers (that offer is from the
 *   current employer); among accepted offers, enough that about a third of candidates holding
 *   another offer accept ours.
 * - Revised offers: about a quarter of offers with a competing offer; most of those are accepted,
 *   few of the rest.
 * - Position in range: Bengaluru offers sit low, declined ones lowest (it agrees with the
 *   Compensation story on Bengaluru pay), and senior declined offers sit below the rest.
 * - Slow decisions: most declines with a competing offer come 8 to 16 days after the offer (the decline
 *   date moves later inside its calendar quarter; the offer date stays), and the accepted offers
 *   with a competing offer, outside Design Verification and outside Q3 2026, took 8 to 14 days to
 *   accept (the screen, interview and offer dates move earlier together; applied, accepted and
 *   start dates stay). The only rows whose existing dates change. Pure.
 */
import { addDays, daysBetween, quarterStart } from '@/lib/dates'
import type { Candidate, ISODate, Requisition } from '../schema'
import type { Rng } from './prng'

/** The first day the ATS recorded offer details. */
export const OFFER_DETAILS_FROM: ISODate = '2025-10-01'

const COMPETING_BY_REASON: Readonly<Record<string, number>> = {
  'Accepted competing offer': 0.85,
  'Compensation below expectations': 0.3,
  'Counteroffer from current employer': 0,
}
/** Other declines that held a competing offer too. */
const COMPETING_OTHER = 0.1
/** Acceptance of offers with a competing offer the plant aims at. */
const COMPETING_ACCEPTANCE = 0.32
/** Share of offers with a competing offer that were revised, and of the revised that were accepted. */
const REVISED_SHARE = 0.25
const REVISED_ACCEPTED = 0.64
/** Share of declines with a competing offer whose decision came 8 to 16 days after the offer. */
const SLOW_DECLINES = 0.85
/** Offers with no competing offer that were revised anyway. */
const REVISED_OTHER = 0.05

const SENIOR = new Set(['L5', 'L6'])

const quarterEnd = (d: ISODate): ISODate => {
  const s = quarterStart(d)
  const m = +s.slice(5, 7) + 2
  const last = new Date(Date.UTC(+s.slice(0, 4), m, 0)).getUTCDate()
  return `${s.slice(0, 4)}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`
}

const median = (xs: readonly number[]): number | null => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const clamp = (x: number) => Math.round(Math.min(1.2, Math.max(0, x)) * 100) / 100

const isAccepted = (c: Candidate) => !!c.hiredDate && c.hiredDate >= OFFER_DETAILS_FROM
const isDeclined = (c: Candidate) =>
  c.status === 'Declined' && !!c.rejectedDate && c.rejectedDate >= OFFER_DETAILS_FROM

export function withOfferDetails(
  candidates: readonly Candidate[],
  requisitions: readonly Requisition[],
  asOf: ISODate,
  rng: Rng,
): Candidate[] {
  const reqs = new Map(requisitions.map((r) => [r.reqId, r]))
  const out: Candidate[] = candidates.map((c) => ({
    ...c,
    competingOffer: null,
    offerRevised: null,
    offerPositionInRange: null,
  }))
  const accepted = out.filter(isAccepted)
  const declined = out.filter(isDeclined)

  // Competing offers among declines, by reason (exact counts, so the shares hold).
  const competing = new Set<Candidate>()
  const reasons = [...new Set(declined.map((c) => c.rejectionReason ?? ''))].sort()
  for (const reason of reasons) {
    const group = declined.filter((c) => (c.rejectionReason ?? '') === reason)
    const share = COMPETING_BY_REASON[reason] ?? COMPETING_OTHER
    for (const c of rng.sample(group, Math.round(group.length * share))) competing.add(c)
  }
  const competingDeclines = declined.filter((c) => competing.has(c))

  // Accepted offers with a competing offer: outside Design Verification and Q3 2026, and able to
  // take 8 to 14 days to accept with the earlier steps moved back (applied to screen stays 2+ days).
  const q3 = (d: ISODate | null | undefined) => !!d && d >= '2026-07-01' && d <= '2026-09-30'
  const slowAccept = new Map<Candidate, number>()
  const eligible = accepted.filter((c) => {
    if (reqs.get(c.reqId)?.department === 'Design Verification' || q3(c.hiredDate) || q3(c.offerDate))
      return false
    return !!c.offerDate && !!c.screenDate && !!c.hiredDate
  })
  const wantAccepted = Math.round(
    (COMPETING_ACCEPTANCE / (1 - COMPETING_ACCEPTANCE)) * competingDeclines.length,
  )
  for (const c of rng.shuffle([...eligible])) {
    if (slowAccept.size >= wantAccepted) break
    const decide = rng.int(8, 14)
    const shift = decide - daysBetween(c.offerDate as string, c.hiredDate as string)
    if (shift <= 0) continue
    const screenGap = daysBetween(c.appliedDate, c.screenDate as string)
    const newOffer = addDays(c.offerDate as string, -shift)
    if (screenGap - shift < 2 || quarterStart(newOffer) !== quarterStart(c.offerDate as string)) continue
    slowAccept.set(c, shift)
    competing.add(c)
  }
  for (const [c, shift] of slowAccept) {
    c.screenDate = c.screenDate && addDays(c.screenDate, -shift)
    c.hmDate = c.hmDate && addDays(c.hmDate, -shift)
    c.onsiteDate = c.onsiteDate && addDays(c.onsiteDate, -shift)
    c.offerDate = c.offerDate && addDays(c.offerDate, -shift)
  }

  // Most declines with a competing offer come 8 to 16 days after the offer, inside their quarter.
  for (const c of rng.sample(competingDeclines, Math.round(competingDeclines.length * SLOW_DECLINES))) {
    if (!c.offerDate || !c.rejectedDate) continue
    const was = c.rejectedDate
    const want = addDays(c.offerDate, rng.int(8, 16))
    const latest = [quarterEnd(was), addDays(asOf, -4)].sort()[0]
    const next = want <= latest ? want : latest
    if (next <= was || daysBetween(c.offerDate, next) < 8) continue
    c.rejectedDate = next
    if (c.lastActivityDate === was) c.lastActivityDate = next
  }

  // Revised offers: a quarter of those with a competing offer, most of them accepted.
  const competingAll = [...competing]
  const revisedCount = Math.round(competingAll.length * REVISED_SHARE)
  const revisedAccepted = Math.min(slowAccept.size - 1, Math.round(revisedCount * REVISED_ACCEPTED))
  const revised = new Set<Candidate>([
    ...rng.sample([...slowAccept.keys()], revisedAccepted),
    ...rng.sample(competingDeclines, revisedCount - revisedAccepted),
  ])
  const resolved = [...accepted, ...declined]
  for (const c of resolved) {
    c.competingOffer = competing.has(c)
    c.offerRevised = revised.has(c) || (!competing.has(c) && rng.chance(REVISED_OTHER))
  }

  // Position in range: drawn by site, level and outcome until the medians land where they should.
  const site = (c: Candidate) => reqs.get(c.reqId)?.location ?? ''
  const senior = (c: Candidate) => SENIOR.has(reqs.get(c.reqId)?.level ?? '')
  const centre = (c: Candidate) => {
    const blr = site(c) === 'Bengaluru'
    const dec = isDeclined(c)
    if (dec && senior(c)) return blr ? 0.2 : 0.38
    if (dec) return blr ? 0.21 : 0.46
    return blr ? 0.385 : 0.52
  }
  const inRange = (xs: readonly number[], lo: number, hi: number) => {
    const m = median(xs)
    return m != null && m >= lo && m <= hi
  }
  for (let tries = 0; ; tries++) {
    const pos = new Map(resolved.map((c) => [c, clamp(rng.normal(centre(c), 0.1))]))
    const of = (pred: (c: Candidate) => boolean) => resolved.filter(pred).map((c) => pos.get(c) as number)
    const ok =
      inRange(
        of((c) => site(c) === 'Bengaluru' && isDeclined(c)),
        0.18,
        0.24,
      ) &&
      inRange(
        of((c) => site(c) === 'Bengaluru' && isAccepted(c)),
        0.35,
        0.42,
      ) &&
      inRange(
        of((c) => site(c) !== 'Bengaluru' && isDeclined(c)),
        0.42,
        0.5,
      ) &&
      inRange(
        of((c) => site(c) !== 'Bengaluru' && isAccepted(c)),
        0.48,
        0.56,
      ) &&
      inRange(
        of((c) => senior(c) && isDeclined(c)),
        0.3,
        0.38,
      )
    if (ok || tries >= 400) {
      if (!ok) throw new Error('Offer details plant: no draw met the range targets')
      for (const c of resolved) c.offerPositionInRange = pos.get(c) as number
      break
    }
  }
  return out
}
