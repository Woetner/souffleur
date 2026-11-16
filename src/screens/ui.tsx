import { useCallback, useEffect, useRef, useState } from 'react'
import type { Character, Line, Script, Settings } from '../types'
import { GEMINI_VOICES } from '../lib/voices'
import { browserSpeak, makeLineAudio, TtsError } from '../lib/tts'
import './screens.css'

/** Segmented control */
export function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  )
}

export function VoiceSelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  return (
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Stem">
      {(['v', 'm'] as const).map((g) => (
        <optgroup key={g} label={g === 'v' ? 'Vrouw' : 'Man'}>
          {GEMINI_VOICES.filter((v) => v.gender === g).map((v) => (
            <option key={v.name} value={v.name}>
              {v.name} – {v.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

export function errText(e: unknown): string {
  if (e instanceof TtsError) return e.message
  if (e instanceof Error) return e.message
  return 'Er ging iets mis.'
}

let current: HTMLAudioElement | null = null
export function playBlob(blob: Blob, rate = 1): Promise<void> {
  current?.pause()
  const url = URL.createObjectURL(blob)
  const a = new Audio(url)
  a.playbackRate = rate
  current = a
  return new Promise((resolve) => {
    const end = () => {
      URL.revokeObjectURL(url)
      resolve()
    }
    a.onended = end
    a.onerror = end
    a.play().catch(end)
  })
}
export function stopAudio() {
  current?.pause()
  current = null
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
}

/** Plays a short "Hallo, ik ben …" sample for a character. Returns which key is playing. */
export function useVoiceSample(settings: Settings, toast: (m: string) => void, context = '') {
  const [playing, setPlaying] = useState<string | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      stopAudio()
    }
  }, [])
  const play = useCallback(
    async (c: Character) => {
      setPlaying(c.key)
      const text = `Hallo, ik ben ${c.name}. Zullen we beginnen?`
      try {
        if (settings.engine === 'gemini' && settings.apiKey) {
          const line: Line = { id: -1, kind: 'line', speakers: [c.key], text }
          const fake = { characters: [c], context } as Script
          const blob = await makeLineAudio(fake, line, settings)
          if (alive.current) await playBlob(blob)
        } else {
          await browserSpeak(text, c, settings.speed).done
        }
      } catch (e) {
        if (alive.current) toast(errText(e))
      }
      if (alive.current) setPlaying((p) => (p === c.key ? null : p))
    },
    [settings, toast, context],
  )
  return { playing, play }
}

export function relTime(ts?: number): string {
  if (!ts) return 'nog niet geoefend'
  const min = Math.round((Date.now() - ts) / 60000)
  if (min < 2) return 'zojuist'
  if (min < 60) return `${min} minuten geleden`
  const h = Math.round(min / 60)
  if (h < 24) return h === 1 ? '1 uur geleden' : `${h} uur geleden`
  const d = Math.round(h / 24)
  if (d === 1) return 'gisteren'
  if (d < 7) return `${d} dagen geleden`
  const w = Math.round(d / 7)
  if (d < 35) return w === 1 ? '1 week geleden' : `${w} weken geleden`
  const m = Math.round(d / 30)
  return m <= 1 ? '1 maand geleden' : `${m} maanden geleden`
}

/** Share (0..1) of parts with her lines whose best score is at least 70 */
export function learnedShare(s: Script): number {
  const parts = s.parts.filter((p) => p.myLines > 0)
  if (!parts.length) return 0
  return parts.filter((p) => (s.progress[p.id]?.best ?? 0) >= 70).length / parts.length
}

export type Medal = 'none' | 'bronze' | 'silver' | 'gold'
export function medal(best?: number): Medal {
  if (best == null) return 'none'
  return best >= 85 ? 'gold' : best >= 70 ? 'silver' : 'bronze'
}
export const MEDAL_LABEL: Record<Medal, string> = { none: 'Nog niet geoefend', bronze: 'Brons', silver: 'Zilver', gold: 'Goud' }

export const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}
export const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.2, 0.8, 0.2, 1] as const } },
}
