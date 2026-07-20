// ─────────────────────────────────────────────────────────────────────────────
// Lawfy — Export Utility
// Gera uma janela de exportação estilizada, consistente em todas as páginas.
// ─────────────────────────────────────────────────────────────────────────────

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

export interface ExportStat {
  value: string | number
  label: string
  /** Cor hex da barra de acento abaixo do card. Ex: '#2563eb' */
  accent?: string
}

export interface ExportCell {
  /** Texto principal */
  text: string
  /** Texto secundário abaixo do principal (menor, cinza) */
  sub?: string
  /**
   * Classe de badge pré-definida (sem dot):
   * green | gray | blue | red | amber | purple | cyan | rose | orange
   */
  badge?: string
  /** Formata o texto em fonte monospace */
  mono?: boolean
  /** Negrito no texto */
  bold?: boolean
  /** Alinha o conteúdo à direita */
  right?: boolean
  /** Destaca a célula em vermelho (ex: datas vencidas) */
  danger?: boolean
}

export interface ExportGroup {
  /** Nome do parceiro/grupo */
  label: string
  /** Linhas deste grupo */
  rows: ExportCell[][]
}

export interface ExportSection {
  /** Título da seção (ex: "Contatos", "Processos") */
  title: string
  /** Cabeçalhos das colunas desta seção (independentes das demais) */
  columns: string[]
  /** Linhas desta seção */
  rows: ExportCell[][]
}

