import { describe, expect, it } from 'vitest'
import { brDate, parseCalendarColumn, parseCasesCsv, splitCsvLine } from './casosImport'

const HEADER = 'id;tribunal;comarca;tipo do ato;regime;como chegou;data do evento;prazo;unidade;prazo em dobro?;recesso se aplica?;feriados;DATA FATAL CORRETA;como chegou nessa data;conferido por'

describe('importação da bateria de casos', () => {
  it('lê CSV com aspas, BOM e datas brasileiras', () => {
    expect(splitCsvLine('a;"b;c";"d ""x"""')).toEqual(['a', 'b;c', 'd "x"'])
    expect(brDate('29/10/2026')).toBe('2026-10-29')
    expect(brDate('31/02/2026')).toBeNull()
  })

  it('feriados da coluna livre, com ano inferido na virada do ano', () => {
    const cal = parseCalendarColumn('02/11 Finados e 20/11 Consciência Negra (feriados nacionais)', '2026-10-29')
    expect(cal.map(c => c.date)).toEqual(['2026-11-02', '2026-11-20'])
    expect(parseCalendarColumn('05/01 suspensão de prazos (Portaria 12/2027)', '2026-12-10')[0]).toMatchObject({ date: '2027-01-05', kind: 'suspension' })
    expect(parseCalendarColumn('—', '2026-10-29')).toEqual([])
  })

  it('converte linhas válidas, pula exemplos e lista os erros por linha', () => {
    const csv = '﻿' + [
      HEADER,
      'tjpb-001;TJPB;João Pessoa;Contestação;civel;djen;29/10/2026;15;dias_uteis;não;sim;02/11 Finados;24/11/2026;Publicação 30/10…;EXEMPLO — substituir',
      'tjpb-002;TJPB;João Pessoa;Réplica;civel;djen;26/10/2026;15;dias_uteis;não;sim;—;18/11/2026;Publicação 27/10, início 28/10;Dra. Fulana (OAB/PB 1)',
      'pen-001;TJPB;Patos;Apelação;penal;data_inicial;30/10/2026;5;;não;sim;;09/11/2026;Súmula 310;Dr. Beltrano (OAB/PB 2)',
      'x-1;TJPB;;Recurso;civil;djen;32/10/2026;quinze;;;;;;;',
    ].join('\n')
    const r = parseCasesCsv(csv)
    expect(r.skipped).toBe(1)
    expect(r.cases.map(c => c.id)).toEqual(['tjpb-002', 'pen-001'])
    expect(r.cases[1].input).toMatchObject({ regime: 'penal', amount: 5, applyRecess: true })
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toMatch(/Linha 5 \(x-1\): regime inválido .*data do evento inválida.*prazo inválido.*data fatal inválida.*conferido por/)
  })
})
