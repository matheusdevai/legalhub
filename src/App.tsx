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
import { ConfirmDialogHost } from '@/components/ui/ConfirmDialog'
import { ToastHost } from '@/components/ui/Toast'
import { FirstAccessScreen } from '@/components/auth/FirstAccessScreen'

// Uma função de carga por tela: usada pelo lazy() e pelo pré-carregamento
// (prefetchPages) — o Vite reaproveita o mesmo arquivo, então baixar antes
// deixa a troca de tela instantânea.
const pages = {
  PrivacyPolicyPage: () => import('@/pages/legal/PrivacyPolicyPage'),
  TermsPage: () => import('@/pages/legal/TermsPage'),
  PrazosPage: () => import('@/pages/prazos/PrazosPage'),
  Dashboard: () => import('@/pages/dashboard/Dashboard'),
  ClientsPage: () => import('@/pages/clients/ClientsPage'),
  ProcessesPage: () => import('@/pages/processes/ProcessesPage'),
  TasksPage: () => import('@/pages/tasks/TasksPage'),
  FinancialsPage: () => import('@/pages/financials/FinancialsPage'),
  CalendarPage: () => import('@/pages/calendar/CalendarPage'),
  CollaboratorsPage: () => import('@/pages/collaborators/CollaboratorsPage'),
  LeadsPage: () => import('@/pages/leads/LeadsPage'),
  SettingsPage: () => import('@/pages/settings/SettingsPage'),
  AdminPage: () => import('@/pages/admin/AdminPage'),
  SupportPage: () => import('@/pages/support/SupportPage'),
  ReportsPage: () => import('@/pages/reports/ReportsPage'),
  UsersPage: () => import('@/pages/users/UsersPage'),
  DocumentsPage: () => import('@/pages/documents/DocumentsPage'),
  EscritorioDigitalPage: () => import('@/pages/escritorioDigital/EscritorioDigitalPage'),
  PublicacoesPage: () => import('@/pages/publicacoes/PublicacoesPage'),
  AiJuridicaPage: () => import('@/pages/aiJuridica/AiJuridicaPage'),
  AssistantPage: () => import('@/pages/assistant/AssistantPage'),
  ClientPortalPage: () => import('@/pages/portal/ClientPortalPage'),
}

/** Depois do login, baixa o código de todas as telas no tempo ocioso do navegador. */
let pagesPrefetched = false
function prefetchPages() {
  if (pagesPrefetched) return
  pagesPrefetched = true
  const run = () => { for (const load of Object.values(pages)) load().catch(() => {}) }
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 4000 })
  else setTimeout(run, 1500)
}

const PrivacyPolicyPage = lazy(() => pages.PrivacyPolicyPage().then(m => ({ default: m.PrivacyPolicyPage })))
const TermsPage = lazy(() => pages.TermsPage().then(m => ({ default: m.TermsPage })))
const PrazosPage = lazy(() => pages.PrazosPage().then(m => ({ default: m.PrazosPage })))
const Dashboard = lazy(() => pages.Dashboard().then(m => ({ default: m.Dashboard })))
const ClientsPage = lazy(() => pages.ClientsPage().then(m => ({ default: m.ClientsPage })))
const ProcessesPage = lazy(() => pages.ProcessesPage().then(m => ({ default: m.ProcessesPage })))
const TasksPage = lazy(() => pages.TasksPage().then(m => ({ default: m.TasksPage })))
const FinancialsPage = lazy(() => pages.FinancialsPage().then(m => ({ default: m.FinancialsPage })))
const CalendarPage = lazy(() => pages.CalendarPage().then(m => ({ default: m.CalendarPage })))
const CollaboratorsPage = lazy(() => pages.CollaboratorsPage().then(m => ({ default: m.CollaboratorsPage })))
const LeadsPage = lazy(() => pages.LeadsPage().then(m => ({ default: m.LeadsPage })))
const SettingsPage = lazy(() => pages.SettingsPage().then(m => ({ default: m.SettingsPage })))
const AdminPage = lazy(() => pages.AdminPage().then(m => ({ default: m.AdminPage })))
const SupportPage = lazy(() => pages.SupportPage().then(m => ({ default: m.SupportPage })))
const ReportsPage = lazy(() => pages.ReportsPage().then(m => ({ default: m.ReportsPage })))
const UsersPage = lazy(() => pages.UsersPage().then(m => ({ default: m.UsersPage })))
const DocumentsPage = lazy(() => pages.DocumentsPage().then(m => ({ default: m.DocumentsPage })))
const EscritorioDigitalPage = lazy(() => pages.EscritorioDigitalPage().then(m => ({ default: m.EscritorioDigitalPage })))
const PublicacoesPage = lazy(() => pages.PublicacoesPage().then(m => ({ default: m.PublicacoesPage })))
const AiJuridicaPage = lazy(() => pages.AiJuridicaPage().then(m => ({ default: m.AiJuridicaPage })))
const AssistantPage = lazy(() => pages.AssistantPage().then(m => ({ default: m.AssistantPage })))
const ClientPortalPage = lazy(() => pages.ClientPortalPage().then(m => ({ default: m.ClientPortalPage })))

