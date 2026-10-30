import { useState } from 'react'
import { CalendarPlus, Copy, Inbox, Plus, XCircle } from 'lucide-react'
import { Button, EmptyState, Input, Modal, Select, Textarea } from '@/components/ui'
import { toast } from '@/components/ui/Toast'
import { cn, formatDate, toLocalISODate } from '@/lib/utils'
import { businessDaysUntil } from '@/lib/deadlines/engine'
import { NO_DEADLINE_REASONS } from '@/lib/deadlines/workflow'
import { createManualCommunication, triageCommunication, type CommunicationRow, type ProcessOption } from '@/lib/deadlines/api'

interface Props {
  items: CommunicationRow[]
  processes: ProcessOption[]
  onCreateDeadline: (c: CommunicationRow) => void
  onChanged: () => void
}

/** Dias úteis desde a captura — meta: triar em até 1 dia útil (especificação, seção 3). */
function ageInBusinessDays(c: CommunicationRow, today: string) {
  return businessDaysUntil(toLocalISODate(new Date(c.created_at)), today)
}

export function TriageInbox({ items, processes, onCreateDeadline, onChanged }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<null | 'no_deadline' | 'duplicate' | 'manual'>(null)
  const today = toLocalISODate()
  const selected = items.find(i => i.id === selectedId) || items[0] || null
  const proc = (id: string | null) => processes.find(p => p.id === id)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <div className="lg:col-span-2 space-y-2">
        <div className="flex justify-end">
          <Button size="sm" variant="secondary" onClick={() => setDialog('manual')}><Plus className="w-4 h-4" /> Intimação manual</Button>
        </div>
        {items.length === 0 && <EmptyState icon={Inbox} title="Nenhuma intimação para triar" description="Tudo o que chega pelo DJEN ou é cadastrado à mão aparece aqui até alguém decidir o que fazer." />}
        {items.map(c => {
          const age = ageInBusinessDays(c, today)
          const p = proc(c.process_id)
          return (
            <button key={c.id} onClick={() => setSelectedId(c.id)}
              className={cn('w-full text-left rounded-xl border p-3 transition-colors', selected?.id === c.id ? 'border-primary-300 bg-primary-50/40 dark:border-primary-800 dark:bg-dark-700' : 'border-slate-100 dark:border-dark-700 bg-white dark:bg-dark-800 hover:bg-slate-50')}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{p ? p.client_name || p.title : c.title || 'Intimação'}</p>
                {age >= 1 && <span className={cn('flex-shrink-0 text-[11px] font-semibold', age >= 2 ? 'text-red-600' : 'text-amber-600')}>há {age} {age === 1 ? 'dia útil' : 'dias úteis'}</span>}
              </div>
              <p className="text-xs text-slate-500 truncate">{c.organ || '—'} · {formatDate(c.made_available_at)}</p>
            </button>
          )
        })}
      </div>

      <div className="lg:col-span-3">
        {selected && (
          <div className="rounded-2xl border border-slate-100 dark:border-dark-700 bg-white dark:bg-dark-800 p-5 space-y-4">
            <div>
              <p className="text-xs text-slate-400">{selected.source === 'manual' ? 'Cadastro manual' : 'DJEN'} · disponibilizada em {formatDate(selected.made_available_at)}</p>
              <h3 className="mt-1 text-base font-semibold text-slate-900 dark:text-white">{proc(selected.process_id)?.number || 'Sem processo vinculado'} — {selected.title || 'Intimação'}</h3>
              <p className="text-xs text-slate-500">{selected.organ}</p>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap max-h-80 overflow-y-auto">{selected.content || 'Sem texto disponível. Consulte a fonte oficial.'}</p>
            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-dark-700">
              <Button onClick={() => onCreateDeadline(selected)}><CalendarPlus className="w-4 h-4" /> Gera prazo</Button>
              <Button variant="secondary" onClick={() => setDialog('no_deadline')}><XCircle className="w-4 h-4" /> Não gera prazo</Button>
              <Button variant="ghost" onClick={() => setDialog('duplicate')}><Copy className="w-4 h-4" /> Duplicada</Button>
            </div>
          </div>
        )}
      </div>

      {dialog === 'no_deadline' && selected && <NoDeadlineDialog item={selected} onClose={() => setDialog(null)} onDone={() => { setDialog(null); setSelectedId(null); onChanged() }} />}
      {dialog === 'duplicate' && selected && <DuplicateDialog item={selected} others={items.filter(i => i.id !== selected.id)} onClose={() => setDialog(null)} onDone={() => { setDialog(null); setSelectedId(null); onChanged() }} />}
      {dialog === 'manual' && <ManualDialog processes={processes} onClose={() => setDialog(null)} onDone={() => { setDialog(null); onChanged() }} />}
    </div>
  )
}

