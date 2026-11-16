import { useSyncExternalStore } from 'react'
import type { Line, Script, Settings } from '../types'
import { prepareLines, TtsError } from './tts'

/** One background job that voices all lines of a script. Keeps running while you move around the app. */
export interface PrepState {
  scriptId: string | null
  running: boolean
  done: number
  total: number
  error?: TtsError
}

let st: PrepState = { scriptId: null, running: false, done: 0, total: 0 }
let ctrl: AbortController | null = null
const subs = new Set<() => void>()
const set = (p: Partial<PrepState>) => {
  st = { ...st, ...p }
  subs.forEach((f) => f())
}

export function otherLines(s: Script): Line[] {
  return s.lines.filter((l) => l.kind === 'line' && !l.speakers?.includes(s.myRole) && l.text)
}

export async function startPrep(s: Script, settings: Settings) {
  if (st.running) return
  ctrl = new AbortController()
  const lines = otherLines(s)
  set({ scriptId: s.id, running: true, done: 0, total: lines.length, error: undefined })
  try {
    const r = await prepareLines(s, lines, settings, (done, total) => set({ done, total }), ctrl.signal)
    set({ running: false, done: r.done, total: r.total, error: r.error })
  } catch (e) {
    set({ running: false, error: e instanceof TtsError ? e : new TtsError('other', String(e)) })
  }
}

export function stopPrep() {
  ctrl?.abort()
  set({ running: false })
}

export const isPrepRunning = (id: string) => st.running && st.scriptId === id

export function usePrep(): PrepState {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => st,
    () => st,
  )
}
