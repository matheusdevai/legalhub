import { describe, it, expect } from 'vitest'
import { buildClientImportPreview } from './clientImportUtils'

describe('buildClientImportPreview', () => {
  it('marca como duplicado quando o CPF já existe em um cliente cadastrado', () => {
    const rows = [{ nome: 'Maria Silva', cpf_cnpj: '123.456.789-00' }]
    const existing = [{ cpf_cnpj: '12345678900' }]
    const preview = buildClientImportPreview(rows, existing)
    expect(preview[0].duplicate).toBe(true)
  })

  it('não marca como duplicado quando o CPF é novo', () => {
    const rows = [{ nome: 'João Souza', cpf_cnpj: '111.222.333-44' }]
    const preview = buildClientImportPreview(rows, [{ cpf_cnpj: '99988877766' }])
    expect(preview[0].duplicate).toBe(false)
  })

  // Bug real corrigido: antes só comparava contra clientes já existentes no
  // banco, então duas linhas com o mesmo CPF DENTRO do próprio arquivo CSV
  // (ex: exportado duas vezes e concatenado por engano) eram as duas
  // importadas como clientes distintos.
  it('marca como duplicado a segunda ocorrência do mesmo CPF dentro do próprio arquivo importado', () => {
    const rows = [
      { nome: 'Ana Paula', cpf_cnpj: '555.666.777-88' },
      { nome: 'Ana Paula (repetida)', cpf_cnpj: '555.666.777-88' },
    ]
    const preview = buildClientImportPreview(rows, [])
    expect(preview[0].duplicate).toBe(false) // primeira ocorrência é válida
    expect(preview[1].duplicate).toBe(true)  // segunda é a duplicata
  })

  it('não marca como duplicado quando o CPF/CNPJ está vazio (não força comparação de vazios)', () => {
    const rows = [{ nome: 'Sem documento' }, { nome: 'Também sem documento' }]
    const preview = buildClientImportPreview(rows, [])
    expect(preview.every(r => !r.duplicate)).toBe(true)
  })

  it('aceita tanto a chave "cpf_cnpj" quanto "cpf/cnpj" (variação de cabeçalho do CSV)', () => {
    const rows = [{ nome: 'Teste', 'cpf/cnpj': '999.888.777-66' }]
    const preview = buildClientImportPreview(rows, [{ cpf_cnpj: '99988877766' }])
    expect(preview[0].duplicate).toBe(true)
    expect(preview[0].cpf_cnpj).toBe('999.888.777-66')
  })

  it('normaliza tipo "PJ" (case-insensitive) e usa "pf" como padrão', () => {
    const rows = [{ nome: 'Empresa X', tipo: 'PJ' }, { nome: 'Pessoa Y', tipo: '' }]
    const preview = buildClientImportPreview(rows, [])
    expect(preview[0].type).toBe('pj')
    expect(preview[1].type).toBe('pf')
  })

  it('normaliza status desconhecido para "prospect"', () => {
    const rows = [{ nome: 'A', status: 'invalido' }, { nome: 'B', status: 'ACTIVE' }]
    const preview = buildClientImportPreview(rows, [])
    expect(preview[0].status).toBe('prospect')
    expect(preview[1].status).toBe('active')
  })
})