function NoDeadlineDialog({ item, onClose, onDone }: { item: CommunicationRow; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState(NO_DEADLINE_REASONS[0])
  const [detail, setDetail] = useState('')
  const [saving, setSaving] = useState(false)
  async function save() {
    if (reason === 'Outro' && detail.trim().length < 5) { toast('Explique o motivo.', 'error'); return }
    setSaving(true)
    const { error } = await triageCommunication(item.id, 'no_deadline', { reason: detail.trim() ? `${reason}: ${detail.trim()}` : reason })
    setSaving(false)
    if (error) { toast(error.message, 'error'); return }
    onDone()
  }
  return (
    <Modal open onClose={onClose} title="Não gera prazo" size="sm">
      <div className="space-y-3">
        <Select label="Motivo" value={reason} onChange={e => setReason(e.target.value)}>
          {NO_DEADLINE_REASONS.map(r => <option key={r}>{r}</option>)}
        </Select>
        <Textarea label="Detalhe (obrigatório em Outro)" value={detail} onChange={e => setDetail(e.target.value)} rows={2} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Voltar</Button><Button onClick={save} loading={saving}>Confirmar</Button></div>
      </div>
    </Modal>
  )
}

function DuplicateDialog({ item, others, onClose, onDone }: { item: CommunicationRow; others: CommunicationRow[]; onClose: () => void; onDone: () => void }) {
  const [original, setOriginal] = useState(others[0]?.id || '')
  const [saving, setSaving] = useState(false)
  async function save() {
    if (!original) return
    setSaving(true)
    const { error } = await triageCommunication(item.id, 'duplicate', { duplicateOf: original })
    setSaving(false)
    if (error) { toast(error.message, 'error'); return }
    onDone()
  }
  return (
    <Modal open onClose={onClose} title="Marcar como duplicada" size="sm">
      <div className="space-y-3">
        {others.length === 0 ? <p className="text-sm text-slate-500">Não há outra intimação na caixa para vincular.</p> : (
          <Select label="Intimação original" value={original} onChange={e => setOriginal(e.target.value)}>
            {others.map(o => <option key={o.id} value={o.id}>{formatDate(o.made_available_at)} · {o.organ || o.title}</option>)}
          </Select>
        )}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Voltar</Button><Button onClick={save} loading={saving} disabled={!original}>Confirmar</Button></div>
      </div>
    </Modal>
  )
}

function ManualDialog({ processes, onClose, onDone }: { processes: ProcessOption[]; onClose: () => void; onDone: () => void }) {
  const [processId, setProcessId] = useState('')
  const [date, setDate] = useState(toLocalISODate())
  const [method, setMethod] = useState('sistema')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  async function save() {
    if (!title.trim()) { toast('Informe do que se trata a intimação.', 'error'); return }
    setSaving(true)
    const { error } = await createManualCommunication({ process_id: processId || null, made_available_at: date, delivery_method: method, title: title.trim(), content: content.trim(), organ: null })
    setSaving(false)
    if (error) { toast(error.message, 'error'); return }
    onDone()
  }
  return (
    <Modal open onClose={onClose} title="Cadastrar intimação manual" size="md">
      <div className="space-y-3">
        <p className="text-xs text-slate-500">Para intimações que não vieram pelo DJEN: pessoal, por carta, pelo painel do tribunal.</p>
        <Select label="Processo" value={processId} onChange={e => setProcessId(e.target.value)}>
          <option value="">Sem processo vinculado</option>
          {processes.map(p => <option key={p.id} value={p.id}>{p.number} — {p.client_name || p.title}</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Data" type="date" value={date} onChange={e => setDate(e.target.value)} />
          <Select label="Meio" value={method} onChange={e => setMethod(e.target.value)}>
            <option value="sistema">Sistema do tribunal</option>
            <option value="mandado">Mandado / carta</option>
            <option value="audiencia">Audiência</option>
            <option value="outro">Outro</option>
          </Select>
        </div>
        <Input label="Assunto" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex.: Intimação para réplica" />
        <Textarea label="Texto da intimação" value={content} onChange={e => setContent(e.target.value)} rows={4} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={save} loading={saving}>Cadastrar</Button></div>
      </div>
    </Modal>
  )
}
