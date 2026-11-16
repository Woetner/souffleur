import type { Character, Line, Script, Settings } from '../types'
import { getAudio, putAudio } from './storage'
import { recordDailyLimit, recordRequest } from './usage'

export const TTS_MODELS = [
  { id: 'gemini-3.8-flash-tts', label: 'Gemini Flash (beste kwaliteit)' },
  { id: 'gemini-3.8-flash-lite-tts', label: 'Gemini Flash Lite (sneller, goedkoper)' },
  { id: 'gemini-2.5-flash-preview-tts', label: 'Gemini 2.5 Flash (oudere versie)' },
]

/**
 * Gemini TTS speaks everything it is sent, including any style instructions.
 * So we send only the words the character says: no instructions, no stage directions.
 * (Character, emotion and context are kept in the signature for a later, tested approach.)
 */
export function buildPrompt(_char: Character | undefined, line: Line, _emotion: Settings['emotion'], _context = ''): string {
  return line.text.trim()
}

async function sha(s: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    // crypto.subtle needs https; fall back to a simple hash
    let h = 0
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
    return 'h' + (h >>> 0).toString(16) + s.length
  }
}

// Bump when the way audio is made changes, so old (inconsistent) audio is not reused
const AUDIO_VERSION = 'v3-steady'
export async function audioKey(model: string, voice: string, prompt: string) {
  return sha(`${AUDIO_VERSION}|${model}|${voice}|${prompt}`)
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** 16-bit PCM mono -> WAV blob, resampled to 16 kHz to save space on the phone */
function pcmToWav(pcm: Uint8Array, rate: number): Blob {
  const src = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2))
  const target = Math.min(rate, 16000)
  const ratio = rate / target
  const len = Math.floor(src.length / ratio)
  const out = new Int16Array(len)
  for (let i = 0; i < len; i++) {
    const x = i * ratio
    const i0 = Math.floor(x)
    const i1 = Math.min(i0 + 1, src.length - 1)
    const f = x - i0
    out[i] = Math.round(src[i0] * (1 - f) + src[i1] * f)
  }
  const header = new ArrayBuffer(44)
  const v = new DataView(header)
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  w(0, 'RIFF')
  v.setUint32(4, 36 + out.byteLength, true)
  w(8, 'WAVE')
  w(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, target, true)
  v.setUint32(28, target * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  w(36, 'data')
  v.setUint32(40, out.byteLength, true)
  return new Blob([header, out.buffer], { type: 'audio/wav' })
}

function findAudio(obj: unknown): { data: string; mime: string } | null {
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  const mime = (o.mimeType ?? o.mime_type) as string | undefined
  if (typeof o.data === 'string' && mime && /audio|l16|pcm/i.test(mime)) return { data: o.data, mime }
  for (const v of Object.values(o)) {
    const r = findAudio(v)
    if (r) return r
  }
  return null
}

export class TtsError extends Error {
  kind: 'key' | 'quota' | 'daily' | 'model' | 'network' | 'other'
  retryMs?: number
  constructor(kind: TtsError['kind'], msg: string, retryMs?: number) {
    super(msg)
    this.kind = kind
    this.retryMs = retryMs
  }
}

// Fixed sampling per voice, so a character sounds the same in every line.
// If a model rejects these extra fields we drop them once and remember that.
let steadyUnsupported = false
const voiceSeed = (voice: string) => [...voice].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 100000, 7)

async function callGemini(apiKey: string, model: string, voice: string, prompt: string, signal?: AbortSignal): Promise<Blob> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  const steady = !steadyUnsupported
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          ...(steady ? { temperature: 0.4, seed: voiceSeed(voice) } : {}),
          speechConfig: {
            ...(steady ? { languageCode: 'nl-NL' } : {}),
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
          },
        },
      }),
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new TtsError('network', 'Geen verbinding met Google. Controleer het internet.')
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg: string = json?.error?.message ?? res.statusText
    if (steady && res.status === 400 && /temperature|seed|language|Unknown name|not supported|Invalid JSON/i.test(msg)) {
      steadyUnsupported = true
      return callGemini(apiKey, model, voice, prompt, signal)
    }
    if (res.status === 400 && /api key|API_KEY/i.test(msg)) throw new TtsError('key', 'De Google-sleutel klopt niet.')
    if (res.status === 403) throw new TtsError('key', 'De Google-sleutel heeft geen toegang. Maak een nieuwe sleutel in Google AI Studio.')
    if (res.status === 404) throw new TtsError('model', `Stemmodel "${model}" niet gevonden.`)
    if (res.status === 429) {
      const details = JSON.stringify(json?.error?.details ?? '')
      const m = /"retryDelay":"(\d+(?:\.\d+)?)s"/.exec(details)
      const daily = /PerDay|per day|daily/i.test(details + msg)
      if (daily) recordDailyLimit()
      throw new TtsError(daily ? 'daily' : 'quota', daily ? 'Het gratis daglimiet van Google is bereikt.' : 'Even te veel tegelijk, we wachten kort.', m ? parseFloat(m[1]) * 1000 : 20000)
    }
    throw new TtsError('other', `Google gaf een fout: ${msg}`)
  }
  const audio = findAudio(json)
  if (!audio) throw new TtsError('other', 'Google gaf geen geluid terug.')
  const bytes = b64ToBytes(audio.data)
  const rate = parseInt(/rate=(\d+)/.exec(audio.mime)?.[1] ?? '24000', 10)
  recordRequest(prompt.length, bytes.length / 2 / rate, model)
  if (/wav/i.test(audio.mime)) return new Blob([bytes as BlobPart], { type: 'audio/wav' })
  return pcmToWav(bytes, rate)
}

