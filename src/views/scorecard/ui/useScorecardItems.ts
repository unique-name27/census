/**
 * The open items the Scorecard counts ("Critical open items", "Where open items wait") and its
 * Needs attention (the escalations, docs/ROLES-V2.md 5.11): the Action center's split for this
 * context (`roleView`), over the one cached collection, open in this browser by the same marks.
 * `open` is every item HR lists (the per-manager training roll-ups are the managers'), so the
 * Scorecard, the masthead and the Action center agree. Null until the first collection is done.
 */
export {
  type HomeItems as ScorecardItems,
  useHomeItems as useScorecardItems,
} from '@/views/home/ui/useHomeItems'
