import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, FileUp, History, RotateCcw } from 'lucide-react'
import { Badge, Button, Input, Modal, Textarea } from '@/components/ui'
import { toast } from '@/components/ui/Toast'
import { cn, formatDate, toLocalISODate } from '@/lib/utils'
import { courtLabel } from '@/lib/deadlines/courts'
import { fetchDeadlineEvents, setDeadlineStatus, updateDeadline, uploadProtocolFile, type DeadlineEventRow, type DeadlineSettings, type ProcessOption, type TeamMember } from '@/lib/deadlines/api'
import { availableActions, reviewBlockedReason, STATUS_COLORS, STATUS_LABELS, UNIT_LABELS, validateClose, validateProtocol, type DeadlineAction, type DeadlineRow } from '@/lib/deadlines/workflow'
import { MemoryView } from './MemoryView'

const EVENT_LABELS: Record<string, string> = {
  criado: 'Prazo calculado e criado',
  data_alterada: 'Data alterada',
  responsaveis: 'Responsável ou conferente alterado',
  alterado: 'Dados alterados',
  capturada: 'Intimação capturada',
  'status:conferido': 'Conferido',
  'status:calculado': 'Voltou para conferência',
  'status:em_elaboracao': 'Em elaboração',
  'status:pronto': 'Pronto para protocolo',
  'status:protocolado': 'Protocolado',
  'status:cancelado': 'Cancelado',
  'status:perdido': 'Marcado como prazo perdido',
  'triagem:deadline': 'Triada: gera prazo',
  'triagem:no_deadline': 'Triada: não gera prazo',
  'triagem:duplicate': 'Triada: duplicada',
  piloto: 'Piloto: data do controle atual ou explicação registrada',
}

const ALERT_LABELS: Record<string, string> = {
  criado: 'novo prazo',
  sem_conferencia_1: 'sem conferência há 1 dia útil',
  sem_conferencia_2: 'sem conferência há 2 dias úteis',
  d5: 'vence em até 5 dias úteis',
  interno: 'prazo interno chegou',
  d1: 'vence amanhã',
  fatal_7h: 'vence hoje (7h)',
  fatal_escalonamento: 'vence hoje, escalonado ao administrador',
  pos_fatal: 'vencido sem protocolo',
  recalculo_mais_cedo: 'prazo antecipado por recálculo',
  triagem_1: 'intimação sem triagem',
  triagem_2: 'intimação sem triagem, escalonado ao administrador',
  divergencia_piloto: 'piloto — data diferente do controle atual',
}

/** "Alerta enviado: vence amanhã → Helena, Rafael (app, e-mail)" — prova de que o aviso existiu. */
function eventLabel(ev: DeadlineEventRow): string {
  if (!ev.kind.startsWith('alerta:')) return EVENT_LABELS[ev.kind] || ev.kind
  const rule = ev.kind.slice('alerta:'.length).split(':')[0]
  const after = (ev.after || {}) as { destinatarios?: string[]; canais?: string[] }
  const to = after.destinatarios?.length ? ` → ${after.destinatarios.join(', ')}` : ''
  const via = after.canais?.length ? ` (${after.canais.map(c => (c === 'email' ? 'e-mail' : c)).join(', ')})` : ''
  return `Alerta: ${ALERT_LABELS[rule] || rule}${to}${via}`
}

interface Props {
  deadline: DeadlineRow | null
  onClose: () => void
  onChanged: () => void
  onRecalculate: (d: DeadlineRow) => void
  me: string
  team: TeamMember[]
  processes: ProcessOption[]
  settings: DeadlineSettings
}

