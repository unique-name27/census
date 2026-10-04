/**
 * Building blocks for the Settings sheet: a titled section and a labelled field row.
 */
import type { ReactNode } from 'react'
import { cx } from '@/components/ui'
import { SECTION_LABEL, type SettingsSection } from '@/data/settings'

export const sectionId = (s: SettingsSection) => `settings-${s}`

/** Text inputs in the sheet: hairline box, focus ring inside, red hairline when invalid. */
export const INPUT =
  'h-8 min-w-0 rounded-control bg-sheet px-2.5 text-[13px] text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--focus)] aria-[invalid=true]:shadow-[inset_0_0_0_1px_var(--critical)]'

export const LINK =
  'inline-flex items-center gap-1 rounded-[2px] text-[13px] font-medium text-link underline-offset-2 hover:underline'

export function SettingsBlock({
  section,
  intro,
  children,
}: {
  section: SettingsSection
  intro?: ReactNode
  children: ReactNode
}) {
  const id = sectionId(section)
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-0 border-t border-rule px-5 pt-5 pb-6 first:border-t-0"
    >
      <h2
        id={`${id}-title`}
        tabIndex={-1}
        className="cut-head rounded-[2px] text-[17px] leading-tight font-semibold outline-none focus-visible:outline-2 focus-visible:outline-focus"
      >
        {SECTION_LABEL[section]}
      </h2>
      {intro && <p className="mt-1 max-w-[60ch] text-[13px] leading-snug text-ink-2">{intro}</p>}
      <div className="mt-4 flex flex-col gap-5">{children}</div>
    </section>
  )
}

/** A setting: its name and a short hint, then the control. */
export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string
  hint?: ReactNode
  /** The input the label names; without it the label is plain text and the control names itself. */
  htmlFor?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <div>
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink">
            {label}
          </label>
        ) : (
          <span className="text-[13px] font-semibold text-ink">{label}</span>
        )}
        {hint && <p className="mt-0.5 text-[12px] leading-snug text-muted">{hint}</p>}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}
