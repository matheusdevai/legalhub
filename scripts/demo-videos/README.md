# Vídeos de demonstração da landing page

Os vídeos em `public/demo/` (usados pela landing em `src/pages/landing/`) são
gravações reais do app, feitas com Playwright num **escritório de
demonstração com dados 100% fictícios** — nunca grave com a conta de um
escritório real.

## Conta de demonstração

- Escritório: "Duarte & Moraes Advocacia (Demonstração)", tenant
  `b3df577d-19dc-4a7c-8970-4de5c1a64307`, admin "Dra. Helena Duarte".
- E-mail e senha ficam fora do repositório. Se perdeu a senha, use
  "Esqueci minha senha" no login.
- Sem OAB cadastrada de propósito: com OAB, o cron noturno de sincronização
  importaria processos reais para dentro do escritório demo.
- A gravação finge uma assinatura ativa só no navegador (intercepta a
  resposta de `billing_subscriptions`) para esconder o aviso de teste
  grátis. Nada é gravado no banco.

## Regravar

Precisa de macOS (a narração usa as vozes do sistema).

```bash
npm run dev                                    # app em http://localhost:5173
cd scripts/demo-videos
npm i --no-save playwright ffmpeg-static       # dependências só da gravação
npx playwright install chromium                # se ainda não tiver
swiftc -O tts.swift -o tts                     # gerador de voz (AVSpeechSynthesizer)
DEMO_EMAIL=... DEMO_PASSWORD=... node clips.cjs painel processos   # ou sem argumentos = todos
./publish.sh painel intimacoes processos clientes agenda financeiro ia documentos relatorios leads mobile
```

`clips.cjs` tem um roteiro por vídeo: falas (`h.say`) intercaladas com
cliques, rolagens e digitação, e um cursor desenhado na página. Cada fala
espera a anterior terminar, e as ações seguintes acontecem enquanto ela toca.
Se um seletor quebrar depois de uma mudança na interface, ajuste o roteiro
daquele clipe.

A gravação gera, por clipe, um MP4 com a narração mixada, a legenda `.vtt`
(as falas quebradas em trechos curtos, nos tempos certos) e um pôster JPG.
`publish.sh` copia tudo para `public/demo` e gera o WebM (VP9 + Opus).

### Voz

A voz é a **Luciana** do macOS. A Premium é usada se estiver instalada
(Ajustes do Sistema → Acessibilidade → Conteúdo Falado → Voz do Sistema →
Gerenciar Vozes → Português (Brasil) → Luciana Premium); senão, a compacta.
Para forçar outra voz, use `VOICE_ID=<identificador>`, e `VOICE_RATE` (padrão
0.52) para a velocidade. O áudio fica em cache em `tts-cache/` por
texto + voz + velocidade.

A Excelência (clipe `ia`) faz uma geração real no Gemini. Se a API responder
"alta demanda", o roteiro tenta de novo até 5 vezes, num trecho cortado do
vídeo.

O id de cada aba do tour em `landingData.ts` precisa casar com o nome do
arquivo em `public/demo/`. `landingData.test.ts` falha se faltar algum.

## Vídeo completo (para enviar a clientes)

Depois de gravar os clipes, junta tudo num vídeo só, com abertura narrada,
cartela por parte, encerramento com o teste grátis e capítulos:

```bash
node make-full.cjs "$HOME/Desktop/LegalHub - Vídeos de demonstração"
```

Gera `LegalHub - Demonstração completa.mp4` (narrado), uma versão com
legenda gravada na imagem, o `.srt` e a pasta `Partes/` com cada clipe.
