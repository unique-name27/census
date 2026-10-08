/** Types for scripts/pagesFiles.mjs (what `npm run deploy` publishes to GitHub Pages). */

export declare const POLICY_SOURCE: 'public/access-policy.json'
export declare const POLICY_TARGET: 'access-policy.json'
export declare const POLICY_FORMAT: 'census-access-policy'
export declare const POLICY_VERSION: number

/** The checksum Census computes over a policy file as it holds it. */
export declare function policyChecksum(file: Record<string, unknown>): string

export interface PagesFile {
  /** The project file, relative to the root; null for an empty file. */
  from: string | null
  /** Where it goes on gh-pages. */
  to: string
}

export declare function pagesFiles(exists: (path: string) => boolean): PagesFile[]

export declare function policyProblem(policyText: string, html: string): string | null
