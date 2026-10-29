// Monta o vídeo completo de demonstração: abertura narrada, cartela por parte,
// os clipes narrados, encerramento com CTA. Gera versão sem e com legenda
// gravada, .srt e capítulos.
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const ffmpeg = require('ffmpeg-static')
const { chromium } = require('playwright')
const { synth } = require('./narration.cjs')

const CHROME = process.env.CHROME_PATH || undefined
const OUT_DIR = process.argv[2]
const W = 1280, H = 800
const WORK = path.join(__dirname, 'full')
fs.rmSync(WORK, { recursive: true, force: true })
fs.mkdirSync(WORK, { recursive: true })
fs.mkdirSync(path.join(OUT_DIR, 'Partes'), { recursive: true })

const LOGO = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '../../public/logomarca.png')).toString('base64')

const PARTS = [
  ['painel', 'Painel', 'O dia do escritório em uma tela'],
  ['intimacoes', 'Intimações', 'Chegam sozinhas, com o prazo calculado'],
  ['processos', 'Processos', 'Todos os casos, por fase e por cliente'],
  ['clientes', 'Clientes', 'Cada cliente com o histórico completo'],
  ['agenda', 'Agenda', 'Audiências, prazos e reuniões no mesmo calendário'],
  ['financeiro', 'Financeiro', 'Honorários e despesas sob controle'],
  ['ia', 'IA Jurídica', 'Análises e peças com inteligência artificial'],
  ['documentos', 'Documentos', 'Pastas por cliente e modelos do escritório'],
  ['relatorios', 'Relatórios', 'A agilidade da equipe em números'],
  ['leads', 'Leads', 'Do primeiro contato ao contrato assinado'],
  ['mobile', 'No celular', 'O mesmo sistema, onde você estiver'],
]

const INTRO = 'Conheça o LegalHub, o sistema de gestão para escritórios de advocacia. Nos próximos minutos, você vai ver como ele organiza processos, prazos, clientes e o financeiro do escritório.'
const OUTRO = 'Experimente o LegalHub grátis por catorze dias, com todos os recursos e sem cartão de crédito. É só acessar o site e criar a sua conta.'