// Rotas de equipe (escritório) — nunca acessíveis a um login de cliente (role 'client'),
// que fica restrito ao Portal do Cliente em /portal.
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, profile, refreshProfile } = useAuth()
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    if (session && !loading) prefetchPages()
  }, [session, loading])

  useEffect(() => {
    if (!session || loading || !profile) return
    const skipped = localStorage.getItem('lawfy_onboarding_skipped')
    if (!skipped && !profile.onboarding_completed && !profile.oab_number && !profile.must_change_password) {
      setShowOnboarding(true)
    }
  }, [session, loading, profile])

  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/login" replace />
  if (profile?.role === 'client') return <Navigate to="/portal" replace />
  // Conta criada com senha temporária: nada do app antes de trocar a senha
  if (profile?.must_change_password) return <FirstAccessScreen />
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

function ClientPortalRoute({ children }: { children: React.ReactNode }) {
  const { session, loading, profile } = useAuth()
  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/login" replace />
  if (profile?.role !== 'client') return <Navigate to="/dashboard" replace />
  if (profile.must_change_password) return <FirstAccessScreen />
  return <Suspense fallback={<LoadingScreen />}>{children}</Suspense>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/" element={<LandingPage />} />
      <Route path="/privacidade" element={<Suspense fallback={<LoadingScreen />}><PrivacyPolicyPage /></Suspense>} />
      <Route path="/termos" element={<Suspense fallback={<LoadingScreen />}><TermsPage /></Suspense>} />
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
      <Route path="/escritorio-digital" element={<PrivateRoute><EscritorioDigitalPage /></PrivateRoute>} />
      <Route path="/publicacoes" element={<PrivateRoute><PublicacoesPage /></PrivateRoute>} />
      <Route path="/prazos" element={<PrivateRoute><PrazosPage /></PrivateRoute>} />
      <Route path="/ia-juridica" element={<PrivateRoute><AiJuridicaPage /></PrivateRoute>} />
      {/* Assistente IA (/assistente-ia): rota desativada temporariamente a pedido do usuário
          (2026-09-16), para reconfigurar/reativar depois. Código de AssistantPage e da Edge
          Function ai-assistant-chat continuam intactos — para reativar, só descomentar a linha
          abaixo (e o item de menu em Sidebar.tsx). Sem a rota, "*" (catch-all) já redireciona
          /assistente-ia para /dashboard.
      <Route path="/assistente-ia" element={<PrivateRoute><AssistantPage /></PrivateRoute>} /> */}
      <Route path="/admin" element={<PrivateRoute><AdminRoute><AdminPage /></AdminRoute></PrivateRoute>} />
      <Route path="/portal" element={<ClientPortalRoute><ClientPortalPage /></ClientPortalRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    // v7_startTransition: a troca de tela vira uma transição do React — a tela
    // atual continua visível (com a barra lateral) enquanto a próxima carrega,
    // em vez de cair no fallback do Suspense (logomarca em tela cheia).
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ThemeProvider>
        <AuthProvider>
          <PageLoadingProvider>
            <AppRoutes />
            <ConfirmDialogHost />
            <ToastHost />
          </PageLoadingProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
