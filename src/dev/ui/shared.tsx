/**
 * Pieces the Developer page's tabs share: the definition every app-facts figure carries, copying
 * to the clipboard with a toast, the list picker (a wrapping row of toggles), the JSON side sheet
 * and the plain pre block.
 */
import { Dialog as BDialog } from '@base-ui/react/dialog'
import type { ReactNode } from 'react'
import type { Definition } from '@/charts/types'
import { IconClose, IconCopy } from '@/components/icons'
import { toast } from '@/components/toast'
import { Button, cx } from '@/components/ui'

/** Every Developer page figure says what it is about (docs/ROLES.md, 2.3). */
export const ABOUT_APP: Definition = {
  term: 'About',
  text: 'About the app, not people data. Nothing on this page is sent anywhere.',
}

export async function copyText(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast(`Copied ${what}`, { tone: 'good' })
  } catch {
    toast('The browser blocked copying', {
      tone: 'critical',
      description: 'Select the text and copy it instead.',
    })
  }
}

export const PRE =
  'max-h-[60vh] overflow-auto rounded-control bg-sheet-2 p-3 font-mono text-label leading-relaxed whitespace-pre-wrap break-words text-ink'

/** A wrapping row of toggles: one is pressed. Arrow keys move along the row. */
export function ListPicker<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly { value: T; label: string; count?: number | null }[]
  onChange: (v: T) => void
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a group of toggle buttons, as Segmented renders
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'inline-flex h-7 items-center gap-1.5 rounded-chip px-2.5 text-small font-medium transition-colors',
              on ? 'bg-ink text-on-ink' : 'bg-sheet-2 text-ink-2 hover:bg-hover hover:text-ink',
            )}
          >
            {o.label}
            {o.count != null && (
              <span className={cx('tnum text-label', on ? 'text-on-ink' : 'text-muted')}>{o.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** A side sheet showing JSON (or any text) with Copy. */
export function JsonSheet({
  open,
  onClose,
  title,
  description,
  text,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  text: string
  children?: ReactNode
}) {
  return (
    <BDialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <BDialog.Portal>
        <BDialog.Backdrop className="fixed inset-0 z-40 bg-overlay transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <BDialog.Popup className="fixed top-0 right-0 bottom-0 z-50 flex w-[min(560px,100vw)] flex-col bg-sheet text-ink shadow-(--shadow-pop) outline-none transition-transform duration-200 ease-out data-[ending-style]:translate-x-6 data-[ending-style]:opacity-0 data-[starting-style]:translate-x-6 data-[starting-style]:opacity-0 lg:w-[min(760px,100vw)]">
          <div className="flex items-start gap-2 px-5 pt-4 pb-3">
            <div className="min-w-0 flex-1">
              <BDialog.Title className="cut-head text-section leading-tight font-semibold">
                {title}
              </BDialog.Title>
              {description && (
                <BDialog.Description className="mt-0.5 text-small text-ink-2">
                  {description}
                </BDialog.Description>
              )}
            </div>
            <BDialog.Close
              aria-label="Close"
              className="-mr-1.5 inline-flex size-8 items-center justify-center rounded-control text-ink-2 hover:bg-hover hover:text-ink"
            >
              <IconClose />
            </BDialog.Close>
          </div>
          <div className="flex items-center gap-2 border-t border-rule px-5 py-2">
            <Button
              size="sm"
              variant="ghost"
              icon={<IconCopy />}
              onClick={() => void copyText(text, 'the JSON')}
            >
              Copy
            </Button>
            {children}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-rule px-5 py-4">
            <pre className={PRE}>{text}</pre>
          </div>
        </BDialog.Popup>
      </BDialog.Portal>
    </BDialog.Root>
  )
}

/** A muted status line inside a sheet. */
export function StatusLine({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="text-meta text-muted">
      {children}
    </p>
  )
}
