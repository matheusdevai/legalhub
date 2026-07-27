import { useState, useEffect, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Eye, EyeOff, Check, AlertTriangle } from 'lucide-react'

export function ResetPassword() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [ready,    setReady]    = useState(false)

  const [password,  setPassword]  = useState('')
  const [password2, setPassword2] = useState('')
  const [showPwd,   setShowPwd]   = useState(false)
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [done,      setDone]      = useState(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
      setChecking(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault(); setError('')
    if (password.length < 6)  { setError('Senha deve ter mínimo 6 caracteres.'); return }
    if (password !== password2) { setError('As senhas não coincidem.'); return }
    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (err) { setError('Não foi possível alterar a senha. Solicite um novo link.'); return }
    setDone(true)
    setTimeout(() => navigate('/dashboard', { replace: true }), 1800)
  }

  const inputCls =
    'w-full px-4 py-3 text-sm border border-slate-200 rounded-xl bg-white ' +
    'text-slate-800 placeholder-slate-400 outline-none ' +
    'focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all'

  return (
    <div className="h-screen overflow-hidden" style={{ background: '#050b15' }}>
      <div className="h-screen w-full overflow-auto flex flex-col items-center justify-center bg-slate-50 px-5 py-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-xl overflow-hidden flex-shrink-0" style={{ width: 44, height: 44 }}>
            <img src="/logomarca.png" alt="LegalHub"
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '0% 50%' }} />
          </div>
          <span className="text-xl font-black text-slate-800">LegalHub</span>
        </div>

        <div className="w-full max-w-[380px] bg-white rounded-3xl px-8 py-8"
          style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.10)' }}>

          {checking ? (
            <div className="py-6 text-center">
              <span className="inline-block w-6 h-6 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : done ? (
            <div className="bg-green-50 border border-green-100 rounded-2xl p-5 text-center">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <Check className="w-5 h-5 text-green-600" />
              </div>
              <p className="font-semibold text-green-800 text-sm">Senha alterada!</p>
              <p className="text-xs text-green-700 mt-1">Redirecionando para o painel...</p>
            </div>
          ) : !ready ? (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 text-center">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <p className="font-semibold text-amber-800 text-sm">Link inválido ou expirado</p>
              <p className="text-xs text-amber-700 mt-1">Solicite um novo link de recuperação.</p>
              <button onClick={() => navigate('/login', { state: { mode: 'forgot' } })}
                className="mt-3 text-xs text-blue-500 font-semibold hover:underline">
                Voltar ao login
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-[26px] font-bold text-slate-900 leading-tight">Nova senha</h2>
                <p className="text-[13px] text-slate-500 mt-1.5">Escolha uma nova senha para sua conta.</p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 tracking-wide uppercase">Nova senha</label>
                  <div className="relative">
                    <input type={showPwd ? 'text' : 'password'} placeholder="Mínimo 6 caracteres" required
                      value={password} onChange={e => setPassword(e.target.value)}
                      className={inputCls + ' pr-11'} />
                    <button type="button" tabIndex={-1} onClick={() => setShowPwd(v => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 tracking-wide uppercase">Confirmar senha</label>
                  <input type={showPwd ? 'text' : 'password'} placeholder="Repita a senha" required
                    value={password2} onChange={e => setPassword2(e.target.value)}
                    className={inputCls} />
                </div>
                {error && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">{error}</p>
                )}
                <button type="submit" disabled={loading}
                  className="w-full flex items-center justify-between px-5 py-3.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-60"
                  style={{ background: '#0f172a', boxShadow: '0 4px 14px rgba(15,23,42,0.25)' }}>
                  <span>{loading ? 'Salvando...' : 'Salvar nova senha'}</span>
                  {loading
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <span className="text-base">→</span>}
                </button>
              </form>
            </>
          )}
        </div>
        <p className="text-[11px] text-slate-400 mt-5">© 2026 LegalHub · Todos os direitos reservados</p>
      </div>
    </div>
  )
}
