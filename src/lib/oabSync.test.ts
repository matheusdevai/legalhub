import { describe, expect, it } from 'vitest'
import {
  brDate, cnjDigits, courtFromCnjNumber, datajudPatch, djenItemToMovimento, formatCnj,
  groupDjenItemsByProcess, isPlanLimitError, mergeMovimentos, normalizeInscricoes,
  normalizeOabNumber, parseDatajudDate, pickExistingProcess, syncWindow, titleFromDjen,
  type DjenItem,
} from './oabSync'

// Formato real de um item do DJEN (comunicaapi.pje.jus.br), observado em 05/11/2026.
const ITEM: DjenItem = {
  id: 761663256,
  hash: 'abc',
  data_disponibilizacao: '2026-10-20',
  siglaTribunal: 'TRT13',
  tipoComunicacao: 'Intimação',
  tipoDocumento: 'Despacho',
  nomeOrgao: '4ª Vara do Trabalho de João Pessoa',
  nomeClasse: 'AçãO TRABALHISTA - RITO SUMARíSSIMO',
  texto: 'Fica a parte intimada…',
  numero_processo: '00003631620255130004',
  numeroprocessocommascara: '0000363-16.2025.5.13.0004',
  meio: 'D',
  ativo: true,
  destinatarios: [
    { nome: 'FELIPE QUEIROGA - PERITO', polo: '' },
    { nome: 'CLARICE PINHEIRO', polo: 'A' },
    { nome: 'EDYLEIDE DA SILVA', polo: 'P' },
  ],
}

describe('inscrições na OAB', () => {
  it('normaliza número (zeros à esquerda, máscara)', () => {
    expect(normalizeOabNumber('034.461')).toBe('34461')
    expect(normalizeOabNumber(null)).toBe('')
  })

  it('junta principal + suplementares, sem repetir e sem UF inválida', () => {
    const r = normalizeInscricoes({ numero: '34461', uf: 'pb' }, [
      { numero: '034461', uf: 'PB' },      // repetida (zeros à esquerda)
      { numero: '12345-A', uf: 'PE' },     // suplementar
      { numero: '999', uf: 'XX' },         // UF inválida — consultar sem UF traria terceiros
      { numero: '', uf: 'RN' },            // sem número
      'lixo',
    ])
    expect(r).toEqual([{ numero: '34461', uf: 'PB' }, { numero: '12345', uf: 'PE' }])
  })

  it('aceita só suplementares quando não há principal', () => {
    expect(normalizeInscricoes(null, [{ numero: '1', uf: 'SP' }])).toEqual([{ numero: '1', uf: 'SP' }])
    expect(normalizeInscricoes({ numero: '1', uf: '' }, null)).toEqual([])
  })
})

describe('número CNJ → tribunal', () => {
  it('Justiça Estadual pela tabela da Res. CNJ 65/2008 (13 = MG, 15 = PB, 17 = PE, 26 = SP)', () => {
    expect(courtFromCnjNumber('0800071-75.2025.8.15.0041')).toBe('tjpb')
    expect(courtFromCnjNumber('00000000020258130001')).toBe('tjmg')
    expect(courtFromCnjNumber('00000000020258170001')).toBe('tjpe')
    expect(courtFromCnjNumber('00000000020258260001')).toBe('tjsp')
    expect(courtFromCnjNumber('00000000020258070001')).toBe('tjdft')
  })

  it('Justiça Federal é o segmento 4 e a do Trabalho o 5 (a tabela antiga trocava os dois)', () => {
    expect(courtFromCnjNumber('0003553-06.2026.4.05.8201')).toBe('trf5')
    expect(courtFromCnjNumber('0000363-16.2025.5.13.0004')).toBe('trt13')
    expect(courtFromCnjNumber('00000000020255000000')).toBe('tst')
  })

  it('número inválido não chuta tribunal', () => {
    expect(courtFromCnjNumber('123')).toBeNull()
    expect(courtFromCnjNumber('00000000020254990001')).toBeNull()
  })

  it('formata e limpa', () => {
    expect(cnjDigits('0003553-06.2026.4.05.8201 ')).toBe('00035530620264058201')
    expect(formatCnj('00035530620264058201')).toBe('0003553-06.2026.4.05.8201')
  })
})