export function DeadlineDrawer({ deadline: d, onClose, onChanged, onRecalculate, me, team, processes, settings }: Props) {
  const [events, setEvents] = useState<DeadlineEventRow[]>([])
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState<null | 'protocolar' | 'devolver' | 'cancelar' | 'perdido'>(null)
  const today = toLocalISODate()

  useEffect(() => {
    if (!d) return
    fetchDeadlineEvents(d.id, d.communication_id).then(setEvents)
  }, [d])

  if (!d) return null
  const name = (id: string | null) => team.find(t => t.id === id)?.name || '—'
  const proc = processes.find(p => p.id === d.process_id)
  const actions = availableActions(d, me, { soloMode: settings.solo_mode, today })
  const blocked = reviewBlockedReason(d, me, { soloMode: settings.solo_mode, today })

  async function run(action: DeadlineAction) {
    if (!d) return
    if (action === 'recalcular') { onRecalculate(d); return }
    if (action === 'protocolar' || action === 'devolver' || action === 'cancelar' || action === 'perdido') { setDialog(action); return }
    const status = action === 'conferir' ? 'conferido' : action === 'iniciar' ? 'em_elaboracao' : 'pronto'
    setBusy(true)
    const { error } = await setDeadlineStatus(d.id, status)
    setBusy(false)
    if (error) { toast(error.message, 'error'); return }
    toast(action === 'conferir' ? 'Cálculo conferido.' : 'Prazo atualizado.', 'success')
    onChanged()
  }

  return (
    <>
      <Modal open onClose={onClose} title={`Prazo: ${d.act_type}`} size="xl">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={STATUS_COLORS[d.status]}>{STATUS_LABELS[d.status]}</Badge>
              {d.manually_adjusted && <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Data ajustada manualmente</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-red-50 dark:bg-red-900/15 p-3">
                <p className="text-xs text-red-700 dark:text-red-300">Prazo fatal</p>
                <p className="text-xl font-bold text-red-700 dark:text-red-300">{formatDate(d.fatal_date)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-dark-700 p-3">
                <p className="text-xs text-slate-500">Prazo interno</p>
                <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{formatDate(d.internal_date)}</p>
              </div>
            </div>
            {d.manually_adjusted && (
              <p className="text-xs text-amber-700 dark:text-amber-400">Sugerido pelo sistema: {formatDate(d.suggested_fatal_date)} · Justificativa: {d.adjust_reason}</p>
            )}
            <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-slate-400">Processo</dt><dd className="text-slate-800 dark:text-slate-100">{proc ? `${proc.number} — ${proc.client_name || proc.title}` : '—'}</dd>
              <dt className="text-slate-400">Tribunal</dt><dd className="text-slate-800 dark:text-slate-100">{courtLabel(d.court)}{d.county ? ` · ${d.county}` : ''}</dd>
              <dt className="text-slate-400">Contagem</dt><dd className="text-slate-800 dark:text-slate-100">{d.amount} {UNIT_LABELS[d.unit]}{d.doubled ? ` (em dobro: ${d.doubled_reason})` : ''}</dd>
              <dt className="text-slate-400">Responsável</dt><dd className="text-slate-800 dark:text-slate-100">{name(d.responsible_id)}</dd>
              <dt className="text-slate-400">Conferente</dt><dd className="text-slate-800 dark:text-slate-100">{name(d.reviewer_id)}{d.reviewed_at ? ` · conferido em ${formatDate(d.reviewed_at, 'dd/MM/yyyy HH:mm')}` : ''}</dd>
              {d.protocol_at && <><dt className="text-slate-400">Protocolo</dt><dd className="text-slate-800 dark:text-slate-100">{formatDate(d.protocol_at, 'dd/MM/yyyy HH:mm')}{d.protocol_number ? ` · nº ${d.protocol_number}` : ''}{d.protocol_file_url && <a href={d.protocol_file_url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-primary-600 underline">comprovante <ExternalLink className="w-3 h-3" /></a>}</dd></>}
              {d.closed_reason && <><dt className="text-slate-400">Motivo</dt><dd className="text-slate-800 dark:text-slate-100">{d.closed_reason}</dd></>}
            </dl>
            {d.review_note && d.status === 'calculado' && (
              <p className="flex gap-1.5 rounded-xl bg-amber-50 dark:bg-amber-900/15 p-3 text-xs text-amber-800 dark:text-amber-300"><RotateCcw className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />Devolvido pelo conferente: {d.review_note}</p>
            )}
            {blocked && <p className="flex gap-1.5 text-xs text-slate-500"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{blocked}</p>}
            {(settings.pilot_mode || d.pilot_reference_date) && <PilotCompare deadline={d} onChanged={onChanged} />}

            {actions.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {actions.includes('conferir') && <Button size="sm" onClick={() => run('conferir')} loading={busy}><CheckCircle2 className="w-4 h-4" /> Confirmar cálculo</Button>}
                {actions.includes('devolver') && <Button size="sm" variant="secondary" onClick={() => run('devolver')}>Devolver</Button>}
                {actions.includes('iniciar') && <Button size="sm" variant="secondary" onClick={() => run('iniciar')} loading={busy}>Em elaboração</Button>}
                {actions.includes('pronto') && <Button size="sm" variant="secondary" onClick={() => run('pronto')} loading={busy}>Pronto para protocolo</Button>}
                {actions.includes('protocolar') && <Button size="sm" onClick={() => run('protocolar')}><FileUp className="w-4 h-4" /> Registrar protocolo</Button>}
                {actions.includes('recalcular') && <Button size="sm" variant="ghost" onClick={() => run('recalcular')}>Recalcular</Button>}
                {actions.includes('cancelar') && <Button size="sm" variant="ghost" onClick={() => run('cancelar')}>Cancelar prazo</Button>}
                {actions.includes('perdido') && <Button size="sm" variant="ghost" className="text-red-600" onClick={() => run('perdido')}>Prazo perdido</Button>}
              </div>
            )}
          </div>

          <div className="lg:col-span-3 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Memória de cálculo</p>
              <MemoryView memory={d.calc_memory || []} />
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2"><History className="w-3.5 h-3.5" /> Histórico</p>
              <ol className="space-y-1.5 text-xs">
                {events.map(ev => (
                  <li key={ev.id} className="flex gap-2">
                    <span className="w-28 flex-shrink-0 text-slate-400 tabular-nums">{formatDate(ev.created_at, 'dd/MM/yy HH:mm')}</span>
                    <span className="text-slate-700 dark:text-slate-200">{eventLabel(ev)}<span className="text-slate-400"> · {ev.actor_id ? name(ev.actor_id) : 'sistema'}</span></span>
                  </li>
                ))}
                {events.length === 0 && <li className="text-slate-400">Sem registros.</li>}
              </ol>
            </div>
          </div>
        </div>
      </Modal>

      {dialog === 'protocolar' && <ProtocolDialog deadline={d} onClose={() => setDialog(null)} onDone={() => { setDialog(null); onChanged() }} />}
      {(dialog === 'devolver' || dialog === 'cancelar' || dialog === 'perdido') && (
        <ReasonDialog kind={dialog} deadline={d} onClose={() => setDialog(null)} onDone={() => { setDialog(null); onChanged() }} />
      )}
    </>
  )
}

function ProtocolDialog({ deadline, onClose, onDone }: { deadline: DeadlineRow; onClose: () => void; onDone: () => void }) {
  const [protocolAt, setProtocolAt] = useState(() => { const n = new Date(); n.setSeconds(0, 0); return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 16) })
  const [number, setNumber] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    const invalid = validateProtocol({ protocolAt, protocolNumber: number, hasFile: !!file })
    if (invalid) { setError(invalid); return }
    setSaving(true); setError('')
    try {
      const fileUrl = file ? await uploadProtocolFile(deadline.tenant_id, deadline.id, file) : null
      const { error: err } = await setDeadlineStatus(deadline.id, 'protocolado', {
        protocol_at: new Date(protocolAt).toISOString(), protocol_number: number.trim() || null, protocol_file_url: fileUrl,
      })
      if (err) throw err
      toast('Protocolo registrado. Prazo encerrado.', 'success')
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível registrar o protocolo.')
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Registrar protocolo" size="sm">
      <div className="space-y-3">
        <p className="text-xs text-slate-500">O prazo só é encerrado com a comprovação do protocolo: número ou comprovante (PDF ou imagem).</p>
        <Input label="Data e hora do protocolo" type="datetime-local" value={protocolAt} onChange={e => setProtocolAt(e.target.value)} />
        <Input label="Número do protocolo" value={number} onChange={e => setNumber(e.target.value)} placeholder="Ex.: 2026.0001234" />
        <label className={cn('flex flex-col items-center gap-1 rounded-xl border-2 border-dashed p-4 text-xs cursor-pointer', file ? 'border-emerald-300 text-emerald-700' : 'border-slate-200 text-slate-500 dark:border-dark-600')}>
          <FileUp className="w-5 h-5" />
          {file ? file.name : 'Anexar comprovante (PDF ou imagem)'}
          <input type="file" accept="application/pdf,image/*" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
        </label>
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} loading={saving}>Registrar e encerrar</Button>
        </div>
      </div>
    </Modal>
  )
}

function ReasonDialog({ kind, deadline, onClose, onDone }: { kind: 'devolver' | 'cancelar' | 'perdido'; deadline: DeadlineRow; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const titles = { devolver: 'Devolver para correção', cancelar: 'Cancelar prazo', perdido: 'Registrar prazo perdido' }
  const hints = {
    devolver: 'Explique o que está errado no cálculo. O prazo continua aguardando conferência até ser recalculado.',
    cancelar: 'Ex.: perda do objeto, acordo, desistência. O cancelamento fica registrado no histórico.',
    perdido: 'Registro honesto do ocorrido, para o escritório corrigir a causa. O administrador será informado.',
  }

  async function save() {
    const invalid = validateClose(reason)
    if (invalid) { setError(invalid); return }
    setSaving(true)
    const { error: err } = kind === 'devolver'
      ? await updateDeadline(deadline.id, { review_note: reason.trim() })
      : await setDeadlineStatus(deadline.id, kind === 'cancelar' ? 'cancelado' : 'perdido', { closed_reason: reason.trim() })
    setSaving(false)
    if (err) { setError(err.message); return }
    toast(kind === 'devolver' ? 'Devolvido ao responsável.' : 'Prazo encerrado.', 'success')
    onDone()
  }

  return (
    <Modal open onClose={onClose} title={titles[kind]} size="sm">
      <div className="space-y-3">
        <p className="text-xs text-slate-500">{hints[kind]}</p>
        <Textarea label="Motivo" value={reason} onChange={e => setReason(e.target.value)} rows={3} />
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Voltar</Button>
          <Button variant={kind === 'perdido' ? 'danger' : 'primary'} onClick={save} loading={saving}>Confirmar</Button>
        </div>
      </div>
    </Modal>
  )
}

/** Piloto (fase 4): data do sistema x data do controle atual do escritório. Divergência pede explicação — mesmo depois de encerrado. */
function PilotCompare({ deadline: d, onChanged }: { deadline: DeadlineRow; onChanged: () => void }) {
  const [note, setNote] = useState(d.pilot_divergence_note || '')
  const [saving, setSaving] = useState(false)
  const ref = d.pilot_reference_date
  const diverges = !!ref && ref !== d.fatal_date
  async function save() {
    if (note.trim().length < 5) { toast('Explique a divergência (o que cada lado considerou).', 'error'); return }
    setSaving(true)
    const { error } = await updateDeadline(d.id, { pilot_divergence_note: note.trim() })
    setSaving(false)
    if (error) { toast(error.message, 'error'); return }
    toast('Explicação registrada.', 'success')
    onChanged()
  }
  return (
    <div className={cn('rounded-xl border p-3 text-xs space-y-2', diverges ? 'border-violet-300 bg-violet-50 dark:border-violet-900/50 dark:bg-violet-900/15' : 'border-slate-100 dark:border-dark-700')}>
      <p className="font-semibold text-slate-800 dark:text-slate-100">
        Piloto · controle atual do escritório: {ref ? formatDate(ref) : 'não informado'}
        {ref && <span className={cn('ml-2 rounded-full px-2 py-0.5', diverges ? 'bg-violet-200 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200' : 'bg-emerald-100 text-emerald-700')}>{diverges ? 'diverge' : 'igual'}</span>}
      </p>
      {diverges && (
        <>
          <Textarea label="Por que as datas diferem? Qual está certa?" value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Ex.: o controle do escritório não considerou a suspensão da Portaria nº …" />
          <Button size="sm" variant="secondary" onClick={save} loading={saving}>Salvar explicação</Button>
        </>
      )}
    </div>
  )
}
