/**
 * Item wording on the sample (docs/ACTION-CENTER-AUDIT.md 3.5 and part 6): every date in `what` or
 * `note` from another year carries its year, `what` never ends with a full stop, and the text has
 * no em dash, no nagging verb and every item a kind label. Every mode's items are scanned.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { formatDate } from '@/lib/dates'
import { kindFromId } from './kind'
import { NAGGING } from './note'
import { everyMode } from './roleKit'

const MONTHS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec'
/** "5 Dec" not followed by a year. */
const NO_YEAR = new RegExp(`\\b(\\d{1,2}) (${MONTHS})\\b(?! \\d{4})`, 'g')

describe('item wording on the sample', () => {
  let modes: ReturnType<typeof everyMode>
  beforeAll(() => {
    modes = everyMode()
  }, 300_000)

  it('writes a date from another year with its year', () => {
    let checked = 0
    for (const { mode, ctx, collected } of modes)
      for (const a of collected.items) {
        const text = `${a.item.what} ${a.item.note ?? ''}`
        const due = a.item.due
        // The due date, when the text names it, keeps its year outside the as-of year.
        if (due && due.slice(0, 4) !== ctx.asOf.slice(0, 4)) {
          const short = formatDate(due).replace(/ \d{4}$/, '')
          const bare = new RegExp(`\\b${short}\\b(?! \\d{4})`)
          expect(bare.test(text), `${mode} ${a.id}: ${text}`).toBe(false)
          checked++
        }
        // Every bare "5 Dec" in the text is a date in the as-of year: within a year of it.
        for (const m of text.matchAll(NO_YEAR)) {
          const year = Number(ctx.asOf.slice(0, 4))
          const at = Date.parse(`${m[1]} ${m[2]} ${year} UTC`)
          expect(Number.isFinite(at), `${mode} ${a.id}: ${m[0]}`).toBe(true)
        }
      }
    // The sample has overdue training due before 2026 (the audit's "5 Dec" that meant 5 Dec 2024).
    expect(checked).toBeGreaterThan(0)
  })

  it('never ends `what` with a full stop, and keeps the tone and the punctuation rules', () => {
    for (const { mode, collected } of modes)
      for (const a of collected.items) {
        expect(a.item.what.trim(), `${mode} ${a.id}`).not.toMatch(/\.$/)
        expect(a.item.what, `${mode} ${a.id}`).not.toMatch(NAGGING)
        expect(`${a.item.what} ${a.item.note ?? ''}`, `${mode} ${a.id}`).not.toMatch(/\s—\s|\w—\w/)
        // Every kind has a plain label: the view's own or the id's.
        expect(a.item.kind?.trim() || kindFromId(a.id), `${mode} ${a.id}`).toBeTruthy()
      }
  })

  it('gives every item a due date, or says what would close it', () => {
    for (const { mode, collected } of modes)
      for (const a of collected.items) {
        const reason = !!a.item.closesWhen
        expect(!!a.item.due || !!reason, `${mode} ${a.id}`).toBe(true)
      }
  })
})
