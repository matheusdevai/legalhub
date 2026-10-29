const { record } = require('./recorder.cjs')

const OPTS = { mobile: { width: 390, height: 844, touch: true } }

const CLIPS = {
  // Celular: painel → menu → processos
  async mobile(h) {
    await h.goto('/dashboard')
    await h.start()
    await h.wait(1200)
    await h.scroll(700, { el: 'main' })
    await h.wait(900)
    await h.scroll(-700)
    await h.click('header button >> nth=0', { after: 1100 })
    await h.click('aside a:has-text("Processos")', { after: 1800 })
    await h.scroll(600, { el: 'main' })
    await h.wait(1200)
    await h.click('header button >> nth=0', { after: 1000 })
    await h.click('aside a:has-text("Agenda")', { after: 1800 })
    await h.scroll(900, { el: 'main' })
    await h.wait(1200)
  },

  // Visão geral: dashboard → quadro (kanban) → desempenho
  async dashboard(h) {
    await h.goto('/dashboard')
    await h.start()
    await h.wait(1200)
    await h.moveTo('text=Tarefas pendentes', { duration: 900 })
    await h.wait(500)
    await h.click('button:has-text("Quadro")', { after: 1800 })
    await h.moveTo('main', { dy: 80, duration: 900 })
    await h.wait(900)
    await h.click('button:has-text("Desempenho")', { after: 1600 })
    await h.scroll(420, { el: 'main' })
    await h.wait(1400)
  },

  // Processos: lista → busca → abre um processo
  async processos(h) {
    await h.goto('/processos')
    await h.start()
    await h.wait(1000)
    await h.scroll(380, { el: 'table' })
    await h.wait(500)
    await h.scroll(-380)
    await h.click('input[placeholder="Buscar processo..."]', { after: 300 })
    await h.type('Luciana')
    await h.wait(1200)
    await h.click('table tbody tr >> nth=0', { dx: -300, after: 2200 })
    await h.scroll(300, { el: '[role="dialog"], .fixed >> nth=-1' }).catch(() => {})
    await h.wait(1500)
  },

  // Intimações: lista → lê o teor → cria tarefa de prazo
  async intimacoes(h) {
    await h.goto('/publicacoes')
    await h.start()
    await h.wait(1000)
    const items = h.page.locator('main button:has-text("Intimação"), main [role="button"]:has-text("Intimação")')
    await h.click(items.nth(0), { after: 1500 })
    await h.click(items.nth(1), { after: 1700 })
    await h.click('button:has-text("Criar tarefa de prazo")', { after: 2200 })
    await h.wait(1200)
  },

  // Financeiro: visão geral → fluxo de caixa → recorrentes
  async financeiro(h) {
    await h.goto('/financeiro')
    await h.start()
    await h.wait(900)
    await h.moveTo('text=Receitas x Despesas', { duration: 800 })
    await h.wait(700)
    await h.scroll(560, { el: 'main' })
    await h.wait(1300)
    await h.scroll(-560)
    await h.click('button:has-text("Fluxo de Caixa")', { after: 2200 })
    await h.scroll(300, { el: 'main' })
    await h.wait(1000)
    await h.click('button:has-text("Recorrentes")', { after: 2200 })
  },

  // Agenda: mês → semana → próximo
  async agenda(h) {
    await h.goto('/agenda')
    await h.start()
    await h.wait(900)
    await h.click('button:has-text("Semana")', { after: 1600 })
    await h.click('button[aria-label*="róxim"], button:has(svg.lucide-chevron-right) >> nth=0', { after: 1600 }).catch(() => {})
    await h.click('button:has-text("Mês")', { after: 1300 })
    await h.click('button:has-text("Lista")', { after: 2000 })
  },

  // Excelência (IA): análise judicial de um processo
  async ia(h) {
    await h.goto('/ia-juridica')
    await h.start()
    await h.wait(900)
    const sel = h.page.locator('main select').first()
    await h.moveTo(sel)
    const value = await sel.locator('option', { hasText: 'Luciana' }).first().getAttribute('value')
    await h.page.mouse.down(); await h.page.mouse.up()
    await sel.selectOption(value)
    await h.wait(900)
    await h.click('button:has-text("Análise (Judicial)")', { after: 1000 })
    await h.click('button:has-text("Analisar")', { after: 2200 })
    await h.cut(async () => {
      await h.page.waitForFunction(() => !document.querySelector('main button[disabled] svg.animate-spin') && /Recomenda|Riscos|Próximos passos|Status/i.test(document.querySelector('main')?.innerText || ''), null, { timeout: 120000 }).catch(() => {})
      await h.page.waitForTimeout(1500)
    })
    await h.wait(1200)
    await h.scroll(520, { el: 'main' })
    await h.wait(1500)
    await h.scroll(520)
    await h.wait(1500)
  },
}

;(async () => {
  const names = process.argv.slice(2)
  for (const name of names.length ? names : Object.keys(CLIPS)) {
    await record(name, OPTS[name] || {}, CLIPS[name])
  }
})().catch(e => { console.error(e); process.exit(1) })

module.exports = { CLIPS }
