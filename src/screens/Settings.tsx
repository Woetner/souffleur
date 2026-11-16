import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen, TopBar } from '../components/Screen'
import UsageBar from '../components/UsageBar'
import Icon from '../components/Icon'
import { useApp } from '../state'
import type { Emotion, TextSize, Theme, VoiceEngine } from '../types'
import { clearEverything, storageEstimate } from '../lib/storage'
import { testKey, TTS_MODELS } from '../lib/tts'
import { errText, itemVariants, listVariants, playBlob, Seg } from './ui'

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <motion.section variants={itemVariants} className="stack">
      <h2 className="section-title">{title}</h2>
      <div className="card stack" style={{ gap: 18 }}>
        {children}
      </div>
    </motion.section>
  )
}

function MicTest() {
  const [level, setLevel] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const stopRef = useRef<() => void>(() => {})
  useEffect(() => () => stopRef.current(), [])

  const start = async () => {
    setErr('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const ctx = new AudioContext()
      const an = ctx.createAnalyser()
      an.fftSize = 512
      ctx.createMediaStreamSource(stream).connect(an)
      const buf = new Uint8Array(an.fftSize)
      let raf = 0
      const tick = () => {
        an.getByteTimeDomainData(buf)
        let sum = 0
        for (const v of buf) sum += ((v - 128) / 128) ** 2
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4))
        raf = requestAnimationFrame(tick)
      }
      tick()
      const timer = window.setTimeout(() => stopRef.current(), 15000)
      stopRef.current = () => {
        cancelAnimationFrame(raf)
        clearTimeout(timer)
        stream.getTracks().forEach((t) => t.stop())
        ctx.close().catch(() => {})
        setLevel(null)
        stopRef.current = () => {}
      }
    } catch {
      setErr('De microfoon is niet beschikbaar. Geef de app toestemming in de instellingen van je browser.')
    }
  }

  return (
    <div className="stack">
      {level === null ? (
        <button className="btn block" onClick={start}>
          <Icon name="mic" /> Microfoon testen
        </button>
      ) : (
        <>
          <p className="small">Zeg iets… de balk beweegt als de app je hoort.</p>
          <div className="meter" aria-label="Geluidsniveau">
            <div style={{ width: `${Math.round(level * 100)}%` }} />
          </div>
          <button className="btn block" onClick={() => stopRef.current()}>
            Stoppen
          </button>
        </>
      )}
      {err && (
        <div className="error" role="alert">
          {err}
        </div>
      )}
    </div>
  )
}

