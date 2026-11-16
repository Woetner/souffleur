import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ProgressRing, Screen } from '../components/Screen'
import Icon, { type IconName } from '../components/Icon'
import { streakCount, useApp } from '../state'
import { makeDemo } from '../lib/demo'
import { displayName } from '../lib/parser'
import { itemVariants, learnedShare, listVariants } from './ui'

function weekMinutes(byDay: Record<string, number>): number {
  let sum = 0
  const d = new Date()
  for (let n = 0; n < 7; n++) {
    sum += byDay[d.toISOString().slice(0, 10)] ?? 0
    d.setDate(d.getDate() - 1)
  }
  return Math.round(sum)
}

export default function Home() {
  const nav = useNavigate()
  const { scripts, settings, saveScript } = useApp()
  const recent = scripts?.[0]
  const streak = streakCount(settings.streakDays)
  const minutes = weekMinutes(settings.minutesByDay)

  const lastPart = recent ? recent.parts.find((p) => p.id === recent.lastPartId) ?? recent.parts[0] : undefined
  const share = recent ? learnedShare(recent) : 0

  const tryDemo = async () => {
    if (!scripts?.some((s) => s.id === 'demo')) await saveScript(makeDemo())
    nav('/script/demo')
  }

  const tiles: { icon: IconName; label: string; sub?: string; to: string; gold?: boolean }[] = [
    { icon: 'plus', label: 'Nieuw script', to: '/nieuw' },
    { icon: 'book', label: 'Mijn scripts', sub: scripts ? `${scripts.length} ${scripts.length === 1 ? 'script' : 'scripts'}` : '', to: '/scripts' },
    { icon: 'settings', label: 'Instellingen', to: '/instellingen', gold: true },
    { icon: 'info', label: 'Uitleg', to: '/welkom', gold: true },
  ]

  return (
    <Screen>
      <header className="home-head">
        <h1>Souffleur</h1>
        <button className="icon-btn" aria-label="Instellingen" onClick={() => nav('/instellingen')}>
          <Icon name="settings" />
        </button>
      </header>

      <motion.div className="stack" variants={listVariants} initial="hidden" animate="show" style={{ gap: 16 }}>
        {settings.engine === 'gemini' && !settings.apiKey && (
          <motion.button variants={itemVariants} whileTap={{ scale: 0.98 }} className="banner" onClick={() => nav('/sleutel')}>
            <span className="ic">
              <Icon name="sparkle" />
            </span>
            <span className="grow">Mooiere stemmen? Stel gratis AI-stemmen in</span>
            <Icon name="next" size={18} />
          </motion.button>
        )}

        {scripts && recent ? (
          <motion.section variants={itemVariants} className="card hero stack">
            <span className="eyebrow">Verder repeteren</span>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <div className="grow stack" style={{ gap: 4, minWidth: 0 }}>
                <h2 className="clamp1">{recent.title}</h2>
                <span className="muted">Jij speelt {displayName(recent.myRole)}</span>
                {lastPart && <span className="muted small clamp1">{lastPart.title}</span>}
              </div>
              <div className="hero-ring">
                <ProgressRing value={share} size={60}>
                  <span style={{ fontSize: 14 }}>{Math.round(share * 100)}%</span>
                </ProgressRing>
              </div>
            </div>
            <div className="row">
              <motion.button
                className="play-big"
                aria-label="Oefenen"
                whileTap={{ scale: 0.9 }}
                whileHover={{ scale: 1.05 }}
                onClick={() => nav(`/script/${recent.id}/oefen/${lastPart?.id ?? 0}`)}
              >
                <Icon name="play" size={32} fill />
              </motion.button>
              <button className="btn ghost grow" style={{ color: '#fff', justifyContent: 'flex-start' }} onClick={() => nav(`/script/${recent.id}`)}>
                Alle oefenstukken
              </button>
            </div>
          </motion.section>
        ) : scripts ? (
          <motion.section variants={itemVariants} className="card stack" style={{ textAlign: 'center', alignItems: 'center', padding: 24 }}>
            <span className="eyebrow">Het doek gaat op</span>
            <h2>Welkom! Laten we beginnen</h2>
            <p className="muted">Upload je script, kies je rol, en de app speelt je tegenspelers.</p>
            <button className="btn primary block" onClick={() => nav('/nieuw')}>
              <Icon name="upload" /> Upload je eerste script
            </button>
            <button className="btn block" onClick={tryDemo}>
              <Icon name="play" /> Probeer de oefenscène
            </button>
          </motion.section>
        ) : (
          <div className="card" style={{ minHeight: 180 }} />
        )}

        <motion.div variants={itemVariants} className="tiles">
          {tiles.map((t) => (
            <motion.button key={t.to} className={`tile${t.gold ? ' gold' : ''}`} whileTap={{ scale: 0.96 }} onClick={() => nav(t.to)}>
              <span className="ic">
                <Icon name={t.icon} />
              </span>
              <span>
                {t.label}
                {t.sub && <span className="muted small" style={{ display: 'block', fontWeight: 400 }}>{t.sub}</span>}
              </span>
            </motion.button>
          ))}
        </motion.div>

        <motion.div variants={itemVariants} className="stats">
          <div className="stat">
            <span className="ic">
              <Icon name="flame" fill />
            </span>
            <div>
              <b>{streak}</b>
              <span className="small muted">{streak === 1 ? 'dag op rij' : 'dagen op rij'}</span>
            </div>
          </div>
          <div className="stat">
            <span className="ic">
              <Icon name="mic" />
            </span>
            <div>
              <b>{minutes}</b>
              <span className="small muted">minuten deze week</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </Screen>
  )
}
