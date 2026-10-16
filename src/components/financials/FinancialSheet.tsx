import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Plus, Repeat } from 'lucide-react'
import type { Financial, FinancialAccount } from '@/types'
import { cn, formatCurrency, formatDate, FINANCIAL_STATUS_COLORS, FINANCIAL_STATUS_LABELS } from '@/lib/utils'
import { parseMoneyInput, sheetTotals, type SheetRow } from '@/lib/financialSheet'

// Planilha de lançamentos do mês: cada célula editável é focável (setas
// navegam), Enter/F2 ou digitar começa a editar, Enter salva e desce, Tab
// salva e vai pra direita, Esc cancela. A última linha é a inclusão rápida.

type Col = 'due_date' | 'description' | 'category' | 'account_id' | 'income' | 'expense' | 'paid_date'
const COLS: Col[] = ['due_date', 'description', 'category', 'account_id', 'income', 'expense', 'paid_date']
const TYPE_TO_EDIT: Col[] = ['description', 'income', 'expense']

export type SheetPatch = Partial<Pick<Financial, 'due_date' | 'description' | 'category' | 'account_id' | 'amount' | 'paid_date'>>

export type QuickAddInput = {
  type: 'receivable' | 'payable'
  due_date: string
  description: string
  category: string
  account_id: string | null
  amount: number
}

type Props = {
  rows: SheetRow[]
  accounts: FinancialAccount[]
  categoryLabels: Record<string, string>
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onToggleSelectAll: () => void
  onPatch: (row: SheetRow, patch: SheetPatch) => void | Promise<void>
  onTogglePaid: (row: SheetRow) => void
  onQuickAdd: (input: QuickAddInput) => Promise<boolean>
  defaultNewDate: string
  /** Linha extra abaixo da descrição (cliente/processo) */
  renderMeta?: (row: SheetRow) => ReactNode
  /** Botões de ação no fim da linha */
  renderActions?: (row: SheetRow) => ReactNode
  /** Desliga a linha de inclusão rápida (ex.: modo "somente atrasados") */
  hideQuickAdd?: boolean
}

function editable(row: SheetRow, col: Col): boolean {
  // A ocorrência prevista é identificada pela data (generated_from_id + due_date);
  // mudar o dia de uma delas faria a original reaparecer. Pra mudar o dia, edita-se a recorrência.
  if (col === 'due_date' && row.projected) return false
  if (col === 'income') return row.financial.type === 'receivable'
  if (col === 'expense') return row.financial.type === 'payable'
  return true
}

function rawValue(row: SheetRow, col: Col): string {
  const f = row.financial
  switch (col) {
    case 'due_date': return f.due_date || ''
    case 'description': return f.description || ''
    case 'category': return f.category || ''
    case 'account_id': return f.account_id || ''
    case 'income':
    case 'expense': return String(f.amount ?? '').replace('.', ',')
    case 'paid_date': return f.paid_date || ''
  }
}

/** Monta o patch a partir do texto editado; null = nada a salvar (inválido ou igual). */
function buildPatch(row: SheetRow, col: Col, draft: string): SheetPatch | null {
  const f = row.financial
  switch (col) {
    case 'due_date':
      return draft && draft !== f.due_date ? { due_date: draft } : null
    case 'description': {
      const v = draft.trim()
      return v && v !== f.description ? { description: v } : null
    }
    case 'category':
      return draft !== (f.category || '') ? { category: draft || null } : null
    case 'account_id':
      return draft !== (f.account_id || '') ? { account_id: draft || null } : null
    case 'income':
    case 'expense': {
      const n = parseMoneyInput(draft)
      return n != null && n !== Number(f.amount) ? { amount: n } : null
    }
    case 'paid_date':
      return draft !== (f.paid_date || '') ? { paid_date: draft || null } : null
  }
}

const cellBase = 'px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-inset focus:ring-primary-400 rounded-sm cursor-default'
const inputBase = 'w-full px-1.5 py-1 text-xs rounded border border-primary-400 bg-white dark:bg-dark-800 text-slate-800 dark:text-slate-100 focus:outline-none'
const thBase = 'px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap'

