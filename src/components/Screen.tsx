import { motion } from 'framer-motion'
import { useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from './Icon'

export function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLElement>(null)
  return (
    <motion.main
      className={`screen ${className}`}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
      // A leftover transform would turn position:fixed children (control bars) into page-relative ones
      onAnimationComplete={() => {
        if (ref.current && ref.current.isConnected) ref.current.style.transform = 'none'
      }}
      ref={ref}
    >
      {children}
    </motion.main>
  )
}

export function TopBar({ title, back = true, right, onBack }: { title?: ReactNode; back?: boolean | string; right?: ReactNode; onBack?: () => void }) {
  const nav = useNavigate()
  return (
    <header className="topbar">
      {back && (
        <button className="icon-btn" aria-label="Terug" onClick={() => (onBack ? onBack() : typeof back === 'string' ? nav(back) : nav(-1))}>
          <Icon name="back" />
        </button>
      )}
      <div className="title">{title}</div>
      {right}
    </header>
  )
}

export function Avatar({ name, color, size = 40, speaking = false }: { name: string; color: string; size?: number; speaking?: boolean }) {
  return (
    <motion.div
      className="avatar"
      style={{ background: color, width: size, height: size, fontSize: size * 0.42 }}
      animate={speaking ? { scale: [1, 1.08, 1], boxShadow: [`0 0 0 0 ${color}66`, `0 0 0 10px ${color}00`] } : { scale: 1 }}
      transition={speaking ? { repeat: Infinity, duration: 1.1 } : {}}
    >
      {name.slice(0, 1).toUpperCase()}
    </motion.div>
  )
}

export function ProgressRing({ value, size = 56, stroke = 6, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--bg-sunk)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--accent)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - Math.max(0, Math.min(1, value))) }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: size * 0.26 }}>{children}</div>
    </div>
  )
}
