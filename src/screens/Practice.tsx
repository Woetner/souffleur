import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Icon, { type IconName } from '../components/Icon'
import { Avatar, Screen, TopBar } from '../components/Screen'
import { isListenSupported, startListening } from '../lib/listen'
import { coverage, normalize, reachedEnd } from '../lib/match'
import { isMine } from '../lib/parser'
import { browserSpeak, cachedLineAudio, charFor, makeLineAudio, prepareLines, TtsError } from '../lib/tts'
import { recordPractice, useApp } from '../state'
import type { Line, Script, TextMode } from '../types'
import './Practice.css'

export interface PracticeResult {
  lines: number
  scored: number
  avg: number // 0..100
  hints: number
  tapped: number
  seconds: number
}

type Phase = 'idle' | 'speaking' | 'loading' | 'waiting'
interface LineResult {
  score?: number // 0..1 when the mic heard her
  tapped?: boolean
  hinted?: boolean
}

const SPEEDS = [0.75, 1, 1.25, 1.5]
const MODES: TextMode[] = ['full', 'fade', 'initials', 'hidden']
const MODE_LABEL: Record<TextMode, string> = { full: 'Hele tekst', fade: 'Vaag', initials: 'Beginletters', hidden: 'Verborgen' }
const GOOD = 0.7

function initials(word: string) {
  return word.replace(/^([^\p{L}\p{N}]*)([\p{L}\p{N}])([\p{L}\p{N}'’-]*)/u, (_, a: string, b: string, c: string) => a + b + '_'.repeat(c.length))
}

/** A tiny silent wav, played on the first tap so the audio element may play later without a tap (iOS). */
function silence(): string {
  const n = 800
  const b = new DataView(new ArrayBuffer(44 + n * 2))
  const w = (o: number, s: string) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)))
  w(0, 'RIFF'); b.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true)
  b.setUint16(22, 1, true); b.setUint32(24, 8000, true); b.setUint32(28, 16000, true); b.setUint16(32, 2, true)
  b.setUint16(34, 16, true); w(36, 'data'); b.setUint32(40, n * 2, true)
  return URL.createObjectURL(new Blob([b.buffer], { type: 'audio/wav' }))
}

export default function Practice() {
  const { id = '', partId = '0' } = useParams()
  const { scripts } = useApp()
  const script = scripts?.find((s) => s.id === id)
  const part = script?.parts[Number(partId)]
  if (!scripts) return <Screen><TopBar title="Laden…" /></Screen>
  if (!script || !part)
    return (
      <Screen>
        <TopBar title="Niet gevonden" back="/" />
        <p className="muted">Dit stuk of deel bestaat niet (meer).</p>
      </Screen>
    )
  return <Player key={`${id}-${partId}`} script={script} partId={Number(partId)} />
}

