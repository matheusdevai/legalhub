import { describe, it, expect } from 'vitest'
import { swapSeccionalTribunal } from './OabSyncModal'

describe('swapSeccionalTribunal', () => {
  // Bug real: ao trocar a seccional (UF) da OAB, o TJ da UF anterior continuava
  // na lista de tribunais marcados para busca — o código só adicionava o novo,
  // nunca removia o antigo, então a busca continuava consultando um tribunal
  // sem relação com o registro atual da OAB, de forma silenciosa.
  it('troca o TJ da seccional anterior pelo novo ao mudar de UF', () => {
    const result = swapSeccionalTribunal(['tjsp'], 'SP', 'RJ')
    expect(result).toEqual(['tjrj'])
  })

  it('preserva tribunais extras marcados manualmente (TRFs) ao trocar a UF', () => {
    const result = swapSeccionalTribunal(['tjsp', 'trf3'], 'SP', 'RJ')
    expect(result).toEqual(['tjrj', 'trf3'])
    expect(result).not.toContain('tjsp')
  })

  it('não duplica o TJ se ele já estiver na lista (ex: adicionado manualmente antes)', () => {
    const result = swapSeccionalTribunal(['tjrj'], 'SP', 'RJ')
    expect(result.filter(t => t === 'tjrj')).toHaveLength(1)
  })

  it('ao definir a seccional pela primeira vez (sem UF anterior), apenas adiciona o novo TJ', () => {
    const result = swapSeccionalTribunal([], '', 'MG')
    expect(result).toEqual(['tjmg'])
  })

  it('ao limpar a seccional (nova UF vazia), remove o TJ da UF anterior sem adicionar nada', () => {
    const result = swapSeccionalTribunal(['tjmg'], 'MG', '')
    expect(result).toEqual([])
  })

  it('não altera a lista quando a UF não muda', () => {
    const result = swapSeccionalTribunal(['tjsp', 'trf3'], 'SP', 'SP')
    expect(result).toEqual(['tjsp', 'trf3'])
  })
})
