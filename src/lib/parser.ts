import type { Line, Part } from '../types'

const UPPER = 'A-ZÀ-ÖØ-Þ'
const SPEAKER_RE = new RegExp(`^([${UPPER}][${UPPER}0-9 .'’\\-+&/,]{0,40}?)\\s*:\\s*(.*)$`)
const MIXED_SPEAKER_RE = /^([A-ZÀ-Þ][\p{L}0-9 .'’-]{0,30}?)\s*:\s*(.*)$/u
const HEADING_RE =
  /^(eerste|tweede|derde|vierde|vijfde|zesde|laatste)?\s*(bedrijf|akte|acte|scène|scene|tafereel|pauze|einde|epiloog|proloog)\b.*$|^(bedrijf|akte|acte|scène|scene|tafereel)\s+[\divx]+\b.*$/i

export interface ParseResult {
  lines: Line[]
  speakers: { key: string; count: number }[]
  title?: string
}

/** Pretty display name: "COBY" -> "Coby", "CORA DE VRIES" -> "Cora De Vries" */
export function displayName(key: string): string {
  return key
    .toLowerCase()
    .replace(/(^|[\s\-'])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())
}

function splitSpeakers(raw: string): string[] {
  return raw
    .split(/\s*(?:\+|&|\/|,|\bEN\b|\bAND\b)\s*/)
    .map((s) => s.trim().replace(/\.$/, ''))
    .filter(Boolean)
}

/** Remove "(…)" parts from a line and return them as directions */
function extractDirections(text: string): { text: string; directions: string[] } {
  const directions: string[] = []
  let out = text.replace(/\(([^)]*)\)?/g, (_m, d: string) => {
    const t = d.trim()
    if (t) directions.push(t)
    return ' '
  })
  out = out.replace(/\s+/g, ' ').replace(/\s+([,.!?…])/g, '$1').trim()
  return { text: out, directions }
}

function isAllCapsShort(s: string) {
  const letters = s.replace(/[^\p{L}]/gu, '')
  return letters.length >= 3 && s.length <= 40 && letters === letters.toUpperCase() && !s.includes(':')
}

/**
 * Turn plain script text into lines. Works for the common amateur-theatre layout:
 *   HANS: Tekst van Hans (regieaanwijzing)
 *   (Losse regieaanwijzing)
 *   EERSTE BEDRIJF
 */
export function parseScript(raw: string): ParseResult {
  const rawLines = raw
    .replace(/\r/g, '')
    .replace(/ /g, ' ')
    .split('\n')
    .map((l) => l.replace(/^[\s\t]+|[\s\t]+$/g, ''))

  // Decide which regex finds speakers: upper case names first, mixed case as fallback
  const count = (re: RegExp) => {
    const m = new Map<string, number>()
    for (const l of rawLines) {
      const r = re.exec(l)
      if (r) {
        for (const s of splitSpeakers(r[1].toUpperCase())) m.set(s, (m.get(s) ?? 0) + 1)
      }
    }
    return m
  }
  let re = SPEAKER_RE
  let counts = count(SPEAKER_RE)
  const realUpper = [...counts.values()].filter((c) => c >= 2).length
  if (realUpper < 2) {
    const mixed = count(MIXED_SPEAKER_RE)
    if ([...mixed.values()].filter((c) => c >= 2).length >= 2) {
      re = MIXED_SPEAKER_RE
      counts = mixed
    }
  }
  const known = new Set([...counts.entries()].filter(([, c]) => c >= 2).map(([k]) => k))

  const lines: Line[] = []
  let started = false
  let title: string | undefined
  let openDirection = false
  let pendingHeadings: string[] = []

  const push = (l: Omit<Line, 'id'>) => lines.push({ ...l, id: lines.length })

  for (const l of rawLines) {
    if (!l) {
      openDirection = false
      continue
    }
    const m = re.exec(l)
    const speakers = m ? splitSpeakers(m[1].toUpperCase()) : []
    const isSpeaker = m && speakers.length > 0 && speakers.every((s) => known.has(s) || speakers.length > 1)

    if (isSpeaker && m) {
      if (!started) {
        started = true
        for (const h of pendingHeadings) push({ kind: 'heading', text: h })
        pendingHeadings = []
      }
      const { text, directions } = extractDirections(m[2])
      push({ kind: 'line', speakers, text, directions: directions.length ? directions : undefined })
      openDirection = m[2].includes('(') && !m[2].includes(')')
      continue
    }

    if (HEADING_RE.test(l)) {
      const clean = l.replace(/\s+/g, ' ').trim()
      if (!started) pendingHeadings.push(clean)
      else push({ kind: 'heading', text: clean })
      openDirection = false
      continue
    }

    if (isAllCapsShort(l) && !l.startsWith('(')) {
      const clean = l.replace(/\s+/g, ' ').trim()
      if (!started) {
        if (!pendingHeadings.length) title = displayName(clean)
      } else push({ kind: 'direction', text: displayName(clean).replace(/^./, (c) => c.toUpperCase()), cue: true })
      openDirection = false
      continue
    }

    if (!started) {
      if (l.startsWith('(') && pendingHeadings.length) pendingHeadings.push(l)
      continue
    }

    if (l.startsWith('(')) {
      const t = l.replace(/^\(/, '').replace(/\)\s*$/, '').trim()
      push({ kind: 'direction', text: t })
      openDirection = !l.includes(')')
      continue
    }

    // Continuation of the previous line (wrapped text from PDF, or an open "(…" direction)
    const prev = lines[lines.length - 1]
    if (prev) {
      if (prev.kind === 'direction' && prev.cue) {
        push({ kind: 'direction', text: l.replace(/^\(|\)\s*$/g, '').replace(/\s{2,}/g, ' ') })
      } else if (prev.kind === 'direction' || openDirection) {
        if (prev.kind === 'direction') prev.text = (prev.text + ' ' + l.replace(/\)\s*$/, '')).replace(/\s{2,}/g, ' ').trim()
        else {
          const { text, directions } = extractDirections('(' + l)
          if (directions.length) prev.directions = [...(prev.directions ?? []), ...directions]
          if (text) prev.text = (prev.text + ' ' + text).trim()
        }
        if (l.includes(')')) openDirection = false
      } else if (prev.kind === 'line') {
        const { text, directions } = extractDirections(l)
        prev.text = (prev.text + ' ' + text).trim()
        if (directions.length) prev.directions = [...(prev.directions ?? []), ...directions]
        if (l.includes('(') && !l.includes(')')) openDirection = true
      } else {
        push({ kind: 'direction', text: l })
      }
    }
  }

  // Convert pending "(" headings that turned into directions (before first speaker)
  for (const ln of lines) {
    if (ln.kind === 'heading' && ln.text.startsWith('(')) {
      ln.kind = 'direction'
      ln.text = ln.text.replace(/^\(/, '').replace(/\)\s*$/, '')
    }
  }

  const speakerCounts = new Map<string, number>()
  for (const ln of lines)
    if (ln.kind === 'line') for (const s of ln.speakers ?? []) if (known.has(s)) speakerCounts.set(s, (speakerCounts.get(s) ?? 0) + 1)

  return {
    lines: lines.filter((ln) => ln.kind !== 'line' || ln.text.length > 0 || (ln.directions?.length ?? 0) > 0),
    speakers: [...speakerCounts.entries()].map(([key, c]) => ({ key, count: c })).sort((a, b) => b.count - a.count),
    title,
  }
}

export const isMine = (l: Line, role: string) => l.kind === 'line' && !!l.speakers?.includes(role)

/** Split into practice parts with about `size` of the user's own lines each, never crossing a heading. */
export function makeParts(lines: Line[], role: string, size: number): Part[] {
  const parts: Part[] = []
  let start = 0
  let mine = 0
  let section = ''
  let sectionNo = 0
  const finish = (end: number) => {
    if (end <= start) return
    const slice = lines.slice(start, end)
    const speakers = [...new Set(slice.flatMap((l) => (l.kind === 'line' ? l.speakers ?? [] : [])))]
    const hasDialogue = slice.some((l) => l.kind === 'line')
    if (!hasDialogue && parts.length) {
      parts[parts.length - 1].end = end
    } else {
      parts.push({
        id: parts.length,
        title: section || `Deel ${parts.length + 1}`,
        start,
        end,
        myLines: slice.filter((l) => isMine(l, role)).length,
        speakers,
      })
    }
    start = end
    mine = 0
  }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (l.kind === 'heading') {
      finish(i)
      sectionNo++
      section = displayName(l.text)
      continue
    }
    if (isMine(l, role)) {
      mine++
      if (mine >= size) {
        // end after this own line; also keep directions that follow it
        let j = i + 1
        while (j < lines.length && lines[j].kind === 'direction') j++
        finish(j)
        i = j - 1
      }
    }
  }
  finish(lines.length)
  // Merge a tiny last part of a section into the previous one
  const merged: Part[] = []
  for (const p of parts) {
    const prev = merged[merged.length - 1]
    if (prev && p.myLines > 0 && p.myLines < Math.ceil(size / 3) && prev.title === p.title) {
      prev.end = p.end
      prev.myLines += p.myLines
      prev.speakers = [...new Set([...prev.speakers, ...p.speakers])]
    } else merged.push({ ...p })
  }
  void sectionNo
  // Number them nicely
  const perTitle = new Map<string, number>()
  return merged.map((p, i) => {
    const n = (perTitle.get(p.title) ?? 0) + 1
    perTitle.set(p.title, n)
    return { ...p, id: i, title: `${p.title} · deel ${n}` }
  })
}
