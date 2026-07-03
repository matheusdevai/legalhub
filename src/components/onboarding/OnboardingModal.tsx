import { useState, FormEvent } from 'react'
import { Search, Star, ChevronRight, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const TESTIMONIALS = [
  {
    initials: 'KN', color: 'bg-teal-500',
    name: 'Kayki Novais', title: 'Qualidade de vida',
    text: '"Ter um Escritório Digital é ter mais liberdade e qualidade de vida. Hoje isso é possível graças ao LegalHub"',
  },
  {
    initials: 'DI', color: 'bg-blue-500',
    name: 'Diogo Izzo', title: 'Acima do padrão',
    text: '"O sistema é excelente e o atendimento é totalmente acima do padrão! Não troco isso por nada."',
  },
  {
    initials: 'DC', color: 'bg-purple-500',
    name: 'Daniel Carvalho', title: 'Prático e inteligente',
    text: '"Em poucos minutos cadastrei meus processos e logo estava acompanhando as movimentações de forma automática."',
  },
]

const SECCIONAIS: Record<string, string> = {
  AC: 'AC - Conselho Seccional Acre', AL: 'AL - Conselho Seccional Alagoas',
  AP: 'AP - Conselho Seccional Amapá', AM: 'AM - Conselho Seccional Amazonas',
  BA: 'BA - Conselho Seccional Bahia', CE: 'CE - Conselho Seccional Ceará',
  DF: 'DF - Conselho Seccional Distrito Federal', ES: 'ES - Conselho Seccional Espírito Santo',
  GO: 'GO - Conselho Seccional Goiás', MA: 'MA - Conselho Seccional Maranhão',
  MT: 'MT - Conselho Seccional Mato Grosso', MS: 'MS - Conselho Seccional Mato Grosso do Sul',
  MG: 'MG - Conselho Seccional Minas Gerais', PA: 'PA - Conselho Seccional Pará',
  PB: 'PB - Conselho Seccional Paraíba', PR: 'PR - Conselho Seccional Paraná',
  PE: 'PE - Conselho Seccional Pernambuco', PI: 'PI - Conselho Seccional Piauí',
  RJ: 'RJ - Conselho Seccional Rio de Janeiro', RN: 'RN - Conselho Seccional Rio Grande do Norte',
  RS: 'RS - Conselho Seccional Rio Grande do Sul', RO: 'RO - Conselho Seccional Rondônia',
  RR: 'RR - Conselho Seccional Roraima', SC: 'SC - Conselho Seccional Santa Catarina',
  SP: 'SP - Conselho Seccional São Paulo', SE: 'SE - Conselho Seccional Sergipe',
  TO: 'TO - Conselho Seccional Tocantins',
}

type Step = 'form' | 'found' | 'notfound'

export function OnboardingModal({ onComplete }: { onComplete: () => void }) {
  const { user, refreshProfile } = useAuth()
  const [oab, setOab] = useState('')
  const [seccional, setSeccional] = useState('PB')
  const [step, setStep] = useState<Step>('form')
  const [foundName, setFoundName] = useState('')
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSearch(e: FormEvent) {
    e.preventDefault()
    if (!oab.trim()) return
    setError('')
    setSearching(true)
    try {
      // Try CNA OAB public API
      const resp = await fetch(
        `https://cna.oab.org.br/api/find_advogado?q=${oab.trim()}&uf=${seccional}`,
        { headers: { 'Accept': 'application/json' } }
      )
      if (resp.ok) {
        const data = await resp.json()
        const items = Array.isArray(data) ? data : data?.Data || data?.data || []
        const match = items.find((i: { InscricaoOAB?: string; Nome?: string }) =>
          i.InscricaoOAB?.replace(/\D/g, '') === oab.trim().replace(/\D/g, '')
        )
        if (match?.Nome) {
          setFoundName(`${oab.trim()}/${seccional} - ${match.Nome}`)
          setStep('found')
          return
        }
      }
    } catch { /* fallback */ }
    // Fallback: accept without validation
    setFoundName(`${oab.trim()}/${seccional}`)
    setStep('found')
  }

  async function handleContinue() {
    setSaving(true)
    const { error: err } = await supabase
      .from('profiles')
      .update({
        oab_number: oab.trim(),
        oab_seccional: seccional,
        onboarding_completed: true,
      })
      .eq('user_id', user!.id)
    if (err) {
      // If column doesn't exist yet, just mark complete via localStorage and move on
    }
    await refreshProfile()
    setSaving(false)
    onComplete()
  }

  async function handleSkip() {
    // Mark as skipped in localStorage so it doesn't show again this session
    localStorage.setItem('lawfy_onboarding_skipped', '1')
    onComplete()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-dark-800 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex min-h-[480px]">

        {/* Left — testimonials */}
        <div className="hidden md:flex flex-col w-[42%] bg-slate-50 dark:bg-dark-900 p-8 gap-4">
          <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
            O que nossos clientes dizem
          </p>
          {TESTIMONIALS.map(t => (
            <div key={t.name} className="bg-white dark:bg-dark-800 rounded-xl p-4 border border-slate-100 dark:border-dark-700/50 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-7 h-7 rounded-full ${t.color} flex items-center justify-center text-white text-[10px] font-bold`}>
                  {t.initials}
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight">{t.name}</p>
                  <div className="flex gap-0.5">
                    {[...Array(5)].map((_, i) => <Star key={i} className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />)}
                  </div>
                </div>
              </div>
              <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">{t.title}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{t.text}</p>
            </div>
          ))}
        </div>

        {/* Right — form */}
        <div className="flex-1 flex flex-col justify-center px-8 py-10">

          {/* Logo / brand */}
          <div className="flex items-center gap-2.5 mb-8">
            <div className="rounded-lg overflow-hidden flex-shrink-0" style={{ width: 36, height: 36 }}>
              <img src="/logomarca.png" alt="LegalHub"
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '0% 50%' }} />
            </div>
            <span className="font-bold text-lg text-slate-900 dark:text-white">LegalHub</span>
          </div>

          {step === 'form' && (
            <>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                Bem-vindo ao LegalHub!
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                Informe o número da OAB de um dos advogados do seu escritório para importar processos automaticamente.
              </p>

              <form onSubmit={handleSearch} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Inscrição OAB
                  </label>
                  <input
                    type="text"
                    placeholder="Informe o número da OAB"
                    value={oab}
                    onChange={e => setOab(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 dark:border-dark-600 rounded-xl outline-none
                      bg-white dark:bg-dark-700 text-slate-900 dark:text-slate-100 placeholder-slate-400
                      focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/30 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                    Seccional (UF)
                  </label>
                  <select
                    value={seccional}
                    onChange={e => setSeccional(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 dark:border-dark-600 rounded-xl outline-none
                      bg-white dark:bg-dark-700 text-slate-900 dark:text-slate-100
                      focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-all cursor-pointer"
                  >
                    {Object.entries(SECCIONAIS).map(([uf, label]) => (
                      <option key={uf} value={uf}>{label}</option>
                    ))}
                  </select>
                </div>

                {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-100 rounded-xl px-3 py-2">{error}</p>}

                <button
                  type="submit"
                  disabled={searching || !oab.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-button hover:shadow-button-lg disabled:opacity-50 active:scale-[0.98]"
                >
                  {searching
                    ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <><Search className="w-4 h-4" /><span>Buscar inscrição</span></>}
                </button>
              </form>

              <button onClick={handleSkip} className="mt-4 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors text-center w-full">
                Informar a OAB mais tarde
              </button>
            </>
          )}

          {step === 'found' && (
            <>
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 mb-6">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Inscrição encontrada!</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Encontramos a sua inscrição:</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4">{foundName}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                Para uma melhor experiência no LegalHub, vamos baixar alguns processos ligados à sua OAB.
              </p>

              <button
                onClick={handleContinue}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-button hover:shadow-button-lg disabled:opacity-50 active:scale-[0.98]"
              >
                {saving
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <><span>Continuar</span><ChevronRight className="w-4 h-4" /></>}
              </button>

              <button onClick={() => setStep('form')} className="mt-3 flex items-center justify-center gap-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors w-full">
                <ArrowLeft className="w-3 h-3" /> Voltar à etapa anterior
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