describe('DJEN → processos', () => {
  it('movimento guarda tribunal, classe, meio e texto integral', () => {
    const m = djenItemToMovimento(ITEM)
    expect(m).toMatchObject({ fonte: 'pje', idComunicacao: 761663256, tribunal: 'trt13', meio: 'D', dataHora: '2026-10-20', orgao: '4ª Vara do Trabalho de João Pessoa' })
    expect(m.cancelada).toBeUndefined()
    expect(djenItemToMovimento({ ...ITEM, ativo: false }).cancelada).toBe(true)
  })

  it('agrupa várias comunicações do mesmo processo (com e sem máscara)', () => {
    const g = groupDjenItemsByProcess([ITEM, { ...ITEM, id: 2, numero_processo: undefined }, { ...ITEM, id: 3, numero_processo: '', numeroprocessocommascara: '' }])
    expect(Array.from(g.keys())).toEqual(['00003631620255130004'])
    expect(g.get('00003631620255130004')).toHaveLength(2)
  })

  it('título usa classe + partes por polo — nunca o perito/1º destinatário como cliente', () => {
    expect(titleFromDjen([ITEM])).toBe('AÇÃO TRABALHISTA - RITO SUMARÍSSIMO — CLARICE PINHEIRO x EDYLEIDE DA SILVA')
    expect(titleFromDjen([{ ...ITEM, nomeClasse: undefined, destinatarios: [] }])).toBe('Intimação')
  })
})

describe('mescla de movimentos', () => {
  it('não apaga as intimações do DJEN ao chegar andamento do DataJud', () => {
    const pje = djenItemToMovimento(ITEM)
    const dj = { codigo: 26, dataHora: '2025-01-21T21:08:38.000Z', nome: 'Distribuição' }
    const { merged, added } = mergeMovimentos([pje], [dj])
    expect(added).toBe(1)
    expect(merged).toEqual([pje, dj])
  })

  it('não repete a mesma comunicação nem o mesmo andamento', () => {
    const pje = djenItemToMovimento(ITEM)
    const dj = { codigo: 26, dataHora: '2025-01-21T21:08:38.000Z', nome: 'Distribuição' }
    const { added } = mergeMovimentos([pje, dj], [{ ...pje, teor: 'outro texto' }, { ...dj }])
    expect(added).toBe(0)
  })

  it('aceita movimentos nulos/legados', () => {
    expect(mergeMovimentos(null, [{ fonte: 'pje', hash: 'h' }]).added).toBe(1)
    expect(mergeMovimentos([{ fonte: 'pje', hash: 'h' }], [{ fonte: 'pje', hash: 'h' }]).added).toBe(0)
  })
})

describe('qual processo recebe as intimações', () => {
  it('prefere o que tem cliente, depois o cadastrado à mão, depois o mais antigo', () => {
    const copia = { id: 'copia', client_id: null, cnj_source: true, created_at: '2026-09-10' }
    const manual = { id: 'manual', client_id: 'c1', cnj_source: false, created_at: '2026-07-27' }
    expect(pickExistingProcess([copia, manual])?.id).toBe('manual')
    expect(pickExistingProcess([
      { id: 'b', client_id: null, cnj_source: false, created_at: '2026-02-01' },
      { id: 'a', client_id: null, cnj_source: false, created_at: '2026-01-01' },
    ])?.id).toBe('a')
    expect(pickExistingProcess([])).toBeNull()
  })
})

describe('DataJud', () => {
  it('lê as duas formas de data de ajuizamento', () => {
    expect(parseDatajudDate('20250121210838')).toBe('2025-01-21')
    expect(parseDatajudDate('2025-01-21T21:08:38Z')).toBe('2025-01-21')
    expect(parseDatajudDate(undefined)).toBeNull()
  })

  it('só preenche campo vazio e soma andamentos', () => {
    const src = {
      grau: 'G1', classe: { nome: 'Usucapião' }, orgaoJulgador: { nome: 'Vara Única de Alagoa Nova' },
      dataAjuizamento: '20250121210838', movimentos: [{ codigo: 26, dataHora: '2025-01-21T21:08:38.000Z', nome: 'Distribuição' }],
    }
    const pje = djenItemToMovimento(ITEM)
    const p = datajudPatch({ title: 'X', area: 'Cível', court: null, data_protocolo: null, movimentos: [pje] }, [src])
    expect(p.area).toBeUndefined() // o advogado já tinha preenchido
    expect(p.court).toBe('Vara Única de Alagoa Nova')
    expect(p.data_protocolo).toBe('2025-01-21')
    expect((p.movimentos as unknown[])[0]).toBe(pje)
    expect(datajudPatch({ title: 'X', area: null, court: null, data_protocolo: null, movimentos: null }, [])).toEqual({})
  })
})

describe('datas e erros', () => {
  it('data de hoje é a de Brasília, não UTC (23h30 em Brasília = 02h30 UTC do dia seguinte)', () => {
    expect(brDate(new Date('2026-11-06T02:30:00Z'))).toBe('2026-11-05')
    expect(syncWindow(new Date('2026-11-06T02:30:00Z'), 365)).toEqual({ inicio: '2025-11-05', fim: '2026-11-05' })
  })

  it('reconhece o erro do limite do plano', () => {
    expect(isPlanLimitError('Limite do plano atingido: seu plano permite no máximo 300 registro(s) em processes.')).toBe(true)
    expect(isPlanLimitError('duplicate key')).toBe(false)
  })
})
