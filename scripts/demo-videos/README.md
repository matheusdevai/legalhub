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

```bash
npm run dev                                    # app em http://localhost:5173
cd scripts/demo-videos
npm i --no-save playwright ffmpeg-static       # dependências só da gravação
npx playwright install chromium                # se ainda não tiver
DEMO_EMAIL=... DEMO_PASSWORD=... node clips.cjs dashboard processos   # ou sem argumentos = todos
./publish.sh dashboard:painel processos:processos intimacoes:intimacoes \
  financeiro:financeiro agenda:agenda mobile:mobile ia:ia
```

`clips.cjs` tem um roteiro por vídeo (cliques, rolagens, digitação), com um
cursor desenhado na página. Se um seletor quebrar depois de uma mudança na
interface, ajuste o roteiro daquele clipe. `publish.sh` gera, para cada
clipe, MP4 (H.264), WebM (VP9) e um pôster JPG.

O id de cada aba do tour em `landingData.ts` precisa casar com o nome do
arquivo em `public/demo/`. `landingData.test.ts` falha se faltar algum.
