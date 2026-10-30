import { LegalDocument, LEGAL_ENTITY, type LegalSection } from './LegalDocument'

const E = LEGAL_ENTITY
const mail = <a href={`mailto:${E.privacyEmail}`}>{E.privacyEmail}</a>

// Texto escrito a partir do que o sistema faz hoje (hospedagem, integrações,
// logs, lixeira). Mudou uma integração, a região do banco ou a retenção?
// Atualize aqui e LEGAL_UPDATED_AT em LegalDocument.tsx.
const SECTIONS: LegalSection[] = [
  {
    id: 'quem-somos',
    title: 'Quem somos e a quem esta política se aplica',
    body: (
      <>
        <p>
          O {E.product} é um sistema de gestão para escritórios de advocacia, disponibilizado pela <strong>{E.name}</strong>,
          com sede em {E.city} (“nós”). Esta política explica como tratamos dados pessoais, nos termos da Lei Geral de
          Proteção de Dados (Lei nº 13.709/2018 — LGPD).
        </p>
        <p>Ela se aplica a:</p>
        <ul>
          <li>quem visita o site do {E.product};</li>
          <li>quem cria uma conta e usa o sistema (advogados, estagiários, equipe financeira e administradores do escritório);</li>
          <li>clientes dos escritórios que recebem acesso ao Portal do Cliente;</li>
          <li>pessoas cujos dados o escritório cadastra no sistema (clientes, partes, contatos e possíveis clientes).</li>
        </ul>
      </>
    ),
  },
  {
    id: 'papeis',
    title: 'Controlador e operador: quem decide sobre cada dado',
    body: (
      <>
        <p>
          <strong>Dados da sua conta.</strong> Para os dados de cadastro e de uso de quem contrata e usa o {E.product}
          (nome, e-mail, OAB, dados de cobrança, registros de acesso), nós somos o <strong>controlador</strong>.
        </p>
        <p>
          <strong>Dados que o escritório cadastra.</strong> Para os dados que o escritório insere no sistema — clientes,
          processos, documentos, prazos, valores, leads —, o <strong>escritório é o controlador</strong> e nós atuamos como
          <strong> operador</strong>: tratamos esses dados apenas para prestar o serviço, conforme as instruções do escritório
          e esta política. Cabe ao escritório ter base legal para tratá-los e atender os pedidos dos seus clientes; nós o
          auxiliamos no que estiver ao nosso alcance.
        </p>
      </>
    ),
  },
  {
    id: 'dados-coletados',
    title: 'Quais dados tratamos',
    body: (
      <>
        <ul>
          <li><strong>Cadastro:</strong> nome, e-mail, senha (guardada apenas em forma criptografada), nome do escritório, número e seccional da OAB, cidade, foto de perfil (opcional) e função no escritório.</li>
          <li><strong>Login com Google ou Microsoft:</strong> nome, e-mail e foto que esses serviços nos repassam quando você escolhe entrar por eles.</li>
          <li><strong>Assinatura e cobrança:</strong> plano, situação da assinatura e identificadores de pagamento. Os dados do cartão são informados diretamente ao Stripe; nós não recebemos nem armazenamos o número do cartão.</li>
          <li><strong>Conteúdo inserido pelo escritório:</strong> dados de clientes (como nome, CPF/CNPJ, contato, endereço e outras informações do caso, inclusive dados sensíveis quando necessários à atuação jurídica, como informações de saúde em causas previdenciárias), processos, andamentos, tarefas, agenda, documentos e arquivos, lançamentos financeiros e leads.</li>
          <li><strong>Publicações processuais:</strong> intimações e andamentos obtidos de fontes públicas a partir do número da OAB informado (veja o item 5).</li>
          <li><strong>Registros de segurança e acesso:</strong> endereço IP, navegador/dispositivo, data e hora de login, tentativas de login sem sucesso (com o e-mail digitado) e eventos sensíveis, como exportações e exclusões em grande volume.</li>
          <li><strong>Uso da inteligência artificial:</strong> o pedido feito à IA, o contexto do processo selecionado e o texto gerado, que ficam no histórico do escritório.</li>
          <li><strong>Atendimento:</strong> mensagens enviadas ao suporte.</li>
        </ul>
        <p>Não usamos ferramentas de publicidade, pixels de rastreamento nem vendemos dados pessoais.</p>
      </>
    ),
  },
  {
    id: 'finalidades',
    title: 'Para que usamos os dados e com qual base legal',
    body: (
      <ul>
        <li><strong>Prestar o serviço contratado</strong> (contas, armazenamento, cálculos de prazo, agenda, relatórios, portal do cliente) — execução de contrato (art. 7º, V, LGPD).</li>
        <li><strong>Cobrança e gestão da assinatura</strong> — execução de contrato e cumprimento de obrigações legais e fiscais (art. 7º, II e V).</li>
        <li><strong>Segurança da conta e prevenção a fraudes</strong>, como alertas de login incomum e de tentativas repetidas de acesso — legítimo interesse e garantia da prevenção à fraude e à segurança do titular (art. 7º, IX, e art. 11, II, “g”).</li>
        <li><strong>Comunicações sobre o serviço</strong> (avisos de prazo, notificações, lembretes de pagamento enviados pelo escritório aos seus clientes, mudanças nos termos) — execução de contrato e legítimo interesse.</li>
        <li><strong>Dados sensíveis inseridos pelo escritório</strong> — tratados como operador, para o exercício regular de direitos em processo judicial, administrativo ou arbitral pelo escritório (art. 11, II, “d”).</li>
        <li><strong>Melhorar o produto e dar suporte</strong> — legítimo interesse, sempre com o mínimo de dados necessário.</li>
      </ul>
    ),
  },
  {
    id: 'fontes-publicas',
    title: 'Publicações processuais e consultas a fontes públicas',
    body: (
      <>
        <p>
          Quando o advogado informa seu número de OAB e seccional, o {E.product} consulta, inclusive automaticamente todos
          os dias, o Diário de Justiça Eletrônico Nacional (DJEN/Comunica PJe) e a base pública DataJud, ambos do Conselho
          Nacional de Justiça, para importar intimações e andamentos ligados àquela inscrição. Se o escritório tiver contratado
          esses serviços, também podem ser consultados o Escavador e o Jusbrasil.
        </p>
        <p>
          Para facilitar o cadastro, o sistema também pode consultar a BrasilAPI (dados públicos de CNPJ), o ViaCEP (endereço
          pelo CEP) e o Cadastro Nacional dos Advogados da OAB (validação da inscrição).
        </p>
      </>
    ),
  },
  {
    id: 'compartilhamento',
    title: 'Com quem compartilhamos dados',
    body: (
      <>
        <p>Compartilhamos dados apenas com fornecedores necessários para o funcionamento do serviço, que os tratam em nosso nome:</p>
        <ul>
          <li><strong>Supabase</strong> — banco de dados, autenticação e armazenamento de arquivos;</li>
          <li><strong>Vercel</strong> — hospedagem do site e do aplicativo;</li>
          <li><strong>Google</strong> — login com Google, fontes do site e, quando o usuário conecta, Google Agenda e Google Drive; e o Google Gemini, que processa os pedidos feitos à inteligência artificial (Excelência);</li>
          <li><strong>Microsoft</strong> — login com conta Microsoft;</li>
          <li><strong>Stripe</strong> — processamento de pagamentos e cobrança;</li>
          <li><strong>Resend</strong> — envio de e-mails do sistema;</li>
          <li><strong>Meta (WhatsApp e Facebook)</strong> — somente se o escritório ativar a integração de leads;</li>
          <li>as fontes de consulta do item 5.</li>
        </ul>
        <p>
          Também podemos compartilhar dados por ordem judicial ou exigência legal. Dentro de um escritório, cada pessoa vê
          os dados de acordo com a sua função; os dados de um escritório nunca ficam visíveis para outro.
        </p>
      </>
    ),
  },
  {
    id: 'transferencia',
    title: 'Transferência internacional',
    body: (
      <p>
        Os servidores do banco de dados ficam nos Estados Unidos, e alguns fornecedores listados acima também processam
        dados fora do Brasil. Essas transferências ocorrem para a execução do contrato e com fornecedores que adotam
        cláusulas contratuais e medidas de segurança compatíveis com a LGPD (art. 33).
      </p>
    ),
  },
  {
    id: 'ia',
    title: 'Uso de inteligência artificial',
    body: (
      <>
        <p>
          Quando você usa a Excelência, o conteúdo do pedido (incluindo dados do processo selecionado e documentos que você
          anexar) é enviado ao Google Gemini para gerar a resposta. Os arquivos anexados são usados apenas naquela geração e
          não ficam guardados no {E.product}; o pedido e o texto gerado ficam no histórico do escritório.
        </p>
        <p>
          O conteúdo gerado por IA pode conter erros e deve sempre ser revisado por um profissional antes de qualquer uso.
          Evite enviar à IA dados que não sejam necessários para a tarefa.
        </p>
      </>
    ),
  },
  {
    id: 'navegador',
    title: 'Cookies e armazenamento no navegador',
    body: (
      <p>
        Usamos apenas o armazenamento essencial do navegador: para manter você conectado (sessão de login), lembrar
        preferências (como tema claro/escuro e avisos já dispensados) e, quando você conecta o Google Agenda ou o Drive,
        guardar temporariamente a autorização dessa conexão. Não usamos cookies de publicidade nem de rastreamento entre sites.
      </p>
    ),
  },
  {
    id: 'retencao',
    title: 'Por quanto tempo guardamos os dados',
    body: (
      <ul>
        <li>Os dados da conta e do escritório ficam guardados enquanto a assinatura estiver ativa.</li>
        <li>Itens excluídos vão para a lixeira e são apagados definitivamente após 7 dias.</li>
        <li>Se o período de teste terminar ou a assinatura for cancelada, a conta passa a funcionar em modo somente leitura, para que o escritório possa consultar e exportar seus dados. Mediante pedido de exclusão, os dados são apagados, salvo o que precisarmos manter por obrigação legal (por exemplo, registros fiscais e de cobrança) ou para exercício regular de direitos.</li>
        <li>Registros de acesso são mantidos pelo prazo mínimo de 6 meses exigido pelo Marco Civil da Internet (Lei nº 12.965/2014).</li>
      </ul>
    ),
  },
  {
    id: 'seguranca',
    title: 'Como protegemos os dados',
    body: (
      <ul>
        <li>Conexão sempre criptografada (HTTPS) e senhas guardadas apenas em forma criptografada.</li>
        <li>Isolamento entre escritórios aplicado no próprio banco de dados: um escritório não acessa os dados de outro.</li>
        <li>Permissões por função dentro do escritório (administrador, advogado, estagiário, financeiro) e acesso restrito do cliente ao seu próprio portal.</li>
        <li>Monitoramento de logins incomuns, tentativas repetidas de acesso e exportações em massa.</li>
      </ul>
    ),
  },
  {
    id: 'direitos',
    title: 'Seus direitos',
    body: (
      <>
        <p>
          Você pode pedir, a qualquer momento: confirmação de que tratamos seus dados, acesso, correção, anonimização,
          bloqueio ou eliminação de dados desnecessários, portabilidade, informação sobre com quem compartilhamos,
          revogação do consentimento (quando for a base legal) e revisão de decisões automatizadas (art. 18, LGPD).
        </p>
        <p>
          Grande parte dos dados pode ser consultada, corrigida e exportada diretamente no sistema. Para os demais pedidos,
          escreva para {mail}. Respondemos em até 15 dias.
        </p>
        <p>
          <strong>Se você é cliente de um escritório</strong> que usa o {E.product}, o escritório é quem decide sobre os seus
          dados: dirija o pedido primeiro a ele. Se precisar, também pode nos escrever, e encaminharemos ao escritório.
        </p>
        <p>Você também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).</p>
      </>
    ),
  },
  {
    id: 'menores',
    title: 'Menores de idade',
    body: (
      <p>
        O {E.product} é destinado a profissionais e não deve ser usado por menores de 18 anos. Dados de crianças e
        adolescentes só devem ser cadastrados pelo escritório quando necessários à atuação jurídica, no melhor interesse
        deles e com a cautela exigida pela LGPD (art. 14).
      </p>
    ),
  },
  {
    id: 'contato',
    title: 'Encarregado de dados e alterações desta política',
    body: (
      <>
        <p>
          O canal de comunicação com o encarregado pelo tratamento de dados pessoais é o e-mail {mail}.
        </p>
        <p>
          Podemos atualizar esta política para refletir mudanças no serviço ou na lei. A data da última atualização fica no
          topo desta página; mudanças relevantes serão avisadas dentro do sistema ou por e-mail.
        </p>
      </>
    ),
  },
]

export function PrivacyPolicyPage() {
  return (
    <LegalDocument
      title="Política de Privacidade"
      intro={
        <p>
          Sua privacidade e o sigilo dos dados dos seus clientes são levados a sério no {E.product}. Aqui você encontra,
          em linguagem direta, quais dados tratamos, por quê, com quem os compartilhamos e como exercer seus direitos.
        </p>
      }
      sections={SECTIONS}
      otherLink={{ to: '/termos', label: 'Termos de Uso' }}
    />
  )
}
