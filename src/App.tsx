import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { LandingPage } from '@/pages/landing/LandingPage'
import { Login } from '@/pages/auth/Login'
import { Dashboard } from '@/pages/dashboard/Dashboard'
import { ClientsPage } from '@/pages/clients/ClientsPage'
import { ProcessesPage } from '@/pages/processes/ProcessesPage'
import { TasksPage } from '@/pages/tasks/TasksPage'
import { FinancialsPage } from '@/pages/financials/FinancialsPage'
import { CalendarPage } from '@/pages/calendar/CalendarPage'
import { CollaboratorsPage } from '@/pages/collaborators/CollaboratorsPage'
import { SettingsPage } from '@/pages/settings/SettingsPage'
import { AdminPage } from '@/pages/admin/AdminPage'
import { SupportPage } from '@/pages/support/SupportPage'
import { ReportsPage } from '@/pages/reports/ReportsPage'
import { UsersPage } from '@/pages/users/UsersPage'
import { DocumentsPage } from '@/pages/documents/DocumentsPage'
import { PublicacoesPage } from '@/pages/publicacoes/PublicacoesPage'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { PageLoadingProvider } from '@/contexts/PageLoadingContext'
import { OnboardingModal } from '@/components/onboarding/OnboardingModal'

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
    <>
      {children}
      {showOnboarding && (
        <OnboardingModal onComplete={async () => { await refreshProfile(); setShowOnboarding(false) }} />
      )}
    </>
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
      <Route path="/" element={<LandingPage />} />
      <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/clientes" element={<PrivateRoute><ClientsPage /></PrivateRoute>} />
      <Route path="/processos" element={<PrivateRoute><ProcessesPage /></PrivateRoute>} />
      <Route path="/tarefas" element={<PrivateRoute><TasksPage /></PrivateRoute>} />
      <Route path="/financeiro" element={<PrivateRoute><FinancialsPage /></PrivateRoute>} />
      <Route path="/agenda" element={<PrivateRoute><CalendarPage /></PrivateRoute>} />
      <Route path="/colaboradores" element={<PrivateRoute><CollaboratorsPage /></PrivateRoute>} />
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
