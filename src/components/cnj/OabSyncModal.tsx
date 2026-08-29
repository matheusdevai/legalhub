import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Scale, ChevronRight, CheckCircle2, RotateCcw, X } from 'lucide-react'
import { Modal, Button, Input, Select } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

const ESTADOS_BR = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO',
  'MA','MG','MS','MT','PA','PB','PE','PI','PR',
  'RJ','RN','RO','RR','RS','SC','SE','SP','TO',
]

// Mapeia seccional (UF) → código do TJ no DataJud (API pública do CNJ)
const UF_TO_TJ: Record<string, string> = {
  AC: 'tjac', AL: 'tjal', AM: 'tjam', AP: 'tjap', BA: 'tjba', CE: 'tjce',
  DF: 'tjdft', ES: 'tjes', GO: 'tjgo', MA: 'tjma', MG: 'tjmg', MS: 'tjms',
  MT: 'tjmt', PA: 'tjpa', PB: 'tjpb', PE: 'tjpe', PI: 'tjpi', PR: 'tjpr',
  RJ: 'tjrj', RN: 'tjrn', RO: 'tjro', RR: 'tjrr', RS: 'tjrs', SC: 'tjsc',
  SE: 'tjse', SP: 'tjsp', TO: 'tjto',
}

// Troca o TJ da seccional anterior pelo novo na lista de tribunais marcados,
// em vez de só acumular — evita que o tribunal do estado antigo continue
// sendo consultado silenciosamente depois que o usuário troca a UF da OAB.
export function swapSeccionalTribunal(current: string[], prevUf: string, nextUf: string): string[] {
  const prevTj = UF_TO_TJ[prevUf]
  const nextTj = UF_TO_TJ[nextUf]
  let next = prevTj && prevTj !== nextTj ? current.filter(t => t !== prevTj) : current
  if (nextTj && !next.includes(nextTj)) next = [nextTj, ...next]
  return next
}

const TRFS_CNJ = [
  { code: 'trf1', label: 'TRF1' },
  { code: 'trf2', label: 'TRF2' },
  { code: 'trf3', label: 'TRF3' },
  { code: 'trf4', label: 'TRF4' },
  { code: 'trf5', label: 'TRF5' },
  { code: 'trf6', label: 'TRF6' },
]

type Step = 'config' | 'syncing' | 'result'

interface SyncResult {
  total: number
  imported: number
  updated: number
  errors: string[]
  oab: string
  jusbrasil: { total: number; imported: number; updated: number; first_sync_note?: string | null } | null
  escavador: { total: number; imported: number; updated: number } | null
  cnj: { total: number; imported: number; updated: number } | null
  pje: { total: number; imported: number; updated: number } | null
}

interface Props { onDone: () => void }

