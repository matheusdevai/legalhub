// ─────────────────────────────────────────────────────────────────────────────
// Lawfy — Export Utility
// Gera uma janela de exportação estilizada, consistente em todas as páginas.
// ─────────────────────────────────────────────────────────────────────────────

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
.actions{background:#fff;padding:14px 40px;display:flex;align-items:center;gap:10px;border-bottom:2px solid #e2e8f0;position:sticky;top:0;z-index:10;box-shadow:0 1px 4px rgba(0,0,0,.06)}
.actions-label{font-size:13px;color:#64748b;margin-right:4px}
.btn{padding:8px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:none;display:inline-flex;align-items:center;gap:7px;text-decoration:none;transition:all .15s}
.btn-blue{background:#2563eb;color:#fff}.btn-blue:hover{background:#1d4ed8}
.btn-gray{background:#f1f5f9;color:#475569;border:1px solid #e2e8f0}.btn-gray:hover{background:#e2e8f0}
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

// ─── Função principal ─────────────────────────────────────────────────────────
export function openExportWindow(opts: ExportOptions): void {
  const { title, subtitle, filename, stats, columns, rows, csvContent, groups, sections } = opts
  const date = new Date().toLocaleString('pt-BR')
  const csvBase64 = btoa(unescape(encodeURIComponent(csvContent)))
  const logoUrl = window.location.origin + '/logomarca.png'

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
</div>
<div class="container">
  ${statsHtml}
  ${contentHtml}
</div>
<div class="footer">LegalHub — Sistema de Gestão Jurídica &middot; Relatório gerado automaticamente</div>
</body>
</html>`

  const win = window.open('', '_blank')
  if (win) { win.document.write(html); win.document.close() }
}
