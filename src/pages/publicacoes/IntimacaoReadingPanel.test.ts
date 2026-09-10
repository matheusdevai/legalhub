import { describe, it, expect } from 'vitest'
import { isSafeHttpUrl } from './IntimacaoReadingPanel'

// `link` vem da API pública do DJEN (fora do nosso controle) e é renderizado
// como href no painel de leitura — precisa ser validado antes de virar link
// clicável, senão um valor tipo "javascript:..." executaria no clique (XSS).
describe('isSafeHttpUrl (link da intimação, achado de review de segurança)', () => {
  it('aceita URLs http e https', () => {
    expect(isSafeHttpUrl('https://www.dje.tjsp.jus.br')).toBe(true)
    expect(isSafeHttpUrl('http://comunica.pje.jus.br/algo')).toBe(true)
  })

  it('rejeita esquemas perigosos ou não-http', () => {
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isSafeHttpUrl('vbscript:msgbox(1)')).toBe(false)
    expect(isSafeHttpUrl('file:///etc/passwd')).toBe(false)
  })

  it('rejeita texto que não é uma URL válida', () => {
    expect(isSafeHttpUrl('não é uma url')).toBe(false)
    expect(isSafeHttpUrl('')).toBe(false)
    expect(isSafeHttpUrl('   ')).toBe(false)
  })
})
