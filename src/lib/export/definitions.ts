/**
 * The metric dictionary stamp on exports: "Definitions changed from defaults: 3 (see Metric
 * definitions)" when someone changed a definition, target or calculation setting, so a reader of
 * a sheet, slide or chart image knows its numbers may not use the standard definitions.
 *
 * The export library stays free of the app's store: the app registers where the count comes from
 * (`setDefinitionsSource`), and every export reads it at the moment it is made. Unregistered (in
 * tests, or outside the app) the count is 0 and nothing is stamped.
 */
import type { ExportMeta } from '@/charts/types'

let source: () => number = () => 0

/** Tell the export library how many metrics differ from their defaults right now. */
export function setDefinitionsSource(read: () => number): void {
  source = read
}

/** Metrics changed from their defaults, as the registered source says; 0 when unknown. */
export function definitionsChanged(): number {
  try {
    const n = source()
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  } catch {
    return 0
  }
}

/** "Definitions changed from defaults: 3 (see Metric definitions)", or null when none changed. */
export function definitionsLine(n: number = definitionsChanged()): string | null {
  return n > 0
    ? `Definitions changed from defaults: ${n.toLocaleString('en-US')} (see Metric definitions)`
    : null
}

/**
 * The stamp for one export, or null: none when nothing changed, and none for a view that reads no
 * people data (AI in HR), whose exports carry no data context at all.
 */
export function definitionsLineFor(
  meta: Pick<ExportMeta, 'scope' | 'window' | 'asOf'>,
  n: number = definitionsChanged(),
): string | null {
  return meta.scope || meta.window || meta.asOf ? definitionsLine(n) : null
}
