export interface VoiceInfo {
  name: string
  gender: 'm' | 'v'
  label: string // Dutch description
}

// Gemini TTS prebuilt voices with a short Dutch description
export const GEMINI_VOICES: VoiceInfo[] = [
  { name: 'Kore', gender: 'v', label: 'stevig' },
  { name: 'Leda', gender: 'v', label: 'jong' },
  { name: 'Aoede', gender: 'v', label: 'luchtig' },
  { name: 'Callirrhoe', gender: 'v', label: 'ontspannen' },
  { name: 'Autonoe', gender: 'v', label: 'helder' },
  { name: 'Despina', gender: 'v', label: 'zacht en vloeiend' },
  { name: 'Erinome', gender: 'v', label: 'duidelijk' },
  { name: 'Laomedeia', gender: 'v', label: 'vrolijk' },
  { name: 'Achernar', gender: 'v', label: 'zacht' },
  { name: 'Gacrux', gender: 'v', label: 'volwassen' },
  { name: 'Pulcherrima', gender: 'v', label: 'uitgesproken' },
  { name: 'Vindemiatrix', gender: 'v', label: 'vriendelijk' },
  { name: 'Sulafat', gender: 'v', label: 'warm' },
  { name: 'Zephyr', gender: 'v', label: 'fris' },
  { name: 'Charon', gender: 'm', label: 'zakelijk' },
  { name: 'Puck', gender: 'm', label: 'opgewekt' },
  { name: 'Fenrir', gender: 'm', label: 'opgewonden' },
  { name: 'Orus', gender: 'm', label: 'stevig' },
  { name: 'Enceladus', gender: 'm', label: 'zacht en hees' },
  { name: 'Iapetus', gender: 'm', label: 'helder' },
  { name: 'Umbriel', gender: 'm', label: 'ontspannen' },
  { name: 'Algieba', gender: 'm', label: 'vloeiend' },
  { name: 'Algenib', gender: 'm', label: 'rauw' },
  { name: 'Rasalgethi', gender: 'm', label: 'vertellend' },
  { name: 'Alnilam', gender: 'm', label: 'krachtig' },
  { name: 'Schedar', gender: 'm', label: 'rustig' },
  { name: 'Achird', gender: 'm', label: 'vriendelijk' },
  { name: 'Zubenelgenubi', gender: 'm', label: 'nonchalant' },
  { name: 'Sadachbia', gender: 'm', label: 'levendig' },
  { name: 'Sadaltager', gender: 'm', label: 'wijs' },
]

const FEMALE = new Set(
  'floor thea coby cora anna anne annie emma sophie julia lisa sanne lotte eva fleur maria marie mia nina ria tine tineke els elly ellen ineke joke karin linda marja mieke monique petra sandra saskia truus wilma yvonne gerda greet henny hennie jannie janny josje kim lies lieke lien lies mariska miep nel nelly riet rietje roos sara sarah tamara vera wil zus moeder mevrouw buurvrouw directrice zuster tante oma dochter vrouw meisje'.split(
    ' ',
  ),
)
const MALE_HINT = /(meneer|vader|opa|oom|heer|man|jongen|zoon|broer|dokter|agent|pastoor|dominee|robot)/i

export function guessGender(name: string, persona = ''): 'm' | 'v' {
  const first = name.toLowerCase().split(/\s+/)[0]
  if (FEMALE.has(first)) return 'v'
  if (/(vrouw|moeder|dochter|zuster|directrice|tante|oma|meisje|mevrouw)/i.test(persona)) return 'v'
  if (MALE_HINT.test(persona) || MALE_HINT.test(name)) return 'm'
  if (/(a|ie|ke|je|ine|ette|y)$/.test(first) && first.length > 2) return 'v'
  return 'm'
}

export const COLORS = ['#c2410c', '#0f766e', '#7c3aed', '#be185d', '#1d4ed8', '#a16207', '#15803d', '#9f1239', '#0e7490', '#6d28d9']

/** Pick distinct voices for the characters */
export function assignVoices(chars: { name: string; persona: string }[]) {
  const used = new Set<string>()
  return chars.map((c, i) => {
    const g = guessGender(c.name, c.persona)
    const pool = GEMINI_VOICES.filter((v) => v.gender === g)
    let pick = pool.find((v) => !used.has(v.name)) ?? pool[i % pool.length]
    if (/robot/i.test(c.name + ' ' + c.persona)) pick = GEMINI_VOICES.find((v) => v.name === 'Iapetus')!
    used.add(pick.name)
    return { voice: pick.name, gender: g, color: COLORS[i % COLORS.length], pitch: g === 'v' ? 1.05 + (i % 3) * 0.1 : 0.85 + (i % 3) * 0.1 }
  })
}
