import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarClock } from 'lucide-react'
import { Button, Input, Modal, Select, Textarea } from '@/components/ui'
import { toast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/utils'
import { calculateDeadline, internalDateFor, type DeadlineResult, type Regime, type StartEvent, type Unit } from '@/lib/deadlines/engine'
import { calendarForProcess, calendarVersion, type CourtCalendarRow } from '@/lib/deadlines/courtCalendar'
import { COURTS } from '@/lib/deadlines/courts'
import { createDeadline, triageCommunication, updateDeadline, type CommunicationRow, type DeadlineSettings, type ProcessOption, type TeamMember } from '@/lib/deadlines/api'
import type { DeadlineRow } from '@/lib/deadlines/workflow'
import { MemoryView } from './MemoryView'

const REGIMES: { value: Regime; label: string }[] = [
  { value: 'civel', label: 'Cível (CPC) — dias úteis' },
  { value: 'juizado', label: 'Juizado Especial — dias úteis' },
  { value: 'trabalhista', label: 'Trabalhista (CLT) — dias úteis' },
  { value: 'administrativo', label: 'Administrativo — dias corridos' },
  { value: 'fixado_juiz', label: 'Fixado pelo juiz' },
]

const START_EVENTS: { value: StartEvent; label: string; dateLabel: string }[] = [
  { value: 'djen', label: 'Publicação no DJEN / diário eletrônico', dateLabel: 'Data da disponibilização' },
  { value: 'sistema_ciencia', label: 'Intimação no sistema do tribunal (consultada)', dateLabel: 'Data da consulta' },
  { value: 'sistema_tacita', label: 'Intimação no sistema do tribunal (não consultada)', dateLabel: 'Data do envio' },
  { value: 'juntada', label: 'Juntada do mandado / carta', dateLabel: 'Data da juntada' },
  { value: 'audiencia', label: 'Intimação em audiência', dateLabel: 'Data da audiência' },
  { value: 'data_inicial', label: 'Outra data inicial', dateLabel: 'Data inicial' },
]

const UNITS: { value: Unit; label: string }[] = [
  { value: 'dias_uteis', label: 'dias úteis' },
  { value: 'dias_corridos', label: 'dias corridos' },
  { value: 'meses', label: 'meses' },
  { value: 'anos', label: 'anos' },
]

const DEFAULT_UNIT: Record<Regime, Unit> = { civel: 'dias_uteis', juizado: 'dias_uteis', trabalhista: 'dias_uteis', administrativo: 'dias_corridos', fixado_juiz: 'dias_uteis' }
const DEFAULT_RECESS: Record<Regime, boolean> = { civel: true, juizado: false, trabalhista: true, administrativo: false, fixado_juiz: true }

function regimeForCourt(court: string): Regime {
  if (court.startsWith('trt') || court === 'tst') return 'trabalhista'
  if (court === 'inss') return 'administrativo'
  return 'civel'
}

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
  me: string
  team: TeamMember[]
  processes: ProcessOption[]
  calendarRows: CourtCalendarRow[]
  settings: DeadlineSettings
  /** Intimação de origem (triagem "Gera prazo"). */
  communication?: CommunicationRow | null
  /** Prazo existente (recalcular). */
  existing?: DeadlineRow | null
}

