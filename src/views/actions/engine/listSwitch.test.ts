/**
 * The Action center's list switch on a phone: a role mode's three parts at their full names were
 * 386 to 400px wide, wider than the 343px column at 375, so the page scrolled sideways.
 */
import { describe, expect, it } from 'vitest'
import { listSwitchOptions } from './listSwitch'

const counts = { roles: true, needs: 20, waiting: 108, open: 128, parked: 0 }

describe('the list switch', () => {
  it('names each list in full where there is room', () => {
    expect(listSwitchOptions(counts, true).map((o) => o.label)).toEqual([
      'Needs attention 20',
      'Waiting on others 108',
      'Handled and snoozed 0',
    ])
    expect(listSwitchOptions({ ...counts, roles: false }, true).map((o) => o.label)).toEqual([
      'Open 128',
      'Handled and snoozed 0',
    ])
  })

  it('uses the short words on a phone, with the same lists and counts', () => {
    const narrow = listSwitchOptions(counts, false)
    expect(narrow.map((o) => o.value)).toEqual(['needs', 'waiting', 'parked'])
    expect(narrow.map((o) => o.label)).toEqual(['Needs attention 20', 'Waiting 108', 'Handled 0'])
    // At 12px Archivo a character is about 6.5px and each part adds 20px of padding: under 343px.
    const width = narrow.reduce((w, o) => w + o.label.length * 6.5 + 20, 4)
    expect(width).toBeLessThan(343)
  })
})
