import { describe, expect, it } from 'vitest'
import { mergeTemplateVariables } from './documentTemplateUtils'

const TEMPLATE = [
  'Outorgante: [NOME_CLIENTE], CPF/CNPJ [CPF_CNPJ], residente em [ENDERECO].',
  'Contato: [EMAIL] / [TELEFONE].',
  'Área: [AREA_DIREITO]. Data: [DATA].',
  'Escritório: [NOME_ESCRITORIO]. Advogado: [NOME_ADVOGADO], OAB [OAB].',
  'Processo: [NUMERO_PROCESSO].',
].join('\n')

describe('mergeTemplateVariables', () => {
  it('preenche todos os placeholders quando o cliente PF tem todos os dados', () => {
    const result = mergeTemplateVariables(TEMPLATE, {
      client: {
        name: 'Maria da Silva',
        cpf_cnpj: '12345678900',
        email: 'maria@example.com',
        phone: '11999998888',
        celular: null,
        address: 'Rua das Flores, 123',
        cidade: 'São Paulo',
        state: 'SP',
        bairro: 'Centro',
        cep: '01000-000',
        area_direito: 'Previdenciário',
        nationality: null, marital_status: null, profession: null, rg: null,
      },
      tenant: { name: 'Escritório Exemplo' },
      profile: { name: 'Dr. João Advogado', oab_number: '123456' },
    })

    expect(result).toContain('Outorgante: Maria da Silva, CPF/CNPJ 123.456.789-00, residente em Rua das Flores, 123, Centro, São Paulo, SP.')
    expect(result).toContain('Contato: maria@example.com / (11) 99999-8888.')
    expect(result).toContain('Área: Previdenciário.')
    expect(result).toContain('Escritório: Escritório Exemplo. Advogado: Dr. João Advogado, OAB 123456.')
    // Sem processo vinculado ainda nesse ponto do fluxo — placeholder fica visível para preenchimento manual
    expect(result).toContain('Processo: [NUMERO_PROCESSO].')
  })

  it('deixa placeholders sem dado disponível em branco, sem quebrar', () => {
    const result = mergeTemplateVariables('[NOME_CLIENTE] - [CPF_CNPJ] - [ENDERECO] - [NOME_ESCRITORIO]', {
      client: {
        name: 'Empresa PJ Ltda', cpf_cnpj: null, email: null, phone: null, celular: null,
        address: null, cidade: null, state: null, bairro: null, cep: null, area_direito: null,
        nationality: null, marital_status: null, profession: null, rg: null,
      },
      tenant: null,
      profile: null,
    })

    expect(result).toBe('Empresa PJ Ltda -  -  - ')
  })

  it('usa celular quando phone não está preenchido', () => {
    const result = mergeTemplateVariables('[TELEFONE]', {
      client: {
        name: 'X', cpf_cnpj: null, email: null, phone: null, celular: '11988887777',
        address: null, cidade: null, state: null, bairro: null, cep: null, area_direito: null,
        nationality: null, marital_status: null, profession: null, rg: null,
      },
    })
    expect(result).toBe('(11) 98888-7777')
  })
})
