import { useSyncExternalStore } from 'react'

/**
 * Google does not tell a browser how much free quota is left, so we count our own requests.
 * Free-tier limits reset at midnight Pacific time. The daily limit is learned the first time
 * Google says "daily limit reached"; until then we show an estimate.
 */
export const ESTIMATED_DAILY_LIMIT = 100
const KEY = 'souffleur-usage'

interface Usage {
  day: string // Pacific date
  requests: number
  chars: number
  costUsd: number
  limit?: number // learned
  hitLimit: boolean
}

let session = 0
let sessionCost = 0

// Gemini audio is billed per output token: 25 tokens per second of audio (USD per 1M tokens)
export const AUDIO_PRICE: Record<string, number> = {
  'gemini-3.8-flash-tts': 9,
  'gemini-3.8-flash-lite-tts': 6,
  'gemini-2.5-flash-preview-tts': 10,
}
const priceFor = (model: string) => {
  const p = AUDIO_PRICE[model] ?? 10
  // Google doubles the 3.8 prices from 1 January 2027
  return model.startsWith('gemini-3.8') && new Date() >= new Date('2027-01-01') ? p * 2 : p
}
export const USD_TO_EUR = 0.92
let state: Usage = load()
const subs = new Set<() => void>()

function pacificDay(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(d)
}

function load(): Usage {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return { day: pacificDay(), requests: 0, chars: 0, costUsd: 0, hitLimit: false }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* ignore */
  }
  snapshot = null
  subs.forEach((f) => f())
}

function rollover() {
  const today = pacificDay()
  if (state.day !== today) state = { day: today, requests: 0, chars: 0, costUsd: 0, limit: state.limit, hitLimit: false }
}

export function recordRequest(chars: number, seconds: number, model: string) {
  rollover()
  const cost = ((seconds * 25) / 1e6) * priceFor(model) + (chars / 4 / 1e6) * 1
  // A request that works means we are not blocked (anymore)
  state = { ...state, requests: state.requests + 1, chars: state.chars + chars, costUsd: (state.costUsd ?? 0) + cost, hitLimit: false }
  session++
  sessionCost += cost
  save()
}

/** Forget a remembered "limit reached", e.g. after switching to a paid key */
export function clearLimitFlag() {
  rollover()
  state = { ...state, hitLimit: false }
  save()
}

export function recordDailyLimit() {
  rollover()
  // Remember the highest count at which Google stopped us; that is the real daily limit
  state = { ...state, hitLimit: true, limit: Math.max(state.requests, 1) }
  save()
}

export interface UsageView {
  used: number
  limit: number
  estimated: boolean
  session: number
  hitLimit: boolean
  resetAt: string // local time, e.g. "09:00"
  costEur: number // today
  sessionCostEur: number
}

let snapshot: UsageView | null = null
export function getUsage(): UsageView {
  rollover()
  if (snapshot) return snapshot
  // Next midnight in Los Angeles, shown in local time
  const now = new Date()
  let reset = new Date(now)
  for (let h = 1; h <= 25; h++) {
    const t = new Date(now.getTime() + h * 3600_000)
    t.setMinutes(0, 0, 0)
    if (pacificDay(t) !== state.day) {
      reset = t
      break
    }
  }
  snapshot = {
    used: state.requests,
    limit: state.limit ?? ESTIMATED_DAILY_LIMIT,
    estimated: !state.limit,
    session,
    hitLimit: state.hitLimit,
    costEur: (state.costUsd ?? 0) * USD_TO_EUR,
    sessionCostEur: sessionCost * USD_TO_EUR,
    resetAt: reset.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
  }
  return snapshot
}

export function useUsage(): UsageView {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    getUsage,
    getUsage,
  )
}
