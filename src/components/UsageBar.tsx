import { useApp } from '../state'
import { useUsage } from '../lib/usage'

const eur = (v: number) => (v < 0.01 && v > 0 ? '< € 0,01' : v.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' }))

/** Free key: share of today's free quota used (our own count). Paid key: estimated cost. */
export default function UsageBar({ compact = false }: { compact?: boolean }) {
  const u = useUsage()
  const { settings } = useApp()

  if (settings.keyPlan === 'paid')
    return (
      <div className="stack" style={{ gap: 6 }}>
        <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontWeight: 600 }}>Kosten stemmen vandaag</span>
          <span className="muted small">≈ {eur(u.costEur)}</span>
        </div>
        {!compact && (
          <span className="muted small">
            {u.used} zinnen ingesproken, deze sessie ≈ {eur(u.sessionCostEur)}. Een schatting op basis van Google's prijslijst; de echte rekening staat in Google AI Studio. Al ingesproken zinnen kosten niets meer.
          </span>
        )}
      </div>
    )

  const pct = Math.min(100, (u.used / u.limit) * 100)
  const color = u.hitLimit || pct >= 90 ? 'var(--warn)' : pct >= 70 ? 'var(--accent-2)' : 'var(--good)'
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontWeight: 600 }}>Gratis stemmen vandaag</span>
        <span className="muted small">
          {u.used} / {u.estimated ? '±' : ''}
          {u.limit} zinnen
        </span>
      </div>
      <div className="bar" role="progressbar" aria-valuenow={u.used} aria-valuemax={u.limit} aria-label="Gebruik gratis stemmen vandaag">
        <div style={{ width: `${pct}%`, background: color }} />
      </div>
      {!compact && (
        <span className="muted small">
          {u.hitLimit
            ? `Daglimiet bereikt. Om ${u.resetAt} vult Google het weer aan.`
            : `Deze sessie: ${u.session}. Wordt om ${u.resetAt} weer aangevuld.`}
          {u.estimated && !u.hitLimit ? ' Het limiet is een schatting; de app leert het echte limiet zodra Google het meldt.' : ''}
          {' '}Al ingesproken zinnen kosten niets meer.
        </span>
      )}
    </div>
  )
}
