import { isLaunchPromoActive, EBOOK_PROMO_END } from '@/lib/promoUtils'

export const PROMO_MONTHLY_PRICE = 149
// A oferta some sozinha da página quando a janela acaba — create-checkout-session
// para de aplicar o cupom na mesma data, então anunciar depois disso seria
// prometer um preço que o checkout não cobra.
export const PROMO_ACTIVE = isLaunchPromoActive()
export const PROMO_LAST_DAY = new Date(new Date(EBOOK_PROMO_END).getTime() - 1).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

export const TRIAL_DAYS = 14

// ─── Tour do produto ────────────────────────────────────────────────────────
// Vídeos gravados no app real, num escritório de demonstração com dados
// fictícios (public/demo/<id>.mp4/.webm + pôster .jpg). Para regravar, ver
// scripts/demo-videos/README.md.
export type TourId = 'painel' | 'intimacoes' | 'processos' | 'financeiro' | 'agenda' | 'ia'

export interface TourItem {
  id: TourId
  label: string
  title: string
  description: string
  bullets: string[]
  path: string
}

export const TOUR: TourItem[] = [
  {
    id: 'painel',
    label: 'Painel',
    title: 'O dia do escritório em uma tela',
    description: 'Tarefas de hoje, prazos vencendo e o desempenho da equipe, em lista, quadro ou calendário.',
    bullets: ['Quadro com Hoje, Próximos 7 dias e Fazendo', 'Pontuação de produtividade por advogado', 'Alertas de tarefas vencidas'],
    path: '/dashboard',
  },
  {
    id: 'intimacoes',
    label: 'Intimações',
    title: 'Intimações chegam sozinhas, com o prazo calculado',
    description: 'Sincronização diária pelo Diário de Justiça Eletrônico Nacional (DJEN) usando só a sua OAB. O prazo já vira tarefa e entra na agenda.',
    bullets: ['Tribunais estaduais e federais, sem senha do PJe', 'Contagem em dias úteis ou corridos', 'Teor completo da publicação para leitura'],
    path: '/publicacoes',
  },
  {
    id: 'processos',
    label: 'Processos',
    title: 'Todos os processos, por fase e por cliente',
    description: 'Partes, número CNJ, fase, último andamento e honorários de cada caso, com busca instantânea.',
    bullets: ['Fases: negociação, conhecimento, recursal, execução', 'Visão por parceiro ou colaborador', 'Exportação para planilha e PDF'],
    path: '/processos',
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    title: 'Honorários e despesas sob controle',
    description: 'Planilha de lançamentos, contas recorrentes mês a mês e fluxo de caixa previsto x realizado.',
    bullets: ['Recorrências projetadas automaticamente', 'Fluxo de caixa com saldo acumulado', 'Comissão de parceiros lançada automaticamente'],
    path: '/financeiro',
  },
  {
    id: 'agenda',
    label: 'Agenda',
    title: 'Audiências, prazos e reuniões no mesmo calendário',
    description: 'Visões de mês, semana, dia e lista, com sincronização com o Google Agenda.',
    bullets: ['Prazos das tarefas aparecem automaticamente', 'Cores por tipo de compromisso', 'Integração com Google Agenda'],
    path: '/agenda',
  },
]

export function tourVideo(id: TourId) {
  return { src: `/demo/${id}.mp4`, poster: `/demo/${id}.jpg` }
}

// ─── Planos ─────────────────────────────────────────────────────────────────
// Espelha o seed real de `plans` em
// supabase/migrations/20260902160000_stripe_billing_foundation.sql — mudar
// preço/limite aqui sem atualizar (ou vice-versa) deixa a Landing Page
// prometendo algo que o billing não aplica.
export type PlanId = 'basico' | 'pro' | 'enterprise'

export interface Plan {
  id: PlanId
  name: string
  tagline: string
  price: number
  processLimit: string
  storageLimit: string
  highlight?: boolean
  features: string[]
}

