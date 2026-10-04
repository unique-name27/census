/**
 * The "Report a problem" summary for the page the reader is on, built when asked for from the
 * analytics context and the settings (see ../diagnosticInput.ts and ../diagnostics.ts).
 */
import { useAnalytics } from '@/data/context'
import { useCensus } from '@/data/store'
import { useQualityLens } from '@/views/data/quality-overview/lens'
import { diagnosticInput } from '../diagnosticInput'
import { diagnosticText } from '../diagnostics'

/** A function that returns the summary as it stands when called. */
export function useDiagnostic(): () => string {
  const ctx = useAnalytics()
  return () =>
    diagnosticText(
      diagnosticInput(ctx, useCensus.getState(), {
        hash: typeof location === 'undefined' ? '' : location.hash,
        browser: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
        windowSize:
          typeof window === 'undefined'
            ? 'unknown'
            : `${window.innerWidth} × ${window.innerHeight} px, device pixel ratio ${window.devicePixelRatio}`,
        at: new Date().toISOString(),
        lensOn: useQualityLens.getState().on,
      }),
    )
}
