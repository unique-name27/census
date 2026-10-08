/**
 * A small linear program solver for tests that play an attacker (`costLp.test.ts`): the bounds of
 * c·x over { x ≥ 0, A x ≤ b }, by a dense two-phase simplex (Dantzig's rule, then Bland's against
 * cycling). Exact enough for tens of variables and a few hundred constraints. Test code only.
 *
 *   const [lo, hi] = lpRange(A, b, c)   // min and max of c·x; throws when infeasible or unbounded
 */
const EPS = 1e-9

type LpResult = { status: 'optimal'; value: number } | { status: 'infeasible' | 'unbounded' }

/** The maximum of c·x over x ≥ 0, A x ≤ b. */
export function lpMax(
  A: readonly (readonly number[])[],
  b: readonly number[],
  c: readonly number[],
): LpResult {
  const m = A.length
  const n = c.length
  // Columns: the auxiliary x0, then x1..xn, then one slack a row; the right-hand side last.
  const cols = 1 + n + m
  const W = cols + 1
  const T = new Float64Array(m * W)
  for (let i = 0; i < m; i++) {
    const o = i * W
    T[o] = -1
    for (let j = 0; j < n; j++) T[o + 1 + j] = A[i][j]
    T[o + 1 + n + i] = 1
    T[o + cols] = b[i]
  }
  const basis = Int32Array.from({ length: m }, (_, i) => 1 + n + i)
  const isBasic = new Uint8Array(cols)
  for (let i = 0; i < m; i++) isBasic[basis[i]] = 1
  // The objective row: reduced costs (a column enters while its cost is positive).
  let z = new Float64Array(W)
  const pivot = (r: number, k: number) => {
    const ro = r * W
    const p = T[ro + k]
    for (let j = 0; j < W; j++) T[ro + j] /= p
    for (let i = 0; i < m; i++) {
      if (i === r) continue
      const o = i * W
      const f = T[o + k]
      if (f === 0) continue
      for (let j = 0; j < W; j++) T[o + j] -= f * T[ro + j]
      T[o + k] = 0
    }
    const f = z[k]
    if (f !== 0) {
      for (let j = 0; j < W; j++) z[j] -= f * T[ro + j]
      z[k] = 0
    }
    isBasic[basis[r]] = 0
    basis[r] = k
    isBasic[k] = 1
  }
  const objective = (cost: Float64Array) => {
    z = new Float64Array(W)
    for (let j = 0; j < cols; j++) z[j] = cost[j]
    for (let i = 0; i < m; i++) {
      const cb = cost[basis[i]]
      if (cb === 0) continue
      for (let j = 0; j < W; j++) z[j] -= cb * T[i * W + j]
    }
  }
  const run = (allowed: (j: number) => boolean): 'optimal' | 'unbounded' => {
    for (let iter = 0; iter < 200_000; iter++) {
      let enter = -1
      if (iter < 20_000) {
        let best = EPS
        for (let j = 0; j < cols; j++)
          if (!isBasic[j] && allowed(j) && z[j] > best) {
            best = z[j]
            enter = j
          }
      } else
        for (let j = 0; j < cols; j++)
          if (!isBasic[j] && allowed(j) && z[j] > EPS) {
            enter = j
            break
          }
      if (enter < 0) return 'optimal'
      let leave = -1
      let best = Number.POSITIVE_INFINITY
      for (let i = 0; i < m; i++) {
        const a = T[i * W + enter]
        if (a <= EPS) continue
        const ratio = T[i * W + cols] / a
        if (ratio < best - 1e-12 || (Math.abs(ratio - best) <= 1e-12 && basis[i] < basis[leave])) {
          best = ratio
          leave = i
        }
      }
      if (leave < 0) return 'unbounded'
      pivot(leave, enter)
    }
    throw new Error('The simplex did not finish.')
  }
  // Phase 1: from the most negative right-hand side, drive the auxiliary variable to 0.
  let worst = -1
  for (let i = 0; i < m; i++)
    if (T[i * W + cols] < -EPS && (worst < 0 || T[i * W + cols] < T[worst * W + cols])) worst = i
  if (worst >= 0) {
    const aux = new Float64Array(cols)
    aux[0] = -1
    objective(aux)
    pivot(worst, 0)
    run(() => true)
    const r0 = basis.indexOf(0)
    if (r0 >= 0) {
      if (T[r0 * W + cols] > 1e-7) return { status: 'infeasible' }
      let k = -1
      for (let j = 1; j < cols; j++) if (!isBasic[j] && Math.abs(T[r0 * W + j]) > EPS) k = j
      if (k >= 0) pivot(r0, k)
    }
  }
  const cost = new Float64Array(cols)
  for (let j = 0; j < n; j++) cost[1 + j] = c[j]
  objective(cost)
  if (run((j) => j !== 0) === 'unbounded') return { status: 'unbounded' }
  let value = 0
  for (let i = 0; i < m; i++) if (basis[i] >= 1 && basis[i] <= n) value += c[basis[i] - 1] * T[i * W + cols]
  return { status: 'optimal', value }
}

/** The minimum and maximum of c·x over x ≥ 0, A x ≤ b. */
export function lpRange(
  A: readonly (readonly number[])[],
  b: readonly number[],
  c: readonly number[],
): [lo: number, hi: number] {
  const hi = lpMax(A, b, c)
  const lo = lpMax(
    A,
    b,
    c.map((v) => -v),
  )
  if (hi.status !== 'optimal' || lo.status !== 'optimal') throw new Error(`LP ${hi.status}, ${lo.status}`)
  return [-lo.value, hi.value]
}

/**
 * Bounds on what each of `n` unknowns (x ≥ 0) can be, given sums of them each known to lie in
 * [lo, hi]: every row of `sets` lists the unknowns a sum covers.
 */
export function boundsFromSums(
  n: number,
  sums: readonly { set: readonly number[]; lo: number; hi: number }[],
  target: readonly number[],
): [lo: number, hi: number] {
  const A: number[][] = []
  const b: number[] = []
  for (const s of sums) {
    const row = new Array<number>(n).fill(0)
    for (const i of s.set) row[i] = 1
    A.push(row)
    b.push(s.hi)
    A.push(row.map((v) => -v))
    b.push(-s.lo)
  }
  const c = new Array<number>(n).fill(0)
  for (const i of target) c[i] = 1
  return lpRange(A, b, c)
}
