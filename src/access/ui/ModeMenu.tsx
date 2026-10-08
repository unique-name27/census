/**
 * The Mode menu (docs/ROLES-V2.md 1.2): eyebrow "Mode", then the eleven modes in their five groups
 * (HR team, HR business partners, HR practices, Outside HR, Building Census), each a radio with its
 * name and one line. The checked choice that has a pick shows it under its name with "Change…".
 * Under the choices: a rule, the short wording that modes are not security, and "About modes".
 * `ModeChoices` is the grouped radio list alone (Settings > Mode uses it too). Rendered inside the
 * Mode button's popover, whose title ("Mode") names the dialog.
 */

import { Popover as BPopover } from '@base-ui/react/popover'
import { type KeyboardEvent, useId, useRef } from 'react'
import { cx } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { openHelp } from '@/help/store'
import { ABOUT_MODES, NOT_SECURITY_SHORT, PICKER_COPY } from '../copy'
import { MODE_GROUPS, MODE_HINT, MODE_LABEL, MODES, type Mode, modeOffered, PICK_OF } from '../modes'
import { openPicker, useMode } from '../store'
import { disabledHint, pickNameOf, pickText } from './pickModel'
import { usePickAvailability } from './usePickRows'

export const MODE_LINK =
  'inline-flex items-center gap-1 rounded-mark text-meta font-medium text-link underline-offset-2 hover:underline'

/**
 * The modes as one radio group in their five groups: name and one line each. Arrow keys, Home and
 * End move focus across every choice, groups included; Space, Enter or a click picks. Native radios
 * pick on every arrow press, but a mode changes the whole app (and a mode without its pick opens
 * the pick dialog), so stepping from HR to Developer must not pass through every mode between.
 */
export function ModeChoices({
  onPicked,
  labelledBy,
  showPick = false,
}: {
  onPicked?: () => void
  labelledBy?: string
  /** The Mode menu: the checked choice shows its pick and "Change…" under its name. */
  showPick?: boolean
}) {
  const { access } = useAnalytics()
  const mode = useMode((s) => s.mode)
  const recruiter = useMode((s) => s.picks.recruiter)
  const setMode = useMode((s) => s.setMode)
  const available = usePickAvailability()
  const name = useId()
  const refs = useRef<Partial<Record<Mode, HTMLInputElement | null>>>({})
  // A policy file can leave a role out of the menu (docs/SECURITY-CENTER.md); the mode in use stays listed.
  const listed = (m: Mode) => modeOffered(m) || m === mode
  const usable = MODES.filter((m) => listed(m) && !disabledHint(m, available))
  // The pick as the page shows it: the context follows the store a moment later after a change.
  const pickName = pickNameOf(access.mode, access.scope, access.unset, { recruiter })

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
      className="-mx-1 flex flex-col gap-2"
    >
      {MODE_GROUPS.filter((g) => g.modes.some(listed)).map((g) => (
        <fieldset key={g.key} className="m-0 flex min-w-0 flex-col border-0 p-0">
          <legend className="px-2 pb-0.5 text-label font-medium text-muted">{g.label}</legend>
          {g.modes.filter(listed).map((m) => {
            const hint = disabledHint(m, available)
            const checked = m === mode
            const kind = PICK_OF[m]
            const withPick = showPick && checked && kind
            return (
              <div key={m}>
                <label
                  className={cx(
                    'flex items-start gap-2.5 rounded-control px-2 py-1.5',
                    hint ? 'cursor-default opacity-60' : 'cursor-pointer hover:bg-hover',
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
                    disabled={!!hint}
                    onChange={() => pick(m)}
                    onKeyDown={(e) => onKey(e, m)}
                    className="mt-[3px] size-3.5 shrink-0 accent-(--ink)"
                  />
                  <span className="min-w-0">
                    <span
                      className={cx('block text-small text-ink', checked ? 'font-semibold' : 'font-medium')}
                    >
                      {MODE_LABEL[m]}
                    </span>
                    {withPick && pickName && access.mode === m ? (
                      <span className="block truncate text-meta leading-snug text-ink">
                        {pickText(pickName)}
                      </span>
                    ) : (
                      <span className="block text-meta leading-snug text-ink-2">{hint ?? MODE_HINT[m]}</span>
                    )}
                  </span>
                </label>
                {withPick && (
                  // Outside the label, so pressing it never re-picks the radio.
                  <div className="pb-1 pl-8">
                    <button
                      type="button"
                      className={MODE_LINK}
                      onClick={() => {
                        onPicked?.()
                        openPicker(kind)
                      }}
                    >
                      {PICKER_COPY[kind].change}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </fieldset>
      ))}
    </div>
  )
}

/** The menu's body: eyebrow, the grouped choices, the wording and "About modes". */
export function ModeMenu({ onClose }: { onClose: () => void }) {
  const titleId = useId()
  return (
    // At most min(80vh, 640px) tall (the popover's 12px padding inside): the choices scroll, the
    // wording and "About modes" stay in view.
    <div className="flex max-h-[calc(min(80vh,640px)-24px)] flex-col">
      {/* The popover's title: names the dialog and the radio group. */}
      <BPopover.Title id={titleId} className="eyebrow pb-1.5">
        Mode
      </BPopover.Title>
      <div className="-mx-1 min-h-0 overflow-y-auto overscroll-contain px-1">
        <ModeChoices onPicked={onClose} labelledBy={titleId} showPick />
      </div>
      <div className="mt-2.5 border-t border-rule pt-2.5">
        <p className="text-meta leading-snug text-muted">{NOT_SECURITY_SHORT}</p>
        <button
          type="button"
          className={cx(MODE_LINK, 'mt-1.5')}
          onClick={() => {
            onClose()
            openHelp('modes')
          }}
        >
          {ABOUT_MODES}
        </button>
      </div>
    </div>
  )
}
