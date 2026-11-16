import { motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Icon from '../components/Icon'
import { ProgressRing, Screen, TopBar } from '../components/Screen'
import { useApp } from '../state'
import type { PracticeResult } from './Practice'
import './Results.css'

function headline(avg: number) {
  if (avg >= 85) return 'Bravo! Applaus!'
  if (avg >= 60) return 'Mooi gespeeld!'
  return 'Goed bezig, nog een keer?'
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60)
  return m ? `${m} min ${s % 60 ? `${s % 60} s` : ''}`.trim() : `${s} s`
}

export default function Results() {
  const { id = '', partId = '0' } = useParams()
  const pid = Number(partId)
  const { scripts } = useApp()
  const nav = useNavigate()
  const res = useLocation().state as PracticeResult | null
  const script = scripts?.find((s) => s.id === id)
  const part = script?.parts[pid]
  const prog = script?.progress[pid]

  if (!scripts) return <Screen><TopBar title="Laden…" /></Screen>
  if (!script || !part)
    return (
      <Screen>
        <TopBar title="Niet gevonden" back="/" />
      </Screen>
    )

  const scored = res ? res.scored > 0 : !!prog
  const avg = res ? res.avg : (prog?.last ?? 0)
  const hasNext = pid + 1 < script.parts.length
  const practice = (p: number) => nav(`/script/${id}/oefen/${p}`, { replace: true })

  return (
    <Screen className="results">
      <TopBar title={part.title} back={`/script/${id}`} />
      {res && scored && avg >= 80 && <Confetti />}
      <motion.div className="rs-hero" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
        {scored ? (
          <ProgressRing value={avg / 100} size={180} stroke={14}>
            <span className="rs-pct">{avg}%</span>
          </ProgressRing>
        ) : (
          <div className="rs-star"><Icon name="star" size={72} fill /></div>
        )}
        <h1>{scored ? headline(avg) : res ? 'Deel uitgespeeld!' : 'Nog niet geoefend'}</h1>
        {scored && <p className="muted">Zo goed kwam je tekst over</p>}
      </motion.div>

      {res ? (
        <div className="rs-stats">
          <Stat value={res.lines} label="jouw zinnen" />
          <Stat value={res.hints} label={res.hints === 1 ? 'hint' : 'hints'} />
          <Stat value={fmtTime(res.seconds)} label="tijd" />
        </div>
      ) : (
        prog && (
          <div className="rs-stats">
            <Stat value={prog.runs} label="keer geoefend" />
            <Stat value={`${prog.best}%`} label="beste" />
            <Stat value={`${prog.last}%`} label="laatste" />
          </div>
        )
      )}
      {res && res.tapped > 0 && (
        <p className="muted small rs-note">
          {res.tapped} {res.tapped === 1 ? 'zin' : 'zinnen'} afgetikt zonder microfoon; die tellen niet mee in de score.
        </p>
      )}
      {prog && res && prog.runs > 1 && (
        <p className="muted small rs-note">
          Je hebt dit deel nu {prog.runs} keer geoefend. Beste score: {prog.best}%.
        </p>
      )}

      <div className="stack rs-actions">
        <button className="btn primary block" onClick={() => practice(pid)}>
          <Icon name="loop" /> Nog een keer
        </button>
        {hasNext && (
          <button className="btn block" onClick={() => practice(pid + 1)}>
            Volgend deel <Icon name="next" size={20} />
          </button>
        )}
        <button className="btn ghost block" onClick={() => nav(`/script/${id}`, { replace: true })}>
          Terug naar script
        </button>
      </div>
    </Screen>
  )
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="card rs-stat">
      <strong>{value}</strong>
      <span className="muted small">{label}</span>
    </div>
  )
}

/** Small dependency-free canvas confetti: ~60 particles, 1.5 s */
function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const c = ref.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const dpr = window.devicePixelRatio || 1
    const W = c.clientWidth
    const H = c.clientHeight
    c.width = W * dpr
    c.height = H * dpr
    ctx.scale(dpr, dpr)
    const css = getComputedStyle(document.documentElement)
    const colors = ['--accent', '--accent-2', '--good'].map((v) => css.getPropertyValue(v).trim() || '#c8952f')
    const ps = Array.from({ length: 60 }, (_, i) => ({
      x: W / 2,
      y: H * 0.3,
      vx: (Math.random() - 0.5) * 9,
      vy: -Math.random() * 9 - 3,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 4,
      color: colors[i % colors.length],
    }))
    const start = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = (t - start) / 1500
      ctx.clearRect(0, 0, W, H)
      if (p >= 1) return
      ctx.globalAlpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3
      for (const q of ps) {
        q.vy += 0.25
        q.vx *= 0.99
        q.x += q.vx
        q.y += q.vy
        q.r += q.vr
        ctx.save()
        ctx.translate(q.x, q.y)
        ctx.rotate(q.r)
        ctx.fillStyle = q.color
        ctx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h)
        ctx.restore()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={ref} className="rs-confetti" aria-hidden="true" />
}