export function DeadlineFormModal({ open, onClose, onSaved, me, team, processes, calendarRows, settings, communication, existing }: Props) {
  const [processId, setProcessId] = useState('')
  const [actType, setActType] = useState('')
  const [court, setCourt] = useState('')
  const [county, setCounty] = useState('')
  const [regime, setRegime] = useState<Regime>('civel')
  const [startEvent, setStartEvent] = useState<StartEvent>('djen')
  const [eventDate, setEventDate] = useState('')
  const [amount, setAmount] = useState('15')
  const [unit, setUnit] = useState<Unit>('dias_uteis')
  const [doubled, setDoubled] = useState(false)
  const [doubledReason, setDoubledReason] = useState('')
  const [applyRecess, setApplyRecess] = useState(true)
  const [responsibleId, setResponsibleId] = useState('')
  const [reviewerId, setReviewerId] = useState('')
  const [adjust, setAdjust] = useState(false)
  const [adjustedFatal, setAdjustedFatal] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setError('')
    if (existing) {
      setProcessId(existing.process_id || ''); setActType(existing.act_type); setCourt(existing.court || ''); setCounty(existing.county || '')
      setRegime(existing.regime); setStartEvent(existing.start_event); setEventDate(existing.start_date); setAmount(String(existing.amount))
      setUnit(existing.unit); setDoubled(existing.doubled); setDoubledReason(existing.doubled_reason || ''); setApplyRecess(existing.apply_recess)
      setResponsibleId(existing.responsible_id); setReviewerId(existing.reviewer_id || '')
      setAdjust(existing.manually_adjusted); setAdjustedFatal(existing.manually_adjusted ? existing.fatal_date : ''); setAdjustReason(existing.adjust_reason || '')
      return
    }
    setProcessId(communication?.process_id || ''); setActType(''); setCourt(''); setCounty('')
    setRegime('civel'); setStartEvent(communication?.source === 'manual' ? 'data_inicial' : 'djen')
    setEventDate(communication?.made_available_at || ''); setAmount('15'); setUnit('dias_uteis')
    setDoubled(false); setDoubledReason(''); setApplyRecess(true)
    setResponsibleId(communication?.assigned_to || me); setReviewerId('')
    setAdjust(false); setAdjustedFatal(''); setAdjustReason('')
  }, [open, existing, communication, me])

  function changeRegime(r: Regime) { setRegime(r); setUnit(DEFAULT_UNIT[r]); setApplyRecess(DEFAULT_RECESS[r]) }
  function changeCourt(c: string) { setCourt(c); if (c && !existing) changeRegime(regimeForCourt(c)) }

  const calendar = useMemo(() => calendarForProcess(calendarRows, { court, county }), [calendarRows, court, county])
  const calc: { result: DeadlineResult | null; error: string } = useMemo(() => {
    const n = Number(amount)
    if (!eventDate || !n) return { result: null, error: '' }
    try {
      return { result: calculateDeadline({ regime, startEvent, eventDate, amount: n, unit, doubled, applyRecess, internalMarginDays: settings.internal_margin_days, calendar }), error: '' }
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : 'Não foi possível calcular.' }
    }
  }, [regime, startEvent, eventDate, amount, unit, doubled, applyRecess, settings.internal_margin_days, calendar])

  const result = calc.result
  const fatal = adjust && adjustedFatal ? adjustedFatal : result?.fatalDate || ''
  const internal = result ? (adjust && adjustedFatal ? internalDateFor(adjustedFatal, settings.internal_margin_days, calendar, result.startDate) : result.internalDate) : ''
  const adjustedEarlierOrLater = adjust && adjustedFatal && result ? (adjustedFatal < result.fatalDate ? 'antes' : adjustedFatal > result.fatalDate ? 'depois' : null) : null
  const dateLabel = START_EVENTS.find(s => s.value === startEvent)?.dateLabel || 'Data'

  async function save() {
    if (!result) { setError(calc.error || 'Preencha a data e o prazo.'); return }
    if (!actType.trim()) { setError('Informe o ato (ex.: contestação, réplica, recurso).'); return }
    if (!responsibleId) { setError('Escolha o responsável.'); return }
    if (!reviewerId) { setError('Escolha quem vai conferir o cálculo.'); return }
    if (reviewerId === (existing?.created_by || me) && !settings.solo_mode) { setError('A conferência precisa ser feita por outra pessoa. Escolha outro conferente.'); return }
    if (doubled && !doubledReason.trim()) { setError('Informe o motivo do prazo em dobro.'); return }
    if (adjust && (!adjustedFatal || adjustReason.trim().length < 5)) { setError('Para ajustar a data, informe a nova data e a justificativa.'); return }
    setSaving(true); setError('')
    const payload = {
      communication_id: existing?.communication_id ?? communication?.id ?? null,
      process_id: processId || null,
      act_type: actType.trim(),
      regime, start_event: startEvent, start_date: eventDate, amount: Number(amount), unit,
      doubled, doubled_reason: doubled ? doubledReason.trim() : null, apply_recess: applyRecess,
      court: court || null, county: county.trim() || null,
      suggested_fatal_date: result.fatalDate, fatal_date: fatal, internal_date: internal,
      manually_adjusted: adjust, adjust_reason: adjust ? adjustReason.trim() : null,
      calc_memory: result.memory, rules_version: result.rulesVersion, calendar_version: calendarVersion(calendarRows),
      responsible_id: responsibleId, reviewer_id: reviewerId,
      ...(existing ? { review_note: null } : {}),
    }
    const { error: err } = existing ? await updateDeadline(existing.id, payload) : await createDeadline(payload)
    if (err) { setSaving(false); setError(err.message); return }
    if (!existing && communication) await triageCommunication(communication.id, 'deadline')
    setSaving(false)
    toast(existing ? 'Prazo recalculado — precisa de nova conferência.' : 'Prazo criado e enviado para conferência.', 'success')
    onSaved()
  }

  const proc = processes.find(p => p.id === processId)

  return (
    <Modal open={open} onClose={onClose} title={existing ? 'Recalcular prazo' : 'Calcular prazo'} size="xl">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          {communication?.content && (
            <details className="rounded-xl border border-slate-200 dark:border-dark-600 p-3 text-xs text-slate-600 dark:text-slate-300">
              <summary className="cursor-pointer font-semibold">Texto da intimação</summary>
              <p className="mt-2 whitespace-pre-wrap max-h-40 overflow-y-auto">{communication.content}</p>
            </details>
          )}
          <Select label="Processo" value={processId} onChange={e => setProcessId(e.target.value)}>
            <option value="">Sem processo vinculado</option>
            {processes.map(p => <option key={p.id} value={p.id}>{p.number} — {p.client_name || p.title}</option>)}
          </Select>
          <Input label="Ato / prazo" value={actType} onChange={e => setActType(e.target.value)} placeholder="Ex.: contestação, réplica, apelação" />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Tribunal" value={court} onChange={e => changeCourt(e.target.value)}>
              <option value="">Selecione</option>
              {COURTS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
            <Input label="Comarca" value={county} onChange={e => setCounty(e.target.value)} placeholder={proc?.court || 'Ex.: João Pessoa'} />
          </div>
          <Select label="Regime de contagem" value={regime} onChange={e => changeRegime(e.target.value as Regime)}>
            {REGIMES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </Select>
          <Select label="Como a intimação chegou" value={startEvent} onChange={e => setStartEvent(e.target.value as StartEvent)}>
            {START_EVENTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          <div className="grid grid-cols-3 gap-3">
            <Input label={dateLabel} type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} />
            <Input label="Prazo" type="number" min={1} value={amount} onChange={e => setAmount(e.target.value)} />
            <Select label="Unidade" value={unit} onChange={e => setUnit(e.target.value as Unit)}>
              {UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
            </Select>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-700 dark:text-slate-200">
            <label className="flex items-center gap-2"><input type="checkbox" checked={doubled} onChange={e => setDoubled(e.target.checked)} /> Prazo em dobro</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={applyRecess} onChange={e => setApplyRecess(e.target.checked)} /> Suspende no recesso (20/12 a 20/01)</label>
          </div>
          {doubled && <Input label="Motivo do prazo em dobro" value={doubledReason} onChange={e => setDoubledReason(e.target.value)} placeholder="Ex.: Fazenda Pública (CPC, art. 183)" />}
          <div className="grid grid-cols-2 gap-3">
            <Select label="Responsável" value={responsibleId} onChange={e => setResponsibleId(e.target.value)}>
              <option value="">Selecione</option>
              {team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            <Select label="Conferente" value={reviewerId} onChange={e => setReviewerId(e.target.value)}>
              <option value="">Selecione</option>
              {team.filter(t => settings.solo_mode || t.id !== (existing?.created_by || me)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 dark:border-dark-600 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400"><CalendarClock className="w-4 h-4" /> Resultado</div>
            {result ? (
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-500">Prazo fatal</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatDate(fatal)}</p>
                  {adjust && adjustedFatal && <p className="text-[11px] text-amber-600">sugerido pelo sistema: {formatDate(result.fatalDate)}</p>}
                </div>
                <div>
                  <p className="text-xs text-slate-500">Prazo interno</p>
                  <p className="text-2xl font-bold text-slate-700 dark:text-slate-200">{formatDate(internal)}</p>
                  <p className="text-[11px] text-slate-400">{settings.internal_margin_days} dias úteis antes</p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-400">{calc.error || 'Informe a data e o prazo.'}</p>
            )}
            {result?.warnings.map(w => (
              <p key={w} className="mt-2 flex gap-1.5 text-xs text-amber-700 dark:text-amber-400"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{w}</p>
            ))}
            {result && court && calendar.length === 0 && (
              <p className="mt-2 flex gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                Sem feriados locais cadastrados para este tribunal: só os feriados nacionais foram considerados. Confira os dias sem expediente do tribunal.
              </p>
            )}
          </div>
          <MemoryView memory={result?.memory || []} compact />
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input type="checkbox" checked={adjust} onChange={e => setAdjust(e.target.checked)} /> Ajustar a data fatal manualmente
          </label>
          {adjust && (
            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-900/10 p-3">
              <Input label="Data fatal correta" type="date" value={adjustedFatal} onChange={e => setAdjustedFatal(e.target.value)} />
              {adjustedEarlierOrLater === 'depois' && (
                <p className="text-xs font-medium text-red-600">Atenção: a data informada é DEPOIS da calculada. Só ajuste com base na fonte oficial.</p>
              )}
              <Textarea label="Justificativa (obrigatória)" value={adjustReason} onChange={e => setAdjustReason(e.target.value)} rows={2} placeholder="Ex.: Portaria nº … suspendeu o expediente em …" />
            </div>
          )}
        </div>
      </div>

      <p className="mt-4 text-[11px] text-slate-400">Cálculo sugerido pelo sistema. Confira com a fonte oficial antes de confirmar.</p>
      {error && <p role="alert" className="mt-3 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-xl px-3.5 py-2.5">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={save} loading={saving}>{existing ? 'Salvar e enviar para conferência' : 'Criar prazo'}</Button>
      </div>
    </Modal>
  )
}
