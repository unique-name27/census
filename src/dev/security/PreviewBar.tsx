/**
 * Shown by the shell in every mode, above the masthead: while this tab previews a role with the
 * Security center's draft, a bar "Previewing Finance." with "Back to the Security center". A
 * preview whose pick dialog was dismissed, or left for Developer mode from the Mode menu, ends
 * quietly. In Developer mode it also warns once when the site's policy file was ignored, naming
 * why. Small, so the other modes load little of the Security center.
 */
import { useEffect } from 'react'
import { MODE_LABEL } from '@/access/modes'
import { useMode } from '@/access/store'
import { IconEye } from '@/components/icons'
import { goTo } from '@/components/navigation'
import { toast } from '@/components/toast'
import { BACK_TO_SECURITY, IGNORED_TITLE, PREVIEW_DETAIL, previewingText } from './copy'
import { backToSecurityCenter, endIdlePreview } from './preview'
import { usePolicy } from './store'

let warned = false

export function PreviewBar() {
  const preview = usePolicy((s) => s.preview)
  const ignored = usePolicy((s) => s.inForce.ignored)
  const mode = useMode((s) => s.mode)
  const picking = useMode((s) => s.picking)
  useEffect(() => {
    endIdlePreview(mode, picking)
  }, [mode, picking])
  useEffect(() => {
    if (!ignored || mode !== 'developer' || warned) return
    warned = true
    toast(IGNORED_TITLE, {
      tone: 'critical',
      description: `${ignored} The built-in defaults are in force.`,
      action: { label: 'Open the Security center', onClick: () => goTo('dev', 'security:in-force') },
      timeout: 12_000,
    })
  }, [ignored, mode])
  if (!preview || mode === 'developer') return null
  return (
    <section aria-label="Preview" className="border-b border-rule bg-warning-wash text-ink">
      <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-1 px-(--gutter) py-2">
        <p className="flex items-center gap-1.5 text-small font-semibold">
          <IconEye className="size-4 shrink-0" />
          {previewingText(MODE_LABEL[mode])}
        </p>
        <p className="min-w-0 flex-1 basis-60 text-meta text-ink-2">{PREVIEW_DETAIL}</p>
        <button
          type="button"
          onClick={backToSecurityCenter}
          className="inline-flex h-7 items-center rounded-control px-2.5 text-small font-semibold text-link underline-offset-2 hover:underline"
        >
          {BACK_TO_SECURITY}
        </button>
      </div>
    </section>
  )
}
