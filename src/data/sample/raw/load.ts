/**
 * Loading the messy sample in the app, in two steps so the import never delays the first view:
 *
 * 1. `messySampleLoader()` (the store awaits it on init) returns the starter state: the rows the
 *    raw extracts import as, with the starter confirmations and certifications, so every tier is
 *    right from the first paint.
 * 2. Once the app is showing, the raw extracts run through the real import pipeline in the
 *    background, one dataset per task, and the full seed is applied: each raw dataset's version
 *    gains its original sheet, mapping and import log. Rows that match the starter state are kept
 *    as they are, so no number changes on screen.
 */
import type { SampleSeed } from '../../quality/seed'
import { useCensus } from '../../store'
import { cachedSample } from '..'
import { type StarterSample, starterSample } from './starter'

let started: Promise<SampleSeed> | null = null

/** The seed loader for `setSampleSeed`; every call shares one load. */
export function messySampleLoader(): Promise<SampleSeed> {
  started ??= start()
  return started
}

async function start(): Promise<SampleSeed> {
  const base = cachedSample()
  const starter = starterSample(base)
  void finish(starter)
  return starter.seed
}

/** Resolves once the store has applied the starter state. */
function whenReady(): Promise<void> {
  return new Promise((resolve) => {
    if (useCensus.getState().ready) return resolve()
    const stop = useCensus.subscribe((s) => {
      if (!s.ready) return
      stop()
      resolve()
    })
  })
}

async function finish(starter: StarterSample): Promise<void> {
  try {
    await whenReady()
    const { completeMessySample } = await import('./seed')
    const seed = await completeMessySample(starter)
    useCensus.getState().applySampleSeed(seed)
  } catch {
    // The starter state stays: the same rows and tiers, without the original sheets.
  }
}
