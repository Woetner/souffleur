import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, Screen, TopBar } from '../components/Screen'
import Icon from '../components/Icon'
import { useApp } from '../state'
import type { Character } from '../types'
import { fileToText } from '../lib/importFile'
import { makeParts, parseScript, type ParseResult } from '../lib/parser'
import { buildScript, charactersFrom } from '../lib/scriptFactory'
import { errText, Seg, useVoiceSample, VoiceSelect } from './ui'

const STEPS = ['Upload', 'Over het stuk', 'Jouw rol', 'Tegenspelers', 'Oefenstukken', 'Klaar']
const SIZES: [number, string][] = [
  [4, 'Kort'],
  [8, 'Normaal'],
  [15, 'Lang'],
]

const slide = {
  enter: (d: number) => ({ x: d * 60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: -d * 60, opacity: 0 }),
}

export default function NewScript() {
  const nav = useNavigate()
  const { settings, saveScript, toast } = useApp()
  const [[step, dir], setStep] = useState([0, 1])
  const [raw, setRaw] = useState('')
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [paste, setPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [layoutHelp, setLayoutHelp] = useState(false)
  const [over, setOver] = useState(false)
  const [fileName, setFileName] = useState('')
  const [title, setTitle] = useState('')
  const [context, setContext] = useState('')
  const [chars, setChars] = useState<Character[]>([])
  const [myRole, setMyRole] = useState('')
  const [partSize, setPartSize] = useState(8)
  const fileRef = useRef<HTMLInputElement>(null)
  const { playing, play } = useVoiceSample(settings, toast, context)

  const go = (n: number) => setStep([n, n > step ? 1 : -1])
  const back = () => (step === 0 ? nav(-1) : go(step - 1))

  const accept = (text: string, name = '') => {
    const p = parseScript(text)
    if (p.speakers.length < 2) {
      setError(name ? `In "${name}" vonden we geen rollen.` : 'In deze tekst vonden we geen rollen.')
      setLayoutHelp(true)
      setPaste(true)
      if (!pasteText) setPasteText(text.slice(0, 20000))
      return
    }
    setError('')
    setLayoutHelp(false)
    setRaw(text)
    setParsed(p)
    setFileName(name)
    setTitle(p.title || name.replace(/\.[^.]+$/, '') || 'Mijn script')
    const cs = charactersFrom(p, text)
    setChars(cs)
    setMyRole(cs.some((c) => c.key === myRole) ? myRole : '')
    go(1)
  }

  const onFile = async (f?: File | null) => {
    if (!f) return
    if (!/\.(docx|pdf|txt|doc)$/i.test(f.name)) {
      setError('Dit soort bestand kennen we niet. Kies een Word-bestand (.docx), PDF of tekstbestand.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const text = await fileToText(f)
      if (!text.trim()) throw new Error('Het bestand lijkt leeg. Is het misschien een scan? Plak dan de tekst hieronder.')
      accept(text, f.name)
    } catch (e) {
      setError(errText(e) || 'Het bestand kon niet gelezen worden.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    onFile(e.dataTransfer.files?.[0])
  }

  const others = chars.filter((c) => c.key !== myRole)
  const updateChar = (key: string, patch: Partial<Character>) => setChars((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)))
  const partCount = useMemo(() => (parsed && myRole ? makeParts(parsed.lines, myRole, partSize).length : 0), [parsed, myRole, partSize])

  const stats = useMemo(() => {
    if (!parsed) return { acts: 0, lines: 0, mine: 0 }
    const lines = parsed.lines.filter((l) => l.kind === 'line')
    return {
      acts: parsed.lines.filter((l) => l.kind === 'heading').length,
      lines: lines.length,
      mine: lines.filter((l) => l.speakers?.includes(myRole)).length,
    }
  }, [parsed, myRole])

  const create = async () => {
    if (!parsed) return
    setBusy(true)
    try {
      const s = buildScript({ raw, title: title.trim() || 'Mijn script', context: context.trim(), myRole, characters: chars, partSize, parsed })
      await saveScript(s)
      nav(`/script/${s.id}`, { replace: true })
    } catch (e) {
      setError(errText(e))
      setBusy(false)
    }
  }

  const canNext = [false, !!title.trim(), !!myRole, true, true, true][step]

  return (
    <Screen>
      <TopBar title="Nieuw script" onBack={back} right={<span className="muted small" style={{ paddingRight: 8 }}>{step + 1} / {STEPS.length}</span>} />
      <div className="wizard-steps" aria-hidden="true">
        {STEPS.map((_, n) => (
          <div key={n}>
            <motion.div initial={false} animate={{ width: n <= step ? '100%' : '0%' }} transition={{ duration: 0.3 }} />
          </div>
        ))}
      </div>

      <div className="wizard-body">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.div key={step} className="stack" custom={dir} variants={slide} initial="enter" animate="center" exit="exit" transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }} style={{ gap: 16 }}>
            <h2>{STEPS[step]}</h2>

            {step === 0 && (
              <>
                <p className="muted">Kies je script. Word (.docx), PDF en tekstbestanden werken.</p>
                <motion.label
                  whileTap={{ scale: 0.98 }}
                  className={`drop${over ? ' over' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setOver(true)
                  }}
                  onDragLeave={() => setOver(false)}
                  onDrop={onDrop}
                >
                  <span className="ic">{busy ? <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} style={{ display: 'grid' }}><Icon name="loop" size={30} /></motion.span> : <Icon name="upload" size={30} />}</span>
                  <b>{busy ? 'Script lezen…' : 'Tik om een bestand te kiezen'}</b>
                  <span className="muted small">of sleep het hierheen</span>
                  <input ref={fileRef} type="file" accept=".docx,.pdf,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" hidden disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
                </motion.label>
                {error && (
                  <div className="error" role="alert">
                    {error}
                  </div>
                )}
                {layoutHelp && (
                  <div className="card stack small">
                    <b>Zo herkent de app je script</b>
                    <p>Elke regel begint met de naam van de rol, dan een dubbele punt:</p>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', background: 'var(--bg-sunk)', padding: 12, borderRadius: 10 }}>
                      {'HANS: Goedemorgen, Thea!\nTHEA: (verbaasd) Hans? Wat doe jij hier?\nEERSTE BEDRIJF'}
                    </pre>
                    <p className="muted">Pas de tekst hieronder aan of plak hem opnieuw.</p>
                  </div>
                )}
                <button className="link-btn" onClick={() => setPaste((v) => !v)}>
                  {paste ? 'Toch een bestand kiezen' : 'of plak de tekst'}
                </button>
                <AnimatePresence initial={false}>
                  {paste && (
                    <motion.div className="stack" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                      <textarea className="input" rows={10} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={'HANS: Goedemorgen!\nTHEA: Goedemorgen, Hans.'} aria-label="Tekst van het script" />
                      <button className="btn primary block" disabled={!pasteText.trim()} onClick={() => accept(pasteText)}>
                        Gebruik deze tekst
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}

            {step === 1 && (
              <>
                <div className="field">
                  <label htmlFor="ns-title">Titel</label>
                  <input id="ns-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
                  {fileName && <span className="muted small">Uit bestand: {fileName}</span>}
                </div>
                <div className="field">
                  <label htmlFor="ns-ctx">
                    Waar gaat het stuk over? <span className="muted small">(mag leeg)</span>
                  </label>
                  <textarea id="ns-ctx" className="input" rows={3} value={context} onChange={(e) => setContext(e.target.value)} placeholder="Bijv. komedie in een verzorgingshuis" />
                  <span className="muted small">Dit helpt de AI-stemmen de juiste toon te vinden.</span>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <p className="muted">Welke rol speel jij? Tik op je eigen rol.</p>
                <div className="stack">
                  {chars.map((c) => (
                    <motion.button key={c.key} className="pick" aria-pressed={myRole === c.key} whileTap={{ scale: 0.98 }} onClick={() => setMyRole(c.key)}>
                      <Avatar name={c.name} color={c.color} size={44} />
                      <span>
                        <b>{c.name}</b>
                        <span className="muted small" style={{ display: 'block' }}>
                          {c.lineCount} {c.lineCount === 1 ? 'regel' : 'regels'}
                          {c.persona ? ` · ${c.persona}` : ''}
                        </span>
                      </span>
                      {myRole === c.key && (
                        <span className="me">
                          <Icon name="check" size={20} /> Dit ben ik
                        </span>
                      )}
                    </motion.button>
                  ))}
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <p className="muted">Zo klinken je tegenspelers. Pas de stem of beschrijving aan als je wilt.</p>
                <div className="card stack" style={{ gap: 14 }}>
                  {others.map((c) => (
                    <div key={c.key} className="char-row">
                      <div className="row">
                        <Avatar name={c.name} color={c.color} speaking={playing === c.key} />
                        <b className="grow">{c.name}</b>
                        <button className="btn small-btn" onClick={() => play(c)} disabled={playing === c.key}>
                          <Icon name="volume" size={20} /> Luister
                        </button>
                      </div>
                      <input className="input" value={c.persona} onChange={(e) => updateChar(c.key, { persona: e.target.value })} placeholder="Wie is dit? Bijv. nuchtere buurvrouw" aria-label={`Beschrijving van ${c.name}`} />
                      <VoiceSelect value={c.voice} onChange={(v) => updateChar(c.key, { voice: v })} />
                    </div>
                  ))}
                </div>
                {!settings.apiKey && <p className="muted small">Zonder Google-sleutel hoor je de gratis robotstem. De gekozen AI-stem hoor je zodra je een sleutel instelt.</p>}
              </>
            )}

            {step === 4 && (
              <>
                <p className="muted">We knippen het stuk in kleine oefenstukken. Hoeveel van jouw zinnen per stuk?</p>
                <Seg value={partSize} options={SIZES} onChange={setPartSize} label="Lengte oefenstuk" />
                <p className="muted small">Kort: 4 eigen zinnen · Normaal: 8 · Lang: 15</p>
                <motion.div key={partCount} className="card row" initial={{ scale: 0.97, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }}>
                  <span className="summary-num">{partCount}</span>
                  <span>We maken {partCount} {partCount === 1 ? 'oefenstuk' : 'oefenstukken'}</span>
                </motion.div>
              </>
            )}

            {step === 5 && (
              <>
                <div className="card stack">
                  <p>
                    We vonden <b>{stats.acts}</b> {stats.acts === 1 ? 'bedrijf' : 'bedrijven'}, <b>{stats.lines}</b> regels, <b>{stats.mine}</b> van jou.
                  </p>
                  <div className="divider" />
                  <span className="muted small">Titel</span>
                  <b>{title}</b>
                  <span className="muted small">Jouw rol</span>
                  <b>{chars.find((c) => c.key === myRole)?.name}</b>
                  <span className="muted small">Oefenstukken</span>
                  <b>{partCount}</b>
                </div>
                {error && (
                  <div className="error" role="alert">
                    {error}
                  </div>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {step > 0 && (
        <div className="wizard-foot">
          {step < STEPS.length - 1 ? (
            <button className="btn primary block" disabled={!canNext} onClick={() => go(step + 1)}>
              Volgende
            </button>
          ) : (
            <motion.button className="btn primary block" whileTap={{ scale: 0.97 }} disabled={busy} onClick={create}>
              <Icon name="sparkle" /> Maak mijn script
            </motion.button>
          )}
        </div>
      )}
    </Screen>
  )
}
