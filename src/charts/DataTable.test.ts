import { describe, expect, it } from 'vitest'
import { textMinWidth } from './DataTable'

describe('text cell widths', () => {
  it('gives long text a readable width so it clamps at two lines, not seven', () => {
    // "What is open" on My team: about 60 characters, which a 102px column broke into 7 lines.
    expect(textMinWidth('1 required course overdue for a person in the Field Sales team')).toBe(
      'min-w-[26ch]',
    )
    expect(textMinWidth('Background check not started')).toBe('min-w-[16ch]')
    expect(textMinWidth('Design')).toBe('min-w-[6ch]')
  })

  it('keeps short values on one line in a compact table (the drill panel), so rows stay 32px', () => {
    expect(textMinWidth('Venkat Reddy', true)).toBe('whitespace-nowrap')
    expect(textMinWidth('Design Verification', true)).toBe('whitespace-nowrap')
    expect(textMinWidth('Senior Staff Design Verification Engineer, ASIC', true)).toBe('min-w-[30ch]')
  })
})
