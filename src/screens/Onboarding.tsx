import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../components/Screen'
import { useApp } from '../state'
import { makeDemo } from '../lib/demo'
import Icon from '../components/Icon'
import './screens.css'

const float = { animate: { y: [0, -6, 0] }, transition: { repeat: Infinity, duration: 3, ease: 'easeInOut' as const } }

function Stage() {
  return (
    <svg viewBox="0 0 240 180" role="img" aria-label="Theaterdoek">
      <rect x="20" y="150" width="200" height="12" rx="4" fill="var(--accent-2)" opacity=".6" />
      <motion.path d="M20 20 Q70 20 70 150 L20 150Z" fill="var(--accent)" initial={{ x: 0 }} animate={{ x: -6 }} transition={{ duration: 1.6, repeat: Infinity, repeatType: 'reverse' }} />
      <motion.path d="M220 20 Q170 20 170 150 L220 150Z" fill="var(--accent)" initial={{ x: 0 }} animate={{ x: 6 }} transition={{ duration: 1.6, repeat: Infinity, repeatType: 'reverse' }} />
      <rect x="14" y="12" width="212" height="14" rx="4" fill="var(--accent)" />
      <motion.g {...float}>
        <circle cx="120" cy="88" r="16" fill="var(--accent-2)" />
        <path d="M100 140 Q120 100 140 140Z" fill="var(--accent-2)" />
      </motion.g>
      <motion.circle cx="120" cy="40" r="5" fill="var(--accent-2)" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 2 }} />
    </svg>
  )
}

function Upload() {
  return (
    <svg viewBox="0 0 240 180" role="img" aria-label="Script uploaden">
      <rect x="40" y="110" width="160" height="50" rx="14" fill="var(--bg-sunk)" stroke="var(--line)" strokeWidth="2" />
      <motion.g animate={{ y: [-10, 10, -10] }} transition={{ repeat: Infinity, duration: 2.6, ease: 'easeInOut' }}>
        <rect x="88" y="20" width="64" height="84" rx="8" fill="var(--bg-elev)" stroke="var(--accent)" strokeWidth="3" />
        {[38, 50, 62, 74, 86].map((y, i) => (
          <rect key={y} x="98" y={y} width={i % 2 ? 30 : 44} height="5" rx="2.5" fill="var(--line)" />
        ))}
        <text x="120" y="34" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--accent)">
          SCRIPT
        </text>
      </motion.g>
      <path d="M120 150 V128 M110 138 L120 128 L130 138" stroke="var(--accent)" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Roles() {
  const cols = ['#0f766e', 'var(--accent)', '#7c3aed']
  return (
    <svg viewBox="0 0 240 180" role="img" aria-label="Rollen">
      {cols.map((c, i) => (
        <motion.g key={i} animate={{ y: [0, i === 1 ? -10 : -4, 0] }} transition={{ repeat: Infinity, duration: 2.2, delay: i * 0.3 }}>
          <circle cx={60 + i * 60} cy={78} r={i === 1 ? 26 : 20} fill={c} />
          <path d={`M${60 + i * 60 - 30} 150 Q${60 + i * 60} ${i === 1 ? 92 : 104} ${60 + i * 60 + 30} 150Z`} fill={c} opacity=".85" />
        </motion.g>
      ))}
      <motion.path d="M120 30 l4 8 9 1 -7 6 2 9 -8 -5 -8 5 2 -9 -7 -6 9 -1z" fill="var(--accent-2)" animate={{ rotate: [0, 15, 0], scale: [1, 1.15, 1] }} style={{ transformOrigin: '120px 40px' }} transition={{ repeat: Infinity, duration: 2 }} />
      {[0, 2].map((i) => (
        <motion.path key={i} d={`M${60 + i * 60 + (i ? -26 : 26)} 50 q6 -8 12 0 q6 8 12 0`} stroke="var(--accent-2)" strokeWidth="3" fill="none" strokeLinecap="round" animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.4, delay: i * 0.4 }} />
      ))}
    </svg>
  )
}

