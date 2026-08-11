import { describe, it, expect, vi, afterEach } from 'vitest'
import { withErrorFeedback } from './errorFeedback'

describe('withErrorFeedback', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retorna o resultado sem avisar nada quando não há erro', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const result = await withErrorFeedback(Promise.resolve({ data: { id: '1' }, error: null }), 'Erro ao salvar')
    expect(result).toEqual({ data: { id: '1' }, error: null })
    expect(alertSpy).not.toHaveBeenCalled()
  })

  it('avisa com o prefixo e a mensagem do erro quando a escrita falha', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const result = await withErrorFeedback(
      Promise.resolve({ data: null, error: { message: 'permissão negada' } }),
      'Erro ao salvar processo'
    )
    expect(result.error).toEqual({ message: 'permissão negada' })
    expect(alertSpy).toHaveBeenCalledWith('Erro ao salvar processo: permissão negada')
  })
})