function Player({ script, partId }: { script: Script; partId: number }) {
  const { settings, updateSettings, saveScript, toast } = useApp()
  const nav = useNavigate()
  const part = script.parts[partId]
  const lines = useMemo(() => script.lines.slice(part.start, part.end), [script.lines, part.start, part.end])
  const role = script.myRole
  const mine = useCallback((l: Line) => isMine(l, role), [role])
  const visible = useCallback((l: Line) => !(l.kind === 'direction' && !l.cue && script.directions === 'hide'), [script.directions])
  const myCount = useMemo(() => lines.filter(mine).length, [lines, mine])
  const firstVisible = Math.max(0, lines.findIndex(visible))

  const [idx, setIdx] = useState(firstVisible)
  const [playing, setPlaying] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [speakingKey, setSpeakingKey] = useState<string | null>(null)
  const [textMode, setTextMode] = useState<TextMode>(script.textMode)
  const [speed, setSpeed] = useState(SPEEDS.includes(settings.speed) ? settings.speed : 1)
  const [loop, setLoop] = useState(false)
  const [listenMode, setListenMode] = useState(false)
  const [hint, setHint] = useState(0)
  const [peek, setPeek] = useState<number | null>(null)
  const [results, setResults] = useState<Record<number, LineResult>>({})
  const [streak, setStreak] = useState(0)
  const [glow, setGlow] = useState(0)
  const [liveCov, setLiveCov] = useState(0)
  const [micOn, setMicOn] = useState(false)
  const [prep, setPrep] = useState<{ done: number; total: number } | null>(null)
  const [tip, setTip] = useState(settings.practiceTipsSeen ? -1 : 0)

  // Refs mirror state for the async play loop
  const idxRef = useRef(idx)
  const settingsRef = useRef(settings)
  const speedRef = useRef(speed)
  const loopRef = useRef(loop)
  const listenRef = useRef(listenMode)
  const hintRef = useRef(0)
  const resultsRef = useRef(results)
  const textModeRef = useRef(textMode)
  textModeRef.current = textMode
  settingsRef.current = settings
  speedRef.current = speed
  loopRef.current = loop
  listenRef.current = listenMode

  const genRef = useRef(0)
  const stops = useRef(new Set<() => void>())
  const abortRef = useRef<AbortController | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const unlocked = useRef(false)
  const fallback = useRef(false) // Gemini failed for good this session: use browser voice
  const toasted = useRef(false)
  const micBlocked = useRef(false)
  const finishOwn = useRef<(() => void) | null>(null)
  const startedAt = useRef<number | null>(null)
  const elapsed = useRef(0)
  const lineEls = useRef<Record<number, HTMLElement | null>>({})

  const audio = () => (audioRef.current ??= Object.assign(new Audio(), { preload: 'auto' }))

  /** Run an activity that can be cancelled by pause/jump. start() returns its stop function. */
  const activity = (start: (done: () => void) => () => void) =>
    new Promise<void>((resolve) => {
      let over = false
      const done = () => {
        if (over) return
        over = true
        stops.current.delete(cancel)
        resolve()
      }
      const cancel = () => {
        stop()
        done()
      }
      stops.current.add(cancel)
      const stop = start(done)
    })
  const wait = (ms: number) =>
    activity((done) => {
      const t = setTimeout(done, ms)
      return () => clearTimeout(t)
    })
  const speak = (text: string, l?: Line) =>
    activity((done) => {
      const s = browserSpeak(text, l ? charFor(script, l) : undefined, speedRef.current)
      s.done.then(done)
      return s.cancel
    })
  const playBlob = (blob: Blob) =>
    activity((done) => {
      const a = audio()
      const url = URL.createObjectURL(blob)
      a.src = url
      a.playbackRate = speedRef.current
      a.preservesPitch = true
      a.onended = () => done()
      a.onerror = () => done()
      a.play().catch(() => done())
      return () => {
        a.pause()
        URL.revokeObjectURL(url)
      }
    })

  const cancelAll = useCallback(() => {
    genRef.current++
    abortRef.current?.abort()
    stops.current.forEach((c) => c())
    stops.current.clear()
    audioRef.current?.pause()
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
    finishOwn.current = null
    setPhase('idle')
    setSpeakingKey(null)
    setMicOn(false)
  }, [])

  const go = (i: number) => {
    idxRef.current = i
    setIdx(i)
    hintRef.current = 0
    setHint(0)
    setLiveCov(0)
  }

  const record = (i: number, r: LineResult) => {
    resultsRef.current = { ...resultsRef.current, [i]: r }
    setResults(resultsRef.current)
    if (r.score !== undefined && r.score >= GOOD && !r.hinted) {
      setStreak((s) => s + 1)
      setGlow((g) => g + 1)
    } else setStreak(0)
  }

  const speakOther = async (l: Line, gen: number, signal: AbortSignal) => {
    const s = settingsRef.current
    setSpeakingKey(l.speakers?.[0] ?? null)
    if (s.engine === 'gemini' && s.apiKey && !fallback.current) {
      try {
        let blob = await cachedLineAudio(script, l, s)
        if (!blob) {
          setPhase('loading')
          blob = await makeLineAudio(script, l, s, signal)
        }
        if (gen !== genRef.current) return
        setPhase('speaking')
        return await playBlob(blob)
      } catch (e) {
        if (gen !== genRef.current || (e as Error).name === 'AbortError') return
        if (e instanceof TtsError) {
          if (!toasted.current) toast(e.message + ' We gebruiken nu de stem van je telefoon.')
          toasted.current = true
          if (e.kind === 'key' || e.kind === 'daily') fallback.current = true
        }
      }
    }
    setPhase('speaking')
    await speak(l.text, l)
  }

  const waitForHer = (i: number, l: Line) =>
    activity((done) => {
      setPhase('waiting')
      const expected = normalize(l.text)
      const s = settingsRef.current
      let heard: string[] = []
      let lastSpeech = 0
      let listener: { stop(): void } | null = null
      let timer: ReturnType<typeof setInterval> | undefined
      let ended = false
      const end = (byTap: boolean) => {
        if (ended) return
        ended = true
        clearInterval(timer)
        setMicOn(false)
        finishOwn.current = null
        const used = !!listener && !micBlocked.current
        const r: LineResult = { hinted: hintRef.current > 0 }
        if (used && heard.length) r.score = coverage(expected, heard)
        else if (byTap || !used) r.tapped = true
        listener?.stop()
        listener = null
        record(i, r)
        done()
      }
      finishOwn.current = () => end(true)
      if (s.useMic && !micBlocked.current && isListenSupported()) {
        setMicOn(true)
        listener = startListening({
          onWords: (w) => {
            heard = w
            lastSpeech = Date.now()
            setLiveCov(coverage(expected, w))
            if (reachedEnd(expected, w)) end(false)
          },
          onSpeechActivity: () => (lastSpeech = Date.now()),
          onError: (kind) => {
            setMicOn(false)
            if (kind === 'denied') {
              micBlocked.current = true
              toast('De microfoon mag niet luisteren. Tik op “Klaar” als je je zin gezegd hebt.')
            }
          },
        })
        timer = setInterval(() => {
          if (!heard.length) return
          const quiet = Date.now() - lastSpeech
          if ((quiet > s.cuePause && coverage(expected, heard) >= 0.6) || quiet > s.cuePause * 2.5) end(false)
        }, 200)
      }
      return () => {
        ended = true
        clearInterval(timer)
        listener?.stop()
        setMicOn(false)
        finishOwn.current = null
      }
    })

  const doLine = async (i: number, gen: number, signal: AbortSignal) => {
    const l = lines[i]
    if (!visible(l)) return
    if (l.kind === 'heading') return wait(500)
    if (l.cue) return wait(400)
    if (l.kind === 'direction') {
      if (script.directions !== 'narrate') return wait(700)
      setPhase('speaking')
      setSpeakingKey(null)
      return speak(l.text)
    }
    if (mine(l)) {
      setSpeakingKey(null)
      if (!listenRef.current) return waitForHer(i, l)
      setPhase('speaking')
      return speak(l.text)
    }
    await speakOther(l, gen, signal)
    if (gen === genRef.current) await wait(200)
  }

  const finish = () => {
    stopClock()
    const own = lines.map((l, i) => (mine(l) ? resultsRef.current[i] : undefined)).filter((r): r is LineResult => !!r)
    const scored = own.filter((r) => r.score !== undefined)
    const avg = scored.length ? Math.round((scored.reduce((a, r) => a + (r.score ?? 0), 0) / scored.length) * 100) : 0
    const res: PracticeResult = {
      lines: myCount,
      scored: scored.length,
      avg,
      hints: own.filter((r) => r.hinted).length,
      tapped: own.filter((r) => r.tapped).length,
      seconds: Math.round(elapsed.current / 1000),
    }
    const prev = script.progress[partId]
    void saveScript({
      ...script,
      textMode: textModeRef.current,
      lastPartId: partId,
      progress: {
        ...script.progress,
        [partId]: {
          runs: (prev?.runs ?? 0) + 1,
          best: Math.max(prev?.best ?? 0, scored.length ? avg : 0),
          last: scored.length ? avg : (prev?.last ?? 0),
          lastAt: Date.now(),
        },
      },
    })
    updateSettings(recordPractice(settingsRef.current, Math.max(1, Math.round(res.seconds / 60))))
    nav(`/script/${script.id}/resultaat/${partId}`, { replace: true, state: res })
  }

  const run = async (from: number) => {
    cancelAll()
    const gen = genRef.current
    const ctrl = new AbortController()
    abortRef.current = ctrl
    let i = from
    for (;;) {
      for (; i < lines.length; i++) {
        if (gen !== genRef.current) return
        go(i)
        await doLine(i, gen, ctrl.signal)
      }
      if (gen !== genRef.current) return
      if (!loopRef.current) break
      i = 0
      resultsRef.current = {}
      setResults({})
    }
    setPlaying(false)
    finish()
  }

  const startClock = () => (startedAt.current ??= Date.now())
  const stopClock = () => {
    if (startedAt.current) elapsed.current += Date.now() - startedAt.current
    startedAt.current = null
  }

  const play = () => {
    if (!unlocked.current) {
      unlocked.current = true
      const a = audio()
      a.src = silence()
      a.play().catch(() => {})
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.speak(new SpeechSynthesisUtterance(''))
    }
    setPlaying(true)
    startClock()
    void run(idxRef.current)
  }
  const pause = () => {
    cancelAll()
    setPlaying(false)
    stopClock()
  }

  const step = (dir: 1 | -1) => {
    let i = idxRef.current + dir
    while (i >= 0 && i < lines.length && !visible(lines[i])) i += dir
    if (i < 0 || i >= lines.length) return
    jump(i)
  }
  const jump = (i: number) => {
    if (playing) void run(i)
    else go(i)
  }
  const next = () => {
    if (finishOwn.current) finishOwn.current()
    else if (playing && idxRef.current >= lines.length - 1) void run(lines.length)
    else step(1)
  }
  const tapCurrent = () => {
    if (!playing) play()
    else next()
  }

  const giveHint = () => {
    const l = lines[idx]
    if (!l || !mine(l)) return
    const total = l.text.split(/\s+/).filter(Boolean).length
    hintRef.current = Math.min(total, hintRef.current + 1)
    setHint(hintRef.current)
  }
  const doPeek = (i: number) => {
    setPeek(i)
    if (i === idxRef.current) hintRef.current = Math.max(hintRef.current, 1)
    setTimeout(() => setPeek((p) => (p === i ? null : p)), 2500)
  }

  // Keep the current line in the middle
  useEffect(() => {
    lineEls.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [idx])

  // Prepare the AI voices of this part in the background
  useEffect(() => {
    const s = settingsRef.current
    if (s.engine !== 'gemini' || !s.apiKey) return
    const todo = lines.filter((l) => l.kind === 'line' && !l.cue && l.text && !isMine(l, role))
    if (!todo.length) return
    const ctrl = new AbortController()
    prepareLines(script, todo, s, (done, total) => setPrep({ done, total }), ctrl.signal)
      .then((r) => {
        if (ctrl.signal.aborted) return
        if (r.error && (r.error.kind === 'key' || r.error.kind === 'daily')) {
          fallback.current = true
          if (!toasted.current) toast(r.error.message + ' We gebruiken nu de stem van je telefoon.')
          toasted.current = true
        }
        setPrep(null)
      })
      .catch(() => setPrep(null))
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script.id, partId])

  // Keep the screen awake while playing
  useEffect(() => {
    if (!playing) return
    let lock: WakeLockSentinel | null = null
    let alive = true
    const get = () =>
      navigator.wakeLock
        ?.request('screen')
        .then((l) => {
          if (alive) lock = l
          else void l.release()
        })
        .catch(() => {})
    get()
    const onVis = () => document.visibilityState === 'visible' && get()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVis)
      lock?.release().catch(() => {})
    }
  }, [playing])

  // Cleanup on leave
  useEffect(
    () => () => {
      cancelAll()
      if (audioRef.current) audioRef.current.src = ''
    },
    [cancelAll],
  )

  const closeTips = () => {
    setTip(-1)
    updateSettings({ practiceTipsSeen: true })
  }

  const cur = lines[idx]
  const curMine = !!cur && mine(cur)
  const charOf = (key?: string) => script.characters.find((c) => c.key === key)
  const myDone = lines.slice(0, idx).filter(mine).length
  const speedLabel = `${String(speed).replace('.', ',')}×`

  const renderMine = (l: Line, i: number) => {
    const isCur = i === idx
    if (results[i] || i < idx || textMode === 'full' || peek === i) return l.text
    const words = l.text.split(/(\s+)/)
    let n = 0
    const shown = words.map((w) => {
      if (!w.trim()) return w
      n++
      if (isCur && n <= hint) return w
      return textMode === 'initials' ? initials(w) : w
    })
    if (textMode === 'hidden' && !(isCur && hint))
      return (
        <button className="pl-peek" onClick={(e) => (e.stopPropagation(), doPeek(i))}>
          <span className="pl-blur">{l.text}</span>
          <span className="pl-peek-label"><Icon name="eye" size={18} /> Tik om te spieken</span>
        </button>
      )
    if (textMode === 'hidden') {
      let k = 0
      return words.map((w) => (!w.trim() ? w : ++k <= hint ? w : '…')).join('').replace(/(…\s*)+$/, ' …')
    }
    if (textMode === 'fade' && isCur && hint) {
      let k = 0
      return words.map((w, j) => (!w.trim() ? w : <span key={j} className={++k <= hint ? 'pl-hinted' : 'pl-faded'}>{w}</span>))
    }
    return shown.join('')
  }

  return (
    <Screen className="practice">
      <div className="pr-top">
        <TopBar
          back={`/script/${script.id}`}
          title={
            <div className="pr-title">
              <span>{part.title}</span>
              <span className="small muted">
                {myDone} / {myCount} van jouw zinnen
              </span>
            </div>
          }
          right={
            <>
              <button
                className={`icon-btn ${settings.useMic && !listenMode ? 'on' : ''}`}
                aria-label={settings.useMic ? 'Microfoon uit' : 'Microfoon aan'}
                aria-pressed={settings.useMic}
                onClick={() => updateSettings({ useMic: !settings.useMic })}
              >
                <Icon name={settings.useMic ? 'mic' : 'micOff'} />
              </button>
              <button
                className="icon-btn"
                aria-label={`Tekstweergave: ${MODE_LABEL[textMode]}`}
                onClick={() => {
                  const m = MODES[(MODES.indexOf(textMode) + 1) % MODES.length]
                  setTextMode(m)
                  toast(`Jouw tekst: ${MODE_LABEL[m]}`)
                }}
              >
                <Icon name="eye" />
              </button>
            </>
          }
        />
        <div className="bar pr-progress" aria-hidden="true">
          <div style={{ width: `${((idx + 1) / Math.max(1, lines.length)) * 100}%` }} />
        </div>
        <AnimatePresence>
          {prep && prep.done < prep.total && (
            <motion.div className="pr-prep small muted" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              Stemmen voorbereiden {prep.done}/{prep.total}
              <div className="pr-thin"><div style={{ width: `${(prep.done / prep.total) * 100}%` }} /></div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="pl-list">
        {lines.map((l, i) => {
          if (!visible(l)) return null
          const isCur = i === idx
          const ref = (el: HTMLElement | null) => {
            lineEls.current[i] = el
          }
          const cls = `pl ${isCur ? 'cur' : ''} ${i < idx ? 'past' : ''}`
          const onClick = () => (isCur ? tapCurrent() : jump(i))
          if (l.kind === 'heading')
            return <h3 key={l.id} ref={ref} className={`${cls} pl-heading`} onClick={onClick}>{l.text}</h3>
          if (l.cue)
            return (
              <p key={l.id} ref={ref} className={`${cls} pl-cue small muted`} onClick={onClick}>
                <Icon name="note" size={16} /> {l.text}
              </p>
            )
          if (l.kind === 'direction')
            return (
              <p key={l.id} ref={ref} className={`${cls} pl-dir`} onClick={onClick}>
                {isCur && speakingKey === null && phase === 'speaking' && <Icon name="volume" size={16} />} {l.text}
              </p>
            )
          const me = mine(l)
          const ch = charOf(l.speakers?.[0])
          const names = (l.speakers ?? []).map((k) => charOf(k)?.name ?? k).join(' + ')
          const r = results[i]
          return (
            <motion.div
              key={l.id}
              ref={ref}
              className={`${cls} pl-line ${me ? 'mine' : ''} ${isCur ? 'card' : ''}`}
              onClick={onClick}
              layout="position"
              transition={{ duration: 0.25 }}
            >
              {isCur && glow > 0 && (
                <motion.span key={glow} className="pl-glow" initial={{ opacity: 0.9, scale: 1 }} animate={{ opacity: 0, scale: 1.04 }} transition={{ duration: 1.2 }} />
              )}
              <div className="pl-who">
                <Avatar name={ch?.name ?? names} color={ch?.color ?? 'var(--text-2)'} size={isCur ? 40 : 30} speaking={isCur && !!speakingKey && speakingKey === l.speakers?.[0]} />
                <span className="pl-name">{me ? `${names} (jij)` : names}</span>
                {isCur && phase === 'loading' && (
                  <span className="pl-making small muted">
                    <span className="spin" /> stem maken…
                  </span>
                )}
              </div>
              <div className={`pl-text ${me && !r && i >= idx && peek !== i ? `m-${textMode}` : ''}`}>{me ? renderMine(l, i) : l.text}</div>
              {!!l.directions?.length && <div className="pl-inline">({l.directions.join(', ')})</div>}
              <AnimatePresence>
                {r && r.score !== undefined && (
                  <motion.div className={`pl-fb ${r.score >= GOOD ? 'good' : 'almost'}`} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                    {r.score >= GOOD ? <><Icon name="check" size={16} /> Goed</> : 'Bijna'}
                  </motion.div>
                )}
              </AnimatePresence>
              {isCur && me && phase === 'waiting' && micOn && (
                <div className="pl-live">
                  <div style={{ width: `${Math.round(liveCov * 100)}%` }} />
                </div>
              )}
            </motion.div>
          )
        })}
        <div className="pl-end muted small">Einde van dit deel</div>
      </div>

      <div className="pr-controls">
        <AnimatePresence>
          {playing && phase === 'waiting' && curMine && (
            <motion.button
              className="btn primary block pr-done"
              onClick={next}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.2 }}
            >
              {micOn && <span className="pr-mic"><Icon name="mic" size={20} /></span>}
              {micOn ? 'Ik luister… Klaar / Volgende' : 'Klaar / Volgende'}
            </motion.button>
          )}
        </AnimatePresence>
        <div className="pr-tools">
          <ToolBtn icon="speed" label={speedLabel} onClick={() => {
            const s = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]
            setSpeed(s)
            updateSettings({ speed: s })
          }} />
          <ToolBtn icon="loop" label="Herhaal" on={loop} onClick={() => setLoop(!loop)} />
          <ToolBtn icon="headphones" label="Luister" on={listenMode} onClick={() => {
            setListenMode(!listenMode)
            toast(listenMode ? 'Jij speelt weer zelf mee.' : 'Luistermodus: ook jouw tekst wordt voorgelezen.')
          }} />
          <ToolBtn icon="bulb" label={hint ? `Souffleer (${hint})` : 'Souffleer'} disabled={!curMine || textMode === 'full'} onClick={giveHint} />
          <AnimatePresence>
            {streak >= 2 && (
              <motion.span key={[3, 5, 10].filter((n) => streak >= n).length} className="chip pr-streak" initial={{ scale: 0.4 }} animate={{ scale: 1 }} exit={{ scale: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 14 }}>
                <Icon name="flame" size={18} fill /> {streak}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="pr-main">
          <button className="icon-btn pr-side" aria-label="Vorige zin" onClick={() => step(-1)}>
            <Icon name="prev" size={28} />
          </button>
          <motion.button className="pr-play" aria-label={playing ? 'Pauze' : 'Spelen'} onClick={playing ? pause : play} whileTap={{ scale: 0.92 }}>
            <Icon name={playing ? 'pause' : 'play'} size={34} fill />
          </motion.button>
          <button className="icon-btn pr-side" aria-label="Volgende zin" onClick={next}>
            <Icon name="next" size={28} />
          </button>
        </div>
      </div>

      <AnimatePresence>{tip >= 0 && <Tips step={tip} onNext={() => (tip >= 2 ? closeTips() : setTip(tip + 1))} onSkip={closeTips} />}</AnimatePresence>
    </Screen>
  )
}

