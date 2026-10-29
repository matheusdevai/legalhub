const { record } = require('./recorder.cjs')

// Roteiro de cada vídeo: h.say() fala (e espera a fala anterior terminar);
// as ações seguintes acontecem enquanto a narração toca.
const OPTS = { mobile: { width: 390, height: 844, touch: true } }

const CLIPS = {
  async painel(h) {
    await h.goto('/dashboard')
    await h.start()
    await h.say('Este é o painel do LegalHub: o dia do escritório inteiro em uma única tela.')
    await h.moveTo('text=Tarefas pendentes', { duration: 1200 })
    await h.say('Os cartões mostram tarefas concluídas, pendentes e vencidas, e a lista de compromissos já vem ordenada pelo prazo.')
    await h.moveTo('text=Compromissos', { duration: 1000 })
    await h.wait(1500)
    await h.say('No modo quadro, cada tarefa aparece na coluna certa: hoje, próximos sete dias e em andamento.')
    await h.click('button:has-text("Quadro")', { after: 1500 })
    await h.moveTo('text=Próximos 7 dias', { duration: 1200 })
    await h.say('E na aba desempenho, você acompanha a produtividade da equipe mês a mês.')
    await h.click('button:has-text("Desempenho")', { after: 1500 })
    await h.scroll(380, { el: 'main' })
  },

  async intimacoes(h) {
    await h.goto('/publicacoes')
    await h.start()
    await h.say('Todos os dias, o LegalHub busca as suas intimações no Diário de Justiça Eletrônico Nacional, usando apenas o número da sua OAB.')
    const items = h.page.locator('main button:has-text("Intimação"), main [role="button"]:has-text("Intimação")')
    await h.moveTo(items.nth(0), { duration: 1200 })
    await h.say('Clique em uma publicação para ler o texto completo, sem sair do sistema.')
    await h.click(items.nth(1), { after: 1200 })
    await h.moveTo('main >> text=Fica a parte autora intimada', { duration: 1000 }).catch(() => {})
    await h.say('Com um clique, você cria a tarefa de prazo. A contagem em dias úteis é automática, e a data já vai para a agenda.')
    await h.click('button:has-text("Criar tarefa de prazo")', { after: 1200 })
    await h.moveTo('text=Vencimento', { duration: 1000 }).catch(() => {})
  },

  async processos(h) {
    await h.goto('/processos')
    await h.start()
    await h.say('Na tela de processos, ficam todos os casos do escritório, com partes, número, fase e último andamento.')
    await h.scroll(380, { el: 'table' })
    await h.wait(600)
    await h.scroll(-380)
    await h.say('A busca encontra qualquer processo em segundos.')
    await h.click('input[placeholder="Buscar processo..."]', { after: 300 })
    await h.type('Luciana')
    await h.wait(800)
    await h.say('Ao abrir um processo, você vê partes, fase, grupo de ação, andamentos e honorários, tudo no mesmo lugar.')
    await h.click('table tbody tr >> nth=0', { dx: -300, after: 1800 })
    await h.scroll(320)
  },

  async clientes(h) {
    await h.goto('/clientes')
    await h.start()
    await h.say('Em clientes, ficam todos os contatos do escritório, com telefone, cidade e quantidade de processos.')
    await h.scroll(300, { el: 'table' })
    await h.scroll(-300)
    await h.say('Dá para importar uma planilha inteira de clientes, e o sistema avisa quando encontra cadastros duplicados.')
    await h.moveTo('button:has-text("Importar")', { duration: 1000 })
    await h.wait(1500)
    await h.say('Ao abrir um cliente, o histórico completo aparece na hora: dados de contato, processos e documentos.')
    await h.click('text=Luciana Torres Brandão', { after: 1800 })
    await h.scroll(360, { el: 'text=Processos (1)' }).catch(() => {})
  },

  async agenda(h) {
    await h.goto('/agenda')
    await h.start()
    await h.say('A agenda reúne audiências, prazos e reuniões em um só calendário, com uma cor para cada tipo de compromisso.')
    await h.moveTo('text=Audiência', { duration: 1200 })
    await h.wait(800)
    await h.say('Na visão da semana, você planeja os próximos dias com folga.')
    await h.click('button:has-text("Semana")', { after: 1300 })
    await h.click('button:has(svg.lucide-chevron-right) >> nth=0', { after: 1200 }).catch(() => {})
    await h.say('E na visão em lista, tudo aparece em ordem cronológica. A agenda também sincroniza com o Google Agenda.')
    await h.click('button:has-text("Lista")', { after: 1800 })
    await h.moveTo('text=Conectar Google Calendar', { duration: 1200 }).catch(() => {})
  },

  async financeiro(h) {
    await h.goto('/financeiro')
    await h.start()
    await h.say('O financeiro mostra saldo, receitas, despesas e pagamentos atrasados logo de cara.')
    await h.moveTo('text=Receitas x Despesas', { duration: 1200 })
    await h.say('Mais abaixo, a planilha de lançamentos funciona como uma planilha de verdade, com edição direto na célula.')
    await h.scroll(600, { el: 'main' })
    await h.wait(1200)
    await h.scroll(-600)
    await h.say('O fluxo de caixa mostra entradas e saídas de cada mês, no previsto e no realizado.')
    await h.click('button:has-text("Fluxo de Caixa")', { after: 1500 })
    await h.scroll(300, { el: 'main' })
    await h.say('E em recorrentes, aluguel, assinaturas e outras contas fixas aparecem mês a mês.')
    await h.click('button:has-text("Recorrentes")', { after: 1500 })
  },

  async ia(h) {
    await h.goto('/ia-juridica')
    await h.start()
    await h.say('A Excelência é a inteligência artificial jurídica do LegalHub.')
    const sel = h.page.locator('main select').first()
    await h.moveTo(sel)
    const value = await sel.locator('option', { hasText: 'Luciana' }).first().getAttribute('value')
    await h.page.mouse.down(); await h.page.mouse.up()
    await sel.selectOption(value)
    await h.say('Escolha um processo e o tipo de análise. Também dá para anexar documentos em PDF ou imagem.')
    await h.click('button:has-text("Análise (Judicial)")', { after: 900 })
    await h.moveTo('text=Anexar PDF ou imagem', { duration: 900 })
    await h.waitSpeech()
    await h.click('button:has-text("Analisar")', { after: 1500 })
    // Espera a geração terminar (spinner some); se o Gemini falhar (503 de
    // demanda alta), tenta de novo — tudo dentro do corte, fora do vídeo.
    await h.cut(async () => {
      for (let attempt = 1; attempt <= 5; attempt++) {
        await h.page.waitForTimeout(1500)
        await h.page.waitForFunction(() => /Resultado \(edit|Erro ao consultar|não pôde gerar|Erro ao gerar/i.test(document.querySelector('main')?.innerText || ''), null, { timeout: 150000 })
        const text = await h.page.locator('main').innerText()
        if (!/Erro ao consultar|não pôde gerar|Erro ao gerar/i.test(text)) return
        console.log('IA falhou, tentativa', attempt)
        if (attempt === 5) throw new Error('IA falhou 5 vezes (Gemini)')
        await h.page.waitForTimeout(20000)
        await h.page.locator('button:has-text("Tentar novamente")').first().click()
      }
    })
    await h.page.waitForTimeout(800)
    await h.say('Em poucos segundos, a análise chega com status do processo, riscos, prazos críticos e próximos passos recomendados.')
    await h.scroll(450, { el: 'main' })
    await h.wait(1500)
    await h.scroll(450)
    await h.say('Você revisa, ajusta e decide, com muito mais rapidez.')
  },

  async documentos(h) {
    await h.goto('/escritorio-digital')
    await h.start()
    await h.say('No Escritório Digital, cada cliente tem a sua pasta, e o espaço de armazenamento fica sempre à vista.')
    await h.moveTo('text=usados de', { duration: 1000 })
    await h.say('Abra uma pasta para ver os documentos do caso.')
    await h.click('main >> text=Luciana Torres Brandão', { after: 1500 })
    await h.click('text=Laudo médico (exemplo)', { after: 2000 })
    await h.page.keyboard.press('Escape')
    await h.say('Em documentos, ficam os modelos do escritório, como procuração, contrato de honorários e petições, prontos para reaproveitar.')
    await h.goto('/documentos')
    await h.moveTo('text=Procuração ad judicia', { duration: 1000 })
    await h.click('text=Contrato de honorários advocatícios', { after: 2200 })
  },

  async relatorios(h) {
    await h.goto('/relatorios')
    await h.start()
    await h.say('Os relatórios mostram a agilidade do escritório: tarefas concluídas no prazo, em atraso e pendentes.')
    await h.moveTo('text=AGILIDADE', { duration: 1200 })
    await h.wait(800)
    await h.say('E na produtividade, você vê quantos clientes, protocolos e tarefas cada pessoa da equipe entregou no mês.')
    await h.click('button:has-text("Produtividade")', { after: 1500 })
    await h.moveTo('text=Tarefas Realizadas', { duration: 1200 })
  },

  async leads(h) {
    await h.goto('/leads')
    await h.start()
    await h.say('Em leads, você acompanha os possíveis clientes, do primeiro contato até o contrato assinado.')
    await h.moveTo('text=Funil de Vendas', { duration: 1200 })
    await h.say('O funil mostra em que etapa cada um está, de onde veio e quem precisa de retorno hoje.')
    await h.moveTo('text=Próximos Follow-ups', { duration: 1200 })
    await h.click('button:has-text("Leads / CRM")', { after: 1800 })
    await h.say('E quando o lead fecha negócio, ele vira cliente do escritório com um clique.')
  },

  async mobile(h) {
    await h.goto('/dashboard')
    await h.start()
    await h.say('E tudo isso funciona no celular, direto no navegador, sem instalar nada.')
    await h.scroll(500)
    await h.scroll(-500)
    await h.say('Confira as tarefas do dia, consulte um processo ou a agenda de onde estiver.')
    await h.click('header button >> nth=0', { after: 900 })
    await h.click('aside a:has-text("Processos")', { after: 1500 })
    await h.scroll(500)
    await h.click('header button >> nth=0', { after: 900 })
    await h.click('aside a:has-text("Agenda")', { after: 1500 })
    await h.scroll(700)
  },
}

;(async () => {
  const names = process.argv.slice(2)
  for (const name of names.length ? names : Object.keys(CLIPS)) {
    await record(name, OPTS[name] || {}, CLIPS[name])
  }
})().catch(e => { console.error(e); process.exit(1) })

module.exports = { CLIPS }
