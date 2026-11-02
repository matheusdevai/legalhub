import { useState, FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { Eye, EyeOff, Mail, Check, ShieldCheck, X, Send, MessageCircle, Lock, ArrowLeft, ArrowRight, Scale, CalendarClock } from 'lucide-react'

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
  const [signupOffice, setSignupOffice] = useState('')
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
    if (signupPwd.length < 8)     { setError('Senha deve ter no mínimo 8 caracteres.'); return }
    setLoading(true)
    const { error: err } = await supabase.auth.signUp({
      email: signupEmail, password: signupPwd,
      // office_name: handle_new_user() cria o escritório com esse nome e
      // abre o teste grátis de 14 dias no plano Pro.
      options: {
        data: { name: signupName, display_name: signupName, office_name: signupOffice.trim() },
        emailRedirectTo: window.location.origin + '/dashboard',
      },
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    setSignupDone(true)
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault(); setError(''); setForgotLoading(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: window.location.origin + '/reset-password',
    })
    setForgotLoading(false)
    if (err) { setError('Não foi possível enviar o e-mail. Verifique o endereço e tente novamente.'); return }
    setForgotDone(true)
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
      const { error } = await supabase.from('support_tickets').insert({
        tenant_id: null,
        user_id: null,
        user_email: chatEmail,
        user_name: chatName,
        subject: chatMsg.slice(0, 120),
        status: 'open',
      })
      if (error) throw error
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

  // Mesma família visual da landing: tinta quase preta, um único azul de destaque
  // (#1677FF) usado com parcimônia, sem brilhos desfocados.
  const inputCls =
    'w-full h-11 px-3.5 text-[15px] border border-slate-300 rounded-[10px] bg-white ' +
    'text-slate-900 placeholder-slate-400 outline-none ' +
    'focus:border-[#1677FF] focus:ring-4 focus:ring-[#1677FF]/10 transition-[border-color,box-shadow]'
  const labelCls = 'block text-[13px] font-medium text-slate-700 mb-1.5'
  const primaryBtnCls =
    'w-full h-11 flex items-center justify-center gap-2 rounded-[10px] text-[15px] font-semibold text-white ' +
    'bg-[#0b1220] hover:bg-black transition-colors active:scale-[0.99] disabled:opacity-60'
  const socialBtnCls =
    'flex items-center justify-center gap-2 h-11 rounded-[10px] text-[14px] font-medium text-slate-700 ' +
    'border border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400 transition-colors'
  const linkCls = 'text-[13px] font-medium text-[#1677FF] hover:text-[#0958d9]'
  const errorBox = (msg: string) => (
    <p role="alert" className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-[10px] px-3.5 py-2.5">{msg}</p>
  )
  const spinner = <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />

  function Divider() {
    return (
      <div className="flex items-center gap-3 my-5" aria-hidden>
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-[12px] text-slate-400">ou continue com</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>
    )
  }

  function SocialButtons() {
    return (
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={loginWithGoogle} className={socialBtnCls}><GoogleIcon /> Google</button>
        <button type="button" onClick={loginWithMicrosoft} className={socialBtnCls}><MicrosoftIcon /> Microsoft</button>
      </div>
    )
  }

  function BackButton() {
    return (
      <button type="button" onClick={() => switchMode('login')}
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-900 transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao login
      </button>
    )
  }

  function Heading({ title, subtitle }: { title: string; subtitle: string }) {
    return (
      <div className="mb-7">
        <h2 className="text-[28px] font-bold tracking-[-0.03em] text-slate-950 leading-tight">{title}</h2>
        <p className="text-[15px] text-slate-500 mt-1.5">{subtitle}</p>
      </div>
    )
  }

  function PasswordInput({ id, value, onChange, placeholder, shown, onToggle, autoComplete }: {
    id: string; value: string; onChange: (v: string) => void; placeholder: string; shown: boolean; onToggle: () => void; autoComplete: string
  }) {
    return (
      <div className="relative">
        <input id={id} type={shown ? 'text' : 'password'} placeholder={placeholder} required autoComplete={autoComplete}
          value={value} onChange={e => onChange(e.target.value)} className={inputCls + ' pr-11'} />
        <button type="button" tabIndex={-1} onClick={onToggle} aria-label={shown ? 'Ocultar senha' : 'Mostrar senha'}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700">
          {shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    )
  }

  // ── Conteúdo do formulário (chamado como função pura, nunca como <FormContent />) ─
  function FormContent() {
    return (
      <>
        {/* LOGIN */}
        {mode === 'login' && (
          <>
            <Heading title="Bem-vindo de volta" subtitle="Entre para acessar o seu escritório." />

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label htmlFor="login-email" className={labelCls}>E-mail</label>
                <input id="login-email" type="email" placeholder="voce@escritorio.com.br" required autoComplete="email"
                  value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="login-password" className="text-[13px] font-medium text-slate-700">Senha</label>
                  <button type="button" onClick={() => switchMode('forgot')} className={linkCls}>
                    Esqueceu a senha?
                  </button>
                </div>
                <div>
                  {PasswordInput({ id: 'login-password', value: password, onChange: setPassword, placeholder: 'Sua senha', shown: showPwd, onToggle: () => setShowPwd(v => !v), autoComplete: 'current-password' })}
                </div>
              </div>

              {error && errorBox(error)}

              <button type="submit" disabled={loading} className={primaryBtnCls}>
                {loading ? <>{spinner} Entrando…</> : <>Entrar <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>

            {Divider()}
            {SocialButtons()}

            <p className="mt-8 text-center text-[14px] text-slate-500">
              Ainda não tem conta?{' '}
              <button type="button" onClick={() => switchMode('signup')} className="font-semibold text-slate-900 hover:text-[#1677FF]">
                Teste grátis por 14 dias
              </button>
            </p>
          </>
        )}

        {/* CRIAR CONTA */}
        {mode === 'signup' && (
          <>
            {BackButton()}
            <Heading title="Criar conta" subtitle="14 dias grátis no plano Pro, sem cartão de crédito." />
            {signupDone ? (
              <div className="border border-emerald-200 bg-emerald-50 rounded-2xl p-6 text-center">
                <div className="w-11 h-11 bg-white border border-emerald-200 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Check className="w-5 h-5 text-emerald-600" />
                </div>
                <p className="font-semibold text-slate-900 text-[15px]">Conta criada</p>
                <p className="text-[14px] text-slate-600 mt-1">Enviamos um link de confirmação para o seu e-mail.</p>
                <button onClick={() => switchMode('login')} className={'mt-4 ' + linkCls}>Ir para o login</button>
              </div>
            ) : (
              <form onSubmit={handleSignup} className="space-y-4">
                <div>
                  <label htmlFor="su-name" className={labelCls}>Nome completo</label>
                  <input id="su-name" type="text" placeholder="Dra. Ana Souza" required autoComplete="name"
                    value={signupName} onChange={e => setSignupName(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label htmlFor="su-office" className={labelCls}>Nome do escritório</label>
                  <input id="su-office" type="text" placeholder="Souza & Associados Advocacia" autoComplete="organization"
                    value={signupOffice} onChange={e => setSignupOffice(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label htmlFor="su-email" className={labelCls}>E-mail</label>
                  <input id="su-email" type="email" placeholder="voce@escritorio.com.br" required autoComplete="email"
                    value={signupEmail} onChange={e => setSignupEmail(e.target.value)} className={inputCls} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="su-pwd" className={labelCls}>Senha</label>
                    {PasswordInput({ id: 'su-pwd', value: signupPwd, onChange: setSignupPwd, placeholder: 'Mínimo 8 caracteres', shown: showPwd, onToggle: () => setShowPwd(v => !v), autoComplete: 'new-password' })}
                  </div>
                  <div>
                    <label htmlFor="su-pwd2" className={labelCls}>Confirmar senha</label>
                    {PasswordInput({ id: 'su-pwd2', value: signupPwd2, onChange: setSignupPwd2, placeholder: 'Repita a senha', shown: showPwd2, onToggle: () => setShowPwd2(v => !v), autoComplete: 'new-password' })}
                  </div>
                </div>
                {error && errorBox(error)}
                <button type="submit" disabled={loading} className={primaryBtnCls}>
                  {loading ? <>{spinner} Criando…</> : <>Criar minha conta <ArrowRight className="w-4 h-4" /></>}
                </button>
                <p className="text-[12px] text-slate-500 text-center leading-relaxed">
                  Ao criar sua conta, você concorda com os{' '}
                  <a href="/termos" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-slate-900">Termos de Uso</a> e a{' '}
                  <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-slate-900">Política de Privacidade</a>.
                </p>
                {Divider()}
                {SocialButtons()}
              </form>
            )}
          </>
        )}

        {/* ESQUECI SENHA */}
        {mode === 'forgot' && (
          <>
            {BackButton()}
            <Heading title="Recuperar senha" subtitle="Enviaremos um link para você criar uma nova senha." />
            {forgotDone ? (
              <div className="border border-slate-200 bg-slate-50 rounded-2xl p-6 text-center">
                <div className="w-11 h-11 bg-white border border-slate-200 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Mail className="w-5 h-5 text-[#1677FF]" />
                </div>
                <p className="font-semibold text-slate-900 text-[15px]">E-mail enviado</p>
                <p className="text-[14px] text-slate-600 mt-1">Confira sua caixa de entrada e o spam.</p>
                <button onClick={() => switchMode('login')} className={'mt-4 ' + linkCls}>Voltar ao login</button>
              </div>
            ) : (
              <form onSubmit={handleForgot} className="space-y-4">
                <div>
                  <label htmlFor="fg-email" className={labelCls}>E-mail cadastrado</label>
                  <input id="fg-email" type="email" placeholder="voce@escritorio.com.br" required autoComplete="email"
                    value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} className={inputCls} />
                </div>
                {error && errorBox(error)}
                <button type="submit" disabled={forgotLoading} className={primaryBtnCls}>
                  {forgotLoading ? <>{spinner} Enviando…</> : 'Enviar link de recuperação'}
                </button>
              </form>
            )}
          </>
        )}
      </>
    )
  }

  const year = new Date().getFullYear()

  return (
    <div className="font-display min-h-screen bg-white text-slate-900 antialiased">
      <div className="min-h-screen flex">

        {/* ══ Painel de marca (desktop) ══ */}
        <aside className="hidden lg:flex relative w-[44%] xl:w-[42%] flex-shrink-0 flex-col justify-between overflow-hidden bg-[#05070c] text-white px-12 xl:px-16 py-12">
          {/* filete de luz no topo — único detalhe de cor, nítido */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#1677FF]/70 to-transparent" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,#0b111c_0%,#05070c_55%)]" />

          <a href="/" className="relative flex items-center gap-2.5 w-fit" aria-label="LegalHub, página inicial">
            <span className="rounded-[10px] overflow-hidden flex-shrink-0 ring-1 ring-white/10" style={{ width: 36, height: 36 }}>
              <img src="/logomarca.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '0% 50%' }} />
            </span>
            <span className="font-bold text-[19px] tracking-[-0.02em]">LegalHub</span>
          </a>

          <div className="relative max-w-md">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#8fb8ff]">Gestão jurídica</p>
            <h1 className="mt-4 text-[40px] xl:text-[46px] font-bold leading-[1.04] tracking-[-0.045em]" style={{ textWrap: 'balance' } as React.CSSProperties}>
              O escritório inteiro em um só lugar.
            </h1>
            <p className="mt-5 text-[17px] leading-relaxed text-[#a1a1a6]">
              Processos, prazos, clientes e financeiro organizados — com as intimações chegando sozinhas.
            </p>

            <ul className="mt-10 space-y-4">
              {[
                { icon: Scale, title: 'Intimações do DJEN no painel', text: 'Processos judiciais sincronizados pela OAB.' },
                { icon: CalendarClock, title: 'Agenda, tarefas e financeiro juntos', text: 'Prazos e audiências viram tarefa e evento sozinhos.' },
                { icon: ShieldCheck, title: 'Dados isolados por escritório', text: 'Permissões por função e conexão criptografada.' },
              ].map(item => (
                <li key={item.title} className="flex gap-3.5">
                  <span className="mt-0.5 w-9 h-9 rounded-[10px] flex items-center justify-center bg-white/[0.06] ring-1 ring-white/10 flex-shrink-0">
                    <item.icon className="w-[18px] h-[18px] text-white/90" />
                  </span>
                  <span>
                    <span className="block text-[15px] font-semibold text-[#f5f5f7]">{item.title}</span>
                    <span className="block text-[14px] text-[#86868b] mt-0.5">{item.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative flex items-center gap-2 text-[13px] text-[#86868b]">
            <Lock className="w-3.5 h-3.5 flex-shrink-0" />
            Conexão criptografada (HTTPS) · dados isolados por escritório
          </div>
        </aside>

        {/* ══ Formulário ══ */}
        <main className="flex-1 flex flex-col min-w-0">
          <div className="lg:hidden flex items-center justify-between px-5 pt-6">
            <a href="/" className="flex items-center gap-2.5" aria-label="LegalHub, página inicial">
              <span className="rounded-[10px] overflow-hidden flex-shrink-0 bg-[#0b1220]" style={{ width: 34, height: 34 }}>
                <img src="/logomarca.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '0% 50%' }} />
              </span>
              <span className="font-bold text-[18px] tracking-[-0.02em]">LegalHub</span>
            </a>
          </div>

          <div className="flex-1 flex items-center justify-center px-5 sm:px-10 py-10">
            <div className="w-full max-w-[380px]">
              {FormContent()}
            </div>
          </div>

          <footer className="px-5 pt-5 pb-20 lg:pb-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[12px] text-slate-400">
            <span>© {year} LegalHub</span>
            <a href="/termos" className="hover:text-slate-700">Termos</a>
            <a href="/privacidade" className="hover:text-slate-700">Privacidade</a>
          </footer>
        </main>
      </div>

      {/* ══ CHAT WIDGET (fixed, aparece em qualquer breakpoint) ══ */}
      {chatOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-4 sm:p-6 pointer-events-none">
          <div className="absolute inset-0 pointer-events-auto bg-black/25" onClick={() => setChatOpen(false)} />

          <div
            className="relative pointer-events-auto flex flex-col w-full max-w-sm rounded-2xl overflow-hidden bg-white ring-1 ring-black/5"
            style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.24)', maxHeight: '90vh' }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0 bg-[#0b1220]">
              <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0">
                <img src="/logomarca.png" alt="LegalHub"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '0% 50%' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white leading-none">Equipe LegalHub</p>
                <p className="text-[12px] text-white/60 mt-1">Respondemos em até 1 dia útil</p>
              </div>
              <button onClick={() => setChatOpen(false)} aria-label="Fechar"
                className="text-white/50 hover:text-white transition-colors p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto bg-slate-50 px-4 py-5 space-y-4">
              <div className="flex gap-2.5">
                <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 mt-0.5 bg-[#0b1220]">
                  <img src="/logomarca.png" alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '0% 50%' }} />
                </div>
                <div className="bg-white rounded-2xl rounded-tl-none px-4 py-3 ring-1 ring-slate-200/70 max-w-[85%]">
                  <p className="text-sm text-slate-700 leading-relaxed">Olá! Ainda não tem uma conta?</p>
                  <p className="text-sm text-slate-700 leading-relaxed mt-1">
                    Nossa equipe pode te ajudar a começar. Deixe seu contato e mensagem.
                  </p>
                </div>
              </div>

              {chatStep === 'sent' && (
                <div className="flex justify-end">
                  <div className="bg-[#0b1220] text-white rounded-2xl rounded-tr-none px-4 py-3 max-w-[85%]">
                    <p className="text-sm leading-relaxed">Mensagem enviada.</p>
                    <p className="text-xs text-white/70 mt-1">Nossa equipe entrará em contato em breve.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Formulário de envio */}
            {chatStep !== 'sent' && (
              <form onSubmit={sendChat}
                className="flex-shrink-0 bg-white border-t border-slate-100 px-4 py-4 space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text" placeholder="Seu nome" required
                    value={chatName} onChange={e => setChatName(e.target.value)}
                    className="h-10 px-3 text-sm border border-slate-300 rounded-[10px] outline-none focus:border-[#1677FF] focus:ring-4 focus:ring-[#1677FF]/10 transition-[border-color,box-shadow]" />
                  <input
                    type="email" placeholder="Seu e-mail" required
                    value={chatEmail} onChange={e => setChatEmail(e.target.value)}
                    className="h-10 px-3 text-sm border border-slate-300 rounded-[10px] outline-none focus:border-[#1677FF] focus:ring-4 focus:ring-[#1677FF]/10 transition-[border-color,box-shadow]" />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text" placeholder="Como podemos ajudar?" required
                    value={chatMsg} onChange={e => setChatMsg(e.target.value)}
                    className="flex-1 h-10 px-3 text-sm border border-slate-300 rounded-[10px] outline-none focus:border-[#1677FF] focus:ring-4 focus:ring-[#1677FF]/10 transition-[border-color,box-shadow]" />
                  <button type="submit" disabled={chatSending} aria-label="Enviar"
                    className="flex-shrink-0 w-10 h-10 rounded-[10px] flex items-center justify-center bg-[#0b1220] hover:bg-black transition-colors disabled:opacity-60">
                    {chatSending ? spinner : <Send className="w-4 h-4 text-white" />}
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
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 h-11 px-4 rounded-full text-[14px] font-medium text-slate-800 bg-white ring-1 ring-slate-200 hover:ring-slate-300 transition-shadow"
          style={{ boxShadow: '0 8px 24px rgba(15,23,42,0.12)' }}>
          <MessageCircle className="w-4 h-4" />
          Fale com nosso time
        </button>
      )}

    </div>
  )
}
