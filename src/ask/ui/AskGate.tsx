/**
 * The Ask panel, only while Ask is on in the mode on screen (`useAskOn`). Turned off, the store
 * stops any answer, forgets the chat and closes the panel before the page paints.
 */
import { useLayoutEffect } from 'react'
import { AskPanel } from './AskPanel'
import { useAskOn } from './askOn'
import { setAskAllowed } from './store'

export function AskGate() {
  const on = useAskOn()
  useLayoutEffect(() => setAskAllowed(on), [on])
  return on ? <AskPanel /> : null
}
