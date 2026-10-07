/**
 * The Mode menu (docs/ROLES.md, 1.2): the three modes as a radio group with one line each,
 * "Change manager…" in Manager mode, the short wording that modes are not security and "About
 * modes". `ModeChoices` is the radio group alone. Rendered inside the Mode button's popover, whose
 * title ("Mode") names the dialog.
 */

import { Popover as BPopover } from '@base-ui/react/popover'
import { type KeyboardEvent, useId, useRef } from 'react'
import { Button, cx } from '@/components/ui'
import { openHelp } from '@/help/store'
import { ABOUT_MODES, CHANGE_MANAGER, NO_MANAGERS_HINT, NOT_SECURITY_SHORT } from '../copy'
import { MODE_HINT, MODE_LABEL, MODES, type Mode } from '../modes'
import { openManagerPicker, useMode } from '../store'
import { useManagers } from './useManagers'

const LINK =
  'inline-flex items-center gap-1 rounded-mark text-meta font-medium text-link underline-offset-2 hover:underline'

/**
 * The three modes as a radio group: name and one line each. Arrow keys, Home and End move focus
 * only; Space, Enter or a click picks. Native radios pick on every arrow press, but a mode changes
 * the whole app (and Manager opens "Choose a manager"), so stepping from HR to Developer must not
 * pass through Manager.
 */
export function ModeChoices({ onPicked, labelledBy }: { onPicked?: () => void; labelledBy?: string }) {
  const mode = useMode((s) => s.mode)
  const setMode = useMode((s) => s.setMode)
  const managers = useManagers()
  const name = useId()
  const noManagers = managers.length === 0
  const refs = useRef<Partial<Record<Mode, HTMLInputElement | null>>>({})
  const usable = MODES.filter((m) => !(m === 'manager' && noManagers))

  const pick = (m: Mode) => {
    if (m !== mode) setMode(m)
    onPicked?.()
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>, m: Mode) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      pick(m)
      return
    }
    const i = usable.indexOf(m)
    const to =
      e.key === 'ArrowDown' || e.key === 'ArrowRight'
        ? usable[(i + 1) % usable.length]
        : e.key === 'ArrowUp' || e.key === 'ArrowLeft'
          ? usable[(i - 1 + usable.length) % usable.length]
          : e.key === 'Home'
            ? usable[0]
            : e.key === 'End'
              ? usable.at(-1)
              : undefined
    if (!to) return
    // Cancels the native arrow behavior (which would pick), and moves focus instead.
    e.preventDefault()
    refs.current[to]?.focus()
  }
  return (
    <div
      role="radiogroup"
      aria-label={labelledBy ? undefined : 'Mode'}
      aria-labelledby={labelledBy}
      className="-mx-1 flex flex-col"
    >
      {MODES.map((m: Mode) => {
        const disabled = m === 'manager' && noManagers
        const checked = m === mode
        return (
          <label
            key={m}
            className={cx(
              'flex items-start gap-2.5 rounded-control px-2 py-1.5',
              disabled ? 'cursor-default opacity-60' : 'cursor-pointer hover:bg-hover',
            )}
          >
            <input
              ref={(el) => {
                refs.current[m] = el
              }}
              type="radio"
              name={name}
              value={m}
              checked={checked}
              disabled={disabled}
              onChange={() => pick(m)}
              onKeyDown={(e) => onKey(e, m)}
              className="mt-[3px] size-3.5 shrink-0 accent-(--ink)"
            />
            <span className="min-w-0">
              <span className={cx('block text-small text-ink', checked ? 'font-semibold' : 'font-medium')}>
                {MODE_LABEL[m]}
              </span>
              <span className="block text-meta leading-snug text-ink-2">
                {disabled ? NO_MANAGERS_HINT : MODE_HINT[m]}
              </span>
            </span>
          </label>
        )
      })}
    </div>
  )
}

/** The menu's body: eyebrow, the choices, "Change manager…", the wording and "About modes". */
export function ModeMenu({ onClose }: { onClose: () => void }) {
  const mode = useMode((s) => s.mode)
  const titleId = useId()
  return (
    <>
      {/* The popover's title: names the dialog and the radio group. */}
      <BPopover.Title id={titleId} className="eyebrow pb-1.5">
        Mode
      </BPopover.Title>
      <ModeChoices onPicked={onClose} labelledBy={titleId} />
      {mode === 'manager' && (
        <div className="mt-1.5 pl-1">
          <Button
            size="sm"
            onClick={() => {
              onClose()
              openManagerPicker()
            }}
          >
            {CHANGE_MANAGER}
          </Button>
        </div>
      )}
      <div className="mt-2.5 border-t border-rule pt-2.5">
        <p className="text-meta leading-snug text-muted">{NOT_SECURITY_SHORT}</p>
        <button
          type="button"
          className={cx(LINK, 'mt-1.5')}
          onClick={() => {
            onClose()
            openHelp('modes')
          }}
        >
          {ABOUT_MODES}
        </button>
      </div>
    </>
  )
}
