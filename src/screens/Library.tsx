import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen, TopBar } from '../components/Screen'
import Icon from '../components/Icon'
import { useApp } from '../state'
import type { Script } from '../types'
import { displayName } from '../lib/parser'
import { learnedShare, relTime } from './ui'

function lastPractised(s: Script): number | undefined {
  const ts = Object.values(s.progress).map((p) => p.lastAt)
  return ts.length ? Math.max(...ts) : undefined
}

function ScriptCard({ s }: { s: Script }) {
  const nav = useNavigate()
  const { saveScript, removeScript, toast } = useApp()
  const [mode, setMode] = useState<'none' | 'menu' | 'rename' | 'delete'>('none')
  const [name, setName] = useState(s.title)
  const share = learnedShare(s)

  const rename = async () => {
    const t = name.trim()
    if (t && t !== s.title) await saveScript({ ...s, title: t })
    setMode('none')
  }
  const remove = async () => {
    await removeScript(s.id)
    toast(`"${s.title}" is verwijderd`)
  }

  return (
    <motion.li layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -60, transition: { duration: 0.22 } }} transition={{ duration: 0.25 }} className="card stack" style={{ gap: 10 }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <motion.button className="grow stack" whileTap={{ scale: 0.98 }} onClick={() => nav(`/script/${s.id}`)} style={{ gap: 4, background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', minWidth: 0, minHeight: 48 }}>
          <h3 className="clamp1">{s.title}</h3>
          <span className="muted small">
            {displayName(s.myRole)} · {s.parts.length} {s.parts.length === 1 ? 'oefenstuk' : 'oefenstukken'}
          </span>
        </motion.button>
        <button className="icon-btn" aria-label="Meer opties" aria-expanded={mode === 'menu'} onClick={() => setMode((m) => (m === 'menu' ? 'none' : 'menu'))}>
          <Icon name="more" />
        </button>
      </div>
      <div className="row small">
        <div className="bar grow" aria-label={`${Math.round(share * 100)}% geleerd`}>
          <div style={{ width: `${share * 100}%` }} />
        </div>
        <span style={{ fontWeight: 700, minWidth: 40, textAlign: 'right' }}>{Math.round(share * 100)}%</span>
      </div>
      <span className="muted small">Laatst geoefend: {relTime(lastPractised(s))}</span>

      <AnimatePresence initial={false} mode="wait">
        {mode !== 'none' && (
          <motion.div key={mode} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
            <div className="stack" style={{ paddingTop: 4 }}>
              {mode === 'menu' && (
                <div className="row">
                  <button className="btn grow" onClick={() => setMode('rename')}>
                    <Icon name="edit" size={20} /> Naam wijzigen
                  </button>
                  <button className="btn danger grow" onClick={() => setMode('delete')}>
                    <Icon name="trash" size={20} /> Verwijderen
                  </button>
                </div>
              )}
              {mode === 'rename' && (
                <form
                  className="stack"
                  onSubmit={(e) => {
                    e.preventDefault()
                    rename()
                  }}
                >
                  <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Nieuwe naam" />
                  <div className="row">
                    <button type="button" className="btn grow" onClick={() => setMode('none')}>
                      Annuleren
                    </button>
                    <button type="submit" className="btn primary grow">
                      Opslaan
                    </button>
                  </div>
                </form>
              )}
              {mode === 'delete' && (
                <>
                  <p>Weet je het zeker? Je voortgang voor dit script gaat ook weg.</p>
                  <div className="row">
                    <button className="btn grow" onClick={() => setMode('none')}>
                      Nee, bewaren
                    </button>
                    <button className="btn danger solid grow" onClick={remove}>
                      Ja, verwijder
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  )
}

export default function Library() {
  const nav = useNavigate()
  const { scripts } = useApp()
  return (
    <Screen>
      <TopBar title="Mijn scripts" back="/" />
      {scripts && scripts.length === 0 && (
        <div className="card stack" style={{ textAlign: 'center', alignItems: 'center', padding: 24 }}>
          <Icon name="book" size={40} />
          <p>Je hebt nog geen scripts.</p>
        </div>
      )}
      <motion.ul className="list-reset" layout style={{ paddingBottom: 80 }}>
        <AnimatePresence initial={false}>
          {scripts?.map((s) => (
            <ScriptCard key={s.id} s={s} />
          ))}
        </AnimatePresence>
      </motion.ul>
      <motion.button className="btn primary fab" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 20 }} whileTap={{ scale: 0.92 }} onClick={() => nav('/nieuw')}>
        <Icon name="plus" /> Nieuw script
      </motion.button>
    </Screen>
  )
}
