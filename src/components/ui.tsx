/**
 * Census UI primitives on Base UI. Small, quiet controls: hairline borders, ink text, 4px radius.
 * Floating layers (menus, popovers, tooltips) are the only things with a shadow.
 */
import { Menu as BMenu } from '@base-ui/react/menu'
import { Popover as BPopover } from '@base-ui/react/popover'
import { Switch as BSwitch } from '@base-ui/react/switch'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { Tooltip as BTooltip } from '@base-ui/react/tooltip'
import { type ButtonHTMLAttributes, forwardRef, type ReactElement, type ReactNode } from 'react'
import { IconChevronDown, IconCritical, IconGood, IconInfoFilled, IconWarning } from './icons'
import type { Severity } from './types'

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')

/* ───────── Button ───────── */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  icon?: ReactNode
  /** Show a trailing chevron (menu triggers). */
  caret?: boolean
}

const BTN_BASE =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-control font-medium select-none transition-colors duration-100 disabled:opacity-45 disabled:pointer-events-none'
const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-on-ink hover:bg-ink-2 data-[popup-open]:bg-ink-2',
  secondary:
    'bg-sheet text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] hover:bg-sheet-2 active:bg-sheet-3 data-[popup-open]:bg-sheet-2',
  ghost:
    'text-ink-2 hover:bg-hover hover:text-ink active:bg-press data-[popup-open]:bg-hover data-[popup-open]:text-ink',
}
const BTN_SIZE = { sm: 'h-7 px-2.5 text-[13px]', md: 'h-8 px-3 text-[13px]' }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, caret, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], className)}
      {...rest}
    >
      {icon}
      {children}
      {caret && <IconChevronDown className="-mr-1 text-muted" />}
    </button>
  )
})

export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(function IconButton(
  { label, variant = 'ghost', size = 'md', className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cx(BTN_BASE, BTN_VARIANT[variant], size === 'sm' ? 'size-7' : 'size-8', className)}
      {...rest}
    >
      {children}
    </button>
  )
})

/* ───────── Floating surfaces ───────── */

const POPUP =
  'bg-sheet text-ink rounded-control shadow-(--shadow-pop) outline-none origin-(--transform-origin) transition-[opacity,scale] duration-100 data-[starting-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[ending-style]:scale-[0.98]'

/* ───────── Menu ───────── */

export type MenuItem =
  | { label: string; onSelect: () => void; icon?: ReactNode; hint?: string; disabled?: boolean }
  | { separator: true }
  | { heading: string }

export function Menu({
  trigger,
  items,
  align = 'end',
  width = 240,
}: {
  trigger: ReactElement
  items: MenuItem[]
  align?: 'start' | 'center' | 'end'
  width?: number
}) {
  return (
    <BMenu.Root>
      <BMenu.Trigger render={trigger} />
      <BMenu.Portal>
        <BMenu.Positioner sideOffset={6} align={align} className="z-50 outline-none">
          <BMenu.Popup className={cx(POPUP, 'py-1')} style={{ width }}>
            {items.map((it, i) => {
              if ('separator' in it) return <BMenu.Separator key={i} className="my-1 h-px bg-rule" />
              if ('heading' in it)
                return (
                  <div key={i} className="eyebrow px-3 pt-2 pb-1">
                    {it.heading}
                  </div>
                )
              return (
                <BMenu.Item
                  key={i}
                  disabled={it.disabled}
                  onClick={it.onSelect}
                  className="mx-1 flex cursor-default items-center gap-2.5 rounded-[3px] px-2 py-1.5 text-[13px] outline-none select-none data-[highlighted]:bg-hover data-[disabled]:opacity-45"
                >
                  <span className="flex w-4 shrink-0 justify-center text-ink-2">{it.icon}</span>
                  <span className="flex-1">{it.label}</span>
                  {it.hint && <span className="text-[11px] text-muted">{it.hint}</span>}
                </BMenu.Item>
              )
            })}
          </BMenu.Popup>
        </BMenu.Positioner>
      </BMenu.Portal>
    </BMenu.Root>
  )
}

/* ───────── Popover ───────── */

export function Popover({
  trigger,
  children,
  title,
  side = 'bottom',
  align = 'start',
  width = 320,
  open,
  onOpenChange,
}: {
  trigger: ReactElement
  children: ReactNode
  title?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  align?: 'start' | 'center' | 'end'
  width?: number
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  return (
    <BPopover.Root open={open} onOpenChange={onOpenChange ? (o) => onOpenChange(o) : undefined}>
      <BPopover.Trigger render={trigger} />
      <BPopover.Portal>
        <BPopover.Positioner sideOffset={6} side={side} align={align} className="z-50 outline-none">
          <BPopover.Popup
            className={cx(POPUP, 'p-3 text-[13px]')}
            style={{ width, maxWidth: 'calc(100vw - 32px)' }}
          >
            {title && (
              <BPopover.Title className="cut-head mb-1.5 text-[14px] font-semibold">{title}</BPopover.Title>
            )}
            {children}
          </BPopover.Popup>
        </BPopover.Positioner>
      </BPopover.Portal>
    </BPopover.Root>
  )
}

/* ───────── Tooltip ───────── */

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <BTooltip.Provider delay={250}>{children}</BTooltip.Provider>
}

