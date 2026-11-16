import { motion } from 'framer-motion'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen, TopBar } from '../components/Screen'
import Icon from '../components/Icon'
import { useApp } from '../state'
import { testKey } from '../lib/tts'
import { errText, itemVariants, listVariants, playBlob } from './ui'

export default function KeyHelp() {
  const nav = useNavigate()
  const { settings, updateSettings, toast } = useApp()
  const [key, setKey] = useState(settings.apiKey)
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const save = async () => {
    const k = key.trim()
    if (!k) return
    updateSettings({ apiKey: k, engine: 'gemini' })
    setBusy(true)
    setResult(null)
    try {
      const blob = await testKey({ ...settings, apiKey: k, engine: 'gemini' })
      setResult({ ok: true, msg: 'Gelukt! De AI-stemmen staan aan.' })
      toast('De sleutel werkt!')
      await playBlob(blob)
    } catch (e) {
      const msg = errText(e)
      setResult({ ok: false, msg })
      toast(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <TopBar title="Gratis AI-stemmen" />
      <motion.div className="stack" variants={listVariants} initial="hidden" animate="show" style={{ gap: 16 }}>
        <motion.p variants={itemVariants} className="muted">
          Met een gratis sleutel van Google krijgen je tegenspelers echte, menselijk klinkende stemmen. Het instellen duurt een paar minuten.
        </motion.p>

        <motion.ol variants={itemVariants} className="card steps">
          <li>
            <span>
              Ga naar{' '}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
                aistudio.google.com/apikey
              </a>{' '}
              en log in met een Google-account (bijvoorbeeld je Gmail).
            </span>
          </li>
          <li>
            <span>
              Klik op de knop <b>"Create API key"</b>. Accepteer eventueel eerst de voorwaarden.
            </span>
          </li>
          <li>
            <span>
              <b>Kopieer</b> de sleutel. Hij begint meestal met <code>AIza</code>.
            </span>
          </li>
          <li>
            <span>Plak hem hieronder en tik op "Opslaan en testen".</span>
          </li>
        </motion.ol>

        <motion.a variants={itemVariants} className="btn block" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit' }}>
          Open Google AI Studio <Icon name="next" size={18} />
        </motion.a>

        <motion.div variants={itemVariants} className="card stack">
          <div className="field">
            <label htmlFor="kh-key">Jouw sleutel</label>
            <div className="row" style={{ gap: 8 }}>
              <input id="kh-key" className="input grow" type={show ? 'text' : 'password'} value={key} onChange={(e) => setKey(e.target.value)} placeholder="Plak hier je sleutel" autoComplete="off" spellCheck={false} />
              <button className="icon-btn" aria-label={show ? 'Sleutel verbergen' : 'Sleutel tonen'} aria-pressed={show} onClick={() => setShow((v) => !v)}>
                <Icon name="eye" />
              </button>
            </div>
          </div>
          <button className="btn primary block" disabled={!key.trim() || busy} onClick={save}>
            <Icon name="check" /> {busy ? 'Bezig met testen…' : 'Opslaan en testen'}
          </button>
          {result && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={result.ok ? 'card' : 'error'} role="status" style={result.ok ? { background: 'var(--good-soft)', color: 'var(--good)', boxShadow: 'none', border: 'none' } : undefined}>
              {result.msg}
            </motion.div>
          )}
          {result?.ok && (
            <button className="btn block" onClick={() => nav('/')}>
              Klaar, naar het begin
            </button>
          )}
        </motion.div>

        <motion.div variants={itemVariants} className="card stack small" style={{ background: 'var(--bg-sunk)', boxShadow: 'none' }}>
          <p>
            <b>Gratis:</b> Google geeft een daglimiet. Je script wordt per regel één keer ingesproken en bewaard op je telefoon, dus daarna kost oefenen niets.
          </p>
          <p>
            <b>Privacy:</b> de sleutel blijft op dit toestel. Alleen de tekst van de regels gaat naar Google om ingesproken te worden.
          </p>
        </motion.div>
      </motion.div>
    </Screen>
  )
}
