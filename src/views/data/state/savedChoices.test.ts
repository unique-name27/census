import { describe, expect, it } from 'vitest'
import { parseProfileKeys } from './savedChoices'

describe('parseProfileKeys', () => {
  it('finds saved column choices among the stored keys, ignoring everything else', () => {
    expect(
      parseProfileKeys([
        'census:profile:employees:6db2924a',
        'census:profile:comp:0000beef',
        'census:import-log:employees',
        'census:profile:nonsense:1234',
        'census:profile:employees:',
        42,
      ]),
    ).toEqual([
      { dataset: 'employees', fingerprint: '6db2924a' },
      { dataset: 'comp', fingerprint: '0000beef' },
    ])
  })
})