function ToolBtn({ icon, label, on, disabled, onClick }: { icon: IconName; label: string; on?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button className={`pr-tool ${on ? 'on' : ''}`} aria-pressed={on} disabled={disabled} onClick={onClick}>
      <Icon name={icon} size={20} />
      <span>{label}</span>
    </button>
  )
}

const TIPS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'play', title: 'Druk op spelen', text: 'Met de grote knop onderaan begin je. De andere personages spreken hun tekst voor je uit.' },
  { icon: 'mic', title: 'Jouw beurt', text: 'Spreek je tekst gewoon hardop. Lukt het luisteren niet, tik dan op “Klaar / Volgende”.' },
  { icon: 'bulb', title: 'Oogje en lampje', text: 'Met het oogje kies je hoeveel je van je eigen tekst ziet. Het lampje souffleert: het verklapt je zin woord voor woord.' },
]

function Tips({ step, onNext, onSkip }: { step: number; onNext: () => void; onSkip: () => void }) {
  const t = TIPS[step]
  return (
    <motion.div className="pr-tips" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
      <motion.div key={step} className="card pr-tip" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.3 }}>
        <div className="pr-tip-icon"><Icon name={t.icon} size={30} /></div>
        <h2>{t.title}</h2>
        <p>{t.text}</p>
        <div className="pr-dots">{TIPS.map((_, i) => <span key={i} className={i === step ? 'on' : ''} />)}</div>
        <div className="row">
          <button className="btn ghost" onClick={onSkip}>Overslaan</button>
          <button className="btn primary grow" onClick={onNext}>{step >= 2 ? 'Begrepen!' : 'Volgende'}</button>
        </div>
      </motion.div>
    </motion.div>
  )
}