const BASE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Inter:wght@400;600;700&display=block');
  *{margin:0;box-sizing:border-box} html,body{width:${W}px;height:${H}px;overflow:hidden}
  body{background:#020711;color:#fff;font-family:Inter,system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;position:relative}
  .glow{position:absolute;inset:-20%;background:radial-gradient(ellipse 55% 45% at 50% 30%,rgba(11,92,255,.45),transparent 70%)}
  .dots{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.07) 1px,transparent 1px);background-size:26px 26px;-webkit-mask-image:radial-gradient(ellipse 70% 60% at 50% 40%,#000,transparent)}
  .z{position:relative}
  .logo{width:84px;height:84px;border-radius:22px;overflow:hidden;background:#06152D;margin:0 auto 22px;box-shadow:0 20px 60px rgba(11,92,255,.35)}
  .logo img{width:100%;height:100%;object-fit:cover;object-position:0% 50%}
  .brand{font-weight:700;font-size:22px;letter-spacing:-.01em}.tag{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#A7B0C0;margin-top:4px}
  h1{font-family:Fraunces,Georgia,serif;font-weight:600;letter-spacing:-.02em;line-height:1.08}
  .eyebrow{font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#1677FF}
  .muted{color:#A7B0C0}
  .pill{display:inline-block;margin-top:34px;padding:16px 30px;border-radius:999px;background:#0B5CFF;font-weight:700;font-size:20px;box-shadow:0 14px 40px rgba(11,92,255,.5)}
`

function card(inner) { return `<html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body><div class="glow"></div><div class="dots"></div><div class="z">${inner}</div></body></html>` }
const brand = `<div class="logo"><img src="${LOGO}"></div><div class="brand">LegalHub</div><div class="tag">Gestão jurídica inteligente</div>`

function run(args) { execFileSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...args]) }
function durationOf(file) {
  const out = (() => { try { execFileSync(ffmpeg, ['-i', file], { stdio: 'pipe' }) } catch (e) { return e.stderr.toString() } })()
  const [, h, m, s] = out.match(/Duration: (\d+):(\d+):([\d.]+)/)
  return +h * 3600 + +m * 60 + +s
}
const ENC = ['-r', '30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '1']

/** Cartela estática (PNG) → segmento de vídeo, com narração opcional. */
function cardSegment(png, out, { secs, voice }) {
  if (voice) {
    run(['-loop', '1', '-i', png, '-i', voice.file, '-filter_complex', `[1]aresample=48000,adelay=600:all=1,apad[a]`, '-map', '0:v', '-map', '[a]',
      '-t', (voice.dur + 1.8).toFixed(2), '-vf', `fade=in:0:12,fade=out:st=${(voice.dur + 1.4).toFixed(2)}:d=0.4`, ...ENC, out])
  } else {
    run(['-loop', '1', '-i', png, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', String(secs),
      '-vf', `fade=in:0:9,fade=out:st=${secs - 0.3}:d=0.3`, '-map', '0:v', '-map', '1:a', ...ENC, out])
  }
  return durationOf(out)
}

;(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: [`--window-size=${W},${H}`] })
  const page = await browser.newPage({ viewport: { width: W, height: H } })
  async function shot(html, file) {
    await page.setContent(html, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: file })
    return file
  }

  const segments = []   // { file, dur, chapter?, cues? }
  const introVoice = synth(INTRO)
  const introPng = await shot(card(`${brand}<h1 style="font-size:64px;margin-top:46px">Demonstração do sistema</h1>
    <p class="muted" style="font-size:20px;margin-top:16px">Processos, intimações, prazos, agenda, clientes e financeiro<br>em um só lugar.</p>`), path.join(WORK, 'intro.png'))
  const introFile = path.join(WORK, '00-intro.mp4')
  const introDur = cardSegment(introPng, introFile, { voice: introVoice })
  segments.push({ file: introFile, dur: introDur, chapter: 'Abertura', cues: [{ text: INTRO, start: 0.6, dur: introVoice.dur }] })

  for (const [i, [id, title, sub]] of PARTS.entries()) {
    const n = i + 1
    const png = await shot(card(`<div class="eyebrow">Parte ${n} de ${PARTS.length}</div>
      <h1 style="font-size:76px;margin-top:18px">${title}</h1><p class="muted" style="font-size:24px;margin-top:18px">${sub}</p>`), path.join(WORK, `t${n}.png`))
    const tFile = path.join(WORK, `${String(n).padStart(2, '0')}-a-titulo.mp4`)
    const tDur = cardSegment(png, tFile, { secs: 2.4 })
    segments.push({ file: tFile, dur: tDur, chapter: `${n}. ${title}` })

    const src = path.join(__dirname, 'out', id + '.mp4')
    const cFile = path.join(WORK, `${String(n).padStart(2, '0')}-b-${id}.mp4`)
    if (id === 'mobile') {
      // Celular (390x844) centralizado num fundo da marca, em 1280x800
      const bg = await shot(card(`<div style="position:absolute;left:-420px;top:50%;transform:translateY(-50%);text-align:left;width:360px">
        <div class="eyebrow">No celular</div><h1 style="font-size:44px;margin-top:12px">Sem instalar nada</h1>
        <p class="muted" style="font-size:18px;margin-top:12px">Direto no navegador do celular, com layout adaptado.</p></div>`), path.join(WORK, 'mobile-bg.png'))
      run(['-loop', '1', '-i', bg, '-i', src, '-filter_complex',
        `[1:v]scale=-2:740,pad=iw+16:ih+16:8:8:color=0x0f1522[ph];[0:v][ph]overlay=x=(W-w)/2+220:y=(H-h)/2:shortest=1[v]`,
        '-map', '[v]', '-map', '1:a', ...ENC, cFile])
    } else {
      run(['-i', src, '-vf', `scale=${W}:${H},fps=30`, ...ENC, cFile])
    }
    const cues = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', id + '.cues.json'), 'utf8'))
    segments.push({ file: cFile, dur: durationOf(cFile), cues })
    fs.copyFileSync(cFile, path.join(OUT_DIR, 'Partes', `${String(n).padStart(2, '0')} - ${title}.mp4`))
  }

  const outroVoice = synth(OUTRO)
  const outroPng = await shot(card(`${brand}<h1 style="font-size:58px;margin-top:40px">Teste grátis por 14 dias</h1>
    <p class="muted" style="font-size:20px;margin-top:14px">Todos os recursos do plano Pro · sem cartão de crédito · sem fidelidade</p>
    <div class="pill">legalhubgestor.vercel.app</div>`), path.join(WORK, 'outro.png'))
  const outroFile = path.join(WORK, '99-outro.mp4')
  const outroDur = cardSegment(outroPng, outroFile, { voice: outroVoice })
  segments.push({ file: outroFile, dur: outroDur, chapter: 'Teste grátis', cues: [{ text: OUTRO, start: 0.6, dur: outroVoice.dur }] })
  await browser.close()

  // Concatena (todos os segmentos têm os mesmos parâmetros de codificação)
  const list = path.join(WORK, 'list.txt')
  fs.writeFileSync(list, segments.map(s => `file '${s.file}'`).join('\n'))
  const joined = path.join(WORK, 'joined.mp4')
  run(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined])

  // Capítulos + legendas com os tempos de cada segmento
  let t = 0
  const chapters = [], srt = []
  const fmt = s => { const ms = Math.round(s * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}` }
  const { splitCue } = require('./narration.cjs')
  for (const s of segments) {
    if (s.chapter) chapters.push({ title: s.chapter, start: t })
    for (const c of s.cues || []) for (const p of splitCue(c)) srt.push({ start: t + p.start, end: t + p.end, text: p.text })
    t += s.dur
  }
  const meta = [';FFMETADATA1', 'title=LegalHub — Demonstração do sistema', 'artist=LegalHub', '']
  chapters.forEach((c, i) => meta.push('[CHAPTER]', 'TIMEBASE=1/1000', `START=${Math.round(c.start * 1000)}`, `END=${Math.round((chapters[i + 1]?.start ?? t) * 1000)}`, `title=${c.title}`, ''))
  const metaFile = path.join(WORK, 'meta.txt')
  fs.writeFileSync(metaFile, meta.join('\n'))
  const srtText = srt.map((c, i) => `${i + 1}\n${fmt(c.start)} --> ${fmt(c.end)}\n${c.text}\n`).join('\n')
  const srtFile = path.join(OUT_DIR, 'LegalHub - Demonstração completa.srt')
  fs.writeFileSync(srtFile, srtText)

  const finalFile = path.join(OUT_DIR, 'LegalHub - Demonstração completa.mp4')
  run(['-i', joined, '-i', metaFile, '-map_metadata', '1', '-map_chapters', '1', '-c', 'copy', '-movflags', '+faststart', finalFile])

  const srtWork = path.join(WORK, 'subs.srt')
  fs.writeFileSync(srtWork, srtText)
  const subbedFile = path.join(OUT_DIR, 'LegalHub - Demonstração completa (com legendas).mp4')
  run(['-i', joined, '-i', metaFile, '-map_metadata', '1', '-map_chapters', '1',
    '-vf', `subtitles=${srtWork}:force_style='FontName=Helvetica,FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00110702,BackColour=&HB0110702,BorderStyle=4,Outline=0,Shadow=0,MarginV=26'`,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', subbedFile])

  console.log(`total ${t.toFixed(1)}s, ${chapters.length} capítulos, ${srt.length} legendas`)
  for (const f of [finalFile, subbedFile]) console.log((fs.statSync(f).size / 1024 / 1024).toFixed(1) + ' MB', path.basename(f))
})().catch(e => { console.error(e); process.exit(1) })
