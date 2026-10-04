/**
 * Test helper for engine time budgets ("runs in under 150 ms"). Wall-clock time alone fails on a
 * busy machine, such as a full parallel test run next to a build, because waiting for a core
 * counts as running. This takes the best of a few runs after a warm-up, and for each run the
 * smaller of wall-clock time and this thread's CPU time, so the budget measures the work.
 * Tests only; the app never imports it.
 */
export function bestCostMs(fn: () => unknown, runs = 3): number {
  fn()
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < runs; i++) {
    const cpu0 = process.threadCpuUsage()
    const t0 = performance.now()
    fn()
    const wall = performance.now() - t0
    const cpu = process.threadCpuUsage(cpu0)
    best = Math.min(best, wall, (cpu.user + cpu.system) / 1000)
  }
  return best
}
