import type { Character, Script } from '../types'
import { displayName, makeParts, parseScript, type ParseResult } from './parser'
import { assignVoices } from './voices'
import { newId } from './storage'

/** Find "Thea Buurvrouw" / "Cora de Vries: Directrice" in the cast list before the play starts */
export function castDescriptions(raw: string, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  const head = raw.split('\n').slice(0, 80)
  for (const k of keys) {
    const name = displayName(k)
    const re = new RegExp(`^[-•*\\s]*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[\\s:/,-]*(.*)$`, 'i')
    for (const l of head) {
      const m = re.exec(l.trim())
      if (m && m[1] && m[1].length < 80 && !/^\s*$/.test(m[1])) {
        out[k] = m[1].replace(/\s+/g, ' ').replace(/^[:/,-]\s*/, '').trim()
        break
      }
    }
  }
  return out
}

export function charactersFrom(parsed: ParseResult, raw: string): Character[] {
  const desc = castDescriptions(raw, parsed.speakers.map((s) => s.key))
  const base = parsed.speakers.map((s) => ({ key: s.key, name: displayName(s.key), persona: desc[s.key] ?? '', lineCount: s.count }))
  const v = assignVoices(base)
  return base.map((c, i) => ({ ...c, voice: v[i].voice, color: v[i].color, pitch: v[i].pitch }))
}

export function buildScript(opts: {
  raw: string
  title: string
  context: string
  myRole: string
  characters: Character[]
  partSize: number
  parsed?: ParseResult
}): Script {
  const parsed = opts.parsed ?? parseScript(opts.raw)
  const now = Date.now()
  return {
    id: newId(),
    title: opts.title,
    context: opts.context,
    createdAt: now,
    updatedAt: now,
    myRole: opts.myRole,
    characters: opts.characters,
    lines: parsed.lines,
    parts: makeParts(parsed.lines, opts.myRole, opts.partSize),
    partSize: opts.partSize,
    directions: 'show',
    textMode: 'full',
    progress: {},
  }
}

/** Re-split after the user changes role or part size */
export function resplit(s: Script, myRole = s.myRole, partSize = s.partSize): Script {
  return { ...s, myRole, partSize, parts: makeParts(s.lines, myRole, partSize), progress: myRole === s.myRole && partSize === s.partSize ? s.progress : {} }
}