export function FinancialSheet({
  rows, accounts, categoryLabels, selectedIds, onToggleSelect, onToggleSelectAll,
  onPatch, onTogglePaid, onQuickAdd, defaultNewDate, renderMeta, renderActions, hideQuickAdd,
}: Props) {
  const tableRef = useRef<HTMLTableElement>(null)
  const [editing, setEditing] = useState<{ rowId: string; col: Col } | null>(null)
  const [draft, setDraft] = useState('')
  // Evita salvar duas vezes (Enter salva e, ao desmontar o input, o blur tentaria de novo)
  const editingRef = useRef<{ rowId: string; col: Col } | null>(null)

  const totals = sheetTotals(rows)
  const selectable = rows.filter(r => !r.projected)
  const allSelected = selectable.length > 0 && selectable.every(r => selectedIds.has(r.financial.id))
  const accountName = (id: string | null) => accounts.find(a => a.id === id)?.name || ''

  function focusCell(rowIdx: number, colIdx: number) {
    requestAnimationFrame(() => {
      const el = tableRef.current?.querySelector<HTMLElement>(`[data-cell="${rowIdx}:${colIdx}"]`)
      el?.focus()
    })
  }

  function startEdit(row: SheetRow, col: Col, initial?: string) {
    if (!editable(row, col)) return
    // Clique dentro do próprio editor sobe até a célula — não reiniciar o texto
    if (editingRef.current?.rowId === row.financial.id && editingRef.current.col === col) return
    const next = { rowId: row.financial.id, col }
    editingRef.current = next
    setEditing(next)
    setDraft(initial ?? rawValue(row, col))
  }

  function finishEdit(save: boolean) {
    const current = editingRef.current
    editingRef.current = null
    setEditing(null)
    if (!save || !current) return
    const row = rows.find(r => r.financial.id === current.rowId)
    if (!row) return
    const patch = buildPatch(row, current.col, draft)
    if (patch) onPatch(row, patch)
  }

  function onCellKeyDown(e: KeyboardEvent, row: SheetRow, rowIdx: number, colIdx: number) {
    const col = COLS[colIdx]
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit(row, col); return }
    if (e.key === 'ArrowRight') { e.preventDefault(); focusCell(rowIdx, Math.min(COLS.length - 1, colIdx + 1)); return }
    if (e.key === 'ArrowLeft') { e.preventDefault(); focusCell(rowIdx, Math.max(0, colIdx - 1)); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); focusCell(Math.min(rows.length - 1, rowIdx + 1), colIdx); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); focusCell(Math.max(0, rowIdx - 1), colIdx); return }
    if (TYPE_TO_EDIT.includes(col) && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      startEdit(row, col, e.key)
    }
  }

  function onEditorKeyDown(e: KeyboardEvent, rowIdx: number, colIdx: number) {
    if (e.key === 'Escape') { e.preventDefault(); finishEdit(false); focusCell(rowIdx, colIdx); return }
    if (e.key === 'Enter') { e.preventDefault(); finishEdit(true); focusCell(Math.min(rows.length - 1, rowIdx + 1), colIdx); return }
    if (e.key === 'Tab') {
      e.preventDefault()
      finishEdit(true)
      focusCell(rowIdx, e.shiftKey ? Math.max(0, colIdx - 1) : Math.min(COLS.length - 1, colIdx + 1))
    }
  }

  function renderEditor(col: Col, rowIdx: number, colIdx: number) {
    const common = {
      autoFocus: true,
      'data-testid': `editor-${col}`,
      onKeyDown: (e: KeyboardEvent) => onEditorKeyDown(e, rowIdx, colIdx),
      onBlur: () => finishEdit(true),
      className: inputBase,
    }
    if (col === 'category') {
      return (
        <select {...common} value={draft} onChange={e => setDraft(e.target.value)}>
          <option value="">—</option>
          {Object.entries(categoryLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      )
    }
    if (col === 'account_id') {
      return (
        <select {...common} value={draft} onChange={e => setDraft(e.target.value)}>
          <option value="">—</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      )
    }
    if (col === 'due_date' || col === 'paid_date') {
      return <input {...common} type="date" value={draft} onChange={e => setDraft(e.target.value)} />
    }
    return (
      <input
        {...common}
        type="text"
        inputMode={col === 'description' ? 'text' : 'decimal'}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        className={cn(inputBase, col !== 'description' && 'text-right')}
      />
    )
  }

  function renderDisplay(row: SheetRow, col: Col): ReactNode {
    const f = row.financial
    switch (col) {
      case 'due_date': return <span className="whitespace-nowrap">{formatDate(f.due_date, 'dd/MM')}</span>
      case 'description':
        return (
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {row.templateId && <Repeat className="w-3 h-3 flex-shrink-0 text-violet-500" aria-label="Recorrente" />}
              <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[260px]">{f.description}</span>
              {f.installment_group_id && (
                <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">
                  {f.installment_number === 0 ? 'Entrada' : `${f.installment_number}/${f.installment_total}`}
                </span>
              )}
            </div>
            {renderMeta?.(row)}
          </div>
        )
      case 'category': return <span className="text-slate-500 dark:text-slate-400">{categoryLabels[f.category || ''] || f.category || '—'}</span>
      case 'account_id': return <span className="text-slate-500 dark:text-slate-400">{accountName(f.account_id) || '—'}</span>
      case 'income': return row.income ? <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(row.income)}</span> : null
      case 'expense': return row.expense ? <span className="font-semibold text-red-600 dark:text-red-400">{formatCurrency(row.expense)}</span> : null
      case 'paid_date': return <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">{f.paid_date ? formatDate(f.paid_date, 'dd/MM') : ''}</span>
    }
  }

  return (
    <div className="overflow-x-auto">
      <table ref={tableRef} className="w-full text-sm border-collapse" data-testid="financial-sheet">
        <thead>
          <tr className="border-b border-slate-200 dark:border-dark-700 bg-slate-50 dark:bg-dark-700/30">
            <th className="w-8 px-2.5 py-2">
              <input type="checkbox" aria-label="Selecionar todos"
                className="w-3.5 h-3.5 rounded border-slate-300 dark:border-dark-500 text-primary-600 focus:ring-primary-400"
                checked={allSelected} onChange={onToggleSelectAll} />
            </th>
            <th className={cn(thBase, 'text-left')}>Venc.</th>
            <th className={cn(thBase, 'text-left')}>Descrição</th>
            <th className={cn(thBase, 'text-left')}>Categoria</th>
            <th className={cn(thBase, 'text-left')}>Conta</th>
            <th className={cn(thBase, 'text-right')}>Entrada</th>
            <th className={cn(thBase, 'text-right')}>Saída</th>
            <th className={cn(thBase, 'text-left')}>Status</th>
            <th className={cn(thBase, 'text-left')}>Pago em</th>
            <th className={cn(thBase, 'text-right')} title="Saldo acumulado do mês, na ordem da planilha (previsto — canceladas não contam)">Saldo</th>
            <th className="w-16" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-dark-700/40">
          {rows.length === 0 && (
            <tr><td colSpan={11} className="px-4 py-8 text-center text-xs text-slate-400">Nenhum lançamento neste mês. Use a linha abaixo para adicionar.</td></tr>
          )}
          {rows.map((row, rowIdx) => {
            const f = row.financial
            const cancelled = f.status === 'cancelled'
            return (
              <tr key={f.id} data-testid="sheet-row"
                className={cn('group transition-colors hover:bg-primary-50/30 dark:hover:bg-primary-900/10',
                  row.projected && 'italic bg-violet-50/40 dark:bg-violet-900/10',
                  cancelled && 'opacity-50 line-through')}>
                <td className="px-2.5 py-2">
                  {!row.projected && (
                    <input type="checkbox" aria-label="Selecionar"
                      className="w-3.5 h-3.5 rounded border-slate-300 dark:border-dark-500 text-primary-600 focus:ring-primary-400"
                      checked={selectedIds.has(f.id)} onChange={() => onToggleSelect(f.id)} />
                  )}
                </td>
                {COLS.slice(0, 6).map((col, colIdx) => (
                  <td key={col}
                    data-cell={`${rowIdx}:${colIdx}`}
                    data-testid={`cell-${col}`}
                    tabIndex={0}
                    onDoubleClick={() => startEdit(row, col)}
                    onClick={() => { if (col !== 'description') startEdit(row, col) }}
                    onKeyDown={e => { if (!editing) onCellKeyDown(e, row, rowIdx, colIdx) }}
                    className={cn(cellBase, (col === 'income' || col === 'expense') && 'text-right', editable(row, col) && 'hover:bg-slate-100/70 dark:hover:bg-dark-700/50')}>
                    {editing?.rowId === f.id && editing.col === col ? renderEditor(col, rowIdx, colIdx) : renderDisplay(row, col)}
                  </td>
                ))}
                <td className="px-2.5 py-2">
                  <button type="button" data-testid="status-toggle" onClick={() => onTogglePaid(row)}
                    title={f.status === 'paid' ? 'Marcar como pendente' : 'Marcar como pago'}
                    className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors not-italic whitespace-nowrap',
                      row.projected ? 'bg-violet-50 text-violet-600 border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800' : FINANCIAL_STATUS_COLORS[f.status || 'pending'])}>
                    {row.projected ? 'Previsto' : FINANCIAL_STATUS_LABELS[f.status || 'pending']}
                  </button>
                </td>
                {(() => {
                  const colIdx = 6
                  const col: Col = 'paid_date'
                  return (
                    <td data-cell={`${rowIdx}:${colIdx}`} data-testid="cell-paid_date" tabIndex={0}
                      onClick={() => startEdit(row, col)}
                      onKeyDown={e => { if (!editing) onCellKeyDown(e, row, rowIdx, colIdx) }}
                      className={cn(cellBase, 'hover:bg-slate-100/70 dark:hover:bg-dark-700/50')}>
                      {editing?.rowId === f.id && editing.col === col ? renderEditor(col, rowIdx, colIdx) : renderDisplay(row, col)}
                    </td>
                  )
                })()}
                <td className={cn('px-2.5 py-2 text-xs text-right font-semibold whitespace-nowrap', row.balance >= 0 ? 'text-slate-700 dark:text-slate-200' : 'text-red-600 dark:text-red-400')}>
                  {formatCurrency(row.balance)}
                </td>
                <td className="px-1.5 py-2">
                  <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity not-italic">
                    {renderActions?.(row)}
                  </div>
                </td>
              </tr>
            )
          })}
          {!hideQuickAdd && <QuickAddRow accounts={accounts} categoryLabels={categoryLabels} defaultDate={defaultNewDate} onAdd={onQuickAdd} />}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 dark:border-dark-600 bg-slate-50 dark:bg-dark-700/30 text-xs font-bold">
            <td />
            <td colSpan={4} className="px-2.5 py-2.5 text-slate-600 dark:text-slate-300 uppercase tracking-wider text-[11px]">Total do mês</td>
            <td className="px-2.5 py-2.5 text-right text-emerald-600 dark:text-emerald-400 whitespace-nowrap" data-testid="total-income">{formatCurrency(totals.income)}</td>
            <td className="px-2.5 py-2.5 text-right text-red-600 dark:text-red-400 whitespace-nowrap" data-testid="total-expense">{formatCurrency(totals.expense)}</td>
            <td colSpan={2} />
            <td className={cn('px-2.5 py-2.5 text-right whitespace-nowrap', totals.result >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')} data-testid="total-result">
              {totals.result >= 0 ? '+' : ''}{formatCurrency(totals.result)}
            </td>
            <td />
          </tr>
          <tr className="bg-slate-50 dark:bg-dark-700/30 text-[11px] text-slate-500 dark:text-slate-400">
            <td />
            <td colSpan={10} className="px-2.5 pb-2.5">
              <span className="mr-5">Recebido: <strong className="text-emerald-600 dark:text-emerald-400">{formatCurrency(totals.received)}</strong></span>
              <span className="mr-5">A receber: <strong className="text-slate-700 dark:text-slate-200">{formatCurrency(totals.income - totals.received)}</strong></span>
              <span className="mr-5">Pago: <strong className="text-red-600 dark:text-red-400">{formatCurrency(totals.paid)}</strong></span>
              <span>A pagar: <strong className="text-slate-700 dark:text-slate-200">{formatCurrency(totals.expense - totals.paid)}</strong></span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ── Linha de inclusão rápida ─────────────────────────────────────────────────
function QuickAddRow({ accounts, categoryLabels, defaultDate, onAdd }: {
  accounts: FinancialAccount[]
  categoryLabels: Record<string, string>
  defaultDate: string
  onAdd: (input: QuickAddInput) => Promise<boolean>
}) {
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [accountId, setAccountId] = useState('')
  const [income, setIncome] = useState('')
  const [expense, setExpense] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const descRef = useRef<HTMLInputElement>(null)

  async function submit() {
    if (busy) return
    const inc = income.trim() ? parseMoneyInput(income) : null
    const exp = expense.trim() ? parseMoneyInput(expense) : null
    if (!description.trim()) { setError('Preencha a descrição'); return }
    if ((income.trim() && inc == null) || (expense.trim() && exp == null)) { setError('Valor inválido'); return }
    if ((inc == null) === (exp == null)) { setError('Preencha Entrada OU Saída'); return }
    const type = inc != null ? 'receivable' : 'payable'
    setError('')
    setBusy(true)
    const ok = await onAdd({
      type,
      due_date: date || defaultDate,
      description: description.trim(),
      category: category || (type === 'receivable' ? 'fees' : 'other'),
      account_id: accountId || null,
      amount: (inc ?? exp) as number,
    })
    setBusy(false)
    if (ok) {
      setDescription(''); setIncome(''); setExpense(''); setCategory('')
      descRef.current?.focus()
    }
  }

  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }
  const field = 'w-full px-1.5 py-1 text-xs rounded border border-transparent hover:border-slate-200 focus:border-primary-400 bg-transparent focus:bg-white dark:focus:bg-dark-800 text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none'

  return (
    <tr className="bg-slate-50/40 dark:bg-dark-800/30" data-testid="quick-add-row">
      <td className="px-2.5 py-1.5 text-slate-400"><Plus className="w-3.5 h-3.5" /></td>
      <td className="px-1.5 py-1.5">
        <input type="date" aria-label="Vencimento" value={date || defaultDate} onChange={e => setDate(e.target.value)} onKeyDown={onKey} className={field} />
      </td>
      <td className="px-1.5 py-1.5">
        <input ref={descRef} data-testid="quick-add-description" placeholder="Novo lançamento…" value={description}
          onChange={e => { setDescription(e.target.value); setError('') }} onKeyDown={onKey} className={field} />
        {error && <p className="text-[10px] text-red-500 mt-0.5 px-1.5" data-testid="quick-add-error">{error}</p>}
      </td>
      <td className="px-1.5 py-1.5">
        <select aria-label="Categoria" value={category} onChange={e => setCategory(e.target.value)} onKeyDown={onKey} className={field}>
          <option value="">Categoria</option>
          {Object.entries(categoryLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </td>
      <td className="px-1.5 py-1.5">
        <select aria-label="Conta" value={accountId} onChange={e => setAccountId(e.target.value)} onKeyDown={onKey} className={field}>
          <option value="">Conta</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </td>
      <td className="px-1.5 py-1.5">
        <input data-testid="quick-add-income" inputMode="decimal" placeholder="Entrada" value={income}
          onChange={e => { setIncome(e.target.value); setError('') }} onKeyDown={onKey} className={cn(field, 'text-right')} />
      </td>
      <td className="px-1.5 py-1.5">
        <input data-testid="quick-add-expense" inputMode="decimal" placeholder="Saída" value={expense}
          onChange={e => { setExpense(e.target.value); setError('') }} onKeyDown={onKey} className={cn(field, 'text-right')} />
      </td>
      <td colSpan={4} className="px-2.5 py-1.5">
        <button type="button" onClick={submit} disabled={busy} data-testid="quick-add-submit"
          className="text-[11px] font-semibold text-primary-600 dark:text-primary-400 hover:underline disabled:opacity-50">
          {busy ? 'Salvando…' : 'Adicionar ↵'}
        </button>
      </td>
    </tr>
  )
}