export default function SettingsScreen() {
  const nav = useNavigate()
  const { settings, updateSettings, toast } = useApp()
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [est, setEst] = useState<{ usedMb: number; quotaMb: number } | null>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)

  useEffect(() => {
    storageEstimate().then(setEst)
  }, [])

  const test = async () => {
    setTesting(true)
    try {
      const blob = await testKey(settings)
      toast('De sleutel werkt!')
      await playBlob(blob)
    } catch (e) {
      toast(errText(e))
    } finally {
      setTesting(false)
    }
  }

  const wipe = async () => {
    await clearEverything()
    location.hash = '#/'
    location.reload()
  }

  return (
    <Screen>
      <TopBar title="Instellingen" />
      <motion.div className="stack" variants={listVariants} initial="hidden" animate="show" style={{ gap: 20 }}>
        <Group title="Stemmen">
          <Seg<VoiceEngine>
            label="Stemmen"
            value={settings.engine}
            onChange={(v) => updateSettings({ engine: v })}
            options={[
              ['gemini', 'AI-stemmen (Gemini)'],
              ['browser', 'Gratis robotstem'],
            ]}
          />
          <AnimatePresence initial={false}>
            {settings.engine === 'gemini' && (
              <motion.div className="stack" style={{ gap: 18, overflow: 'hidden' }} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <div className="field">
                  <label htmlFor="st-key">Google-sleutel</label>
                  <div className="row" style={{ gap: 8 }}>
                    <input
                      id="st-key"
                      className="input grow"
                      type={showKey ? 'text' : 'password'}
                      value={settings.apiKey}
                      onChange={(e) => updateSettings({ apiKey: e.target.value.trim() })}
                      placeholder="AIza…"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button className="icon-btn" aria-label={showKey ? 'Sleutel verbergen' : 'Sleutel tonen'} aria-pressed={showKey} onClick={() => setShowKey((v) => !v)}>
                      <Icon name="eye" />
                    </button>
                  </div>
                  <button className="btn block" disabled={!settings.apiKey || testing} onClick={test}>
                    <Icon name="volume" /> {testing ? 'Bezig met testen…' : 'Test sleutel'}
                  </button>
                  <button className="link-btn" onClick={() => nav('/sleutel')}>
                    Hoe kom ik aan een gratis sleutel?
                  </button>
                </div>
                <div className="field">
                  <label>Soort sleutel</label>
                  <Seg<'free' | 'paid'>
                    label="Soort sleutel"
                    value={settings.keyPlan}
                    onChange={(v) => updateSettings({ keyPlan: v })}
                    options={[
                      ['free', 'Gratis'],
                      ['paid', 'Betaald'],
                    ]}
                  />
                  <span className="muted small">
                    {settings.keyPlan === 'paid'
                      ? 'Geen daglimiet en sneller laden. Kost ongeveer € 0,65 per toneelstuk (vanaf januari ± € 1,30), één keer.'
                      : 'Gratis met een daglimiet. Een heel stuk laden kan een dag of twee duren.'}{' '}
                    <button className="link-btn" onClick={() => nav('/sleutel', { state: { scrollTo: 'betaald' } })}>
                      Hoe zet ik betalen aan?
                    </button>
                  </span>
                </div>
                {settings.apiKey && <UsageBar />}
                <div className="field">
                  <label htmlFor="st-model">Stemmodel</label>
                  <select id="st-model" className="input" value={settings.model} onChange={(e) => updateSettings({ model: e.target.value })}>
                    {TTS_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Hoeveel emotie</label>
                  <Seg<Emotion>
                    value={settings.emotion}
                    onChange={(v) => updateSettings({ emotion: v })}
                    options={[
                      ['calm', 'Rustig'],
                      ['some', 'Een beetje'],
                      ['lots', 'Veel'],
                    ]}
                  />
                  <span className="muted small">Bij een andere keuze worden de stemmen opnieuw gemaakt.</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Group>

        <Group title="Oefenen">
          <div className="field">
            <label>Spreeksnelheid tegenspelers</label>
            <Seg<number>
              value={settings.speed}
              onChange={(v) => updateSettings({ speed: v })}
              options={[
                [0.75, '0,75×'],
                [1, '1×'],
                [1.25, '1,25×'],
                [1.5, '1,5×'],
              ]}
            />
          </div>
          <div className="field">
            <label htmlFor="st-pause">
              Pauze voor de volgende cue: <b>{(settings.cuePause / 1000).toFixed(1).replace('.', ',')} sec</b>
            </label>
            <input id="st-pause" type="range" min={600} max={2500} step={100} value={settings.cuePause} onChange={(e) => updateSettings({ cuePause: Number(e.target.value) })} />
            <span className="muted small">Hoe lang de app stil wacht voordat hij aanneemt dat je klaar bent.</span>
          </div>
          <div className="setting-row">
            <span className="grow">
              <b>Microfoon gebruiken</b>
              <span className="muted small" style={{ display: 'block' }}>
                Uit: je tikt zelf als je klaar bent.
              </span>
            </span>
            <button className="switch" role="switch" aria-checked={settings.useMic} aria-label="Microfoon gebruiken" onClick={() => updateSettings({ useMic: !settings.useMic })} />
          </div>
          {settings.useMic && <MicTest />}
        </Group>

        <Group title="Weergave">
          <div className="field">
            <label>Tekstgrootte</label>
            <Seg<TextSize>
              value={settings.textSize}
              onChange={(v) => updateSettings({ textSize: v })}
              options={[
                ['normal', 'Normaal'],
                ['large', 'Groot'],
                ['xlarge', 'Extra groot'],
              ]}
            />
          </div>
          <div className="field">
            <label>Thema</label>
            <Seg<Theme>
              value={settings.theme}
              onChange={(v) => updateSettings({ theme: v })}
              options={[
                ['auto', 'Automatisch'],
                ['light', 'Licht'],
                ['dark', 'Donker'],
              ]}
            />
          </div>
        </Group>

        <Group title="Gegevens">
          <p className="muted">{est ? `In gebruik op dit toestel: ${est.usedMb} MB (scripts en ingesproken stemmen).` : 'Alles wordt alleen op dit toestel bewaard.'}</p>
          <button className="btn block" onClick={() => nav('/welkom')}>
            <Icon name="info" /> Uitleg opnieuw bekijken
          </button>
          <AnimatePresence initial={false} mode="wait">
            {confirmWipe ? (
              <motion.div key="c" className="stack" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <p>Alle scripts, voortgang, stemmen en instellingen worden gewist. Weet je het zeker?</p>
                <div className="row">
                  <button className="btn grow" onClick={() => setConfirmWipe(false)}>
                    Nee
                  </button>
                  <button className="btn danger solid grow" onClick={wipe}>
                    Ja, alles wissen
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.button key="b" className="btn danger block" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setConfirmWipe(true)}>
                <Icon name="trash" /> Alles wissen
              </motion.button>
            )}
          </AnimatePresence>
        </Group>

        <p className="muted small" style={{ textAlign: 'center' }}>
          Souffleur v0.4 · {__BUILD__}
        </p>
      </motion.div>
    </Screen>
  )
}
