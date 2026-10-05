/** What every part of an answer reads: the conversation (people and refs) and the question it answers. */
import { createContext, use } from 'react'
import type { Conversation } from '@/ask/engine'
import type { ExportScope } from './model'

export interface AnswerContext {
  conversation: Conversation
  question: string
  /** The answer's place in this chat (1-based), so its exported tables get their own file names. */
  turnNo?: number
  /** The scope its exported tables are stamped with; null (or absent) for the app's scope now. */
  exportScope?: () => ExportScope | null
}

export const AnswerCtx = createContext<AnswerContext | null>(null)

export function useAnswerCtx(): AnswerContext {
  const c = use(AnswerCtx)
  if (!c) throw new Error('Answer parts render inside <Answer>')
  return c
}

/** The bold label opening the paragraph or list item a record link sits in ("Bengaluru"). */
export const LeadCtx = createContext<string | null>(null)
