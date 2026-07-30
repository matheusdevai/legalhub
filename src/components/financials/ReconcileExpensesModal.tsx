import { useEffect, useState } from 'react'
import { Receipt, ArrowRight } from 'lucide-react'
import { Modal, Button, Input } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { Financial } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  clientId: string
  clientName: string
  onDone: () => void
}

export function ReconcileExpensesModal({ open, onClose, clientId, clientName, onDone }: Props) {
  const [loading, setLoading] = useState(true)
  const [expenses, setExpenses] = useState<Financial[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [grossAmount, setGrossAmount] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setDescription(`Honorários — ${clientName}`)
    setGrossAmount('')
    setDueDate(new Date().toISOString().slice(0, 10))
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('financials')
        .select('*')
        .eq('client_id', clientId)
        .eq('type', 'payable')
        .eq('reconciled', false)
        .is('deleted_at', null)
        .order('due_date', { ascending: false })
      const rows = (data || []) as Financial[]
      setExpenses(rows)
      setSelected(new Set(rows.map(r => r.id)))
      setLoading(false)
    }
    load()
  }, [open, clientId, clientName])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectedTotal = expenses.filter(e => selected.has(e.id)).reduce((s, e) => s + Number(e.amount), 0)
  const gross = parseFloat(grossAmount.replace(',', '.')) || 0
  const net = Math.max(0, gross - selectedTotal)
  const isValid = description.trim() !== '' && gross > 0

  async function save() {
    if (!isValid) return
    setSaving(true)
    const selectedExpenses = expenses.filter(e => selected.has(e.id))
    const breakdown = selectedExpenses.length > 0
      ? `Honorário bruto: ${formatCurrency(gross)}. Gastos descontados (${selectedExpenses.length}): ${formatCurrency(selectedTotal)}. Líquido: ${formatCurrency(net)}.`
      : `Honorário: ${formatCurrency(gross)}. Nenhum gasto descontado.`

    const { data: created, error } = await supabase.from('financials').insert({
      type: 'receivable', category: 'fees', description: description.trim(),
      amount: net, due_date: dueDate || null, status: 'pending',
      client_id: clientId, client_name: clientName,
      notes: breakdown,
    }).select().single()

    if (!error && created && selectedExpenses.length > 0) {
      await supabase.from('financials')
        .update({ reconciled: true, reconciled_in_id: created.id })
        .in('id', selectedExpenses.map(e => e.id))
    }
    setSaving(false)
    onDone()
  }

  return (
    <Modal open={open} onClose={onClose} title="Lançar honorário descontando gastos" size="md">
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-8">Carregando gastos pendentes...</p>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Receipt className="w-3.5 h-3.5" /> Gastos pendentes com {clientName}
            </p>
            {expenses.length === 0 ? (
              <p className="text-sm text-gray-400 bg-gray-50 dark:bg-dark-700 rounded-xl px-3 py-3">
                Nenhum gasto pendente registrado para este cliente.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {expenses.map(e => (
                  <label key={e.id} className="flex items-center gap-3 px-3 py-2 rounded-xl border border-gray-100 dark:border-dark-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-700/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={selected.has(e.id)}
                      onChange={() => toggle(e.id)}
                      className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{e.description}</p>
                      <p className="text-xs text-gray-400">{e.due_date ? formatDate(e.due_date) : '—'}</p>
                    </div>
                    <span className="text-sm font-semibold text-red-500 flex-shrink-0">-{formatCurrency(e.amount)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Descrição" value={description} onChange={e => setDescription(e.target.value)} />
            <Input label="Vencimento" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
          <Input
            label="Valor bruto dos honorários"
            type="number" step="0.01" min="0" placeholder="0,00"
            value={grossAmount} onChange={e => setGrossAmount(e.target.value)}
          />

          <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-dark-700 rounded-xl">
            <div className="text-center">
              <p className="text-[11px] text-gray-400 uppercase tracking-wide">Bruto</p>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{formatCurrency(gross)}</p>
            </div>
            <span className="text-gray-300">−</span>
            <div className="text-center">
              <p className="text-[11px] text-gray-400 uppercase tracking-wide">Gastos</p>
              <p className="text-sm font-semibold text-red-500">{formatCurrency(selectedTotal)}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
            <div className="text-center">
              <p className="text-[11px] text-gray-400 uppercase tracking-wide">Líquido a cobrar</p>
              <p className={cn('text-lg font-bold', net > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400')}>{formatCurrency(net)}</p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button onClick={onClose}
              className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-dark-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors">
              Cancelar
            </button>
            <Button onClick={save} loading={saving} disabled={!isValid}>Criar lançamento</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
