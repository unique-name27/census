import { motion } from 'motion/react'

/** Bar positions in a 20×20 box: three descending columns, as in the favicon. */
const BARS = [
  { x: 5, y: 6.25, h: 7.5 },
  { x: 8.75, y: 8.75, h: 5 },
  { x: 12.5, y: 10.6, h: 3.15 },
]

/**
 * The Census mark: three descending bars on an ink tile. `working` gently cycles the bars while
 * data loads; the app's MotionConfig holds them still for people who prefer reduced motion.
 */
export function Mark({ size = 20, working = false }: { size?: number; working?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
      <rect width="20" height="20" rx="4" fill="var(--ink)" />
      {BARS.map((b, i) =>
        working ? (
          <motion.rect
            key={i}
            x={b.x}
            y={b.y}
            width={2.5}
            height={b.h}
            fill="var(--on-ink)"
            style={{ originY: 1, transformBox: 'fill-box' }}
            animate={{ scaleY: [1, 0.4, 1] }}
            transition={{
              duration: 0.9,
              repeat: Number.POSITIVE_INFINITY,
              delay: i * 0.15,
              ease: 'easeInOut',
            }}
          />
        ) : (
          <rect key={i} x={b.x} y={b.y} width={2.5} height={b.h} fill="var(--on-ink)" />
        ),
      )}
    </svg>
  )
}
