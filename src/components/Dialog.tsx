/**
 * Modal dialog on a sheet surface: title, optional description, body and a footer row for actions.
 * Controlled (`open` + `onOpenChange`) or triggered by an element passed as `trigger`.
 */
import { Dialog as BDialog } from '@base-ui/react/dialog'
import type { ReactElement, ReactNode } from 'react'
import { IconClose } from './icons'

export interface DialogProps {
  title: string
  description?: ReactNode
  children?: ReactNode
  /** Action buttons, right-aligned under a hairline. */
  footer?: ReactNode
  trigger?: ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Max width in px (the dialog never exceeds the viewport minus the gutter). */
  width?: number
}

export function Dialog({
  title,
  description,
  children,
  footer,
  trigger,
  open,
  onOpenChange,
  width = 560,
}: DialogProps) {
  return (
    <BDialog.Root open={open} onOpenChange={onOpenChange ? (o) => onOpenChange(o) : undefined}>
      {trigger && <BDialog.Trigger render={trigger} />}
      <BDialog.Portal>
        <BDialog.Backdrop className="fixed inset-0 z-40 bg-overlay transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <BDialog.Popup
          className="fixed top-[max(48px,12vh)] left-1/2 z-50 flex max-h-[calc(100dvh-max(48px,12vh)-24px)] w-[calc(100vw-32px)] -translate-x-1/2 flex-col rounded-sheet bg-sheet text-ink shadow-(--shadow-pop) outline-none transition-[opacity,scale] duration-150 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0"
          style={{ maxWidth: width }}
        >
          <div className="flex items-start gap-3 px-5 pt-4 pb-3">
            <div className="min-w-0 flex-1">
              <BDialog.Title className="cut-head text-[20px] leading-tight font-semibold">
                {title}
              </BDialog.Title>
              {description && (
                <BDialog.Description className="mt-1 max-w-[70ch] text-[13px] text-ink-2">
                  {description}
                </BDialog.Description>
              )}
            </div>
            <BDialog.Close
              aria-label="Close"
              className="-mt-0.5 -mr-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-control text-ink-2 hover:bg-hover hover:text-ink"
            >
              <IconClose />
            </BDialog.Close>
          </div>
          {children && <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>}
          {footer && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-rule px-5 py-3">{footer}</div>
          )}
        </BDialog.Popup>
      </BDialog.Portal>
    </BDialog.Root>
  )
}
