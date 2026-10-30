// Ponte da Fase 2: as intimações do DJEN já chegam pela sincronização
// (sync-pje / cron-sync-processes) e ficam em processes.movimentos (fonte
// 'pje'). Ao abrir a caixa "A triar", elas viram linhas de `communications`
// para triagem — sem mexer nas Edge Functions nesta fase.

export interface ProcessWithMovements {
  id: string
  number: string | null
  movimentos: unknown
}

export interface CommunicationInsert {
  process_id: string
  source: 'djen'
  external_id: string
  made_available_at: string | null
  delivery_method: 'djen'
  organ: string | null
  title: string | null
  content: string | null
}

interface PjeMovement {
  fonte?: string
  idComunicacao?: string | number | null
  hash?: string | null
  nome?: string | null
  dataHora?: string | null
  orgao?: string | null
  teor?: string | null
}

/**
 * Intimações do DJEN ainda não importadas, a partir de `since` (YYYY-MM-DD).
 * `known` = external_ids já existentes no escritório. Movimentos do DataJud
 * (andamentos, não intimações) ficam de fora.
 */
export function communicationsToImport(processes: ProcessWithMovements[], known: Set<string>, since: string): CommunicationInsert[] {
  const out: CommunicationInsert[] = []
  const seen = new Set(known)
  for (const p of processes) {
    const list = Array.isArray(p.movimentos) ? (p.movimentos as PjeMovement[]) : []
    for (const m of list) {
      if (m?.fonte !== 'pje') continue
      const ext = m.idComunicacao != null ? String(m.idComunicacao) : m.hash || null
      if (!ext || seen.has(ext)) continue
      const day = m.dataHora ? String(m.dataHora).slice(0, 10) : null
      if (day && day < since) continue
      seen.add(ext)
      out.push({
        process_id: p.id,
        source: 'djen',
        external_id: ext,
        made_available_at: day,
        delivery_method: 'djen',
        organ: m.orgao || null,
        title: m.nome || 'Intimação',
        content: m.teor || null,
      })
    }
  }
  return out
}
