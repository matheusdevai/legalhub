/**
 * Dados do "Tour por perfil" da landing (ProfileTour.tsx).
 *
 * Tudo aqui é FICTÍCIO (nomes, números de processo, valores) — é uma tela
 * ilustrativa, não prova social. Os recursos citados nos hotspots/atalhos
 * existem de fato no sistema (ver CLAUDE.md): intimações do DJEN pela OAB,
 * tarefa de prazo a partir da intimação, distribuição automática de tarefas,
 * permissões por função, situação do processo administrativo (INSS) e a
 * tarefa automática de judicializar o indeferido, Google Agenda, comissões de
 * parceiros, Excelência (IA), Portal do Cliente. Não citar aqui o Controle de
 * Prazos (/prazos): ainda é piloto, desligado por escritório.
 */

export type ProfileId = 'autonomo' | 'escritorio' | 'previdenciario' | 'trabalhista'

/** Onde o hotspot fica preso na tela ilustrativa. */
export type HotspotAnchor = 'header' | 'stats' | 'list' | 'shortcuts'

export type RowTone = 'blue' | 'amber' | 'green' | 'red' | 'neutral'

export interface ProfileStat {
  label: string
  value: number
  format?: 'int' | 'brl'
}

export interface ProfileRow {
  title: string
  meta: string
  tag: string
  tone: RowTone
  when: string
}

export interface ProfileShortcut {
  label: string
  detail: string
}

export interface ProfileHotspot {
  id: string
  anchor: HotspotAnchor
  title: string
  body: string
}

export interface ProfileTourItem {
  id: ProfileId
  tab: string
  persona: string
  headline: string
  summary: string
  path: string
  screenTitle: string
  screenSub: string
  listTitle: string
  stats: [ProfileStat, ProfileStat, ProfileStat]
  rows: ProfileRow[]
  shortcuts: ProfileShortcut[]
  hotspots: ProfileHotspot[]
}

