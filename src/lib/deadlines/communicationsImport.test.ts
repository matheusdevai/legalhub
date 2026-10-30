import { describe, expect, it } from 'vitest'
import { communicationsToImport } from './communicationsImport'

const proc = (id: string, movimentos: unknown) => ({ id, number: '0000', movimentos })

describe('communicationsToImport', () => {
  it('importa só intimações do DJEN, novas e a partir da data de corte', () => {
    const rows = communicationsToImport([
      proc('p1', [
        { fonte: 'pje', idComunicacao: 101, nome: 'Intimação', dataHora: '2026-10-20', orgao: '1ª Vara', teor: 'Fica intimada...' },
        { fonte: 'pje', idComunicacao: 102, dataHora: '2026-09-01' },        // antes do corte
        { fonte: 'pje', idComunicacao: 103, dataHora: '2026-10-25' },        // já importada
        { codigo: 26, nome: 'Distribuído', dataHora: '2026-10-21' },         // andamento do DataJud
      ]),
      proc('p2', [{ fonte: 'pje', hash: 'abc', dataHora: '2026-10-28' }]),
      proc('p3', null),
    ], new Set(['103']), '2026-10-01')
    expect(rows.map(r => r.external_id)).toEqual(['101', 'abc'])
    expect(rows[0]).toMatchObject({ process_id: 'p1', made_available_at: '2026-10-20', organ: '1ª Vara', content: 'Fica intimada...' })
  })

  it('não duplica a mesma comunicação vinda em dois processos', () => {
    const m = { fonte: 'pje', idComunicacao: 7, dataHora: '2026-10-20' }
    expect(communicationsToImport([proc('a', [m]), proc('b', [m])], new Set(), '2026-01-01')).toHaveLength(1)
  })
})
