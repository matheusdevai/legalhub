import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchCitiesByState } from './ibgeUtils'

describe('fetchCitiesByState', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retorna lista vazia sem chamar a API quando nenhuma UF é informada', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchCitiesByState('')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retorna os nomes das cidades em ordem alfabética', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 1, nome: 'Sousa' }, { id: 2, nome: 'Cajazeiras' }, { id: 3, nome: 'Bayeux' }],
    }))
    expect(await fetchCitiesByState('PB')).toEqual(['Bayeux', 'Cajazeiras', 'Sousa'])
  })

  it('lança erro se a API responder com falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    await expect(fetchCitiesByState('XX')).rejects.toThrow()
  })

  it('cacheia o resultado por UF e não chama a API de novo para a mesma UF', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: 1, nome: 'Niterói' }] })
    vi.stubGlobal('fetch', fetchMock)
    await fetchCitiesByState('RJ')
    await fetchCitiesByState('RJ')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
