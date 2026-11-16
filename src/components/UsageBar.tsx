import { useUsage } from '../lib/usage'

/** How much of today's free Google voice quota we have used (our own count) */
export default function UsageBar({ compact = false }: { compact?: boolean }) {
  const u = useUsage()
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
