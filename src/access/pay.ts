/**
 * Pay per mode (docs/ROLES-V2.md, part 3): three pay views. `switch` (Developer, HR, CHRO,
 * Compensation) shows individual amounts and cost totals while "Show pay amounts" is on; `totals`
 * (Finance) shows cost totals over 5 or more people and never one person's amount, with no switch;
 * `none` (everyone else) shows ratios only. Ask never sends an amount or a cost total, in any mode.
 * Pure.
 *
 *   ctx.showPay   individual amounts may show (`pay: true` columns)
 *   ctx.showCost  cost totals may show (`cost: true` columns): showPay, or Finance
 */
import { IMMIGRATION_OF, type Mode, PAY_OF, type PayView } from './modes'
import { type Decision, hidden, limited, SHOWN } from './policy/types'

export const payView = (mode: Mode): PayView => PAY_OF[mode]

/** Individual pay amounts may show: a switch mode with "Show pay amounts" on. */
export const showPayIn = (mode: Mode, switchOn: boolean): boolean => PAY_OF[mode] === 'switch' && switchOn

/** Cost totals may show: individual amounts may (the switch modes, switch on), or Finance always. */
export const showCostIn = (mode: Mode, switchOn: boolean): boolean =>
  showPayIn(mode, switchOn) || PAY_OF[mode] === 'totals'

/** Work authorization types per person may show: a mode with the switch, switch on. */
export const showImmigrationIn = (mode: Mode, switchOn: boolean): boolean => IMMIGRATION_OF[mode] && switchOn

export type PaySurface = 'pay:amounts' | 'pay:totals' | 'pay:switch'

/**
 * The `pay:*` surfaces for a mode, from its pay view (the matrix keeps every table equal to these):
 * `pay:switch` the "Show pay amounts" switch, `pay:amounts` one person's amounts, `pay:totals`
 * cost totals over groups.
 */
export function payDecisions(mode: Mode): Readonly<Record<PaySurface, Decision>> {
  switch (PAY_OF[mode]) {
    case 'switch':
      // Shown; the amounts and totals render while the switch is on (`ctx.showPay`, `ctx.showCost`).
      return { 'pay:switch': SHOWN, 'pay:amounts': SHOWN, 'pay:totals': SHOWN }
    case 'totals':
      return {
        'pay:switch': hidden('Finance mode shows cost totals without a switch.'),
        'pay:amounts': hidden("Finance mode never shows one person's pay."),
        'pay:totals': limited('Totals over 5 or more people, by whole business units.'),
      }
    default:
      return {
        'pay:switch': hidden('This mode shows ratios only.'),
        'pay:amounts': hidden('This mode shows ratios only.'),
        'pay:totals': hidden('This mode shows ratios only.'),
      }
  }
}
