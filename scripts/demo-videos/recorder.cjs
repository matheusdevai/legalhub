// Grava um "clipe" do app: screencast via CDP (JPEG por frame, com timestamp)
// → ffmpeg monta um MP4 H.264 a 30fps. Inclui um cursor falso desenhado na
// página (headless não renderiza cursor) e helpers de movimento suave.
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const ffmpeg = require('ffmpeg-static')
const { launch, ensureLogin, BASE } = require('./common.cjs')
const { synth, buildVtt } = require('./narration.cjs')

const CURSOR_SCRIPT = `
(() => {
  try { sessionStorage.setItem('ebook_banner_dismissed', '1'); sessionStorage.setItem('maintenance_dismissed', '1') } catch {}
  const install = () => {
    if (document.getElementById('__demo_cursor')) return
    const c = document.createElement('div')
    c.id = '__demo_cursor'
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 10.5-6.6 1.3 3.9 7.3-2.9 1.5-3.9-7.4L4 20z" fill="#0b1220" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>'
    Object.assign(c.style, { position: 'fixed', left: '0px', top: '0px', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-3px,-2px)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))', transition: 'opacity .2s' })
    if (window.__demoTouch) c.style.display = 'none'
    document.documentElement.appendChild(c)
    window.addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px' }, true)
    window.addEventListener('mousedown', e => {
      const r = document.createElement('div')
      Object.assign(r.style, { position: 'fixed', left: (e.clientX - 18) + 'px', top: (e.clientY - 18) + 'px', width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(11,92,255,.35)', zIndex: 2147483646, pointerEvents: 'none', transform: 'scale(.3)', transition: 'transform .45s ease-out, opacity .45s ease-out' })
      document.documentElement.appendChild(r)
      requestAnimationFrame(() => { r.style.transform = 'scale(1.4)'; r.style.opacity = '0' })
      setTimeout(() => r.remove(), 500)
    }, true)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install()
})()
`

