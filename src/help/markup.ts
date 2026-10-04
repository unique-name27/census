/**
 * The inline link markup of help text: `[label](kind:target)`. Pure, so the parsing, the plain
 * text used by search and the link checks are unit-tested.
 */
import type { Block, HelpArticle } from './types'

export type LinkKind = 'route' | 'metric' | 'article' | 'tour' | 'settings'

export const LINK_KINDS: readonly LinkKind[] = ['route', 'metric', 'article', 'tour', 'settings']

export interface HelpLink {
  kind: LinkKind
  target: string
  label: string
}

export type Inline = { text: string } | { link: HelpLink }

const LINK = /\[([^\]]+)\]\(([a-z]+):([^)\s]*)\)/g

const isKind = (s: string): s is LinkKind => (LINK_KINDS as readonly string[]).includes(s)

/** Split text into plain runs and links. An unknown kind stays as plain text. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const m of text.matchAll(LINK)) {
    const [whole, label, kind, target] = m
    const at = m.index ?? 0
    if (at > last) out.push({ text: text.slice(last, at) })
    out.push(isKind(kind) ? { link: { kind, target, label } } : { text: whole })
    last = at + whole.length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}

/** The text as a reader sees it, links reduced to their labels. */
export function plainText(text: string): string {
  return parseInline(text)
    .map((p) => ('text' in p ? p.text : p.link.label))
    .join('')
}

/** Every string of a block. */
export function blockTexts(b: Block): readonly string[] {
  if ('p' in b) return [b.p]
  if ('h' in b) return [b.h]
  if ('note' in b) return [b.note]
  if ('ul' in b) return b.ul
  return b.ol
}

/** Every link in a piece of text. */
export function linksIn(text: string): HelpLink[] {
  return parseInline(text).flatMap((p) => ('link' in p ? [p.link] : []))
}

/** Every link an article carries, in its body. */
export function articleLinks(a: HelpArticle): HelpLink[] {
  return a.body.flatMap((b) => blockTexts(b).flatMap(linksIn))
}

/** The whole article as plain text: title, summary and body. */
export function articleText(a: HelpArticle): string {
  return [a.title, a.summary, ...a.body.flatMap((b) => blockTexts(b).map(plainText))].join('\n')
}
