/**
 * Small wording helpers for tier explanations and rule details.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2 Oct" in the reference year, "2 Oct 2025" otherwise. Accepts dates and date-times. */
export function shortDate(iso: string | null | undefined, refYear?: string): string {
  if (!iso || iso.length < 10) return 'an unknown date'
  const y = iso.slice(0, 4)
  const m = MONTHS[+iso.slice(5, 7) - 1]
  if (!m) return 'an unknown date'
  const day = `${+iso.slice(8, 10)} ${m}`
  return refYear && refYear === y ? day : `${day} ${y}`
}

/**
 * A share as a whole percent that never rounds a gap away: 99.6% stays "99.6%", not "100%",
 * and 0.3% reads "<1%", not "0%".
 */
export function pctText(share: number): string {
  if (!Number.isFinite(share)) return '—'
  if (share >= 1) return '100%'
  if (share <= 0) return '0%'
  const whole = Math.round(share * 100)
  if (whole >= 100) return `${(Math.floor(share * 1000) / 10).toFixed(1)}%`
  if (whole <= 0) return '<1%'
  return `${whole}%`
}

/**
 * A share stated against the threshold it is judged by, so the words never contradict the
 * verdict: whole percents away from it, one decimal within 1 pt of it, rounded toward the side
 * the share is on. 94.6% filled reads "94.6%", not "95%", against a 95% bar; 2.47% unrecognized
 * reads "2.5%", not "2%", against a 2% limit. `min`: the share must reach the threshold; `max`:
 * it must not go over it.
 */
export function pctAgainst(share: number, threshold: number, side: 'min' | 'max'): string {
  if (!Number.isFinite(share)) return '—'
  if (Math.abs(share - threshold) >= 0.01) return pctText(share)
  const tenths = side === 'min' ? Math.floor(share * 1000 + 1e-9) : Math.ceil(share * 1000 - 1e-9)
  return `${(tenths / 10).toFixed(1)}%`
}

/** A threshold as a percent, never rounded past 0.01 pts: "95%", "97.5%", "0.5%". */
export function limitText(share: number): string {
  if (!Number.isFinite(share)) return '—'
  return `${+(share * 100).toFixed(2)}%`
}

/** A share with one decimal for thresholds near 2%: "4.1%". */
export function pct1(share: number): string {
  if (!Number.isFinite(share)) return '—'
  return `${(Math.round(share * 1000) / 10).toFixed(1)}%`
}

export const intText = (n: number): string => n.toLocaleString('en-US')

export const rowsText = (n: number): string => `${intText(n)} ${n === 1 ? 'row' : 'rows'}`

/** "Termination type" → "termination type" mid-sentence; acronyms such as "ID" keep their case. */
export const midSentence = (label: string): string =>
  /^[A-Z]{2,}\b/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1)

export const capFirst = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** The person who did something, "you" when no name was given. */
export const byWho = (by: string | null | undefined): string => (by?.trim() ? by.trim() : 'you')
