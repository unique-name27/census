/**
 * A native select in the house style: hairline ring, 4px radius, a stroke chevron. Native so long
 * column lists stay fast and keyboard and screen-reader behaviour comes from the browser.
 */
import type { ReactNode } from 'react'
import { IconChevronDown } from '@/components/icons'
import { cx } from '@/components/ui'

export function Select({
  value,
  onChange,
  label,
  children,
  className,
  tone = 'default',
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  /** Accessible name. */
  label: string
  children: ReactNode
  className?: string
  /** 'attention' draws a warning ring, for a value that still needs a decision. */
  tone?: 'default' | 'attention' | 'quiet'
  disabled?: boolean
}) {
  return (
    <span className={cx('relative inline-flex min-w-0', className)}>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cx(
          'h-7 w-full min-w-0 cursor-pointer appearance-none truncate rounded-control pr-7 pl-2 text-[13px] text-ink outline-none transition-colors focus-visible:shadow-[inset_0_0_0_2px_var(--focus)] disabled:cursor-default disabled:opacity-45',
          tone === 'quiet'
            ? 'bg-transparent shadow-[inset_0_0_0_1px_var(--rule)] hover:bg-hover'
            : 'bg-sheet shadow-[inset_0_0_0_1px_var(--rule-strong)] hover:bg-sheet-2',
          tone === 'attention' && 'shadow-[inset_0_0_0_1px_var(--warning)]',
        )}
      >
        {children}
      </select>
      <IconChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted"
      />
    </span>
  )
}
