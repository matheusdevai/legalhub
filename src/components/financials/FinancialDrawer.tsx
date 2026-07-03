import { useEffect, useRef, useState } from 'react'
import { X, ArrowUpRight, ArrowDownRight, DollarSign, CalendarDays, FileText, User, Briefcase, Tag, CheckCircle2, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

export type FinancialDrawerForm = {
  type: 'receivable' | 'payable'
  category: string
  description: string
  amount: string
  client_id: string
  client_name: string
  process_id: string
  process_number: string
  due_date: string
  paid_date: string
  status: 'pending' | 'paid' | 'overdue' | 'cancelled'
  notes: string
}

export const DRAWER_EMPTY_FORM: FinancialDrawerForm = {
  type: 'receivable',
  category: 'fees',
  description: '',
  amount: '',
  client_id: '',
  client_name: '',
  process_id: '',
  process_number: '',
  due_date: '',
  paid_date: '',
  status: 'pending',
  notes: '',
}

const CATEGORIES = [
  { value: 'fees',         label: 'Honorários' },
  { value: 'costs',        label: 'Custas' },
  { value: 'salary',       label: 'Salário' },
  { value: 'rent',         label: 'Aluguel' },
  { value: 'subscription', label: 'Assinatura' },
  { value: 'tax',          label: 'Impostos' },
  { value: 'comissao',     label: 'Comissão' },
  { value: 'other',        label: 'Outros' },
]

type Client = { id: string; name: string }
type Process = { id: string; number: string; title: string }

type Props = {
  open: boolean
  onClose: () => void
  onSave: (form: FinancialDrawerForm) => Promise<void>
  initial?: Partial<FinancialDrawerForm>
  editId?: string | null
  clients?: Client[]
  processes?: Process[]
  saving?: boolean
}

function formatAmountDisplay(raw: string): string {
  const n = parseFloat(raw.replace(',', '.'))
  if (!raw || isNaN(n)) return 'R$ 0,00'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

export function FinancialDrawer({ open, onClose, onSave, initial, editId, clients = [], processes = [], saving = false }: Props) {
  const [form, setForm] = useState<FinancialDrawerForm>({ ...DRAWER_EMPTY_FORM, ...initial })
  const firstInput = useRef<HTMLInputElement>(null)

  // Reset form when drawer opens/initial changes
  useEffect(() => {
    if (open) {
      setForm({ ...DRAWER_EMPTY_FORM, ...initial })
      setTimeout(() => firstInput.current?.focus(), 100)
    }
  }, [open, initial])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  function set<K extends keyof FinancialDrawerForm>(key: K, value: FinancialDrawerForm[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  const isReceita = form.type === 'receivable'
  const isValid = form.description.trim() !== '' && form.amount !== '' && parseFloat(form.amount) > 0

  const headerBg = isReceita
    ? 'from-emerald-500 to-emerald-600'
    : 'from-rose-500 to-rose-600'
  const accentBtn = isReceita
    ? 'bg-emerald-500 hover:bg-emerald-600 focus:ring-emerald-300'
    : 'bg-rose-500 hover:bg-rose-600 focus:ring-rose-300'
  const TypeIcon = isReceita ? ArrowUpRight : ArrowDownRight

  async function handleSave() {
    if (!isValid || saving) return
    await onSave(form)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        role="presentation"
        aria-hidden={!open}
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
      />

      {/* Drawer panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={editId ? 'Editar lançamento' : 'Novo lançamento'}
        className={cn(
          'fixed top-0 right-0 h-full z-50 w-full sm:w-[400px] flex flex-col bg-white dark:bg-dark-900 shadow-2xl transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* ── Header ── */}
        <div className={cn('relative flex-shrink-0 bg-gradient-to-br p-6 text-white', headerBg)}>
          {/* Close */}
          <button
            aria-label="Fechar"
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Icon + Title */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <TypeIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-white/70">
                {editId ? 'Editar' : 'Novo'} lançamento
              </p>
              <p className="text-lg font-bold leading-tight">
                {isReceita ? 'Receita' : 'Despesa'}
              </p>
            </div>
          </div>

          {/* Live amount display */}
          <p
            aria-label="Valor do lançamento"
            className="text-3xl font-extrabold tracking-tight"
          >
            {formatAmountDisplay(form.amount)}
          </p>
          <p className="text-xs text-white/60 mt-1">
            {form.status === 'paid' ? '● Pago' : form.status === 'pending' ? '○ Pendente' : form.status === 'overdue' ? '⚠ Vencido' : '✕ Cancelado'}
          </p>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Type toggle */}
          <div className="flex rounded-xl border border-slate-200 dark:border-dark-600 overflow-hidden p-0.5 bg-slate-50 dark:bg-dark-800">
            {(['receivable', 'payable'] as const).map(t => (
              <button
                key={t}
                type="button"
                data-testid={`type-${t}`}
                onClick={() => set('type', t)}
                className={cn(
                  'flex-1 py-2 text-sm font-semibold rounded-lg transition-all duration-150',
                  form.type === t
                    ? t === 'receivable'
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'bg-rose-500 text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                )}
              >
                {t === 'receivable' ? '↑ Receita' : '↓ Despesa'}
              </button>
            ))}
          </div>

          {/* Categoria */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              <Tag className="w-3.5 h-3.5" /> Categoria
            </label>
            <select
              data-testid="field-category"
              value={form.category}
              onChange={e => set('category', e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-dark-600 bg-white dark:bg-dark-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-100 dark:focus:ring-emerald-900/30 transition"
            >
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          {/* Descrição */}
          <div>
            <label htmlFor="drawer-desc" className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              <FileText className="w-3.5 h-3.5" /> Descrição <span className="text-red-400">*</span>
            </label>
            <input
              id="drawer-desc"
              ref={firstInput}
              data-testid="field-description"
              type="text"
              placeholder="Identificação do lançamento"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-dark-600 bg-white dark:bg-dark-800 text-slate-800 dark:text-slate-200 placeholder-slate-300 dark:placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-primary-100 transition"
            />
          </div>

          {/* Valor */}
          <div>
            <label htmlFor="drawer-amount" className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              <DollarSign className="w-3.5 h-3.5" /> Valor <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400 dark:text-slate-500">R$</span>
              <input
                id="drawer-amount"
                data-testid="field-amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
                className="w-full pl-10 pr-3 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 dark:border-dark-600 bg-white dark:bg-dark-800 text-slate-800 dark:text-slate-200 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-100 transition"
              />
            </div>
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="drawer-due" className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                <CalendarDays className="w-3.5 h-3.5" /> Vencimento
              </label>
              <input
                id="drawer-due"
                data-testid="field-due-date"
                type="date"
                value={form.due_date}
                onChange={e => set('due_date', e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-dark-600 bg-white dark:bg-dark-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-100 transition"
              />
            </div>
            <div>
              <label htmlFor="drawer-paid" className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Pagamento
              </label>
              <input
                id="drawer-paid"
                data-testid="field-paid-date"
                type="date"
                value={form.paid_date}
                onChange={e => set('paid_date', e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-dark-600 bg-white dark:bg-dark-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-100 transition"
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              <Clock className="w-3.5 h-3.5" /> Status
            </label>
            <div className="flex gap-2 flex-wrap">
              {([
                { value: 'pending',   label: 'Pendente',  cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800' },
                { value: 'paid',      label: 'Pago',      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800' },
                { value: 'overdue',   label: 'Vencido',   cls: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800' },
                { value: 'cancelled', label: 'Cancelado', cls: 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-dark-700 dark:text-slate-400 dark:border-dark-600' },
              ] as const).map(s => (
                <button
                  key={s.value}
                  type="button"
                  data-testid={`status-${s.value}`}
                  onClick={() => set('status', s.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-semibold border transition-all',
                    form.status === s.value
                      ? s.cls + ' ring-2 ring-offset-1 ring-current'
                      : 'bg-white dark:bg-dark-800 text-slate-400 border-slate-200 dark:border-dark-600 hover:border-slate-300'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cliente */}
          {clients.length > 0 && (
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                <User className="w-3.5 h-3.5" /> Cliente
              </label>
              <select
                data-testid="field-client"
                value={form.client_id}
                onChange={e => {
                  const c = clients.find(x => x.id === e.target.value)
                  set('client_id', e.target.value)
                  set('client_name', c?.name ?? '')
                }}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-dark-600 bg-white dark:bg-dark-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-100 transition"
              >
                <option value="">Selecione um cliente</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {/* Processo */}
          {processes.length > 0 && (
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                <Briefcase className="w-3.5 h-3.5" /> Processo
              </label>
              <select
                data-testid="field-process"
                value={form.process_id}
                onChange={e => {
                  const p = processes.find(x => x.id === e.target.value)
                  set('process_id', e.target.value)
                  set('process_number', p?.number ?? '')
                }}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-dark-600 bg-white dark:bg-dark-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-100 transition"
              >
                <option value="">Selecione um processo</option>
                {processes.map(p => <option key={p.id} value={p.id}>{p.number} — {p.title}</option>)}
              </select>
            </div>
          )}

          {/* Observações */}
          <div>
            <label htmlFor="drawer-notes" className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              <FileText className="w-3.5 h-3.5" /> Observações
            </label>
            <textarea
              id="drawer-notes"
              data-testid="field-notes"
              rows={2}
              placeholder="Informações adicionais..."
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-dark-600 bg-white dark:bg-dark-800 text-slate-800 dark:text-slate-200 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-100 resize-none transition"
            />
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex-shrink-0 p-4 border-t border-slate-100 dark:border-dark-700 bg-white dark:bg-dark-900 space-y-2">
          <button
            type="button"
            data-testid="btn-save"
            onClick={handleSave}
            disabled={!isValid || saving}
            className={cn(
              'w-full py-3 rounded-xl text-white text-sm font-bold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2',
              accentBtn,
              (!isValid || saving) && 'opacity-50 cursor-not-allowed'
            )}
          >
            {saving ? 'Salvando...' : 'Salvar dados'}
          </button>
          <button
            type="button"
            data-testid="btn-cancel"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-dark-800 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </aside>
    </>
  )
}