export const PLANS: Plan[] = [
  {
    id: 'basico',
    name: 'Básico',
    tagline: 'Para quem está começando a organizar o escritório',
    price: 149,
    processLimit: 'Até 300 processos ativos',
    storageLimit: '5 GB de armazenamento',
    features: [
      'Até 3 usuários',
      'Até 150 clientes cadastrados',
      'Dashboard completo (visão geral, lista, quadro e desempenho)',
      'Clientes com busca automática de CPF/CNPJ',
      'Processos por fase e grupo de ação',
      'Tarefas com recorrência e cálculo de prazo',
      'Agenda sincronizada com o Google Calendar',
      'Financeiro (contas a pagar e a receber)',
      'Excelência (IA): até 30 gerações/mês',
      'Suporte por e-mail',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Para escritórios em crescimento, com equipe e clientes ativos',
    price: 349,
    processLimit: 'Até 1.500 processos ativos',
    storageLimit: '25 GB de armazenamento',
    highlight: true,
    features: [
      'Tudo do plano Básico',
      'Até 10 usuários',
      'Até 750 clientes cadastrados',
      'Excelência (IA): até 200 gerações/mês',
      'Sincronização automática de publicações (OAB/CNJ, Escavador, Jusbrasil)',
      'Portal do Cliente exclusivo',
      'Relatórios de desempenho da equipe',
      'Colaboradores & Parceiros com comissão automática',
      'Suporte prioritário via chat',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Para escritórios com alto volume e times maiores',
    price: 799,
    processLimit: 'Processos ilimitados',
    storageLimit: '100 GB de armazenamento',
    features: [
      'Tudo do plano Pro',
      'Até 25 usuários (precisa de mais? Fale com nosso time)',
      'Clientes ilimitados',
      'Excelência (IA) ilimitada (uso justo)',
      'Onboarding assistido para toda a equipe',
      'SLA de suporte dedicado',
    ],
  },
]

/** Plano sugerido pelo slider "quantos processos ativos" — mesmos cortes de `processLimit`. */
export function recommendedPlanFor(activeProcesses: number): PlanId {
  if (activeProcesses <= 300) return 'basico'
  if (activeProcesses <= 1500) return 'pro'
  return 'enterprise'
}

export const FAQS = [
  {
    q: 'Preciso de cartão de crédito para começar?',
    a: `Não. Você cria a conta e usa o sistema por ${TRIAL_DAYS} dias grátis, com todos os recursos do plano Pro, sem informar dados de pagamento. Se não assinar ao fim do teste, seus dados continuam disponíveis para consulta e exportação.`,
  },
  ...(PROMO_ACTIVE ? [{
    q: 'Como funciona a promoção de lançamento?',
    a: `Assinando até ${PROMO_LAST_DAY}, você paga R$ ${PROMO_MONTHLY_PRICE},00/mês nos 3 primeiros meses, independentemente do plano escolhido. Depois desse período, passa a valer o valor normal do plano contratado. Como bônus, você também recebe o e-book completo do LegalHub direto dentro do sistema.`,
  }] : []),
  {
    q: 'Como as intimações chegam no sistema?',
    a: 'Você informa o número da sua OAB e a seccional. Todo dia o LegalHub consulta o Diário de Justiça Eletrônico Nacional (DJEN/Comunica PJe, do CNJ), que reúne as publicações de tribunais estaduais e federais, e importa as comunicações em seu nome. Não pedimos a senha do PJe. Só aparece o que é publicado no DJEN, que hoje cobre a grande maioria dos tribunais.',
  },
  {
    q: 'Funciona no celular? Preciso instalar algo?',
    a: 'Não precisa instalar nada: o LegalHub roda no navegador do computador, do tablet ou do celular, com layout adaptado a cada tela.',
  },
  {
    q: 'Consigo trazer meus clientes de outra planilha ou sistema?',
    a: 'Sim. Clientes podem ser importados por arquivo CSV, com detecção de duplicados contra o que já está cadastrado e dentro do próprio arquivo. Processos podem ser importados pela sincronização da OAB.',
  },
  {
    q: 'Posso trocar de plano depois?',
    a: 'Sim. Você pode fazer upgrade ou downgrade de plano a qualquer momento, conforme o volume de processos do seu escritório crescer.',
  },
  {
    q: 'Existe fidelidade ou multa de cancelamento?',
    a: 'Não. A cobrança é mensal e recorrente, sem contrato de fidelidade. Você pode cancelar quando quiser.',
  },
  {
    q: 'Meus dados ficam seguros e isolados dos de outros escritórios?',
    a: 'Sim. O isolamento por escritório é a base da arquitetura: cada escritório só acessa os próprios dados, e dentro dele cada pessoa tem permissões de acordo com a função (administrador, advogado, estagiário, financeiro).',
  },
]