export function OabSyncModal({ onDone }: Props) {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('config')
  const [oabNumber, setOabNumber] = useState(profile?.oab_number || '')
  const [oabSeccional, setOabSeccional] = useState(profile?.oab_seccional || '')
  const [error, setError] = useState<string | null>(null)
  const [savingOab, setSavingOab] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [tribunais, setTribunais] = useState<string[]>(
    profile?.oab_tribunais?.length ? profile.oab_tribunais :
    profile?.oab_seccional ? [UF_TO_TJ[profile.oab_seccional]] : []
  )
  const [showMaisTribunais, setShowMaisTribunais] = useState(false)
  const [showPje, setShowPje] = useState(false)
  const [pjeCpf, setPjeCpf] = useState('')
  const [pjeSenha, setPjeSenha] = useState('')

  function toggleTribunal(code: string) {
    setTribunais(prev => prev.includes(code) ? prev.filter(t => t !== code) : [...prev, code])
  }

  async function startSync() {
    if (!oabNumber.trim() || !oabSeccional) {
      setError('Informe o número da OAB e a seccional.')
      return
    }
    setError(null)

    // Persiste OAB e tribunais marcados no perfil se mudou — os tribunais também
    // são lidos pelo cron noturno de sincronização automática (mesma seleção do usuário aqui).
    const tribunaisChanged = JSON.stringify(tribunais) !== JSON.stringify(profile?.oab_tribunais || [])
    const changed = oabNumber.trim() !== profile?.oab_number || oabSeccional !== profile?.oab_seccional || tribunaisChanged
    if (changed) {
      setSavingOab(true)
      await supabase.from('profiles')
        .update({ oab_number: oabNumber.trim(), oab_seccional: oabSeccional, oab_tribunais: tribunais })
        .eq('user_id', profile!.user_id)
      await refreshProfile()
      setSavingOab(false)
    }

    setStep('syncing')

    const body = { oab_number: oabNumber.trim(), oab_seccional: oabSeccional.toUpperCase() }
    const cnjBody = { ...body, tribunais }
    const pjeBody = { cpf: pjeCpf.replace(/\D/g, ''), senha: pjeSenha, tribunais }
    const usePje = showPje && pjeCpf.trim() && pjeSenha.trim() && tribunais.length > 0
    setPjeSenha('') // não retém a senha do PJe em memória após o disparo

    const [jbSettled, escSettled, cnjSettled, pjeSettled] = await Promise.allSettled([
      supabase.functions.invoke('sync-jusbrasil', { body }).catch((e: any) => ({
        data: { error: e?.message || 'Erro JusBrasil', total: 0, imported: 0, updated: 0, errors: [] },
        error: null,
      })),
      supabase.functions.invoke('sync-escavador', { body }).catch((e: any) => ({
        data: { error: e?.message || 'Erro Escavador', total: 0, imported: 0, updated: 0, errors: [] },
        error: null,
      })),
      tribunais.length > 0
        ? supabase.functions.invoke('sync-cnj', { body: cnjBody }).catch((e: any) => ({
            data: { error: e?.message || 'Erro CNJ', total: 0, imported: 0, updated: 0, errors: [] },
            error: null,
          }))
        : Promise.resolve({ data: null, error: null }),
      usePje
        ? supabase.functions.invoke('sync-pje', { body: pjeBody }).catch((e: any) => ({
            data: { error: e?.message || 'Erro PJe', total: 0, imported: 0, updated: 0, errors: [] },
            error: null,
          }))
        : Promise.resolve({ data: null, error: null }),
    ])

    const allErrors: string[] = []

    let jbData: any = null
    if (jbSettled.status === 'fulfilled') {
      const d = (jbSettled.value as any)?.data
      if (d?.error) allErrors.push(`JusBrasil: ${d.error}`)
      else if (d) {
        jbData = d
        if (Array.isArray(d.errors)) allErrors.push(...d.errors.map((e: string) => `JusBrasil: ${e}`))
      }
    }

    let escData: any = null
    if (escSettled.status === 'fulfilled') {
      const d = (escSettled.value as any)?.data
      if (d?.error) allErrors.push(`Escavador: ${d.error}`)
      else if (d) {
        escData = d
        if (Array.isArray(d.errors)) allErrors.push(...d.errors.map((e: string) => `Escavador: ${e}`))
      }
    }

    let cnjData: any = null
    if (cnjSettled.status === 'fulfilled') {
      const d = (cnjSettled.value as any)?.data
      if (d?.error) allErrors.push(`CNJ: ${d.error}`)
      else if (d) {
        cnjData = d
        if (Array.isArray(d.errors)) allErrors.push(...d.errors.map((e: string) => `CNJ: ${e}`))
      }
    }

    let pjeData: any = null
    if (pjeSettled.status === 'fulfilled') {
      const d = (pjeSettled.value as any)?.data
      if (d?.error) allErrors.push(`PJe: ${d.error}`)
      else if (d) {
        pjeData = d
        if (Array.isArray(d.errors)) allErrors.push(...d.errors.map((e: string) => `PJe: ${e}`))
      }
    }

    setResult({
      total: (jbData?.total || 0) + (escData?.total || 0) + (cnjData?.total || 0) + (pjeData?.total || 0),
      imported: (jbData?.imported || 0) + (escData?.imported || 0) + (cnjData?.imported || 0) + (pjeData?.imported || 0),
      updated: (jbData?.updated || 0) + (escData?.updated || 0) + (cnjData?.updated || 0) + (pjeData?.updated || 0),
      errors: allErrors,
      oab: jbData?.oab || escData?.oab || cnjData?.oab || `${oabNumber}/${oabSeccional}`,
      jusbrasil: jbData ? { total: jbData.total, imported: jbData.imported, updated: jbData.updated, first_sync_note: jbData.first_sync_note } : null,
      escavador: escData ? { total: escData.total, imported: escData.imported, updated: escData.updated } : null,
      cnj: cnjData ? { total: cnjData.total, imported: cnjData.imported, updated: cnjData.updated } : null,
      pje: pjeData ? { total: pjeData.total, imported: pjeData.imported, updated: pjeData.updated } : null,
    })
    setStep('result')
  }

  const stepIndex = { config: 0, syncing: 1, result: 2 }[step]

  return (
    <Modal open onClose={onDone} title="" size="md">
      {/* Gradient header */}
      <div className="-mx-6 -mt-6 px-6 pt-5 pb-4 mb-5 bg-gradient-to-r from-primary-700 to-primary-500 rounded-t-2xl">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Scale className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                Sincronizar processos via OAB
              </h2>
              <p className="text-xs text-primary-100 mt-0.5">
                {step === 'config' && 'JusBrasil + Escavador + CNJ — busca automática por OAB'}
                {step === 'syncing' && 'Buscando processos no JusBrasil, Escavador e CNJ…'}
                {step === 'result' && 'Sincronização concluída'}
              </p>
            </div>
          </div>
          <button onClick={onDone} className="text-primary-200 hover:text-white transition-colors mt-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1.5">
          {[
            { key: 'config', label: 'OAB' },
            { key: 'syncing', label: 'Sincronizar' },
          ].map((s, i) => {
            const done = stepIndex > i
            const active = stepIndex === i
            return (
              <div key={s.key} className="flex items-center gap-1.5">
                <div className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-all flex-shrink-0',
                  active ? 'bg-white text-primary-700' :
                  done  ? 'bg-primary-400 text-white' : 'bg-primary-600/60 text-primary-200',
                )}>
                  {done ? '✓' : i + 1}
                </div>
                <span className={cn('text-[10px] font-medium',
                  active ? 'text-white' : done ? 'text-primary-200' : 'text-primary-300',
                )}>{s.label}</span>
                {i < 1 && <div className="w-6 h-px bg-primary-500/60 mx-0.5" />}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Step 1: OAB ── */}
      {step === 'config' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Informe sua OAB para importar automaticamente seus processos via{' '}
            <strong className="text-gray-700 dark:text-gray-200">JusBrasil</strong>,{' '}
            <strong className="text-gray-700 dark:text-gray-200">Escavador</strong> e{' '}
            <strong className="text-gray-700 dark:text-gray-200">CNJ (DataJud)</strong>.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Número da OAB *"
              value={oabNumber}
              onChange={e => setOabNumber(e.target.value.replace(/\D/g, ''))}
              placeholder="Ex: 123456"
            />
            <Select
              label="Seccional (UF) *"
              value={oabSeccional}
              onChange={e => {
                const uf = e.target.value
                setTribunais(prev => swapSeccionalTribunal(prev, oabSeccional, uf))
                setOabSeccional(uf)
              }}
            >
              <option value="">Selecione</option>
              {ESTADOS_BR.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </Select>
          </div>

          <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
            <div className="flex gap-2 flex-wrap">
              {['JusBrasil', 'Escavador', 'CNJ'].map(src => (
                <span key={src} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white dark:bg-dark-700 border border-blue-200 dark:border-blue-700 text-xs font-medium text-blue-700 dark:text-blue-300 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {src}
                </span>
              ))}
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400 flex-1">
              Busca em paralelo nas três plataformas
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
              Tribunais para busca no CNJ (DataJud)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {oabSeccional && UF_TO_TJ[oabSeccional] && (
                <button
                  type="button"
                  onClick={() => toggleTribunal(UF_TO_TJ[oabSeccional])}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                    tribunais.includes(UF_TO_TJ[oabSeccional])
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white dark:bg-dark-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-dark-600',
                  )}
                >
                  TJ{oabSeccional}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowMaisTribunais(v => !v)}
                className="px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-gray-300 dark:border-dark-600 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {showMaisTribunais ? 'Ocultar tribunais federais' : '+ Tribunais federais (TRF)'}
              </button>
            </div>
            {showMaisTribunais && (
              <div className="flex flex-wrap gap-1.5">
                {TRFS_CNJ.map(trf => (
                  <button
                    key={trf.code}
                    type="button"
                    onClick={() => toggleTribunal(trf.code)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                      tribunais.includes(trf.code)
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'bg-white dark:bg-dark-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-dark-600',
                    )}
                  >
                    {trf.label}
                  </button>
                ))}
              </div>
            )}
            {tribunais.length === 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Nenhum tribunal selecionado — a busca no CNJ será pulada (JusBrasil e Escavador continuam ativos).
              </p>
            )}
          </div>

          <div className="border border-gray-100 dark:border-dark-700 rounded-xl">
            <button
              type="button"
              onClick={() => setShowPje(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400"
            >
              <span>+ Sincronizar também via PJe (opcional)</span>
              <span className="text-gray-300 dark:text-gray-600">{showPje ? '−' : '+'}</span>
            </button>
            {showPje && (
              <div className="px-3 pb-3 space-y-2">
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  Usa seu login do PJe (CPF e senha) para consultar avisos pendentes nos tribunais selecionados acima. As credenciais não são armazenadas — usadas apenas nesta consulta.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="CPF (PJe)"
                    value={pjeCpf}
                    onChange={e => setPjeCpf(e.target.value.replace(/\D/g, ''))}
                    placeholder="Somente números"
                  />
                  <Input
                    label="Senha (PJe)"
                    type="password"
                    value={pjeSenha}
                    onChange={e => setPjeSenha(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

          <div className="flex items-center justify-between pt-1">
            <button onClick={onDone} className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
              Pular por agora
            </button>
            <Button variant="primary" onClick={startSync} loading={savingOab}>
              Sincronizar agora <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2: Sincronizando ── */}
      {step === 'syncing' && (
        <div className="flex flex-col items-center justify-center py-10 space-y-5">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-primary-100 dark:border-primary-900/30" />
            <div className="absolute inset-0 rounded-full border-4 border-primary-600 border-t-transparent animate-spin" />
            <Scale className="absolute inset-0 m-auto w-6 h-6 text-primary-600" />
          </div>
          <div className="text-center space-y-1">
            <p className="font-semibold text-gray-900 dark:text-white">
              Buscando no JusBrasil, Escavador e CNJ
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              OAB {oabNumber}/{oabSeccional}
            </p>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center max-w-xs">
            Isso pode levar alguns segundos. Não feche esta janela.
          </p>
        </div>
      )}

      {/* ── Step 3: Resultado ── */}
      {step === 'result' && result && (
        <div className="space-y-4">
          {result.jusbrasil?.first_sync_note && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                <span className="font-semibold">JusBrasil: </span>{result.jusbrasil.first_sync_note}
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <div>
              <p className="font-semibold text-emerald-800 dark:text-emerald-300">Sincronização concluída!</p>
              <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-0.5">OAB {result.oab}</p>
            </div>
          </div>

          {/* Stats totais */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Processos encontrados', value: result.total, color: 'text-primary-600 dark:text-primary-400', bg: 'bg-primary-50 dark:bg-primary-900/20' },
              { label: 'Novos importados', value: result.imported, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
              { label: 'Atualizados', value: result.updated, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
            ].map(s => (
              <div key={s.label} className={cn('text-center p-3 rounded-xl', s.bg)}>
                <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-tight">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Breakdown por fonte */}
          {(result.jusbrasil || result.escavador || result.cnj || result.pje) && (
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'JusBrasil', data: result.jusbrasil },
                { label: 'Escavador', data: result.escavador },
                { label: 'CNJ', data: result.cnj },
                { label: 'PJe', data: result.pje },
              ].map(({ label, data }) => (
                <div key={label} className="p-3 rounded-xl border border-gray-100 dark:border-dark-700 bg-gray-50/50 dark:bg-dark-800/50">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary-500" />
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</span>
                  </div>
                  {data ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {data.total} encontrados · {data.imported} novos · {data.updated} atualizados
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                      {label === 'CNJ' ? 'Nenhum tribunal selecionado'
                        : label === 'PJe' ? 'Não utilizado nesta busca'
                        : 'Token não configurado'}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {result.errors.length > 0 && (
            <details className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
              <summary className="cursor-pointer text-xs font-semibold text-amber-700 dark:text-amber-400 select-none">
                ⚠ {result.errors.length} aviso{result.errors.length !== 1 ? 's' : ''} (clique para ver)
              </summary>
              <ul className="mt-2 space-y-0.5">
                {result.errors.map((e, i) => (
                  <li key={i} className="text-[11px] text-amber-700 dark:text-amber-500 font-mono">{e}</li>
                ))}
              </ul>
            </details>
          )}

          {result.total === 0 && !result.jusbrasil?.first_sync_note && (
            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-4 space-y-2">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                Nenhum processo encontrado para OAB {result.oab}
              </p>
              <ul className="text-xs text-amber-700 dark:text-amber-400 list-disc list-inside space-y-0.5">
                <li>Verifique se o número e a seccional estão corretos</li>
                <li>Confirme que os tokens de API estão configurados no Supabase</li>
                <li>Processos muito antigos podem não estar indexados — cadastre manualmente</li>
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-dark-700">
            <button
              onClick={() => { setStep('config'); setResult(null) }}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Sincronizar novamente
            </button>
            <div className="flex gap-2">
              {result.total > 0 && (
                <Button variant="ghost" size="sm" onClick={() => { onDone(); navigate('/publicacoes') }}>
                  Ver intimações
                </Button>
              )}
              <Button variant="primary" onClick={() => { onDone(); navigate('/processos') }}>
                Ver processos
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