/** Try the chosen model, then fall back to other models if it does not exist */
export async function synthGemini(settings: Settings, voice: string, prompt: string, signal?: AbortSignal): Promise<Blob> {
  const order = [settings.model, ...TTS_MODELS.map((m) => m.id).filter((m) => m !== settings.model)]
  let last: unknown
  for (const model of order) {
    try {
      return await callGemini(settings.apiKey, model, voice, prompt, signal)
    } catch (e) {
      last = e
      if (!(e instanceof TtsError) || e.kind !== 'model') throw e
    }
  }
  throw last
}

export function charFor(script: Script, line: Line): Character | undefined {
  const key = line.speakers?.[0]
  return script.characters.find((c) => c.key === key)
}

export async function lineAudioKey(script: Script, line: Line, settings: Settings) {
  const char = charFor(script, line)
  return audioKey(settings.model, char?.voice ?? 'Charon', buildPrompt(char, line, settings.emotion, script.context))
}

export async function cachedLineAudio(script: Script, line: Line, settings: Settings): Promise<Blob | undefined> {
  return getAudio(await lineAudioKey(script, line, settings))
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('aborted', 'AbortError'))
    })
  })

export async function makeLineAudio(script: Script, line: Line, settings: Settings, signal?: AbortSignal): Promise<Blob> {
  const char = charFor(script, line)
  const voice = char?.voice ?? 'Charon'
  const prompt = buildPrompt(char, line, settings.emotion, script.context)
  const key = await audioKey(settings.model, voice, prompt)
  const hit = await getAudio(key)
  if (hit) return hit
  for (let attempt = 0; ; attempt++) {
    try {
      const blob = await synthGemini(settings, voice, prompt, signal)
      await putAudio(key, blob)
      return blob
    } catch (e) {
      if (e instanceof TtsError && e.kind === 'quota' && attempt < 4) {
        await sleep(e.retryMs ?? 20000, signal)
        continue
      }
      if (e instanceof TtsError && (e.kind === 'other' || e.kind === 'network') && attempt < 1) {
        await sleep(2000, signal)
        continue
      }
      throw e
    }
  }
}

/** Generate audio for many lines, two at a time. Stops on key or daily-limit errors. */
export async function prepareLines(
  script: Script,
  lines: Line[],
  settings: Settings,
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<{ done: number; total: number; error?: TtsError }> {
  const todo: Line[] = []
  for (const l of lines) if (!(await cachedLineAudio(script, l, settings))) todo.push(l)
  const total = lines.length
  let done = total - todo.length
  onProgress(done, total)
  let error: TtsError | undefined
  let idx = 0
  const worker = async () => {
    while (idx < todo.length && !error && !signal?.aborted) {
      const l = todo[idx++]
      try {
        await makeLineAudio(script, l, settings, signal)
        done++
        onProgress(done, total)
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        if (e instanceof TtsError) error = e
        else error = new TtsError('other', String(e))
      }
    }
  }
  // A paid key has much higher rate limits, so load more lines at the same time
  const n = settings.keyPlan === 'paid' ? 6 : 2
  await Promise.all(Array.from({ length: n }, () => worker()))
  return { done, total, error }
}

// ---------- Browser voices (free, offline, robotic) ----------

let dutchVoices: SpeechSynthesisVoice[] = []
export function loadBrowserVoices(): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return []
  const all = speechSynthesis.getVoices()
  dutchVoices = all.filter((v) => v.lang.toLowerCase().startsWith('nl'))
  return dutchVoices
}
if (typeof speechSynthesis !== 'undefined') {
  loadBrowserVoices()
  speechSynthesis.onvoiceschanged = () => loadBrowserVoices()
}

export function browserSpeak(text: string, char: Character | undefined, rate: number): { done: Promise<void>; cancel: () => void } {
  if (typeof speechSynthesis === 'undefined' || !text) return { done: Promise.resolve(), cancel: () => {} }
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'nl-NL'
  const voices = dutchVoices.length ? dutchVoices : loadBrowserVoices()
  if (voices.length && char) {
    const idx = Math.abs([...char.key].reduce((a, c) => a + c.charCodeAt(0), 0)) % voices.length
    u.voice = voices[idx]
  }
  u.pitch = char?.pitch ?? 1
  u.rate = rate
  const done = new Promise<void>((resolve) => {
    // Some browsers never fire onend; resolve after a generous estimate as a safety net
    const words = text.split(/\s+/).length
    const t = setTimeout(resolve, (1500 + words * 550) / Math.max(0.5, rate))
    const end = () => {
      clearTimeout(t)
      resolve()
    }
    u.onend = end
    u.onerror = end
  })
  speechSynthesis.cancel()
  speechSynthesis.speak(u)
  return { done, cancel: () => speechSynthesis.cancel() }
}

/** Quick test of a key: voices one short sentence */
export async function testKey(settings: Settings): Promise<Blob> {
  return synthGemini(settings, 'Kore', 'Hallo! Wat leuk dat je komt repeteren.')
}
