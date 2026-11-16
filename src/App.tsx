import { AnimatePresence } from 'framer-motion'
import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useApp } from './state'
import Home from './screens/Home'

const Onboarding = lazy(() => import('./screens/Onboarding'))
const NewScript = lazy(() => import('./screens/NewScript'))
const Library = lazy(() => import('./screens/Library'))
const ScriptPage = lazy(() => import('./screens/ScriptPage'))
const Practice = lazy(() => import('./screens/Practice'))
const Results = lazy(() => import('./screens/Results'))
const SettingsScreen = lazy(() => import('./screens/Settings'))
const KeyHelp = lazy(() => import('./screens/KeyHelp'))

export default function App() {
  const location = useLocation()
  const { settings } = useApp()
  if (!settings.onboarded && location.pathname === '/') return <Navigate to="/welkom" replace />
  return (
    <Suspense fallback={<div className="screen" />}>
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Home />} />
          <Route path="/welkom" element={<Onboarding />} />
          <Route path="/nieuw" element={<NewScript />} />
          <Route path="/scripts" element={<Library />} />
          <Route path="/script/:id" element={<ScriptPage />} />
          <Route path="/script/:id/oefen/:partId" element={<Practice />} />
          <Route path="/script/:id/resultaat/:partId" element={<Results />} />
          <Route path="/instellingen" element={<SettingsScreen />} />
          <Route path="/sleutel" element={<KeyHelp />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </Suspense>
  )
}