export interface ExportOptions {
  /** Título exibido no header do relatório */
  title: string
  /** Subtítulo opcional (período, filtro ativo, etc.) */
  subtitle?: string
  /** Nome sugerido para o arquivo CSV sem extensão. Ex: 'processos-2026-06' */
  filename: string
  /** Até 4 cards de estatísticas no topo */
  stats: ExportStat[]
  /** Cabeçalhos das colunas da tabela */
  columns: string[]
  /** Linhas da tabela (usado quando não há grupos) */
  rows: ExportCell[][]
  /** Conteúdo CSV (primeira linha = cabeçalho, separado por vírgulas) */
  csvContent: string
  /** Quando fornecido, gera o relatório agrupado por parceiro em vez de lista plana */
  groups?: ExportGroup[]
  /** Quando fornecido, gera o relatório em seções independentes (ex: Contatos + Processos), cada uma com suas próprias colunas */
  sections?: ExportSection[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function renderCell(cell: ExportCell): string {
  const classes = [
    cell.right ? 'right' : '',
    cell.danger ? 'danger' : '',
    cell.mono ? 'mono' : '',
    cell.bold ? 'bold' : '',
  ].filter(Boolean).join(' ')
  const inner = cell.badge
    ? `<span class="badge b-${cell.badge}">${cell.text}</span>`
    : `${cell.bold ? `<strong>${cell.text}</strong>` : cell.text}${cell.sub ? `<span class="sub">${cell.sub}</span>` : ''}`
  return `<td${classes ? ` class="${classes}"` : ''}>${inner}</td>`
}

function renderTable(columns: string[], rows: ExportCell[][], startIndex = 0): string {
  return `<table>
    <thead><tr>
      <th style="width:40px">#</th>
      ${columns.map(c => `<th>${c}</th>`).join('')}
    </tr></thead>
    <tbody>
      ${rows.length === 0
        ? `<tr><td colspan="${columns.length + 1}" style="text-align:center;padding:32px;color:#94a3b8">Nenhum registro encontrado</td></tr>`
        : rows.map((row, i) => `
          <tr>
            <td class="num">${startIndex + i + 1}</td>
            ${row.map(renderCell).join('')}
          </tr>`).join('')}
    </tbody>
  </table>`
}

// ─── Versão em HTML simples (para conversão no Google Docs) ────────────────────
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderPlainCell(cell: ExportCell): string {
  const text = escapeHtml(cell.text) + (cell.sub ? ` (${escapeHtml(cell.sub)})` : '')
  const style = `border:1px solid #cbd5e1;padding:6px 10px;${cell.right ? 'text-align:right;' : ''}${cell.danger ? 'color:#dc2626;' : ''}`
  return `<td style="${style}">${cell.bold ? `<b>${text}</b>` : text}</td>`
}

function renderPlainTable(columns: string[], rows: ExportCell[][]): string {
  return `<table style="border-collapse:collapse;width:100%;margin-bottom:20px">
    <thead><tr style="background:#f1f5f9">
      <th style="border:1px solid #cbd5e1;padding:6px 10px;text-align:left">#</th>
      ${columns.map(c => `<th style="border:1px solid #cbd5e1;padding:6px 10px;text-align:left">${escapeHtml(c)}</th>`).join('')}
    </tr></thead>
    <tbody>
      ${rows.length === 0
        ? `<tr><td colspan="${columns.length + 1}" style="padding:16px;text-align:center;color:#94a3b8">Nenhum registro encontrado</td></tr>`
        : rows.map((row, i) => `<tr><td style="border:1px solid #cbd5e1;padding:6px 10px">${i + 1}</td>${row.map(renderPlainCell).join('')}</tr>`).join('')}
    </tbody>
  </table>`
}

function buildDocsHtml(opts: ExportOptions, date: string): string {
  const { title, subtitle, stats, columns, rows, groups, sections } = opts
  const statsLine = stats.length
    ? `<p style="font-family:Arial,sans-serif;color:#374151">${stats.map(s => `<b>${escapeHtml(String(s.value))}</b> ${escapeHtml(s.label)}`).join(' &nbsp;&middot;&nbsp; ')}</p>`
    : ''
  const body = sections
    ? sections.map(s => `<h3 style="font-family:Arial,sans-serif;color:#1e40af">${escapeHtml(s.title)} (${s.rows.length})</h3>${renderPlainTable(s.columns, s.rows)}`).join('')
    : groups
    ? groups.map(g => `<h3 style="font-family:Arial,sans-serif;color:#1e40af">${escapeHtml(g.label)} (${g.rows.length})</h3>${renderPlainTable(columns, g.rows)}`).join('')
    : renderPlainTable(columns, rows)
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>
    <h1 style="font-family:Arial,sans-serif;color:#0f2550">${escapeHtml(title)}</h1>
    ${subtitle ? `<p style="font-family:Arial,sans-serif;color:#64748b">${escapeHtml(subtitle)}</p>` : ''}
    <p style="font-family:Arial,sans-serif;color:#94a3b8;font-size:12px">Gerado em ${date}</p>
    ${statsLine}
    ${body}
  </body></html>`
}

// ─── CSS compartilhado ────────────────────────────────────────────────────────
const SHARED_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;color:#1e293b;min-height:100vh}
.header{background:linear-gradient(135deg,#0f2550 0%,#1e40af 60%,#2563eb 100%);padding:28px 40px;display:flex;align-items:center;justify-content:space-between}
.logo-wrap{display:flex;align-items:center;gap:14px}
.logo-icon{width:180px;height:76px;border-radius:12px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.logo-icon img{width:100%;height:100%;object-fit:contain}
.header-right{text-align:right}
.report-title{font-size:18px;font-weight:700;color:#fff}
.report-sub{font-size:12px;color:rgba(255,255,255,.65);margin-top:3px}
.actions{background:#fff;padding:14px 40px;display:flex;align-items:center;flex-wrap:wrap;gap:10px;border-bottom:2px solid #e2e8f0;position:sticky;top:0;z-index:10;box-shadow:0 1px 4px rgba(0,0,0,.06)}
.actions-label{font-size:13px;color:#64748b;margin-right:4px}
.btn{padding:8px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:none;display:inline-flex;align-items:center;gap:7px;text-decoration:none;transition:all .15s}
.btn:disabled{opacity:.6;cursor:default}
.btn-blue{background:#2563eb;color:#fff}.btn-blue:hover{background:#1d4ed8}
.btn-gray{background:#f1f5f9;color:#475569;border:1px solid #e2e8f0}.btn-gray:hover{background:#e2e8f0}
.btn-green{background:#0f9d58;color:#fff}.btn-green:hover{background:#0b8043}
.btn-docs{background:#2b7de9;color:#fff}.btn-docs:hover{background:#1a5fc4}
.g-status{font-size:12px;color:#64748b;margin-left:2px}
.container{padding:28px 40px}
.stats{display:grid;gap:14px;margin-bottom:28px}
.stat{background:#fff;border-radius:14px;padding:18px 22px;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.stat-val{font-size:32px;font-weight:900;color:#0f172a;line-height:1}
.stat-lbl{font-size:12px;color:#64748b;margin-top:5px;font-weight:500}
.stat-accent{width:32px;height:3px;border-radius:2px;margin-top:10px;background:#2563eb}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06);border:1px solid #e2e8f0}
thead tr{background:linear-gradient(90deg,#f8fafc,#f1f5f9)}
th{padding:13px 14px;text-align:left;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#64748b;border-bottom:1px solid #e2e8f0;white-space:nowrap}
td{padding:12px 14px;font-size:13px;color:#374151;border-bottom:1px solid #f1f5f9;vertical-align:middle}
tr:last-child td{border-bottom:none}
tbody tr:hover td{background:#f8fafc}
.num{color:#94a3b8;font-size:11px;font-weight:600}
.sub{display:block;font-size:11px;color:#94a3b8;margin-top:2px;font-family:monospace}
.badge{display:inline-flex;align-items:center;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap}
.b-green {background:#dcfce7;color:#15803d}
.b-gray  {background:#f1f5f9;color:#64748b}
.b-blue  {background:#dbeafe;color:#1d4ed8}
.b-red   {background:#fee2e2;color:#dc2626}
.b-amber {background:#fef3c7;color:#d97706}
.b-purple{background:#f3e8ff;color:#7c3aed}
.b-cyan  {background:#cffafe;color:#0e7490}
.b-rose  {background:#ffe4e6;color:#e11d48}
.b-orange{background:#ffedd5;color:#c2410c}
.danger{color:#ef4444;font-weight:700}
.right{text-align:right}
.mono{font-family:monospace;font-size:12px}
.bold{font-weight:700;color:#0f172a}
.footer{padding:20px 40px;text-align:center;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;background:#fff;margin-top:0}
.group-block{margin-bottom:32px}
.group-header{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;background:linear-gradient(90deg,#eff6ff,#f8fafc);border-radius:10px;border:1px solid #bfdbfe;margin-bottom:10px}
.group-title{font-size:14px;font-weight:800;color:#1e40af;display:flex;align-items:center;gap:8px}
.group-dot{width:10px;height:10px;border-radius:50%;background:#2563eb;display:inline-block}
.group-count{font-size:12px;color:#64748b;background:#e2e8f0;padding:3px 12px;border-radius:20px;font-weight:600}
@media print{.actions{display:none!important}body{background:#fff}.container{padding:16px 20px}.header{padding:20px}.group-block{break-inside:avoid}}
`

// ─── Exportação para o Google Drive ─────────────────────────────────────────────
// Roda inteiramente na janela principal do app (não no popup do relatório, que é
// aberto via window.open('', ...) e por isso nunca navega para uma URL real — sua
// origem efetiva não é a origem registrada no Google Cloud Console, então o GIS
// rejeitaria o token com "origin_mismatch" se a autenticação rodasse lá dentro).
// O popup só recebe, via `win.exportToSheets`/`win.exportToDocs`, closures já
// prontas para atualizar seu próprio DOM (status, botões).
const BADGE_COLORS: Record<string, { bg: string; fg: string }> = {
  green:  { bg: '#dcfce7', fg: '#15803d' },
  gray:   { bg: '#f1f5f9', fg: '#64748b' },
  blue:   { bg: '#dbeafe', fg: '#1d4ed8' },
  red:    { bg: '#fee2e2', fg: '#dc2626' },
  amber:  { bg: '#fef3c7', fg: '#d97706' },
  purple: { bg: '#f3e8ff', fg: '#7c3aed' },
  cyan:   { bg: '#cffafe', fg: '#0e7490' },
  rose:   { bg: '#ffe4e6', fg: '#e11d48' },
  orange: { bg: '#ffedd5', fg: '#c2410c' },
}

function hexToRgb(hex: string) {
  const h = hex.replace('#', '')
  return { red: parseInt(h.substr(0, 2), 16) / 255, green: parseInt(h.substr(2, 2), 16) / 255, blue: parseInt(h.substr(4, 2), 16) / 255 }
}
const THIN_BORDER = { style: 'SOLID', color: hexToRgb('#e2e8f0') }
const ALL_BORDERS = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER }

interface SheetCellOpts { bold?: boolean; fontSize?: number; bg?: string; fg?: string; align?: string; border?: boolean }

function sheetCell(text: string | number, opts: SheetCellOpts = {}): any {
  const fmt: any = {
    wrapStrategy: 'WRAP',
    verticalAlignment: 'MIDDLE',
    textFormat: { bold: !!opts.bold, fontSize: opts.fontSize || 10 },
  }
  if (opts.border !== false) fmt.borders = ALL_BORDERS
  if (opts.bg) fmt.backgroundColor = hexToRgb(opts.bg)
  if (opts.fg) fmt.textFormat.foregroundColor = hexToRgb(opts.fg)
  if (opts.align) fmt.horizontalAlignment = opts.align
  return { userEnteredValue: { stringValue: String(text ?? '') }, userEnteredFormat: fmt }
}

function sheetDataCell(cell: ExportCell, zebraBg?: string) {
  const text = cell.text + (cell.sub ? `\n${cell.sub}` : '')
  const badge = cell.badge ? BADGE_COLORS[cell.badge] : undefined
  return sheetCell(text, {
    bold: !!cell.bold,
    align: cell.right ? 'RIGHT' : 'LEFT',
    bg: badge ? badge.bg : zebraBg,
    fg: cell.danger ? '#dc2626' : badge?.fg,
  })
}

function sheetHeaderRow(cols: string[]) {
  return { values: [sheetCell('#', { bold: true, bg: '#1e40af', fg: '#ffffff', align: 'CENTER' }), ...cols.map(c => sheetCell(c, { bold: true, bg: '#1e40af', fg: '#ffffff' }))] }
}

function sheetDataRow(idx: number, row: ExportCell[], zebraBg?: string) {
  return { values: [sheetCell(idx, { align: 'CENTER', fg: '#94a3b8', fontSize: 9, bg: zebraBg }), ...row.map(c => sheetDataCell(c, zebraBg))] }
}

function sheetTableRows(cols: string[], rows: ExportCell[][]) {
  const out = [sheetHeaderRow(cols)]
  if (!rows.length) out.push({ values: [sheetCell('Nenhum registro encontrado', { fg: '#94a3b8', align: 'CENTER' })] })
  else rows.forEach((r, i) => out.push(sheetDataRow(i + 1, r, i % 2 === 1 ? '#f8fafc' : '#ffffff')))
  return out
}

function buildSheetBody(opts: ExportOptions, fileName: string, date: string) {
  const { title, subtitle, stats, columns, rows, groups, sections } = opts
  const maxCols = sections ? Math.max(...sections.map(s => s.columns.length + 1)) : columns.length + 1

  const rowData: any[] = []
  const merges: any[] = []
  let frozenRowCount = 0
  let firstTable = true

  function pushMergedRow(text: string, size: number, bg: string, fg: string) {
    const values = [sheetCell(text, { bold: true, fontSize: size, bg, fg, border: false })]
    for (let i = 1; i < maxCols; i++) values.push(sheetCell('', { bg, border: false }))
    rowData.push({ values })
    merges.push({ startRowIndex: rowData.length - 1, endRowIndex: rowData.length, startColumnIndex: 0, endColumnIndex: maxCols })
  }

  function emitTable(cols: string[], rowsIn: ExportCell[][]) {
    if (firstTable) { frozenRowCount = rowData.length + 1; firstTable = false }
    sheetTableRows(cols, rowsIn).forEach(r => rowData.push(r))
  }

  pushMergedRow(title, 14, '#0f2550', '#ffffff')
  pushMergedRow(`${subtitle ? subtitle + '  ·  ' : ''}Gerado em ${date}`, 9, '#f1f5f9', '#64748b')
  if (stats.length) pushMergedRow(stats.map(s => `${s.value} ${s.label}`).join('   ·   '), 10, '#eff6ff', '#1e40af')
  rowData.push({ values: [] })

  if (sections) {
    sections.forEach(sec => {
      pushMergedRow(`${sec.title} (${sec.rows.length})`, 11, '#eff6ff', '#1e40af')
      emitTable(sec.columns, sec.rows)
      rowData.push({ values: [] })
    })
  } else if (groups) {
    groups.forEach(g => {
      pushMergedRow(`${g.label} (${g.rows.length})`, 11, '#eff6ff', '#1e40af')
      emitTable(columns, g.rows)
      rowData.push({ values: [] })
    })
  } else {
    emitTable(columns, rows)
  }

  return {
    maxCols,
    body: {
      properties: { title: fileName },
      sheets: [{
        properties: { title: 'Relatório', gridProperties: { frozenRowCount, hideGridlines: true } },
        data: [{ startRow: 0, startColumn: 0, rowData }],
        merges,
      }],
    },
  }
}

function loadGis(): Promise<void> {
  return new Promise((resolve, reject) => {
    const ready = () => !!(window as any).google?.accounts?.oauth2
    if (ready()) { resolve(); return }
    if (!document.getElementById('gis-script')) {
      const s = document.createElement('script')
      s.id = 'gis-script'; s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true
      document.body.appendChild(s)
    }
    const interval = setInterval(() => { if (ready()) { clearInterval(interval); resolve() } }, 100)
    setTimeout(() => { clearInterval(interval); if (!ready()) reject(new Error('Falha ao carregar biblioteca do Google')) }, 10_000)
  })
}

function getGoogleToken(): Promise<string> {
  return loadGis().then(() => new Promise<string>((resolve, reject) => {
    const g = (window as any).google
    const client = g.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (resp: any) => {
        if (resp.error) { reject(new Error(resp.error)); return }
        resolve(resp.access_token)
      },
    })
    client.requestAccessToken()
  }))
}

