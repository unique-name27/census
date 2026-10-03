/**
 * Toasts: short confirmations after exports, uploads and rescoping. One global manager so any
 * module can call `toast()`; the shell renders <Toaster /> once.
 */
import { Toast } from '@base-ui/react/toast'
import { IconClose, IconCritical, IconGood } from './icons'

export type ToastTone = 'neutral' | 'good' | 'critical'

export interface ToastOptions {
  tone?: ToastTone
  description?: string
  /** One follow-up action, e.g. "Undo". The toast closes after it runs. */
  action?: { label: string; onClick: () => void }
  /** Milliseconds before it closes on its own; 0 keeps it open. Defaults to 5s (8s with an action). */
  timeout?: number
}

const manager = Toast.createToastManager()

/** Show a toast; returns its id (for `dismissToast`). */
export function toast(message: string, opts: ToastOptions = {}): string {
  const tone = opts.tone ?? 'neutral'
  const action = opts.action
  const id: string = manager.add({
    title: message,
    description: opts.description,
    type: tone,
    priority: tone === 'critical' ? 'high' : 'low',
    timeout: opts.timeout ?? (action ? 8000 : 5000),
    actionProps: action
      ? {
          children: action.label,
          onClick: () => {
            manager.close(id)
            action.onClick()
          },
        }
      : undefined,
  })
  return id
}

export function dismissToast(id?: string): void {
  manager.close(id)
}

function ToneIcon({ tone }: { tone: string | undefined }) {
  if (tone === 'good') return <IconGood className="mt-px size-4 shrink-0 text-good" />
  if (tone === 'critical') return <IconCritical className="mt-px size-4 shrink-0 text-critical" />
  return null
}

function ToastList() {
  const { toasts } = Toast.useToastManager()
  return toasts.map((t) => (
    <Toast.Root
      key={t.id}
      toast={t}
      className="pointer-events-auto rounded-control bg-sheet text-ink shadow-(--shadow-pop) transition-[opacity,translate] duration-150 ease-out [translate:var(--toast-swipe-movement-x)_var(--toast-swipe-movement-y)] data-[ending-style]:opacity-0 data-[limited]:hidden data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0"
    >
      <Toast.Content className="flex items-start gap-2.5 py-2.5 pr-1.5 pl-3">
        <ToneIcon tone={t.type} />
        <div className="min-w-0 flex-1 py-px">
          <Toast.Title className="text-[13px] leading-snug font-medium" />
          <Toast.Description className="mt-0.5 text-[12px] leading-snug text-ink-2 empty:hidden" />
        </div>
        {t.actionProps && (
          <Toast.Action className="h-6 shrink-0 rounded-control px-2 text-[12px] font-semibold text-link hover:bg-hover" />
        )}
        <Toast.Close
          aria-label="Dismiss"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-control text-muted hover:bg-hover hover:text-ink"
        >
          <IconClose className="size-3.5" />
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ))
}

/** Renders the toast stack, bottom right. Mount once near the app root. */
export function Toaster() {
  return (
    <Toast.Provider toastManager={manager} limit={3}>
      <Toast.Portal>
        <Toast.Viewport className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[360px] max-w-[calc(100vw-32px)] flex-col-reverse gap-2 outline-none">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}
