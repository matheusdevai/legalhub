import { useState, FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Eye, EyeOff, Mail, Check, Settings, ShieldCheck, X, Send, MessageCircle } from 'lucide-react'

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}
function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden>
      <rect x="1"  y="1"  width="10" height="10" fill="#f25022"/>
      <rect x="12" y="1"  width="10" height="10" fill="#7fba00"/>
      <rect x="1"  y="12" width="10" height="10" fill="#00a4ef"/>
      <rect x="12" y="12" width="10" height="10" fill="#ffb900"/>
    </svg>
  )
}

type Mode = 'login' | 'signup' | 'forgot'
type ChatStep = 'welcome' | 'form' | 'sent'

export function Login() {
  const { session, signIn } = useAuth()
  const location = useLocation()
  const [mode, setMode] = useState<Mode>((location.state as { mode?: Mode } | null)?.mode || 'login')

  const [chatOpen,    setChatOpen]    = useState(false)
  const [chatStep,    setChatStep]    = useState<ChatStep>('welcome')
  const [chatName,    setChatName]    = useState('')
  const [chatEmail,   setChatEmail]   = useState('')
  const [chatMsg,     setChatMsg]     = useState('')
  const [chatSending, setChatSending] = useState(false)

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  const [signupName,  setSignupName]  = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPwd,   setSignupPwd]   = useState('')
  const [signupPwd2,  setSignupPwd2]  = useState('')
  const [showPwd2,    setShowPwd2]    = useState(false)
  const [signupDone,  setSignupDone]  = useState(false)

  const [forgotEmail,   setForgotEmail]   = useState('')
  const [forgotDone,    setForgotDone]    = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)

  if (session) return <Navigate to="/dashboard" replace />

  async function handleLogin(e: FormEvent) {
    e.preventDefault(); setError(''); setLoading(true)
    const { error: err } = await signIn(email, password)
    if (err) setError('E-mail ou senha incorretos.')
    setLoading(false)
  }

  async function handleSignup(e: FormEvent) {
    e.preventDefault(); setError('')
    if (signupPwd !== signupPwd2) { setError('As senhas não coincidem.'); return }
    if (signupPwd.length < 6)     { setError('Senha deve ter mínimo 6 caracteres.'); return }
    setLoading(true)
    const { error: err } = await supabase.auth.signUp({
      email: signupEmail, password: signupPwd,
      options: { data: { name: signupName, display_name: signupName } },
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    setSignupDone(true)
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault(); setForgotLoading(true)
    await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: window.location.origin + '/reset-password',
    })
    setForgotLoading(false); setForgotDone(true)
  }

  async function loginWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/dashboard' },
    })
  }
  async function loginWithMicrosoft() {
    await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: { scopes: 'email profile openid', redirectTo: window.location.origin + '/dashboard' },
    })
  }

  function switchMode(m: Mode) {
    setMode(m); setError(''); setSignupDone(false); setForgotDone(false)
  }

  async function sendChat(e: FormEvent) {
    e.preventDefault()
    setChatSending(true)
    try {
      await supabase.from('support_tickets').insert({
        tenant_id: null,
        user_id: null,
        user_email: chatEmail,
        user_name: chatName,
        subject: chatMsg.slice(0, 120),
        status: 'open',
      })
    } catch {
      window.open(
        `mailto:contato@legalhub.com.br?subject=Contato via site&body=Nome: ${encodeURIComponent(chatName)}%0AEmail: ${encodeURIComponent(chatEmail)}%0AMensagem: ${encodeURIComponent(chatMsg)}`
      )
    }
    setChatSending(false)
    setChatStep('sent')
  }

  function openChat() {
    setChatOpen(true); setChatStep('welcome')
    setChatName(''); setChatEmail(''); setChatMsg('')
  }

  const inputCls =
    'w-full px-4 py-3 text-sm border border-slate-200 rounded-xl bg-white ' +
    'text-slate-800 placeholder-slate-400 outline-none ' +
    'focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all'

  // ── Conteúdo do formulário (chamado como função pura, nunca como <FormContent />) ─
  function FormContent() {
    return (
      <>
        {/* LOGIN */}
        {mode === 'login' && (
          <>
            <div className="mb-7">
              <h2 className="text-[26px] font-bold text-slate-900 leading-tight">
                Bem-vindo de volta
              </h2>
              <p className="text-[13px] text-slate-500 mt-1.5">Acesse sua conta para continuar</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 tracking-wide uppercase">
                  E-mail
                </label>
                <input type="email" placeholder="seu@email.com.br" required
                  value={email} onChange={e => setEmail(e.target.value)}
                  className={inputCls} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-600 tracking-wide uppercase">
                    Senha
                  </label>
                  <button type="button" onClick={() => switchMode('forgot')}
                    className="text-xs text-blue-500 hover:text-blue-600 font-medium">
                    Esqueceu sua senha?
                  </button>
                </div>
                <div className="relative">
                  <input type={showPwd ? 'text' : 'password'} placeholder="••••••••••••" required
                    value={password} onChange={e => setPassword(e.target.value)}
                    className={inputCls + ' pr-11'} />
                  <button type="button" tabIndex={-1} onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">{error}</p>
              )}

              <button type="submit" disabled={loading}
                className="w-full flex items-center justify-between px-5 py-3.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-60"
                style={{ background: '#0f172a', boxShadow: '0 4px 14px rgba(15,23,42,0.25)' }}>
                <span>{loading ? 'Entrando...' : 'Entrar'}</span>
                {loading
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <span className="text-base">→</span>}
              </button>
            </form>

            <div className="mt-4 space-y-2.5">
              <button onClick={loginWithGoogle}
                className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl text-[13px] text-slate-600 font-medium border border-slate-200 bg-white hover:bg-slate-50 active:scale-[0.98] transition-all">
                <ShieldCheck className="w-4 h-4 text-slate-400" />
                Entrar com autenticação segura
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={loginWithGoogle}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs text-slate-500 border border-slate-200 bg-white hover:bg-slate-50 transition-all">
                  <GoogleIcon /> Google
                </button>
                <button onClick={loginWithMicrosoft}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs text-slate-500 border border-slate-200 bg-white hover:bg-slate-50 transition-all">
                  <MicrosoftIcon /> Microsoft
                </button>
              </div>
            </div>

          </>
        )}

        {/* CRIAR CONTA */}
        {mode === 'signup' && (
          <>
            <div className="mb-5">
              <button onClick={() => switchMode('login')}
                className="text-xs text-slate-400 hover:text-slate-600 mb-3 flex items-center gap-1">
                ← Voltar
              </button>
              <h2 className="text-[26px] font-bold text-slate-900 leading-tight">
                Criar conta
              </h2>
              <p className="text-[13px] text-slate-500 mt-1.5">Comece a usar o LegalHub agora</p>
            </div>
            {signupDone ? (
              <div className="bg-green-50 border border-green-100 rounded-2xl p-5 text-center">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Check className="w-5 h-5 text-green-600" />
                </div>
                <p className="font-semibold text-green-800 text-sm">Conta criada!</p>
                <p className="text-xs text-green-700 mt-1">Verifique seu e-mail para confirmar.</p>
                <button onClick={() => switchMode('login')} className="mt-3 text-xs text-blue-500 font-semibold hover:underline">
                  Ir para o login
                </button>
              </div>
            ) : (
              <form onSubmit={handleSignup} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 tracking-wide uppercase">Nome completo</label>
                  <input type="text" placeholder="Dr. João Silva" required
                    value={signupName} onChange={e => setSignupName(e.target.value)}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 tracking-wide uppercase">E-mail</label>
                  <input type="email" placeholder="seu@email.com.br" required
                    value={signupEmail} onChange={e => setSignupEmail(e.target.value)}
                    className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 tracking-wide uppercase">Senha</label>
                  <div className="relative">
                    <input type={showPwd ? 'text' : 'password'} placeholder="Mínimo 6 caracteres" required
                      value={signupPwd} onChange={e => setSignupPwd(e.target.value)}
                      className={inputCls + ' pr-11'} />
                    <button type="button" tabIndex={-1} onClick={() => setShowPwd(v => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 tracking-wide uppercase">Confirmar senha</label>
                  <div className="relative">
                    <input type={showPwd2 ? 'text' : 'password'} placeholder="Repita a senha" required
                      value={signupPwd2} onChange={e => setSignupPwd2(e.target.value)}
                      className={inputCls + ' pr-11'} />
                    <button type="button" tabIndex={-1} onClick={() => setShowPwd2(v => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPwd2 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">{error}</p>}
                <button type="submit" disabled={loading}
                  className="w-full flex items-center justify-between px-5 py-3.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-60"
                  style={{ background: '#0f172a', boxShadow: '0 4px 14px rgba(15,23,42,0.25)' }}>
                  <span>{loading ? 'Criando...' : 'Criar minha conta'}</span>
                  {loading
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <span className="text-base">→</span>}
                </button>
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <button type="button" onClick={loginWithGoogle}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs text-slate-500 border border-slate-200 bg-white hover:bg-slate-50 transition-all">
                    <GoogleIcon /> Google
                  </button>
                  <button type="button" onClick={loginWithMicrosoft}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs text-slate-500 border border-slate-200 bg-white hover:bg-slate-50 transition-all">
                    <MicrosoftIcon /> Microsoft
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        {/* ESQUECI SENHA */}
        {mode === 'forgot' && (
          <>
            <div className="mb-5">
              <button onClick={() => switchMode('login')}
                className="text-xs text-slate-400 hover:text-slate-600 mb-3 flex items-center gap-1">
                ← Voltar
              </button>
              <h2 className="text-[26px] font-bold text-slate-900 leading-tight">
                Recuperar senha
              </h2>
              <p className="text-[13px] text-slate-500 mt-1.5">Enviaremos um link de redefinição.</p>
            </div>
            {forgotDone ? (
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 text-center">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Mail className="w-5 h-5 text-blue-500" />
                </div>
                <p className="font-semibold text-blue-800 text-sm">E-mail enviado!</p>
                <p className="text-xs text-blue-600 mt-1">Verifique sua caixa de entrada.</p>
                <button onClick={() => switchMode('login')} className="mt-3 text-xs text-blue-500 font-semibold hover:underline">Voltar ao login</button>
              </div>
            ) : (
              <form onSubmit={handleForgot} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 tracking-wide uppercase">E-mail cadastrado</label>
                  <input type="email" placeholder="seu@email.com.br" required
                    value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
                    className={inputCls} />
                </div>
                <button type="submit" disabled={forgotLoading}
                  className="w-full flex items-center justify-between px-5 py-3.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-60"
                  style={{ background: '#0f172a', boxShadow: '0 4px 14px rgba(15,23,42,0.25)' }}>
                  <span>{forgotLoading ? 'Enviando...' : 'Enviar link de recuperação'}</span>
                  {forgotLoading
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <span className="text-base">→</span>}
                </button>
              </form>
            )}
          </>
        )}
      </>
    )
  }

  return (
    <div className="h-screen overflow-hidden" style={{ background: '#050b15' }}>

      {/* ══ DESKTOP ══ */}
      <div className="hidden lg:block h-screen relative overflow-hidden">

        <img
          src="/login-bg.png"
          alt=""
          className="absolute inset-0 w-full h-full"
          style={{ objectFit: 'cover', objectPosition: 'left top' }}
          draggable={false}
        />

        <div
          className="absolute flex flex-col bg-white"
          style={{
            left: 'max(53.9vw, 80.9vh)',
            right: 'max(0.98vw, 1.46vh)',
            top: 'max(1.11vw, 1.66vh)',
            bottom: 'max(5.53vw, 8.3vh)',
            borderRadius: '20px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)',
            overflow: 'hidden',
          }}
        >
          {/* Ícone de configurações — canto superior direito */}
          <div className="absolute top-4 right-4 z-10">
            <Settings className="w-4 h-4 text-slate-300" />
          </div>

          {/* Área scrollável centralizada */}
          <div className="flex-1 overflow-y-auto px-10 pt-10 pb-2" style={{ minHeight: 0 }}>
            <div className="flex items-center justify-center min-h-full">
              <div style={{ width: '100%', maxWidth: '360px' }}>
                {FormContent()}
              </div>
            </div>
          </div>

          {/* Copyright colado no fundo */}
          <div className="flex-shrink-0 text-center py-3 border-t border-slate-100">
            <p className="text-[11px] text-slate-400">
              © 2026 LegalHub · Todos os direitos reservados
            </p>
          </div>
        </div>
      </div>

      {/* ══ MOBILE ══ */}
      <div className="lg:hidden h-screen overflow-auto flex flex-col items-center justify-center bg-slate-50 px-5 py-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-xl overflow-hidden flex-shrink-0" style={{ width: 44, height: 44 }}>
            <img src="/logomarca.png" alt="LegalHub"
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '0% 50%' }} />
          </div>
          <span className="text-xl font-black text-slate-800">LegalHub</span>
        </div>
        <div className="w-full max-w-[380px] bg-white rounded-3xl px-8 py-8"
          style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.10)' }}>
          {FormContent()}
        </div>
        <p className="text-[11px] text-slate-400 mt-5">© 2026 LegalHub · Todos os direitos reservados</p>
      </div>

      {/* ══ CHAT WIDGET (fixed, aparece em qualquer breakpoint) ══ */}
      {chatOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-4 sm:p-6 pointer-events-none">
          {/* Backdrop sutil */}
          <div
            className="absolute inset-0 pointer-events-auto"
            onClick={() => setChatOpen(false)}
            style={{ background: 'rgba(0,0,0,0.25)' }}
          />

          {/* Painel do chat */}
          <div
            className="relative pointer-events-auto flex flex-col w-full max-w-sm rounded-2xl overflow-hidden"
            style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.28)', maxHeight: '90vh' }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#0a1628,#1e3a8a)' }}>
              <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0">
                <img src="/logomarca.png" alt="LegalHub"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '0% 50%' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white leading-none">Equipe LegalHub</p>
                <p className="text-[11px] text-cyan-400 mt-0.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" />
                  Online agora
                </p>
              </div>
              <button onClick={() => setChatOpen(false)}
                className="text-white/50 hover:text-white transition-colors p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto bg-slate-50 px-4 py-5 space-y-4">

              {/* Bolha de boas-vindas */}
              <div className="flex gap-2.5">
                <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 mt-0.5"
                  style={{ background: '#0a1628' }}>
                  <img src="/logomarca.png" alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '0% 50%' }} />
                </div>
                <div className="bg-white rounded-2xl rounded-tl-none px-4 py-3 shadow-sm max-w-[85%]">
                  <p className="text-sm text-slate-700 leading-relaxed">
                    Olá! 👋 Ainda não tem uma conta?
                  </p>
                  <p className="text-sm text-slate-700 leading-relaxed mt-1">
                    Nossa equipe pode te ajudar a começar. Deixe seu contato e mensagem!
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1.5">Respondemos em até 1 dia útil</p>
                </div>
              </div>

              {chatStep === 'sent' && (
                <div className="flex justify-end">
                  <div className="bg-blue-600 text-white rounded-2xl rounded-tr-none px-4 py-3 shadow-sm max-w-[85%]">
                    <p className="text-sm leading-relaxed">Mensagem enviada! ✅</p>
                    <p className="text-xs text-blue-200 mt-1">Nossa equipe entrará em contato em breve.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Formulário de envio */}
            {chatStep !== 'sent' && (
              <form onSubmit={sendChat}
                className="flex-shrink-0 bg-white border-t border-slate-100 px-4 py-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text" placeholder="Seu nome" required
                    value={chatName} onChange={e => setChatName(e.target.value)}
                    className="px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all" />
                  <input
                    type="email" placeholder="Seu e-mail" required
                    value={chatEmail} onChange={e => setChatEmail(e.target.value)}
                    className="px-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all" />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text" placeholder="Como podemos ajudar?" required
                    value={chatMsg} onChange={e => setChatMsg(e.target.value)}
                    className="flex-1 px-3 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all" />
                  <button type="submit" disabled={chatSending}
                    className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-95 disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg,#1e3a8a,#2563eb)' }}>
                    {chatSending
                      ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <Send className="w-4 h-4 text-white" />}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Botão flutuante de chat (sempre visível) */}
      {!chatOpen && (
        <button
          onClick={openChat}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 px-4 py-3 rounded-2xl text-white text-sm font-semibold shadow-lg transition-all hover:scale-105 active:scale-95"
          style={{ background: 'linear-gradient(135deg,#0a1628,#1e3a8a)', boxShadow: '0 8px 24px rgba(30,58,138,0.45)' }}>
          <MessageCircle className="w-4 h-4" />
          Fale com nosso time
        </button>
      )}

    </div>
  )
}
