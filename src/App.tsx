import { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { LandingPage } from '@/pages/landing/LandingPage'
import { Login } from '@/pages/auth/Login'
import { ResetPassword } from '@/pages/auth/ResetPassword'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { PageLoadingProvider } from '@/contexts/PageLoadingContext'
import { OnboardingModal } from '@/components/onboarding/OnboardingModal'

const Dashboard        = lazy(() => import('@/pages/dashboard/Dashboard').then(m => ({ default: m.Dashboard })))
const ClientsPage      = lazy(() => import('@/pages/clients/ClientsPage').then(m => ({ default: m.ClientsPage })))
const ProcessesPage    = lazy(() => import('@/pages/processes/ProcessesPage').then(m => ({ default: m.ProcessesPage })))
const TasksPage        = lazy(() => import('@/pages/tasks/TasksPage').then(m => ({ default: m.TasksPage })))
const FinancialsPage   = lazy(() => import('@/pages/financials/FinancialsPage').then(m => ({ default: m.FinancialsPage })))
const CalendarPage     = lazy(() => import('@/pages/calendar/CalendarPage').then(m => ({ default: m.CalendarPage })))
const CollaboratorsPage = lazy(() => import('@/pages/collaborators/CollaboratorsPage').then(m => ({ default: m.CollaboratorsPage })))
const LeadsPage        = lazy(() => import('@/pages/leads/LeadsPage').then(m => ({ default: m.LeadsPage })))
const SettingsPage     = lazy(() => import('@/pages/settings/SettingsPage').then(m => ({ default: m.SettingsPage })))
const AdminPage        = lazy(() => import('@/pages/admin/AdminPage').then(m => ({ default: m.AdminPage })))
const SupportPage      = lazy(() => import('@/pages/support/SupportPage').then(m => ({ default: m.SupportPage })))
const ReportsPage      = lazy(() => import('@/pages/reports/ReportsPage').then(m => ({ default: m.ReportsPage })))
const UsersPage        = lazy(() => import('@/pages/users/UsersPage').then(m => ({ default: m.UsersPage })))
const DocumentsPage    = lazy(() => import('@/pages/documents/DocumentsPage').then(m => ({ default: m.DocumentsPage })))
const PublicacoesPage  = lazy(() => import('@/pages/publicacoes/PublicacoesPage').then(m => ({ default: m.PublicacoesPage })))

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, profile, refreshProfile } = useAuth()
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    if (!session || loading || !profile) return
    const skipped = localStorage.getItem('lawfy_onboarding_skipped')
    if (!skipped && !profile.onboarding_completed && !profile.oab_number) {
      setShowOnboarding(true)
    }
  }, [session, loading, profile])

  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/login" replace />
  return (
    <Suspense fallback={<LoadingScreen />}>
      {children}
      {showOnboarding && (
        <OnboardingModal onComplete={async () => { await refreshProfile(); setShowOnboarding(false) }} />
      )}
    </Suspense>
  )
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth()
  return profile?.role === 'super_admin' ? <>{children}</> : <Navigate to="/dashboard" replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/" element={<LandingPage />} />
      <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/clientes" element={<PrivateRoute><ClientsPage /></PrivateRoute>} />
      <Route path="/processos" element={<PrivateRoute><ProcessesPage /></PrivateRoute>} />
      <Route path="/tarefas" element={<PrivateRoute><TasksPage /></PrivateRoute>} />
      <Route path="/financeiro" element={<PrivateRoute><FinancialsPage /></PrivateRoute>} />
      <Route path="/agenda" element={<PrivateRoute><CalendarPage /></PrivateRoute>} />
      <Route path="/colaboradores" element={<PrivateRoute><CollaboratorsPage /></PrivateRoute>} />
      <Route path="/leads" element={<PrivateRoute><LeadsPage /></PrivateRoute>} />
      <Route path="/configuracoes" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
      <Route path="/suporte" element={<PrivateRoute><SupportPage /></PrivateRoute>} />
      <Route path="/relatorios" element={<PrivateRoute><ReportsPage /></PrivateRoute>} />
      <Route path="/usuarios" element={<PrivateRoute><UsersPage /></PrivateRoute>} />
      <Route path="/documentos" element={<PrivateRoute><DocumentsPage /></PrivateRoute>} />
      <Route path="/publicacoes" element={<PrivateRoute><PublicacoesPage /></PrivateRoute>} />
      <Route path="/admin" element={<PrivateRoute><AdminRoute><AdminPage /></AdminRoute></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <PageLoadingProvider>
            <AppRoutes />
          </PageLoadingProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
