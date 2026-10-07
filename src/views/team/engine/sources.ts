/**
 * What My team is made of (docs/ROLES.md 2.2, docs/DESIGN-REFRESH.md 4.2): the producing views'
 * own models for the scope on screen, each cached per analytics context, so a number here is the
 * same number, computed once, as on People stats, Recruiting, Onboarding and Talent. Pure.
 */
import { accessFor } from '@/access/context'
import type { AnalyticsContext } from '@/data/context'
import { focusLeader } from '@/data/scope'
import { type HrbpModel, hrbpModel } from '@/views/hrbp/engine'
import { computeOnboarding, type OnboardingModel } from '@/views/onboarding/engine'
import { computeRecruiting, type RecruitingModel } from '@/views/recruiting/engine'
import { type TalentModel, talentModel } from '@/views/talent/engine'

export interface TeamSources {
  hrbp: HrbpModel
  recruiting: RecruitingModel
  onboarding: OnboardingModel
  talent: TalentModel
}

/** The four producing models for this context (each one cached by its own view). */
export function teamSources(ctx: AnalyticsContext): TeamSources {
  return {
    hrbp: hrbpModel(ctx),
    recruiting: computeRecruiting(ctx),
    onboarding: computeOnboarding(ctx),
    talent: talentModel(ctx),
  }
}

/** The leader whose org the page shows: the leader filter's focus, when it names someone on the roster. */
export function teamLeader(ctx: AnalyticsContext): { id: string; name: string } | null {
  const id = focusLeader(ctx.filters)
  const e = id ? ctx.org.byId.get(id) : undefined
  return id && e ? { id, name: e.name || id } : null
}

/**
 * Manager mode's answers, whatever mode is on screen: My team shows what a manager sees, so a
 * Developer previewing it sees the same page (the hide lists apply to the findings and items here
 * as they do in Manager mode).
 */
export function managerAnswers(ctx: AnalyticsContext) {
  return ctx.access.mode === 'manager' ? ctx.access : accessFor('manager', null, ctx.metrics)
}
