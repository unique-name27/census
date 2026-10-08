/**
 * The parts of a hero's 100% bar (`ui/SplitBar.tsx`): a key, its words, its count and how it is
 * painted, a status (with its glyph), a step of the blue ramp, or gray. Pure.
 */
export type SplitTone = 'good' | 'warning' | 'serious' | 'critical'
export type SplitPaint =
  | SplitTone
  | 'seq-250'
  | 'seq-400'
  | 'seq-500'
  | 'seq-600'
  | 'series'
  | 'deemph'
  | 'empty'

export interface SplitPart {
  key: string
  label: string
  count: number
  paint: SplitPaint
}