export const PROFILE_TOUR: ProfileTourItem[] = [
  {
    id: 'autonomo',
    tab: 'Advogado autônomo',
    persona: 'Uma pessoa cuidando de tudo',
    headline: 'Você advoga. O sistema lembra do resto.',
    summary: 'As intimações chegam pela sua OAB, cada prazo vira tarefa com data fatal e os honorários ficam num lugar só, sem planilha paralela.',
    path: '/dashboard',
    screenTitle: 'Meu dia',
    screenSub: 'Dra. Marina Sales · OAB/PB',
    listTitle: 'Prazos e compromissos da semana',
    stats: [
      { label: 'Processos ativos', value: 86 },
      { label: 'Intimações na semana', value: 9 },
      { label: 'A receber no mês', value: 14600, format: 'brl' },
    ],
    rows: [
      { title: 'Réplica à contestação', meta: '0804417-21.2026.8.15.2001 · TJPB', tag: 'Prazo', tone: 'amber', when: 'fatal 14/12' },
      { title: 'Audiência de conciliação', meta: 'CEJUSC · João Pessoa', tag: 'Audiência', tone: 'blue', when: '03/12 · 14h' },
      { title: 'Contrarrazões de apelação', meta: '0811032-40.2025.8.15.2001 · TJPB', tag: 'Prazo', tone: 'amber', when: 'fatal 10/12' },
      { title: 'Honorários · parcela 3 de 6', meta: 'Cliente: Ana Beatriz Lins', tag: 'Receber', tone: 'green', when: 'vence 05/12' },
    ],
    shortcuts: [
      { label: 'Criar tarefa da intimação', detail: 'Prazo calculado em dias úteis' },
      { label: 'Gerar minuta com IA', detail: 'A partir dos documentos do processo' },
      { label: 'Lançar honorário recorrente', detail: 'Parcelas previstas no fluxo de caixa' },
    ],
    hotspots: [
      { id: 'stats', anchor: 'stats', title: 'Números sem digitar nada', body: 'Contados a partir dos seus processos, intimações e lançamentos. Nada para preencher à mão.' },
      { id: 'list', anchor: 'list', title: 'Intimação vira tarefa', body: 'A intimação do DJEN chega pela sua OAB e vira tarefa com prazo interno e data fatal, já na agenda.' },
      { id: 'shortcuts', anchor: 'shortcuts', title: 'Minuta com IA', body: 'A Excelência redige a minuta a partir dos documentos anexados ao processo. Você revisa e assina.' },
    ],
  },
  {
    id: 'escritorio',
    tab: 'Escritório',
    persona: 'Advogados, estagiários e financeiro',
    headline: 'Cada pessoa sabe o que é dela.',
    summary: 'Atividade sem responsável vai para quem está com menos carga, e cada função vê e edita só o que lhe cabe.',
    path: '/tarefas',
    screenTitle: 'Atividades da equipe',
    screenSub: 'Prado & Mendes Advogados · 7 pessoas',
    listTitle: 'Distribuição de hoje',
    stats: [
      { label: 'Pessoas na equipe', value: 7 },
      { label: 'Atividades em andamento', value: 58 },
      { label: 'Processos ativos', value: 1240 },
    ],
    rows: [
      { title: 'Manifestação sobre o laudo', meta: 'Atribuída automaticamente a Bruno (estagiário)', tag: 'Distribuída', tone: 'blue', when: 'hoje' },
      { title: 'Recurso ordinário', meta: 'Dra. Helena Prado · TRT13', tag: 'Prazo', tone: 'amber', when: 'fatal 02/12' },
      { title: 'Conciliar recebimentos de novembro', meta: 'Financeiro · Camila', tag: 'Financeiro', tone: 'green', when: 'hoje' },
      { title: 'Revisar contrato de honorários', meta: 'Dr. Paulo Mendes', tag: 'Documento', tone: 'neutral', when: 'amanhã' },
    ],
    shortcuts: [
      { label: 'Convidar pessoa da equipe', detail: 'Advogado, estagiário ou financeiro' },
      { label: 'Ver carga por pessoa', detail: 'Quem está com mais atividades' },
      { label: 'Relatórios do escritório', detail: 'Produtividade, processos e financeiro' },
    ],
    hotspots: [
      { id: 'list', anchor: 'list', title: 'Distribuição automática', body: 'Atividade criada sem responsável vai para quem tem menos pendências, com notificação para a pessoa.' },
      { id: 'header', anchor: 'header', title: 'Permissões por função', body: 'Administrador, advogado, estagiário e financeiro veem e editam só o que lhes cabe.' },
      { id: 'stats', anchor: 'stats', title: 'Dados isolados por escritório', body: 'Cada escritório só enxerga os próprios registros, regra aplicada direto no banco de dados.' },
    ],
  },
  {
    id: 'previdenciario',
    tab: 'Previdenciário',
    persona: 'INSS administrativo e Justiça Federal',
    headline: 'Do requerimento no INSS à ação na Justiça Federal.',
    summary: 'Acompanhe a situação de cada requerimento. Se vier indeferimento, a tarefa de entrar com a ação já nasce criada.',
    path: '/processos',
    screenTitle: 'Processos administrativos',
    screenSub: '64 requerimentos em andamento',
    listTitle: 'Requerimentos no INSS',
    stats: [
      { label: 'Requerimentos em andamento', value: 64 },
      { label: 'Em exigência', value: 5 },
      { label: 'Ações na Justiça Federal', value: 112 },
    ],
    rows: [
      { title: 'Severino A. Costa', meta: 'Aposentadoria por idade · req. 1.842.337.905', tag: 'Em exigência', tone: 'amber', when: 'cumprir até 30/11' },
      { title: 'Josefa M. da Silva', meta: 'BPC/LOAS · req. 2.017.554.130', tag: 'Em análise', tone: 'blue', when: 'há 94 dias' },
      { title: 'Antônio R. Freitas', meta: 'Auxílio por incapacidade · req. 1.990.208.476', tag: 'Indeferido', tone: 'red', when: 'tarefa criada' },
      { title: 'Maria do Carmo Lopes', meta: 'Pensão por morte · req. 2.104.873.662', tag: 'Deferido', tone: 'green', when: '12/11' },
    ],
    shortcuts: [
      { label: 'Registrar exigência', detail: 'O prazo de cumprimento vai para a agenda' },
      { label: 'Judicializar indeferido', detail: 'Tarefa de protocolar a ação, já distribuída' },
      { label: 'Portal do Cliente', detail: 'O segurado acompanha pelo celular' },
    ],
    hotspots: [
      { id: 'list', anchor: 'list', title: 'Situação de cada requerimento', body: 'Em análise, em exigência, deferido ou indeferido, com alerta de exigência vencendo e de análise parada há 90 dias.' },
      { id: 'shortcuts', anchor: 'shortcuts', title: 'Indeferiu? Já vira tarefa', body: 'O indeferimento cria a atividade de protocolar a ação na Justiça Federal, distribuída para a equipe.' },
      { id: 'stats', anchor: 'stats', title: 'Judicial e administrativo separados', body: 'As ações judiciais entram sozinhas pela OAB. Os requerimentos do INSS você cadastra e acompanha à parte.' },
    ],
  },
  {
    id: 'trabalhista',
    tab: 'Trabalhista',
    persona: 'Reclamatórias na Justiça do Trabalho',
    headline: 'Pauta de audiências e prazos do TRT sob controle.',
    summary: 'As intimações do TRT chegam pela sua OAB com o prazo contado em dias úteis, e as audiências entram na agenda da equipe.',
    path: '/agenda',
    screenTitle: 'Agenda trabalhista',
    screenSub: 'Próximos 15 dias',
    listTitle: 'Audiências e prazos',
    stats: [
      { label: 'Audiências no mês', value: 17 },
      { label: 'Processos na Justiça do Trabalho', value: 228 },
      { label: 'Intimações na semana', value: 21 },
    ],
    rows: [
      { title: 'Audiência de instrução', meta: '0000873-55.2026.5.13.0003 · 3ª Vara do Trabalho', tag: 'Audiência', tone: 'blue', when: '01/12 · 9h' },
      { title: 'Recurso ordinário', meta: '0002101-14.2025.5.13.0022 · TRT13', tag: 'Prazo', tone: 'amber', when: 'fatal 02/12' },
      { title: 'Audiência inicial', meta: '0001544-90.2026.5.13.0005 · 5ª Vara do Trabalho', tag: 'Audiência', tone: 'blue', when: '03/12 · 10h30' },
      { title: 'Comissão do parceiro', meta: 'Indicação: Rafael Souto · 20%', tag: 'Comissão', tone: 'green', when: 'pagar 10/12' },
    ],
    shortcuts: [
      { label: 'Sincronizar com o Google Agenda', detail: 'Audiências no seu celular' },
      { label: 'Criar prazo da intimação', detail: 'Regime trabalhista sugerido' },
      { label: 'Comissões de parceiros', detail: 'Por processo indicado' },
    ],
    hotspots: [
      { id: 'list', anchor: 'list', title: 'Prazo trabalhista', body: 'Para intimação do TRT, o regime trabalhista em dias úteis é sugerido sozinho. Você confere antes de salvar.' },
      { id: 'shortcuts', anchor: 'shortcuts', title: 'Agenda + Google', body: 'Audiências e prazos sincronizados com o Google Agenda de quem cuida do processo.' },
      { id: 'stats', anchor: 'stats', title: 'Intimações de qualquer TRT', body: 'O DJEN traz as comunicações de todos os tribunais em que a sua inscrição na OAB aparece.' },
    ],
  },
]

export function profileTour(id: ProfileId): ProfileTourItem {
  return PROFILE_TOUR.find(p => p.id === id) ?? PROFILE_TOUR[0]
}
