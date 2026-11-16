import { createStore, del, get, keys, set, clear } from 'idb-keyval'
import type { Script, Settings } from '../types'

const scriptStore = createStore('souffleur-scripts', 'scripts')
const audioStore = createStore('souffleur-audio', 'audio')

export const DEFAULT_SETTINGS: Settings = {
  engine: 'gemini',
  apiKey: '',
  model: 'gemini-3.8-flash-tts',
  emotion: 'some',
  textSize: 'large',
  theme: 'auto',
  speed: 1,
  cuePause: 1200,
  useMic: true,
  onboarded: false,
  practiceTipsSeen: false,
  streakDays: [],
  minutesByDay: {},
}

const SETTINGS_KEY = 'souffleur-settings'

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    /* private mode */
  }
  return { ...DEFAULT_SETTINGS }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

export async function listScripts(): Promise<Script[]> {
  const ks = await keys(scriptStore)
  const all = await Promise.all(ks.map((k) => get<Script>(k, scriptStore)))
  return all.filter((s): s is Script => !!s).sort((a, b) => b.updatedAt - a.updatedAt)
}

export const getScript = (id: string) => get<Script>(id, scriptStore)
export const putScript = (s: Script) => set(s.id, s, scriptStore)
export const deleteScript = (id: string) => del(id, scriptStore)

export const getAudio = (key: string) => get<Blob>(key, audioStore)
export const putAudio = (key: string, b: Blob) => set(key, b, audioStore)
export const countAudio = async () => (await keys(audioStore)).length
export const clearAudio = () => clear(audioStore)

export async function clearEverything() {
  await clear(scriptStore)
  await clear(audioStore)
  try {
    localStorage.removeItem(SETTINGS_KEY)
  } catch {
    /* ignore */
  }
}

export async function storageEstimate(): Promise<{ usedMb: number; quotaMb: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null
    const e = await navigator.storage.estimate()
    return { usedMb: Math.round((e.usage ?? 0) / 1e6), quotaMb: Math.round((e.quota ?? 0) / 1e6) }
  } catch {
    return null
  }
}

export async function askPersistence() {
  try {
    await navigator.storage?.persist?.()
  } catch {
    /* ignore */
  }
}

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
