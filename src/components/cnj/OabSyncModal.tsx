import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Scale, ChevronRight, CheckCircle2, RotateCcw, X, Plus, Trash2, AlertTriangle, Info } from 'lucide-react'
import { Modal, Button, Input, Select } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { cn, formatDate } from '@/lib/utils'
import { normalizeInscricoes, UFS } from '@/lib/oabSync'
import {
  lastSyncRun, syncCnjComplement, syncEscavador, syncJusbrasil, syncPje,
  type PjeSyncResult, type SourceResult, type SyncRunRow,
} from '@/lib/oabSyncClient'

// Sincronização de processos pela OAB.
//
// Fonte principal: DJEN (Comunica PJe, API pública do CNJ) — filtra pela
// inscrição (número + UF da OAB) e traz comunicações de QUALQUER tribunal do
// país. Por isso a lista de "inscrições suplementares": quem advoga em outro
// estado com outra inscrição só recebe esses processos consultando-a também.
// O DataJud (CNJ) não permite busca por OAB (o índice público não tem partes);
// ele só completa classe/órgão/andamentos dos processos já encontrados.

type Step = 'config' | 'syncing' | 'result'
interface Row { numero: string; uf: string }

interface SyncResult {
  pje: PjeSyncResult
  escavador: SourceResult | null
  jusbrasil: SourceResult | null
}

interface Props { onDone: () => void }

const isTokenMissing = (r: SourceResult | null) => !!r?.error && /nao configurad|não configurad/i.test(r.error)