function Listen() {
  return (
    <svg viewBox="0 0 240 180" role="img" aria-label="Spreken en luisteren">
      {[0, 1, 2].map((i) => (
        <motion.circle key={i} cx="120" cy="86" r="34" fill="none" stroke="var(--accent)" strokeWidth="3" animate={{ r: [34, 80], opacity: [0.6, 0] }} transition={{ repeat: Infinity, duration: 2.4, delay: i * 0.8, ease: 'easeOut' }} />
      ))}
      <circle cx="120" cy="86" r="34" fill="var(--accent)" />
      <rect x="111" y="64" width="18" height="30" rx="9" fill="#fff" />
      <path d="M104 86 a16 16 0 0 0 32 0 M120 102 v8" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" />
      <motion.g animate={{ x: [0, 4, 0] }} transition={{ repeat: Infinity, duration: 1.8 }}>
        <rect x="170" y="128" width="58" height="30" rx="12" fill="var(--accent-2)" />
        <text x="199" y="148" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">
          cue!
        </text>
      </motion.g>
    </svg>
  )
}

const slide = {
  enter: (d: number) => ({ x: `${d * 100}%`, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: `${-d * 100}%`, opacity: 0 }),
}

const SLIDES: { art: ReactNode; title: string; text: string }[] = [
  { art: <Stage />, title: 'Welkom bij Souffleur', text: 'Jouw tegenspeler, altijd beschikbaar. Repeteer je tekst wanneer het jou uitkomt.' },
  { art: <Upload />, title: 'Upload je script', text: 'Kies je script als Word-bestand of PDF. De app haalt zelf de rollen en regels eruit.' },
  { art: <Roles />, title: 'Kies je rol', text: 'De app speelt alle andere rollen, elk met een eigen stem.' },
  { art: <Listen />, title: 'Spreek je tekst hardop', text: 'De app luistert en geeft je de volgende cue. Tikken kan ook.' },
]

export default function Onboarding() {
  const nav = useNavigate()
  const { scripts, saveScript, updateSettings } = useApp()
  const [[i, dir], setPos] = useState([0, 1])
  const last = i === SLIDES.length - 1
  const go = (n: number) => {
    const t = Math.max(0, Math.min(SLIDES.length - 1, n))
    if (t !== i) setPos([t, t > i ? 1 : -1])
  }

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -60 || info.velocity.x < -400) go(i + 1)
    else if (info.offset.x > 60 || info.velocity.x > 400) go(i - 1)
  }

  const tryDemo = async () => {
    if (!scripts?.some((s) => s.id === 'demo')) await saveScript(makeDemo())
    updateSettings({ onboarded: true })
    nav('/script/demo', { replace: true })
  }
  const upload = () => {
    updateSettings({ onboarded: true })
    nav('/nieuw', { replace: true })
  }
  const skip = () => {
    updateSettings({ onboarded: true })
    nav('/', { replace: true })
  }

  return (
    <Screen className="onb">
      <div className="row" style={{ justifyContent: 'flex-end', minHeight: 48 }}>
        {!last && (
          <button className="btn ghost" onClick={skip}>
            Overslaan
          </button>
        )}
      </div>
      <div className="onb-track">
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.section
            key={i}
            className="onb-slide"
            custom={dir}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 300, damping: 34 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.5}
            onDragEnd={onDragEnd}
          >
            {SLIDES[i].art}
            <h2>{SLIDES[i].title}</h2>
            <p className="muted" style={{ maxWidth: 340 }}>
              {SLIDES[i].text}
            </p>
          </motion.section>
        </AnimatePresence>
      </div>
      <div className="dots">
        {SLIDES.map((_, n) => (
          <button key={n} aria-label={`Stap ${n + 1}`} aria-current={n === i} onClick={() => go(n)} />
        ))}
      </div>
      {last ? (
        <motion.div className="stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <button className="btn primary block" onClick={tryDemo}>
            <Icon name="play" /> Probeer de oefenscène
          </button>
          <button className="btn block" onClick={upload}>
            <Icon name="upload" /> Upload mijn script
          </button>
        </motion.div>
      ) : (
        <button className="btn primary block" onClick={() => go(i + 1)}>
          Volgende
        </button>
      )}
    </Screen>
  )
}
