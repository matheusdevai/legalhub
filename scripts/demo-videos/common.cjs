const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')

const BASE = process.env.DEMO_BASE_URL || 'http://localhost:5173'
// Sessão salva entre gravações (fica fora do git — ver .gitignore desta pasta)
const STATE = path.join(__dirname, '.state.json')

async function launch({ width = 1280, height = 800, scale = 1, dark = false } = {}) {
  // --window-size + screen: sem isso o screencast do headless usa a janela
  // padrão (1280x720) e corta/distorce os frames
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: [`--window-size=${width},${height}`],
  })
  const opts = { viewport: { width, height }, screen: { width, height }, deviceScaleFactor: scale, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: dark ? 'dark' : 'light' }
  if (fs.existsSync(STATE)) opts.storageState = STATE
  const context = await browser.newContext(opts)
  const page = await context.newPage()
  return { browser, context, page }
}

async function ensureLogin(page, context) {
  await page.goto(BASE + '/dashboard')
  await page.waitForTimeout(2500)
  if (!page.url().includes('/login')) return
  const email = process.env.DEMO_EMAIL
  const password = process.env.DEMO_PASSWORD
  if (!email || !password) throw new Error('Defina DEMO_EMAIL e DEMO_PASSWORD (conta do escritório de demonstração).')
  await page.fill('input[type="email"]', email)
  await page.fill('input[placeholder="••••••••••••"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard', { timeout: 20000 })
  await page.waitForTimeout(2000)
  await context.storageState({ path: STATE })
}

module.exports = { launch, ensureLogin, BASE }