export function OabSyncModal({ onDone }: Props) {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('config')
  const [oabNumber, setOabNumber] = useState(profile?.oab_number || '')
  const [oabSeccional, setOabSeccional] = useState(profile?.oab_seccional || '')
  const [extras, setExtras] = useState<Row[]>(() => (profile?.oab_inscricoes || []).map(i => ({ numero: i.numero, uf: i.uf })))
  const [error, setError] = useState<string | null>(null)
  const [savingOab, setSavingOab] = useState(false)
  const [result, setResult] = useState<SyncResult | null>(null)
  const [lastRun, setLastRun] = useState<SyncRunRow | null>(null)

  useEffect(() => {
    if (profile?.user_id) lastSyncRun(profile.user_id).then(setLastRun)
  }, [profile?.user_id, step])

  function updateExtra(i: number, patch: Partial<Row>) {
    setExtras(prev => prev.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  }

  async function startSync() {
    if (!oabNumber.trim() || !oabSeccional) {
      setError('Informe o número da OAB e a seccional da inscrição principal.')
      return
    }
    const incomplete = extras.some(r => (r.numero.trim() && !r.uf) || (!r.numero.trim() && r.uf))
    if (incomplete) { setError('Complete número e UF de cada inscrição suplementar (ou remova a linha).'); return }
    setError(null)

    const suplementares = normalizeInscricoes(null, extras)
      .filter(i => !(i.numero === oabNumber.replace(/\D/g, '').replace(/^0+/, '') && i.uf === oabSeccional))

    // A Edge Function usa as inscrições GRAVADAS no perfil (não as do navegador),
    // então salva antes de sincronizar.
    setSavingOab(true)
    const { error: saveErr } = await supabase.from('profiles')
      .update({ oab_number: oabNumber.trim(), oab_seccional: oabSeccional, oab_inscricoes: suplementares })
      .eq('user_id', profile!.user_id)
    setSavingOab(false)
    if (saveErr) { setError(`Não foi possível salvar a OAB: ${saveErr.message}`); return }
    await refreshProfile()

    setStep('syncing')
    // DJEN primeiro (sozinho): é a fonte que cria/atualiza a maioria dos
    // processos — rodar as outras ao mesmo tempo podia gravar o mesmo processo duas vezes.
    const pje = await syncPje('manual')
    const [esc, jus] = await Promise.all([syncEscavador(), syncJusbrasil()])
    // DataJud em segundo plano: só completa dados e pode levar mais de 1 minuto.
    void syncCnjComplement()

    setResult({ pje, escavador: esc, jusbrasil: jus })
    setStep('result')
  }

  const stepIndex = { config: 0, syncing: 1, result: 2 }[step]
  const inscricoesLabel = [`${oabNumber || '—'}/${oabSeccional || '—'}`, ...extras.filter(e => e.numero && e.uf).map(e => `${e.numero}/${e.uf}`)].join(', ')

  const pje = result?.pje
  const paid = [
    { label: 'Escavador', data: result?.escavador ?? null },
    { label: 'JusBrasil', data: result?.jusbrasil ?? null },
  ]
  const totals = {
    total: (pje?.total || 0) + paid.reduce((s, p) => s + (p.data && !p.data.error ? p.data.total || 0 : 0), 0),
    imported: (pje?.imported || 0) + paid.reduce((s, p) => s + (p.data && !p.data.error ? p.data.imported || 0 : 0), 0),
    updated: (pje?.updated || 0) + paid.reduce((s, p) => s + (p.data && !p.data.error ? p.data.updated || 0 : 0), 0),
  }
  const pjeErrors = [...(pje?.error ? [pje.error] : []), ...(pje?.errors || [])]

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
                {step === 'config' && 'Todos os tribunais do país que publicam no DJEN — gratuito'}
                {step === 'syncing' && 'Buscando suas intimações no DJEN (todos os tribunais)…'}
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
            Importamos seus processos pelas intimações publicadas no{' '}
            <strong className="text-gray-700 dark:text-gray-200">DJEN</strong> (Diário de Justiça Eletrônico Nacional,
            do CNJ), de <strong className="text-gray-700 dark:text-gray-200">qualquer tribunal do país</strong> —
            estaduais, federais e do trabalho. Se houver token configurado, JusBrasil e Escavador também são consultados.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Número da OAB (principal) *"
              value={oabNumber}
              onChange={e => setOabNumber(e.target.value.replace(/\D/g, ''))}
              placeholder="Ex: 123456"
            />
            <Select label="Seccional (UF) *" value={oabSeccional} onChange={e => setOabSeccional(e.target.value)}>
              <option value="">Selecione</option>
              {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                Inscrições suplementares (advoga em outros estados?)
              </p>
              <button
                type="button"
                onClick={() => setExtras(prev => [...prev, { numero: '', uf: '' }])}
                disabled={extras.length >= 10}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar inscrição
              </button>
            </div>
            {extras.length === 0 && (
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                O DJEN busca pela inscrição (número + UF), não pelo tribunal. Processos em que você atua com outra
                inscrição (ex.: OAB/PE suplementar) só aparecem se ela estiver cadastrada aqui.
              </p>
            )}
            {extras.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_110px_auto] gap-2 items-end">
                <Input
                  label={i === 0 ? 'Número' : undefined}
                  value={r.numero}
                  onChange={e => updateExtra(i, { numero: e.target.value.replace(/\D/g, '') })}
                  placeholder="Número da inscrição"
                />
                <Select label={i === 0 ? 'UF' : undefined} value={r.uf} onChange={e => updateExtra(i, { uf: e.target.value })}>
                  <option value="">UF</option>
                  {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                </Select>
                <button
                  type="button"
                  onClick={() => setExtras(prev => prev.filter((_, k) => k !== i))}
                  className="h-10 px-2 text-gray-400 hover:text-red-500 transition-colors"
                  title="Remover inscrição"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-blue-700 dark:text-blue-300">
              Aparecem os processos com alguma intimação publicada no DJEN no último ano. Processo sem publicação no
              período, em segredo de justiça ou intimado só por outro meio (pessoal, carta, sistema próprio do tribunal)
              não aparece — cadastre-o manualmente. A sincronização automática roda todo dia às 2h.
            </p>
          </div>

          {lastRun && (
            <p className={cn('text-[11px]', lastRun.ok === false ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500')}>
              Última sincronização ({lastRun.trigger === 'cron' ? 'automática' : 'manual'}): {formatDate(lastRun.started_at, "dd/MM/yyyy 'às' HH:mm")}
              {lastRun.finished_at
                ? ` — ${lastRun.found} intimações, ${lastRun.imported} processo(s) novo(s), ${lastRun.updated} atualizado(s)${lastRun.ok === false ? ` · com erro: ${(lastRun.errors || [])[0] || ''}` : ''}`
                : ' — em andamento'}
            </p>
          )}

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
            <p className="font-semibold text-gray-900 dark:text-white">Buscando suas intimações no DJEN</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">OAB {inscricoesLabel}</p>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center max-w-xs">
            O último ano inteiro, em todos os tribunais. Pode levar até um minuto — não feche esta janela.
          </p>
        </div>
      )}

      {/* ── Step 3: Resultado ── */}
      {step === 'result' && result && pje && (
        <div className="space-y-4">
          {pje.error ? (
            <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
              <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0" />
              <div>
                <p className="font-semibold text-red-800 dark:text-red-300">Não foi possível consultar o DJEN</p>
                <p className="text-sm text-red-700 dark:text-red-400 mt-0.5">{pje.error}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <div>
                <p className="font-semibold text-emerald-800 dark:text-emerald-300">Sincronização concluída!</p>
                <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-0.5">
                  OAB {pje.oab || inscricoesLabel}{pje.periodo ? ` · ${formatDate(pje.periodo.inicio)} a ${formatDate(pje.periodo.fim)}` : ''}
                </p>
              </div>
            </div>
          )}

          {/* Stats totais */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Intimações encontradas', value: totals.total, color: 'text-primary-600 dark:text-primary-400', bg: 'bg-primary-50 dark:bg-primary-900/20' },
              { label: 'Processos novos', value: totals.imported, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
              { label: 'Atualizados', value: totals.updated, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
            ].map(s => (
              <div key={s.label} className={cn('text-center p-3 rounded-xl', s.bg)}>
                <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-tight">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Por inscrição e por fonte */}
          <div className="grid grid-cols-2 gap-2">
            {(pje.inscricoes || []).map(i => (
              <div key={i.oab} className="p-3 rounded-xl border border-gray-100 dark:border-dark-700 bg-gray-50/50 dark:bg-dark-800/50">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className={cn('w-1.5 h-1.5 rounded-full', i.errors.length ? 'bg-amber-500' : 'bg-emerald-500')} />
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">DJEN · OAB {i.oab}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {i.errors.length ? i.errors[0] : `${i.found} intimação(ões)${i.truncated ? ` de ${i.count}` : ''}`}
                </p>
              </div>
            ))}
            {paid.map(({ label, data }) => (
              <div key={label} className="p-3 rounded-xl border border-gray-100 dark:border-dark-700 bg-gray-50/50 dark:bg-dark-800/50">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{label} (pago)</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {!data || isTokenMissing(data) ? <span className="italic text-gray-400">Token não configurado</span>
                    : data.error ? data.error
                    : `${data.total} encontrados · ${data.imported} novos · ${data.updated} atualizados`}
                </p>
              </div>
            ))}
          </div>

          {result.jusbrasil?.first_sync_note && (
            <p className="text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
              <span className="font-semibold">JusBrasil: </span>{result.jusbrasil.first_sync_note}
            </p>
          )}

          {pje.truncated && (
            <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
              Há mais intimações do que coube nesta sincronização. Clique em "Sincronizar novamente" daqui a pouco para trazer o restante
              (o que já foi gravado não se repete).
            </p>
          )}
          {!!pje.skipped_plan_limit && (
            <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
              {pje.skipped_plan_limit} processo(s) não foram criados porque o escritório chegou ao limite de processos do plano.
              As intimações de processos já cadastrados continuaram sendo atualizadas. Veja Configurações &gt; Plano.
            </p>
          )}

          {pjeErrors.length > 0 && !pje.error && (
            <details className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
              <summary className="cursor-pointer text-xs font-semibold text-amber-700 dark:text-amber-400 select-none">
                ⚠ {pjeErrors.length} aviso{pjeErrors.length !== 1 ? 's' : ''} (clique para ver)
              </summary>
              <ul className="mt-2 space-y-0.5">
                {pjeErrors.map((e, i) => (
                  <li key={i} className="text-[11px] text-amber-700 dark:text-amber-500 font-mono">{e}</li>
                ))}
              </ul>
            </details>
          )}

          {!pje.error && totals.total === 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-4 space-y-2">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                Nenhuma intimação no DJEN no último ano para {pje.oab || inscricoesLabel}
              </p>
              <ul className="text-xs text-amber-700 dark:text-amber-400 list-disc list-inside space-y-0.5">
                <li>Confira o número e a UF de cada inscrição (o DJEN busca pela UF da inscrição, não do tribunal)</li>
                <li>Se advoga em outro estado com outra inscrição, adicione-a em "Inscrições suplementares"</li>
                <li>Processos sem publicação recente ou em segredo de justiça precisam ser cadastrados manualmente</li>
              </ul>
            </div>
          )}

          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            Em segundo plano, o DataJud (CNJ) completa classe, vara e andamentos dos processos pelo número.
          </p>

          <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-dark-700">
            <button
              onClick={() => { setStep('config'); setResult(null) }}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Sincronizar novamente
            </button>
            <div className="flex gap-2">
              {totals.total > 0 && (
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
