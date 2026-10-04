/**
 * Exports stamp "Definitions changed from defaults: N" from the dictionary in force. The export
 * library loads on demand and knows nothing of the store, so the app tells it where the count
 * comes from once, when the Data room module loads with the app.
 */
import { useCensus } from '@/data/store'
import { setDefinitionsSource } from '@/lib/export/definitions'
import { metricsApi } from '@/metrics/api'

setDefinitionsSource(() => metricsApi(useCensus.getState().metrics).changedCount)
