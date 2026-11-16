import { normalize } from './match'

export type ListenError = 'denied' | 'nomic' | 'network' | 'unsupported' | 'other'

export interface ListenHandlers {
  /** Normalized words of the whole transcript so far (final + interim) */
  onWords: (words: string[]) => void
  onSpeechActivity?: () => void
  onError?: (kind: ListenError) => void
}

interface RecResult {
  isFinal: boolean
  0: { transcript: string }
}
interface Rec {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: { results: ArrayLike<RecResult> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  onspeechstart: (() => void) | null
}
type RecCtor = new () => Rec

function ctor(): RecCtor | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export const isListenSupported = () => !!ctor()

/** Listen continuously in Dutch. Restarts by itself when the browser stops early (e.g. after silence). */
export function startListening(h: ListenHandlers): { stop(): void } {
  const Ctor = ctor()
  if (!Ctor) {
    h.onError?.('unsupported')
    return { stop() {} }
  }
  let wanted = true
  let finals = ''
  let rec: Rec | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let quickEnds = 0
  let netErrors = 0

  const fail = (kind: ListenError) => {
    if (!wanted) return
    wanted = false
    h.onError?.(kind)
  }

  const begin = () => {
    if (!wanted) return
    const r = new Ctor()
    r.lang = 'nl-NL'
    r.continuous = true
    r.interimResults = true
    r.maxAlternatives = 1
    let sessionFinal = ''
    const startedAt = Date.now()
    r.onresult = (e) => {
      let interim = ''
      sessionFinal = ''
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) sessionFinal += ' ' + res[0].transcript
        else interim += ' ' + res[0].transcript
      }
      quickEnds = 0
      netErrors = 0
      h.onSpeechActivity?.()
      h.onWords(normalize(finals + sessionFinal + interim))
    }
    r.onspeechstart = () => h.onSpeechActivity?.()
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') fail('denied')
      else if (e.error === 'audio-capture') fail('nomic')
      else if (e.error === 'network' && ++netErrors > 3) fail('network')
      // 'no-speech' and 'aborted' are normal: we simply restart
    }
    r.onend = () => {
      finals += sessionFinal
      if (rec === r) rec = null
      if (!wanted) return
      quickEnds = Date.now() - startedAt < 800 ? quickEnds + 1 : 0
      if (quickEnds > 6) return fail('other')
      timer = setTimeout(begin, quickEnds ? 300 : 80)
    }
    rec = r
    try {
      r.start()
    } catch {
      fail('other')
    }
  }
  begin()

  return {
    stop() {
      wanted = false
      clearTimeout(timer)
      try {
        rec?.abort()
      } catch {
        /* already stopped */
      }
      rec = null
    },
  }
}