async function record(name, { width = 1280, height = 800, scale = 1, touch = false } = {}, scenario) {
  const outDir = path.join(__dirname, 'out')
  const frameDir = path.join(__dirname, 'frames', name)
  fs.rmSync(frameDir, { recursive: true, force: true })
  fs.mkdirSync(frameDir, { recursive: true })
  fs.mkdirSync(outDir, { recursive: true })

  const { browser, context, page } = await launch({ width, height, scale })
  if (touch) await context.addInitScript('window.__demoTouch = true')
  await context.addInitScript(CURSOR_SCRIPT)
  // Só na gravação: esconde o aviso de teste grátis do escritório demo,
  // fingindo uma assinatura ativa na resposta (nada é gravado no banco).
  await context.route('**/rest/v1/billing_subscriptions*', async route => {
    const res = await route.fetch()
    let body = await res.text()
    body = body.replace(/"status":"trialing"/g, '"status":"active"')
    await route.fulfill({ response: res, body })
  })
  await ensureLogin(page, context)

  let pos = { x: width * 0.6, y: height * 0.55 }
  const h = {
    page, BASE,
    wait: ms => page.waitForTimeout(ms),
    async goto(route) { await page.goto(BASE + route); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(900); await page.mouse.move(pos.x, pos.y) },
    async moveTo(target, { dx = 0, dy = 0, duration = 650 } = {}) {
      const loc = typeof target === 'string' ? page.locator(target).first() : target
      await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {})
      const box = await loc.boundingBox({ timeout: 3000 }).catch(() => null)
      if (!box) throw new Error('sem bounding box: ' + target)
      const to = { x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 + dy }
      const steps = Math.max(12, Math.round(duration / 16))
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
        await page.mouse.move(pos.x + (to.x - pos.x) * e, pos.y + (to.y - pos.y) * e)
        await page.waitForTimeout(16)
      }
      pos = to
      return loc
    },
    async click(target, opts = {}) {
      await h.moveTo(target, opts)
      await page.waitForTimeout(180)
      await page.mouse.down(); await page.waitForTimeout(70); await page.mouse.up()
      await page.waitForTimeout(opts.after ?? 900)
    },
    async type(text, delay = 55) { await page.keyboard.type(text, { delay }) },
    async scroll(dy, { steps = 30, el } = {}) {
      if (el) await h.moveTo(el)
      for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, dy / steps); await page.waitForTimeout(22) }
      await page.waitForTimeout(400)
    },
  }

  // Começa a capturar só depois da página inicial carregada
  const cdp = await context.newCDPSession(page)
  const frames = []
  let n = 0
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const file = path.join(frameDir, String(n++).padStart(6, '0') + '.jpg')
    fs.writeFileSync(file, Buffer.from(data, 'base64'))
    frames.push({ file, ts: metadata.timestamp })
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  })

  const startCast = () => cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: Math.round(width * scale), maxHeight: Math.round(height * scale), everyNthFrame: 1 })
  // Corta uma espera do vídeo: o último frame antes do corte fica só `hold` segundos.
  async function cut(waitFn, hold = 0.6) {
    await cdp.send('Page.stopScreencast')
    if (frames.length) frames[frames.length - 1].hold = hold
    await waitFn()
    await startCast()
    await page.waitForTimeout(150)
  }

  // Narração: cada fala espera a anterior terminar, é sintetizada fora do
  // vídeo (corte sem pausa visível) e marcada no relógio de parede — depois
  // convertido para o tempo do vídeo.
  const speech = []
  let speakingUntil = 0
  const now = () => Date.now() / 1000
  async function waitSpeech(pad = 0.35) {
    const left = speakingUntil + pad - now()
    if (left > 0) await page.waitForTimeout(left * 1000)
  }
  async function say(text) {
    await waitSpeech()
    let clip
    if (speech.some(s => s.text === text)) throw new Error('fala repetida: ' + text)
    await cut(async () => { clip = synth(text) }, 0.04)
    const at = now()
    speech.push({ text, ...clip, at })
    speakingUntil = at + clip.dur
  }

  try {
    await scenario({ ...h, say, waitSpeech, cut,
      start: async () => {
        await page.mouse.move(pos.x, pos.y)
        await startCast()
        await page.waitForTimeout(300)
      },
    })
    await waitSpeech(0.9)
  } finally {
    await cdp.send('Page.stopScreencast').catch(() => {})
    await page.waitForTimeout(300)
    await browser.close()
  }

  if (frames.length < 2) throw new Error('nenhum frame capturado')
  const endTs = frames[frames.length - 1].ts + 0.5
  let t = 0
  for (const [i, f] of frames.entries()) {
    f.vstart = t
    f.dur = f.hold ?? Math.max(0.001, ((frames[i + 1]?.ts ?? endTs) - f.ts))
    t += f.dur
  }
  const videoLen = t
  // Relógio de parede → tempo do vídeo (respeitando os cortes)
  function toVideoTime(ts) {
    let k = 0
    while (k + 1 < frames.length && frames[k + 1].ts <= ts) k++
    const f = frames[k]
    return f.vstart + Math.min(Math.max(0, ts - f.ts), f.dur)
  }

  const list = frames.map(f => `file '${f.file}'\nduration ${f.dur.toFixed(4)}`).join('\n') + `\nfile '${frames[frames.length - 1].file}'\n`
  const listFile = path.join(frameDir, 'list.txt')
  fs.writeFileSync(listFile, list)

  const silent = path.join(frameDir, 'silent.mp4')
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-vf', 'fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-movflags', '+faststart', '-an', silent])

  const out = path.join(outDir, name + '.mp4')
  const cues = speech.map(s => ({ text: s.text, start: toVideoTime(s.at), dur: s.dur, file: s.file }))
  if (cues.length) {
    const inputs = cues.flatMap(c => ['-i', c.file])
    const delays = cues.map((c, i) => `[${i + 1}]aresample=48000,adelay=${Math.round(c.start * 1000)}:all=1[a${i}]`).join(';')
    const mix = `${cues.map((_, i) => `[a${i}]`).join('')}amix=inputs=${cues.length}:normalize=0,apad,volume=1.6[aout]`
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', silent, ...inputs, '-filter_complex', `${delays};${mix}`,
      '-map', '0:v', '-map', '[aout]', '-t', videoLen.toFixed(3), '-c:v', 'copy', '-c:a', 'aac', '-b:a', '96k', '-ac', '1', '-movflags', '+faststart', out])
    fs.writeFileSync(path.join(outDir, name + '.vtt'), buildVtt(cues))
    fs.writeFileSync(path.join(outDir, name + '.cues.json'), JSON.stringify(cues.map(({ text, start, dur }) => ({ text, start, dur })), null, 1))
  } else {
    fs.copyFileSync(silent, out)
  }
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-ss', '2.5', '-i', out, '-frames:v', '1', '-q:v', '5', path.join(outDir, name + '.jpg')])
  const size = (fs.statSync(out).size / 1024 / 1024).toFixed(2)
  console.log(`${name}: ${frames.length} frames, ${videoLen.toFixed(1)}s, ${cues.length} falas, ${size} MB`)
}

module.exports = { record }