async function driveUpload(token: string, fileName: string, mimeType: string, contentType: string, content: string) {
  const boundary = `lawfy-export-${Date.now()}`
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: fileName, mimeType }) + `\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${contentType}; charset=UTF-8\r\n\r\n` +
    content + `\r\n` +
    `--${boundary}--`
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary="${boundary}"` },
    body,
  })
  if (!res.ok) throw new Error(`Falha ao enviar (HTTP ${res.status})`)
  return res.json()
}

async function createFormattedSheet(token: string, opts: ExportOptions, fileName: string, date: string) {
  const built = buildSheetBody(opts, fileName, date)
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(built.body),
  })
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `HTTP ${res.status}`) }
  const sheet = await res.json()
  const sheetId = sheet.sheets[0].properties.sheetId
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheet.spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ autoResizeDimensions: { dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: built.maxCols } } }] }),
  }).catch(() => {})
  return sheet
}

function attachGoogleExport(win: Window, opts: ExportOptions, fileName: string, date: string) {
  loadGis().catch(() => {}) // pré-carrega para o clique não esperar o script

  function setStatus(text: string, isError = false) {
    const el = win.document.getElementById('gStatus')
    if (!el) return
    el.textContent = text
    ;(el as HTMLElement).style.color = isError ? '#dc2626' : '#64748b'
  }

  ;(win as any).exportToSheets = async () => {
    const btn = win.document.getElementById('btnSheets') as HTMLButtonElement | null
    if (btn) btn.disabled = true
    setStatus('Conectando ao Google...')
    try {
      const token = await getGoogleToken()
      setStatus('Criando planilha formatada...')
      const sheet = await createFormattedSheet(token, opts, fileName, date)
      setStatus('✓ Planilha criada no Google Drive')
      window.open(sheet.spreadsheetUrl, '_blank')
    } catch (err: any) {
      setStatus(`Erro: ${err.message}`, true)
    } finally {
      if (btn) btn.disabled = false
    }
  }

  ;(win as any).exportToDocs = async () => {
    const btn = win.document.getElementById('btnDocs') as HTMLButtonElement | null
    if (btn) btn.disabled = true
    setStatus('Conectando ao Google...')
    try {
      const token = await getGoogleToken()
      setStatus('Enviando para o Google Drive...')
      const file = await driveUpload(token, fileName, 'application/vnd.google-apps.document', 'text/html', buildDocsHtml(opts, date))
      setStatus('✓ Documento criado no Google Drive')
      window.open(file.webViewLink, '_blank')
    } catch (err: any) {
      setStatus(`Erro: ${err.message}`, true)
    } finally {
      if (btn) btn.disabled = false
    }
  }
}

// ─── Função principal ─────────────────────────────────────────────────────────
export function openExportWindow(opts: ExportOptions): void {
  const { title, subtitle, filename, stats, columns, rows, csvContent, groups, sections } = opts
  const date = new Date().toLocaleString('pt-BR')
  const csvBase64 = btoa(unescape(encodeURIComponent(csvContent)))
  const logoUrl = window.location.origin + '/logomarca.png'
  const driveFileName = `${filename}-${new Date().toISOString().slice(0, 10)}`

  const statsCols = Math.min(stats.length, 4)
  const statsHtml = `
    <div class="stats" style="grid-template-columns:repeat(${statsCols},1fr)">
      ${stats.map(s => `
        <div class="stat">
          <div class="stat-val">${s.value}</div>
          <div class="stat-lbl">${s.label}</div>
          <div class="stat-accent" style="background:${s.accent ?? '#2563eb'}"></div>
        </div>`).join('')}
    </div>`

  // Seções independentes (ex: Contatos + Processos de um parceiro)
  const contentHtml = sections
    ? sections.map(s => `
        <div class="group-block">
          <div class="group-header">
            <span class="group-title"><span class="group-dot"></span>${s.title}</span>
            <span class="group-count">${s.rows.length} registro${s.rows.length !== 1 ? 's' : ''}</span>
          </div>
          ${renderTable(s.columns, s.rows)}
        </div>`).join('')
    // Agrupado por parceiro
    : groups
    ? groups.map(g => `
        <div class="group-block">
          <div class="group-header">
            <span class="group-title"><span class="group-dot"></span>${g.label}</span>
            <span class="group-count">${g.rows.length} registro${g.rows.length !== 1 ? 's' : ''}</span>
          </div>
          ${renderTable(columns, g.rows)}
        </div>`).join('')
    : renderTable(columns, rows)

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} — LegalHub</title>
  <style>${SHARED_CSS}</style>
</head>
<body>
<div class="header">
  <div class="logo-wrap">
    <div class="logo-icon">
      <img src="${logoUrl}" alt="LegalHub" />
    </div>
  </div>
  <div class="header-right">
    <div class="report-title">${title}</div>
    <div class="report-sub">${subtitle ? subtitle + ' · ' : ''}Gerado em ${date}</div>
  </div>
</div>
<div class="actions">
  <span class="actions-label">Exportar:</span>
  <button class="btn btn-blue" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
  <a class="btn btn-gray" href="data:text/csv;charset=utf-8;base64,${csvBase64}" download="${filename}-${new Date().toISOString().slice(0, 10)}.csv">⬇️ Baixar CSV</a>
  ${CLIENT_ID ? `
  <button class="btn btn-green" id="btnSheets" onclick="exportToSheets()">📊 Planilha Google</button>
  <button class="btn btn-docs" id="btnDocs" onclick="exportToDocs()">📄 Docs Google</button>
  <span class="g-status" id="gStatus"></span>
  ` : ''}
</div>
<div class="container">
  ${statsHtml}
  ${contentHtml}
</div>
<div class="footer">LegalHub — Sistema de Gestão Jurídica &middot; Relatório gerado automaticamente</div>
</body>
</html>`

  const win = window.open('', '_blank')
  if (win) {
    win.document.write(html)
    win.document.close()
    if (CLIENT_ID) attachGoogleExport(win, opts, driveFileName, date)
  }
}