/** Short hover/focus hint. Never the only way to read a value. */
export function Tip({
  content,
  children,
  side = 'top',
}: {
  content: ReactNode
  children: ReactElement
  side?: 'top' | 'bottom'
}) {
  return (
    <BTooltip.Root>
      <BTooltip.Trigger render={children} />
      <BTooltip.Portal>
        <BTooltip.Positioner sideOffset={6} side={side} className="z-50">
          <BTooltip.Popup className={cx(POPUP, 'max-w-72 px-2.5 py-1.5 text-[12px] leading-snug')}>
            {content}
          </BTooltip.Popup>
        </BTooltip.Positioner>
      </BTooltip.Portal>
    </BTooltip.Root>
  )
}

/* ───────── Segmented control ───────── */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'sm',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; icon?: ReactNode }[]
  label: string
  size?: 'sm' | 'md'
}) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(v) => {
        if (v[0]) onChange(v[0] as T)
      }}
      className="inline-flex rounded-control bg-sheet-2 p-0.5"
    >
      {options.map((o) => (
        <Toggle
          key={o.value}
          value={o.value}
          className={cx(
            'inline-flex items-center gap-1.5 rounded-[3px] px-2.5 font-medium text-ink-2 transition-colors select-none hover:text-ink data-[pressed]:bg-sheet data-[pressed]:text-ink data-[pressed]:shadow-[0_0_0_1px_var(--rule-strong)]',
            size === 'sm' ? 'h-6 text-[12px]' : 'h-7 text-[13px]',
          )}
        >
          {o.icon}
          {o.label}
        </Toggle>
      ))}
    </ToggleGroup>
  )
}

/* ───────── Switch ───────── */

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: Base UI renders the switch as a button inside the label
    <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink-2 select-none">
      <BSwitch.Root
        checked={checked}
        onCheckedChange={(v) => onChange(v)}
        className="relative flex h-[18px] w-[30px] shrink-0 rounded-full bg-rule-strong p-[2px] transition-colors data-[checked]:bg-ink"
      >
        <BSwitch.Thumb className="size-[14px] rounded-full bg-sheet transition-transform duration-150 data-[checked]:translate-x-[12px]" />
      </BSwitch.Root>
      {label}
    </label>
  )
}

/* ───────── Status ───────── */

const SEVERITY: Record<
  Severity,
  { icon: (p: { className?: string }) => ReactElement; text: string; wash: string; word: string }
> = {
  critical: { icon: IconCritical, text: 'text-critical', wash: 'bg-critical-wash', word: 'Critical' },
  warning: { icon: IconWarning, text: 'text-warning', wash: 'bg-warning-wash', word: 'Watch' },
  info: { icon: IconInfoFilled, text: 'text-s1', wash: 'bg-hover', word: 'Note' },
  good: { icon: IconGood, text: 'text-good', wash: 'bg-good-wash', word: 'Good' },
}

/** Icon + word, so state never depends on color alone. */
export function StatusPill({
  severity,
  label,
  quiet,
}: {
  severity: Severity
  label?: string
  quiet?: boolean
}) {
  const s = SEVERITY[severity]
  const Icon = s.icon
  return (
    <span
      className={cx(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-[3px] pr-1.5 pl-1 text-[11px] font-semibold tracking-[0.02em] text-ink',
        quiet ? 'bg-transparent' : s.wash,
      )}
    >
      <Icon className={cx(s.text, 'size-3.5')} />
      {label ?? s.word}
    </span>
  )
}

export function SeverityIcon({ severity, className }: { severity: Severity; className?: string }) {
  const s = SEVERITY[severity]
  const Icon = s.icon
  return <Icon className={cx(s.text, className ?? 'size-3.5')} />
}

/** Neutral tag, e.g. "Sample", "Uploaded", "Small sample". */
export function Tag({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'ink' | 'outline'
}) {
  return (
    <span
      className={cx(
        'inline-flex h-5 items-center rounded-[3px] px-1.5 text-[11px] font-medium whitespace-nowrap',
        tone === 'neutral' && 'bg-sheet-3 text-ink-2',
        tone === 'ink' && 'bg-ink text-on-ink',
        tone === 'outline' && 'text-ink-2 shadow-[inset_0_0_0_1px_var(--rule-strong)]',
      )}
    >
      {children}
    </span>
  )
}
