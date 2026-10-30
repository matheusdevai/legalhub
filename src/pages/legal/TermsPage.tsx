import { Link } from 'react-router-dom'
import { LegalDocument, LEGAL_ENTITY, type LegalSection } from './LegalDocument'
import { TRIAL_DAYS } from '@/pages/landing/landingData'

const E = LEGAL_ENTITY
const mail = <a href={`mailto:${E.privacyEmail}`}>{E.privacyEmail}</a>

// Regras comerciais aqui (teste grátis, somente leitura, limites) espelham o
// billing real: billingStatus.ts (tenantAccess) e os limites de `plans`.
const SECTIONS: LegalSection[] = [
  {
    id: 'aceite',
    title: 'Aceite e partes',
    body: (
      <>
        <p>
          Estes Termos regulam o uso do {E.product}, sistema de gestão para escritórios de advocacia oferecido pela
          <strong> {E.name}</strong>, com sede em {E.city} (“nós”), por você e pelo escritório que você representa
          (“escritório” ou “cliente”).
        </p>
        <p>
          Ao criar uma conta ou usar o sistema, você declara ter lido e aceitado estes Termos e a{' '}
          <Link to="/privacidade">Política de Privacidade</Link>, ter pelo menos 18 anos e, quando cria a conta em nome de
          um escritório, ter poderes para representá-lo.
        </p>
      </>
    ),
  },
  {
    id: 'servico',
    title: 'O que é o serviço',
    body: (
      <p>
        O {E.product} é um software como serviço (SaaS), acessado pelo navegador, para organizar clientes, processos,
        intimações, prazos, agenda, documentos, financeiro e equipe, com recursos de inteligência artificial e integrações
        com serviços de terceiros. Os recursos e limites de cada plano são os descritos na página de planos no momento da
        contratação. Podemos aprimorar, alterar ou descontinuar funcionalidades, preservando o núcleo do serviço contratado.
      </p>
    ),
  },
  {
    id: 'conta',
    title: 'Conta, equipe e segurança de acesso',
    body: (
      <ul>
        <li>Você deve informar dados verdadeiros e mantê-los atualizados.</li>
        <li>O login e a senha são pessoais e intransferíveis. Cada pessoa da equipe deve ter seu próprio acesso.</li>
        <li>O administrador do escritório decide quem tem acesso e com qual função, e responde pelo uso feito pela equipe e pelos acessos concedidos a clientes no Portal do Cliente.</li>
        <li>Avise-nos imediatamente em caso de suspeita de acesso indevido à sua conta.</li>
      </ul>
    ),
  },
  {
    id: 'teste-planos',
    title: 'Teste grátis, planos e pagamento',
    body: (
      <ul>
        <li>Novas contas têm {TRIAL_DAYS} dias de teste grátis com os recursos do plano Pro, sem necessidade de cartão de crédito.</li>
        <li>A assinatura é mensal e recorrente, cobrada antecipadamente pelo Stripe no meio de pagamento informado. Não há fidelidade nem multa de cancelamento.</li>
        <li>Promoções (como preço de lançamento) valem pelas condições e prazos anunciados no momento da contratação.</li>
        <li>Cada plano tem limites (por exemplo, de usuários, clientes, processos ativos, armazenamento e gerações de IA por mês). Ao atingir um limite, você pode migrar de plano; nenhum dado já cadastrado é apagado por isso.</li>
        <li>Podemos reajustar preços mediante aviso prévio de pelo menos 30 dias; o novo valor vale a partir do ciclo seguinte.</li>
        <li>Se o teste terminar sem contratação, ou se a assinatura for cancelada ou ficar sem pagamento, a conta passa ao modo somente leitura: os dados continuam disponíveis para consulta e exportação, mas não é possível criar ou editar registros até a regularização.</li>
      </ul>
    ),
  },
  {
    id: 'cancelamento',
    title: 'Cancelamento',
    body: (
      <p>
        Você pode cancelar a assinatura a qualquer momento nas configurações do sistema. O acesso completo continua até o fim
        do período já pago, sem reembolso proporcional do mês em curso, salvo quando a lei exigir. Depois disso, valem as
        regras de somente leitura e de exclusão de dados descritas na{' '}
        <Link to="/privacidade">Política de Privacidade</Link>. Podemos suspender ou encerrar contas que violem estes Termos,
        com aviso prévio sempre que possível.
      </p>
    ),
  },
  {
    id: 'uso-permitido',
    title: 'Uso permitido',
    body: (
      <>
        <p>Você concorda em não:</p>
        <ul>
          <li>usar o sistema para atividades ilegais ou que violem direitos de terceiros, o sigilo profissional ou o Código de Ética da OAB;</li>
          <li>inserir dados pessoais sem base legal para tratá-los;</li>
          <li>tentar acessar dados de outros escritórios, burlar limites do plano ou testar a segurança do sistema sem autorização;</li>
          <li>sobrecarregar o serviço com acessos automatizados, copiar, revender ou fazer engenharia reversa do software.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'dados-escritorio',
    title: 'Dados do escritório e sigilo profissional',
    body: (
      <>
        <p>
          Os dados que o escritório insere no sistema pertencem ao escritório. Nós os tratamos apenas para prestar o serviço,
          como operador, nos termos da LGPD e da <Link to="/privacidade">Política de Privacidade</Link>, e mantemos sigilo
          sobre eles.
        </p>
        <p>
          O escritório é o controlador desses dados e responde pela base legal do tratamento, pelo dever de sigilo perante os
          seus clientes e pelas informações que decide compartilhar no Portal do Cliente. O escritório pode exportar seus
          dados a qualquer momento.
        </p>
      </>
    ),
  },
  {
    id: 'prazos',
    title: 'Intimações, prazos e cálculos',
    body: (
      <>
        <p>
          O {E.product} é uma ferramenta de apoio à organização do escritório e <strong>não substitui o acompanhamento
          profissional dos processos</strong>. Em especial:
        </p>
        <ul>
          <li>as intimações são importadas de fontes públicas, como o DJEN e o DataJud, que podem ficar indisponíveis, atrasar ou não abranger todos os atos de todos os tribunais;</li>
          <li>o cálculo automático de prazos considera dias úteis ou corridos, mas não conhece todos os feriados locais, suspensões de expediente e regras específicas de cada caso;</li>
          <li>cabe sempre ao advogado responsável conferir as publicações nas fontes oficiais e os prazos antes de agir.</li>
        </ul>
        <p>
          Não respondemos por perda de prazo, preclusão ou outros prejuízos processuais decorrentes da falta dessa conferência.
        </p>
      </>
    ),
  },
  {
    id: 'ia',
    title: 'Inteligência artificial',
    body: (
      <p>
        Os textos, análises e peças gerados pela inteligência artificial são sugestões automatizadas, podem conter erros,
        omissões ou informações desatualizadas e não constituem parecer jurídico. O uso desse conteúdo é de responsabilidade
        exclusiva do profissional, que deve revisá-lo integralmente antes de utilizá-lo.
      </p>
    ),
  },
  {
    id: 'terceiros',
    title: 'Integrações com serviços de terceiros',
    body: (
      <p>
        Integrações como Google Agenda, Google Drive, WhatsApp, Meta, Escavador e Jusbrasil dependem desses serviços e das
        contas e autorizações do próprio usuário. Não controlamos a disponibilidade nem as regras desses serviços, que têm
        seus próprios termos.
      </p>
    ),
  },
  {
    id: 'disponibilidade',
    title: 'Disponibilidade e suporte',
    body: (
      <p>
        Trabalhamos para manter o sistema disponível e seguro, mas podem ocorrer interrupções para manutenção, atualizações
        ou por falhas de terceiros (hospedagem, internet, fontes públicas). Sempre que possível, manutenções programadas serão
        avisadas. O suporte é prestado pelos canais e no nível de atendimento previstos no plano contratado.
      </p>
    ),
  },
  {
    id: 'responsabilidade',
    title: 'Limitação de responsabilidade',
    body: (
      <p>
        Na máxima extensão permitida pela lei, não respondemos por lucros cessantes, danos indiretos ou perdas decorrentes de
        uso inadequado do sistema, de informações inseridas pelo próprio usuário, de falhas de serviços de terceiros ou da
        falta de conferência descrita nos itens 8 e 9. Nossa responsabilidade total, em qualquer caso, fica limitada ao valor
        pago pelo escritório nos 12 meses anteriores ao evento. Nada nestes Termos afasta direitos que não possam ser
        limitados por lei.
      </p>
    ),
  },
  {
    id: 'propriedade',
    title: 'Propriedade intelectual',
    body: (
      <p>
        O software, a marca {E.product}, o layout e os materiais do serviço são nossos ou licenciados para nós. A assinatura
        dá ao escritório uma licença de uso pessoal, não exclusiva e intransferível, enquanto estiver vigente. Os dados e
        documentos do escritório continuam sendo do escritório.
      </p>
    ),
  },
  {
    id: 'alteracoes',
    title: 'Alterações destes Termos',
    body: (
      <p>
        Podemos atualizar estes Termos. Mudanças relevantes serão avisadas no sistema ou por e-mail com antecedência razoável.
        Continuar usando o {E.product} depois que elas entrarem em vigor significa concordar com a nova versão; se não
        concordar, você pode cancelar a assinatura.
      </p>
    ),
  },
  {
    id: 'foro',
    title: 'Lei aplicável, foro e contato',
    body: (
      <>
        <p>
          Estes Termos são regidos pelas leis brasileiras. Fica eleito o foro da comarca de João Pessoa/PB para resolver
          eventuais conflitos, ressalvadas as hipóteses em que a lei garanta outro foro.
        </p>
        <p>Dúvidas sobre estes Termos: {mail}.</p>
      </>
    ),
  },
]

export function TermsPage() {
  return (
    <LegalDocument
      title="Termos de Uso"
      intro={
        <p>
          Estes são os termos que regem a relação entre o seu escritório e o {E.product}. Procuramos escrever de forma clara;
          leia com atenção, especialmente as partes sobre prazos processuais, inteligência artificial e responsabilidade.
        </p>
      }
      sections={SECTIONS}
      otherLink={{ to: '/privacidade', label: 'Política de Privacidade' }}
    />
  )
}
