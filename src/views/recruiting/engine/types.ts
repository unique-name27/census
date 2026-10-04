/**
 * Shapes shared by the recruiting engine modules. Pure types and small constants; no React.
 */
import type { Candidate, Requisition } from '@/data/schema'

/** Index of the last stage a candidate can wait in (Offer); Hired (5) is terminal. */
export const LAST_OPEN_STAGE = 4
export const HIRED = 5

/** Where an application stands on the as-of date. */
export type Outcome = 'Active' | 'Rejected' | 'Withdrawn' | 'Declined' | 'Hired'

/** One application, joined to its requisition and evaluated on the as-of date. */
export interface App {
  /** The candidate row this application came from (what the drill panel lists). */
  raw: Candidate
  id: string
  name: string
  reqId: string
  req: Requisition | null
  /** Job title from the req; null when the req is unknown or has none. */
  title: string | null
  businessUnit: string | null
  department: string | null
  location: string | null
  level: string | null
  hiringManager: string | null
  hiringManagerId: string | null
  recruiter: string | null
  coordinator: string | null
  source: string
  appliedDate: string
  /** Stage dates (index = stage), only those on or before the as-of date; Applied is appliedDate. */
  dates: (string | null)[]
  /** Furthest stage reached on the as-of date (0 Applied … 5 Hired). */
  furthest: number
  outcome: Outcome
  /** Hired date, or the exit date for rejected, withdrawn and declined applications. */
  exitDate: string | null
  reason: string | null
  /** Date the furthest stage was entered. */
  enteredDate: string
  /** Next scheduled event; only for applications that are still open in the data. */
  nextEventDate: string | null
}

/** Which optional columns exist anywhere in the data (a missing column means null, never 0). */
export interface Coverage {
  hasNextEvent: boolean
  hasStageDates: boolean
  hasOfferDate: boolean
  hasDeclined: boolean
  hasRejectedDate: boolean
  hasFilledDate: boolean
}

/** Next-step state of an active candidate (the user's core definition). */
export type NextState = 'needs-step' | 'scheduled' | 'awaiting-feedback' | 'offer-out'
export const NEXT_STATES: NextState[] = ['needs-step', 'awaiting-feedback', 'offer-out', 'scheduled']

/** Aging tier: amber = watch, red = overdue. Any tier means the candidate lacks a timely next step. */
export type Tier = 'amber' | 'red'

export type OwnerRole = 'Recruiter' | 'Coordinator' | 'Hiring manager' | 'Unassigned'

export interface ActiveItem {
  app: App
  /** Stage the candidate waits in (0 … 4). */
  stage: number
  state: NextState
  /** Start of the state clock. */
  since: string
  /** Days on the state clock: since the event, since the offer, or in stage. */
  days: number
  daysInStage: number
  tier: Tier | null
  owner: string | null
  ownerRole: OwnerRole
  /** The user's sub-state words: Needs review, Needs scheduling, Onsite scheduled, … */
  label: string
  /** The next step in neutral words. */
  nextStep: string
}

/** Stage norms: historical median days to the next stage (≥ 5 samples, else 14). */
export interface Norms {
  days: number[]
  samples: number[]
}
