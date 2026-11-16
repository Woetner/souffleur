import type { Script } from '../types'
import { parseScript } from './parser'
import { buildScript, charactersFrom } from './scriptFactory'

// A short original scene so new users can try the app straight away
export const DEMO_TEXT = `DE GENERALE

EERSTE SCÈNE
(Een kleine theaterzaal. MARIJKE zit met een script op schoot. JOOP komt binnen met twee koppen koffie.)
JOOP: Koffie voor de ster van de avond!
MARIJKE: Ster? Ik ben mijn tekst alweer kwijt, Joop.
JOOP: (zet de koffie neer) Onzin. Gisteren kende je hem nog uit je hoofd.
MARIJKE: Gisteren was er ook geen publiek.
JOOP: Er is nu ook geen publiek. Alleen ik. En ik ben heel vergevingsgezind.
MARIJKE: (lacht) Dat zeg je altijd, en dan zucht je toch.
JOOP: Ik zucht van bewondering. Kom, we lopen het begin nog één keer door.
MARIJKE: Goed. Maar als ik blijf haken, neem jij het over.
JOOP: Afgesproken. En daarna een stuk taart.
(De regisseur ANNEKE steekt haar hoofd om de deur.)
ANNEKE: Nog tien minuten, mensen! En Marijke, niet vergeten: rustig ademen.
MARIJKE: Rustig ademen. Tekst kennen. Niet over de bank struikelen.
ANNEKE: Precies. Dan komt het helemaal goed.
JOOP: Zie je wel? Zelfs Anneke heeft vertrouwen in je.
MARIJKE: Dan moet ik het zeker niet verpesten. Oké. Ik ben er klaar voor.
`

export function makeDemo(): Script {
  const parsed = parseScript(DEMO_TEXT)
  const chars = charactersFrom(parsed, DEMO_TEXT)
  const s = buildScript({ raw: DEMO_TEXT, title: 'Oefenscène: De generale', context: 'korte komische scène achter de schermen', myRole: 'MARIJKE', characters: chars, partSize: 4, parsed })
  return { ...s, id: 'demo', isDemo: true }
}
