/** Small glue between the HRBP figures and the shared drill panel. */
import type { DrillSource } from '@/drill/Drill'
import type { DrillSpec } from '@/drill/types'

/**
 * The drill for a table cell or tile: a thunk (the spec is built on click) when there are records
 * behind the number, else nothing, so cells without records don't look clickable.
 */
export const drillWhen = (has: boolean, build: () => DrillSpec | null): DrillSource => (has ? build : null)
