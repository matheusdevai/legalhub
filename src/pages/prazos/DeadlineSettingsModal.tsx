import { useState } from 'react'
import { Button, Modal, Select } from '@/components/ui'
import { toast } from '@/components/ui/Toast'
import { updateDeadlineSettings, type DeadlineSettings, type TeamMember } from '@/lib/deadlines/api'

interface Props {
  tenantId: string
  settings: DeadlineSettings
  team: TeamMember[]
  onClose: () => void
  onSaved: (s: DeadlineSettings) => void
}

/** Configurações › Prazos (administrador) — especificação, seção 11. */
export function DeadlineSettingsModal({ tenantId, settings, team, onClose, onSaved }: Props) {
  const [margin, setMargin] = useState(String(settings.internal_margin_days))
  const [hour, setHour] = useState(String(settings.escalation_hour))
  const [triage, setTriage] = useState(settings.triage_owner_id || '')
  const [solo, setSolo] = useState(settings.solo_mode)
  const [saving, setSaving] = useState(false)

  async function save() {
    const patch = { internal_margin_days: Number(margin), escalation_hour: Number(hour), triage_owner_id: triage || null, solo_mode: solo }
    setSaving(true)
    const { error } = await updateDeadlineSettings(tenantId, patch)
    setSaving(false)
    if (error) { toast(`Não foi possível salvar: ${error.message}`, 'error'); return }
    toast('Configurações de prazos salvas.', 'success')
    onSaved({ ...settings, ...patch })
  }

  return (
    <Modal open onClose={onClose} title="Configurações do Controle de Prazos" size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Select label="Margem do prazo interno" value={margin} onChange={e => setMargin(e.target.value)}>
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} {n === 1 ? 'dia útil' : 'dias úteis'} antes do fatal</option>)}
          </Select>
          <Select label="Escalonamento no dia do fatal" value={hour} onChange={e => setHour(e.target.value)}>
            {[10, 11, 12, 13, 14, 15, 16].map(h => <option key={h} value={h}>{h}h</option>)}
          </Select>
        </div>
        <p className="-mt-2 text-xs text-slate-500">
          No dia do fatal, se o protocolo não tiver sido registrado até esse horário, o administrador é avisado junto com o responsável e o conferente. O escalonamento não pode ser desligado.
        </p>
        <Select label="Responsável pela triagem das intimações" value={triage} onChange={e => setTriage(e.target.value)}>
          <option value="">Administradores do escritório</option>
          {team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={solo} onChange={e => setSolo(e.target.checked)} className="mt-1" />
          <span>
            Escritório de uma pessoa só (modo solo)
            <span className="block text-xs text-slate-500">Sem um segundo advogado, a conferência é feita pela mesma pessoa, mas só a partir do dia seguinte ao cadastro.</span>
          </span>
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} loading={saving}>Salvar</Button>
        </div>
      </div>
    </Modal>
  )
}
