export type LineKind = 'line' | 'direction' | 'heading'

export interface Line {
  id: number
  kind: LineKind
  /** Speaker key (upper-case name) for dialogue lines. Several for "HANS + THEA:" */
  speakers?: string[]
  /** Spoken text, without stage directions in brackets */
  text: string
  /** Stage directions found inside the line, e.g. "bromt" */
  directions?: string[]
  /** Optional note from the user that steers how the AI says this line */
  note?: string
  /** Technical cue (light, sound) */
  cue?: boolean
}

export interface Character {
  key: string // upper-case name as in the script
  name: string // display name
  lineCount: number
  voice: string // Gemini voice name
  persona: string // short description used to steer the voice
  color: string
  pitch: number // for browser voice
}

export interface Part {
  id: number
  title: string
  start: number // first line index (inclusive)
  end: number // last line index (exclusive)
  myLines: number
  speakers: string[]
}

export type DirectionsMode = 'show' | 'narrate' | 'hide'
export type TextMode = 'full' | 'fade' | 'initials' | 'hidden'

export interface PartProgress {
  runs: number
  best: number // 0..100
  last: number
  lastAt: number
}

export interface Script {
  id: string
  title: string
  context: string
  createdAt: number
  updatedAt: number
  myRole: string
  characters: Character[]
  lines: Line[]
  parts: Part[]
  partSize: number // number of own lines per part
  directions: DirectionsMode
  textMode: TextMode
  progress: Record<number, PartProgress>
  lastPartId?: number
  isDemo?: boolean
}

export type VoiceEngine = 'gemini' | 'browser'
export type Emotion = 'calm' | 'some' | 'lots'
export type TextSize = 'normal' | 'large' | 'xlarge'
export type Theme = 'auto' | 'light' | 'dark'

export interface Settings {
  engine: VoiceEngine
  apiKey: string
  model: string
  emotion: Emotion
  textSize: TextSize
  theme: Theme
  speed: number
  cuePause: number // ms of silence before we accept she finished
  useMic: boolean
  keyPlan: 'free' | 'paid'
  onboarded: boolean
  practiceTipsSeen: boolean
  streakDays: string[] // ISO dates practised
  minutesByDay: Record<string, number>
}
