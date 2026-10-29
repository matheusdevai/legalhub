// Grava um "clipe" do app: screencast via CDP (JPEG por frame, com timestamp)
// → ffmpeg monta um MP4 H.264 a 30fps. Inclui um cursor falso desenhado na
// página (headless não renderiza cursor) e helpers de movimento suave.
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const ffmpeg = require('ffmpeg-static')
const { launch, ensureLogin, BASE } = require('./common.cjs')

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
      await loc.scrollIntoViewIfNeeded().catch(() => {})
      const box = await loc.boundingBox()
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
  try {
    await scenario({ ...h,
      start: async () => {
        await page.mouse.move(pos.x, pos.y)
        await startCast()
        await page.waitForTimeout(300)
      },
      // Corta uma espera longa (ex.: resposta da IA): o último frame antes do
      // corte fica só CUT_HOLD segundos no vídeo, em vez da espera inteira.
      cut: async waitFn => {
        await cdp.send('Page.stopScreencast')
        if (frames.length) frames[frames.length - 1].cut = true
        await waitFn()
        await startCast()
        await page.waitForTimeout(300)
      },
    })
    await page.waitForTimeout(600)
  } finally {
    await cdp.send('Page.stopScreencast').catch(() => {})
    await page.waitForTimeout(300)
    await browser.close()
  }

  if (frames.length < 2) throw new Error('nenhum frame capturado')
  const endTs = frames[frames.length - 1].ts + 0.5
  const list = frames.map((f, i) => {
    const dur = f.cut ? 0.6 : Math.max(0.001, ((frames[i + 1]?.ts ?? endTs) - f.ts))
    return `file '${f.file}'\nduration ${dur.toFixed(4)}`
  }).join('\n') + `\nfile '${frames[frames.length - 1].file}'\n`
  const listFile = path.join(frameDir, 'list.txt')
  fs.writeFileSync(listFile, list)

  const out = path.join(outDir, name + '.mp4')
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-vf', 'fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-movflags', '+faststart', '-an', out])
  // Pôster: primeiro frame "assentado" (1s) em WebP via JPEG
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-ss', '0.8', '-i', out, '-frames:v', '1', '-vf', `scale=${Math.min(1280, Math.round(width * scale))}:-2`, '-q:v', '4', path.join(outDir, name + '.jpg')])
  const size = (fs.statSync(out).size / 1024 / 1024).toFixed(2)
  const secs = (endTs - frames[0].ts).toFixed(1)
  console.log(`${name}: ${frames.length} frames, ${secs}s, ${size} MB → ${out}`)
}

module.exports = { record }
