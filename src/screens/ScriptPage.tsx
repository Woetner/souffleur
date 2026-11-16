import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar, Screen, TopBar } from '../components/Screen'
import Icon from '../components/Icon'
import { useApp } from '../state'
import type { Character, DirectionsMode, Line, Part, Script, TextMode } from '../types'
import { displayName, isMine } from '../lib/parser'
import { resplit } from '../lib/scriptFactory'
import { cachedLineAudio, prepareLines } from '../lib/tts'
import { errText, itemVariants, listVariants, medal, MEDAL_LABEL, Seg, useVoiceSample, VoiceSelect } from './ui'

type Filter = 'all' | 'mine' | 'todo'

const expand = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: 'auto' }, exit: { opacity: 0, height: 0 }, style: { overflow: 'hidden' } }

function Collapsible({ title, icon, children, open: initial = false }: { title: string; icon: Parameters<typeof Icon>[0]['name']; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial)
  return (
    <section className="card" style={{ padding: 0 }}>
      <button className="row" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={{ width: '100%', minHeight: 60, padding: '0 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <Icon name={icon} />
        <b className="grow">{title}</b>
        <motion.span animate={{ rotate: open ? 90 : 0 }} style={{ display: 'grid' }}>
          <Icon name="next" size={16} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div {...expand}>
            <div className="stack" style={{ padding: '0 16px 16px', gap: 16 }}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

/** Text input that saves on blur, so typing does not write to storage each key */
function LazyInput({ value, onSave, placeholder, label }: { value: string; onSave: (v: string) => void; placeholder?: string; label: string }) {
  const [v, setV] = useState(value)
  return <input className="input" value={v} placeholder={placeholder} aria-label={label} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v.trim())} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
}

function PartRow({ s, p }: { s: Script; p: Part }) {
  const nav = useNavigate()
  const best = s.progress[p.id]?.best
  const m = medal(best)
  const first = s.lines.slice(p.start, p.end).find((l) => l.kind === 'line')
  const short = p.title.includes(' · ') ? p.title.split(' · ').slice(1).join(' · ') : p.title
  return (
    <motion.button variants={itemVariants} whileTap={{ scale: 0.98 }} className="card tap part-row" onClick={() => nav(`/script/${s.id}/oefen/${p.id}`)}>
      <span className={`medal ${m}`} title={MEDAL_LABEL[m]} aria-label={MEDAL_LABEL[m] + (best != null ? `, ${best}%` : '')}>
        <Icon name="star" fill={m !== 'none'} size={22} />
      </span>
      <span className="grow" style={{ minWidth: 0 }}>
        <b className="clamp1" style={{ display: 'block' }}>{short}</b>
        {first && (
          <span className="muted small clamp1" style={{ display: 'block' }}>
            {displayName(first.speakers?.[0] ?? '')}: {first.text}
          </span>
        )}
        <span className="small" style={{ color: 'var(--accent)' }}>
          {p.myLines ? `${p.myLines} ${p.myLines === 1 ? 'zin' : 'zinnen'} van jou` : 'Alleen luisteren'}
          {best != null && <span className="muted"> · beste {best}%</span>}
        </span>
      </span>
      <Icon name="play" size={20} />
    </motion.button>
  )
}

function Voices({ s, others }: { s: Script; others: Line[] }) {
  const nav = useNavigate()
  const { settings, toast } = useApp()
  const [cached, setCached] = useState<number | null>(null)
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null)
  const [err, setErr] = useState('')
  const abort = useRef<AbortController | null>(null)
  const hasKey = settings.engine === 'gemini' && !!settings.apiKey

  useEffect(() => {
    if (!hasKey) return
    let live = true
    Promise.all(others.map((l) => cachedLineAudio(s, l, settings))).then((r) => live && setCached(r.filter(Boolean).length))
    return () => {
      live = false
    }
  }, [s, others, settings, hasKey])
  useEffect(() => () => abort.current?.abort(), [])

  if (!hasKey)
    return (
      <motion.button whileTap={{ scale: 0.98 }} className="banner" onClick={() => nav('/sleutel')}>
        <span className="ic">
          <Icon name="sparkle" />
        </span>
        <span className="grow">
          {settings.engine === 'browser' ? 'Je gebruikt nu de gratis robotstem.' : 'Nog geen Google-sleutel.'} Stel gratis AI-stemmen in voor echte tegenspelers.
        </span>
      </motion.button>
    )

  const run = async () => {
    const ac = new AbortController()
    abort.current = ac
    setErr('')
    setProg({ done: 0, total: others.length })
    const r = await prepareLines(s, others, settings, (done, total) => setProg({ done, total }), ac.signal)
    abort.current = null
    setCached(r.done)
    setProg(null)
    if (r.error) setErr(r.error.message + (r.error.kind === 'daily' ? ' Morgen kun je verder; wat al klaar is blijft bewaard.' : ''))
    else if (!ac.signal.aborted) toast('Alle stemmen zijn klaar!')
  }

  return (
    <div className="card stack">
      <p>
        <b>{cached ?? '…'}</b> van de <b>{others.length}</b> regels van je tegenspelers zijn al ingesproken en bewaard.
      </p>
      {prog ? (
        <>
          <div className="bar">
            <div style={{ width: `${prog.total ? (prog.done / prog.total) * 100 : 0}%` }} />
          </div>
          <div className="row">
            <span className="grow muted small">
              Bezig: {prog.done} / {prog.total}
            </span>
            <button className="btn small-btn" onClick={() => abort.current?.abort()}>
              Stoppen
            </button>
          </div>
        </>
      ) : (
        cached !== others.length && (
          <button className="btn primary block" onClick={() => run().catch((e) => setErr(errText(e)))}>
            <Icon name="sparkle" /> Alle stemmen nu maken
          </button>
        )
      )}
      {err && (
        <div className="error" role="alert">
          {err}
        </div>
      )}
      <p className="muted small">Klaarmaken hoeft niet: tijdens het oefenen worden regels ook vanzelf ingesproken. Vooraf maken voorkomt wachten.</p>
    </div>
  )
}

function FullText({ s, onNote }: { s: Script; onNote: (id: number, note: string) => void }) {
  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const colors = useMemo(() => Object.fromEntries(s.characters.map((c) => [c.key, c])), [s.characters])
  return (
    <div className="card" style={{ paddingTop: 8 }}>
      {s.lines.map((l) => {
        if (l.kind === 'heading') return <div key={l.id} className="script-line head">{displayName(l.text)}</div>
        if (l.kind === 'direction') return <div key={l.id} className="script-line dir">({l.text})</div>
        const mine = isMine(l, s.myRole)
        const c = colors[l.speakers?.[0] ?? '']
        return (
          <div key={l.id} className={`script-line${mine ? ' mine' : ''}`}>
            <div className="row" style={{ alignItems: 'flex-start', gap: 8 }}>
              <div className="grow">
                <span className="who" style={{ color: c?.color }}>{(l.speakers ?? []).map(displayName).join(' + ')}</span>
                {l.directions?.length ? <span className="muted small"> ({l.directions.join('; ')})</span> : null}
                <div>{l.text}</div>
                {l.note && editing !== l.id && <div className="note-text">Notitie: {l.note}</div>}
              </div>
              {!mine && (
                <button
                  className="icon-btn"
                  aria-label="Notitie voor de stem"
                  style={{ color: l.note ? 'var(--accent-2)' : 'var(--text-2)' }}
                  onClick={() => {
                    setEditing(editing === l.id ? null : l.id)
                    setDraft(l.note ?? '')
                  }}
                >
                  <Icon name="note" size={20} />
                </button>
              )}
            </div>
            <AnimatePresence initial={false}>
              {editing === l.id && (
                <motion.form
                  {...expand}
                  onSubmit={(e) => {
                    e.preventDefault()
                    onNote(l.id, draft.trim())
                    setEditing(null)
                  }}
                >
                  <div className="stack" style={{ paddingTop: 8 }}>
                    <input className="input" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Bijv. boos, fluisterend, heel snel" aria-label="Notitie" />
                    <div className="row">
                      <button type="button" className="btn grow" onClick={() => setEditing(null)}>
                        Annuleren
                      </button>
                      <button type="submit" className="btn primary grow">
                        Opslaan
                      </button>
                    </div>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </div>
  )
}

export default function ScriptPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { scripts, settings, saveScript, removeScript, toast } = useApp()
  const s = scripts?.find((x) => x.id === id)
  const [filter, setFilter] = useState<Filter>('all')
  const [showText, setShowText] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const { playing, play } = useVoiceSample(settings, toast, s?.context)

  const others = useMemo(() => (s ? s.lines.filter((l) => l.kind === 'line' && !isMine(l, s.myRole) && l.text) : []), [s])

  if (!scripts) return <Screen><TopBar /></Screen>
  if (!s)
    return (
      <Screen>
        <TopBar back="/" />
        <div className="card stack">
          <p>Dit script bestaat niet (meer).</p>
          <button className="btn primary" onClick={() => nav('/scripts')}>
            Naar mijn scripts
          </button>
        </div>
      </Screen>
    )

  const update = (patch: Partial<Script>) => saveScript({ ...s, ...patch })
  const updateChar = (key: string, patch: Partial<Character>) => update({ characters: s.characters.map((c) => (c.key === key ? { ...c, ...patch } : c)) })
  const me = s.characters.find((c) => c.key === s.myRole)

  const parts = s.parts.filter((p) => (filter === 'mine' ? p.myLines > 0 : filter === 'todo' ? p.myLines > 0 && (s.progress[p.id]?.best ?? 0) < 70 : true))
  const groups: [string, Part[]][] = []
  for (const p of parts) {
    const g = p.title.includes(' · ') ? p.title.split(' · ')[0] : p.title.startsWith('Deel ') ? '' : p.title
    const last = groups[groups.length - 1]
    if (last && last[0] === g) last[1].push(p)
    else groups.push([g, [p]])
  }

  const del = async () => {
    await removeScript(s.id)
    toast(`"${s.title}" is verwijderd`)
    nav('/scripts', { replace: true })
  }

  return (
    <Screen>
      <TopBar title={s.title} back="/" />
      <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: -8 }}>
        <span className="chip" style={{ background: me?.color, color: '#fff' }}>
          Jij: {me?.name ?? displayName(s.myRole)}
        </span>
        <span className="chip">{s.parts.length} oefenstukken</span>
        {s.isDemo && <span className="chip">Oefenscène</span>}
      </div>

      <h2 className="section-title">Oefenstukken</h2>
      <div className="chips" role="group" aria-label="Filter">
        {(
          [
            ['all', 'Alles'],
            ['mine', 'Met mijn tekst'],
            ['todo', 'Nog oefenen'],
          ] as [Filter, string][]
        ).map(([f, l]) => (
          <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {l}
          </button>
        ))}
      </div>
      <motion.div key={filter} className="stack" variants={listVariants} initial="hidden" animate="show">
        {groups.map(([g, ps], gi) => (
          <div key={gi} className="stack" style={{ gap: 10 }}>
            {g && <span className="eyebrow">{g}</span>}
            {ps.map((p) => (
              <PartRow key={p.id} s={s} p={p} />
            ))}
          </div>
        ))}
        {!parts.length && <p className="muted">{filter === 'todo' ? 'Alles geleerd. Bravo!' : 'Geen oefenstukken gevonden.'}</p>}
      </motion.div>

      <h2 className="section-title">Tegenspelers</h2>
      <div className="card stack" style={{ gap: 14 }}>
        {s.characters
          .filter((c) => c.key !== s.myRole)
          .map((c) => (
            <div key={c.key} className="char-row">
              <div className="row">
                <Avatar name={c.name} color={c.color} speaking={playing === c.key} />
                <span className="grow">
                  <b>{c.name}</b>
                  <span className="muted small" style={{ display: 'block' }}>
                    {c.lineCount} regels
                  </span>
                </span>
                <button className="btn small-btn" onClick={() => play(c)} disabled={playing === c.key}>
                  <Icon name="volume" size={20} /> Luister
                </button>
              </div>
              <LazyInput key={c.persona} value={c.persona} label={`Beschrijving van ${c.name}`} placeholder="Wie is dit? Bijv. nuchtere buurvrouw" onSave={(v) => updateChar(c.key, { persona: v })} />
              <VoiceSelect value={c.voice} onChange={(v) => updateChar(c.key, { voice: v })} />
            </div>
          ))}
      </div>

      <h2 className="section-title">Stemmen</h2>
      <Voices s={s} others={others} />

      <Collapsible title="Instellingen voor dit script" icon="settings">
        <div className="field">
          <label>Regieaanwijzingen</label>
          <Seg<DirectionsMode>
            value={s.directions ?? 'show'}
            onChange={(v) => update({ directions: v })}
            options={[
              ['show', 'Tonen'],
              ['narrate', 'Voorlezen'],
              ['hide', 'Verbergen'],
            ]}
          />
        </div>
        <div className="field">
          <label>Jouw tekst tijdens het oefenen</label>
          <Seg<TextMode>
            value={s.textMode}
            onChange={(v) => update({ textMode: v })}
            options={[
              ['full', 'Volledig'],
              ['fade', 'Vaag'],
              ['initials', 'Beginletters'],
              ['hidden', 'Verborgen'],
            ]}
          />
        </div>
        <div className="field">
          <label>Lengte oefenstuk</label>
          <Seg<number>
            value={s.partSize}
            onChange={(v) => saveScript(resplit(s, s.myRole, v))}
            options={[
              [4, 'Kort'],
              [8, 'Normaal'],
              [15, 'Lang'],
            ]}
          />
          <span className="muted small">Let op: bij een andere lengte begint je voortgang opnieuw.</span>
        </div>
        <div className="field">
          <label htmlFor="sp-role">Mijn rol</label>
          <select id="sp-role" className="input" value={s.myRole} onChange={(e) => saveScript(resplit(s, e.target.value))}>
            {s.characters.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name} ({c.lineCount} regels)
              </option>
            ))}
          </select>
        </div>
      </Collapsible>

      <button className="btn block" onClick={() => setShowText((v) => !v)} aria-expanded={showText}>
        <Icon name="eye" /> {showText ? 'Tekst verbergen' : 'Tekst bekijken'}
      </button>
      <AnimatePresence initial={false}>
        {showText && (
          <motion.div {...expand}>
            <p className="muted small" style={{ marginBottom: 8 }}>
              Tik op het notitie-icoon bij een regel van een tegenspeler om aan te geven hoe die gezegd moet worden. De stem wordt dan opnieuw gemaakt.
            </p>
            <FullText s={s} onNote={(lid, note) => update({ lines: s.lines.map((l) => (l.id === lid ? { ...l, note: note || undefined } : l)) })} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="divider" />
      <AnimatePresence initial={false} mode="wait">
        {confirmDel ? (
          <motion.div key="c" className="card stack" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <p>Script en voortgang verwijderen? Dit kan niet ongedaan worden.</p>
            <div className="row">
              <button className="btn grow" onClick={() => setConfirmDel(false)}>
                Nee, bewaren
              </button>
              <button className="btn danger solid grow" onClick={del}>
                Ja, verwijder
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.button key="b" className="btn danger block" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setConfirmDel(true)}>
            <Icon name="trash" /> Script verwijderen
          </motion.button>
        )}
      </AnimatePresence>
    </Screen>
  )
}
