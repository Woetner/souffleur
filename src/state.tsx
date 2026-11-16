import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Script, Settings } from './types'
import { deleteScript, listScripts, loadSettings, putScript, saveSettings } from './lib/storage'

interface AppState {
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
  scripts: Script[] | null // null while loading
  saveScript: (s: Script) => Promise<void>
  removeScript: (id: string) => Promise<void>
  toast: (msg: string) => void
}

const Ctx = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [scripts, setScripts] = useState<Script[] | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  useEffect(() => {
    listScripts().then(setScripts).catch(() => setScripts([]))
  }, [])

  useEffect(() => {
    const r = document.documentElement
    r.dataset.size = settings.textSize
    if (settings.theme === 'auto') delete r.dataset.theme
    else r.dataset.theme = settings.theme
  }, [settings.textSize, settings.theme])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const n = { ...s, ...patch }
      saveSettings(n)
      return n
    })
  }, [])

  const saveScript = useCallback(async (s: Script) => {
    const n = { ...s, updatedAt: Date.now() }
    await putScript(n)
    setScripts((all) => [n, ...(all ?? []).filter((x) => x.id !== n.id)])
  }, [])

  const removeScript = useCallback(async (id: string) => {
    await deleteScript(id)
    setScripts((all) => (all ?? []).filter((x) => x.id !== id))
  }, [])

  const toast = useCallback((msg: string) => {
    setToastMsg(msg)
    window.setTimeout(() => setToastMsg((m) => (m === msg ? null : m)), Math.max(3200, msg.length * 55))
  }, [])

  const value = useMemo(() => ({ settings, updateSettings, scripts, saveScript, removeScript, toast }), [settings, updateSettings, scripts, saveScript, removeScript, toast])
  return (
    <Ctx.Provider value={value}>
      {children}
      {toastMsg && (
        <div className="toast" role="status">
          {toastMsg}
        </div>
      )}
    </Ctx.Provider>
  )
}

export function useApp() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside provider')
  return v
}

/** Today's practice stats: call when a practice run ends */
export function recordPractice(settings: Settings, minutes: number): Partial<Settings> {
  const today = new Date().toISOString().slice(0, 10)
  const days = settings.streakDays.includes(today) ? settings.streakDays : [...settings.streakDays, today].slice(-60)
  return { streakDays: days, minutesByDay: { ...settings.minutesByDay, [today]: (settings.minutesByDay[today] ?? 0) + minutes } }
}

export function streakCount(days: string[]): number {
  const set = new Set(days)
  let n = 0
  const d = new Date()
  if (!set.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1)
  while (set.has(d.toISOString().slice(0, 10))) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}
