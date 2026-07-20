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

// ─── Função principal ─────────────────────────────────────────────────────────
export function openExportWindow(opts: ExportOptions): void {
  const { title, subtitle, filename, stats, columns, rows, csvContent, groups, sections } = opts
  const date = new Date().toLocaleString('pt-BR')
  const csvBase64 = btoa(unescape(encodeURIComponent(csvContent)))
  const logoUrl = window.location.origin + '/logomarca.png'
  const driveFileName = `${filename}-${new Date().toISOString().slice(0, 10)}`
  const docsEncoded = encodeURIComponent(buildDocsHtml(opts, date))
  const sheetDataEncoded = encodeURIComponent(JSON.stringify({
    title, subtitle, date, filename: driveFileName, stats, columns, rows, groups, sections,
  }))

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
  <button class="btn btn-green" id="btnSheets" onclick="window.exportToSheets()">📊 Planilha Google</button>
  <button class="btn btn-docs" id="btnDocs" onclick="window.exportToDocs()">📄 Docs Google</button>
  <span class="g-status" id="gStatus"></span>
  <input type="hidden" id="gExportSheetData" value="${sheetDataEncoded}">
  <input type="hidden" id="gExportDocs" value="${docsEncoded}">
  ` : ''}
</div>
<div class="container">
  ${statsHtml}
  ${contentHtml}
</div>
<div class="footer">LegalHub — Sistema de Gestão Jurídica &middot; Relatório gerado automaticamente</div>
${CLIENT_ID ? `<script>
(function(){
  var CLIENT_ID = ${JSON.stringify(CLIENT_ID)};
  var DRIVE_SCOPE = ${JSON.stringify(DRIVE_SCOPE)};
  var fileName = ${JSON.stringify(driveFileName)};
  var docsHtml = decodeURIComponent(document.getElementById('gExportDocs').value);
  var SHEET = JSON.parse(decodeURIComponent(document.getElementById('gExportSheetData').value));

  function loadGis() {
    return new Promise(function(resolve, reject) {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) { resolve(); return }
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = function(){ resolve() };
      s.onerror = function(){ reject(new Error('Falha ao carregar biblioteca do Google')) };
      document.head.appendChild(s);
    });
  }

  function getToken() {
    return loadGis().then(function() {
      return new Promise(function(resolve, reject) {
        var client = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: DRIVE_SCOPE,
          callback: function(resp) {
            if (resp.error) { reject(new Error(resp.error)); return }
            resolve(resp.access_token);
          },
        });
        client.requestAccessToken();
      });
    });
  }

  function driveUpload(token, mimeType, contentType, content) {
    var boundary = 'lawfy-export-' + Date.now();
    var body =
      '--' + boundary + '\\r\\n' +
      'Content-Type: application/json; charset=UTF-8\\r\\n\\r\\n' +
      JSON.stringify({ name: fileName, mimeType: mimeType }) + '\\r\\n' +
      '--' + boundary + '\\r\\n' +
      'Content-Type: ' + contentType + '; charset=UTF-8\\r\\n\\r\\n' +
      content + '\\r\\n' +
      '--' + boundary + '--';
    return fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'multipart/related; boundary="' + boundary + '"',
      },
      body: body,
    }).then(function(res) {
      if (!res.ok) throw new Error('Falha ao enviar (HTTP ' + res.status + ')');
      return res.json();
    });
  }

  function setStatus(text, isError) {
    var el = document.getElementById('gStatus');
    el.textContent = text;
    el.style.color = isError ? '#dc2626' : '#64748b';
  }

  // ─── Planilha formatada (Sheets API) ────────────────────────────────────────
  var BADGE_COLORS = {
    green:  { bg: '#dcfce7', fg: '#15803d' },
    gray:   { bg: '#f1f5f9', fg: '#64748b' },
    blue:   { bg: '#dbeafe', fg: '#1d4ed8' },
    red:    { bg: '#fee2e2', fg: '#dc2626' },
    amber:  { bg: '#fef3c7', fg: '#d97706' },
    purple: { bg: '#f3e8ff', fg: '#7c3aed' },
    cyan:   { bg: '#cffafe', fg: '#0e7490' },
    rose:   { bg: '#ffe4e6', fg: '#e11d48' },
    orange: { bg: '#ffedd5', fg: '#c2410c' },
  };

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    return { red: parseInt(h.substr(0, 2), 16) / 255, green: parseInt(h.substr(2, 2), 16) / 255, blue: parseInt(h.substr(4, 2), 16) / 255 };
  }
  var THIN_BORDER = { style: 'SOLID', color: hexToRgb('#e2e8f0') };
  function allBorders() { return { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER }; }

  function textCell(text, opts) {
    opts = opts || {};
    var fmt = {
      wrapStrategy: 'WRAP',
      verticalAlignment: 'MIDDLE',
      textFormat: { bold: !!opts.bold, fontSize: opts.fontSize || 10 },
    };
    if (opts.border !== false) fmt.borders = allBorders();
    if (opts.bg) fmt.backgroundColor = hexToRgb(opts.bg);
    if (opts.fg) fmt.textFormat.foregroundColor = hexToRgb(opts.fg);
    if (opts.align) fmt.horizontalAlignment = opts.align;
    return { userEnteredValue: { stringValue: String(text == null ? '' : text) }, userEnteredFormat: fmt };
  }

  function dataCell(cell, zebraBg) {
    var text = cell.text + (cell.sub ? '\\n' + cell.sub : '');
    var badge = cell.badge && BADGE_COLORS[cell.badge];
    return textCell(text, {
      bold: !!cell.bold,
      align: cell.right ? 'RIGHT' : 'LEFT',
      bg: badge ? badge.bg : zebraBg,
      fg: cell.danger ? '#dc2626' : (badge ? badge.fg : undefined),
    });
  }

  function headerRow(cols) {
    var values = [textCell('#', { bold: true, bg: '#1e40af', fg: '#ffffff', align: 'CENTER' })];
    cols.forEach(function(c) { values.push(textCell(c, { bold: true, bg: '#1e40af', fg: '#ffffff' })); });
    return { values: values };
  }

  function dataRow(idx, row, zebraBg) {
    var values = [textCell(idx, { align: 'CENTER', fg: '#94a3b8', fontSize: 9, bg: zebraBg })];
    row.forEach(function(c) { values.push(dataCell(c, zebraBg)); });
    return { values: values };
  }

  function tableRows(cols, rows) {
    var out = [headerRow(cols)];
    if (!rows.length) {
      out.push({ values: [textCell('Nenhum registro encontrado', { fg: '#94a3b8', align: 'CENTER' })] });
    } else {
      rows.forEach(function(r, i) { out.push(dataRow(i + 1, r, i % 2 === 1 ? '#f8fafc' : '#ffffff')); });
    }
    return out;
  }

  function buildSheetBody() {
    var maxCols = SHEET.sections
      ? Math.max.apply(null, SHEET.sections.map(function(s) { return s.columns.length + 1; }))
      : SHEET.columns.length + 1;

    var rowData = [];
    var merges = [];
    var frozenRowCount = 0;
    var firstTable = true;

    function pushMergedRow(text, size, bg, fg) {
      var values = [textCell(text, { bold: true, fontSize: size, bg: bg, fg: fg, border: false })];
      for (var i = 1; i < maxCols; i++) values.push(textCell('', { bg: bg, border: false }));
      rowData.push({ values: values });
      merges.push({ startRowIndex: rowData.length - 1, endRowIndex: rowData.length, startColumnIndex: 0, endColumnIndex: maxCols });
    }

    function emitTable(cols, rows) {
      if (firstTable) { frozenRowCount = rowData.length + 1; firstTable = false; }
      tableRows(cols, rows).forEach(function(r) { rowData.push(r); });
    }

    pushMergedRow(SHEET.title, 14, '#0f2550', '#ffffff');
    pushMergedRow((SHEET.subtitle ? SHEET.subtitle + '  ·  ' : '') + 'Gerado em ' + SHEET.date, 9, '#f1f5f9', '#64748b');
    if (SHEET.stats && SHEET.stats.length) {
      var statsText = SHEET.stats.map(function(s) { return s.value + ' ' + s.label; }).join('   ·   ');
      pushMergedRow(statsText, 10, '#eff6ff', '#1e40af');
    }
    rowData.push({ values: [] });

    if (SHEET.sections) {
      SHEET.sections.forEach(function(sec) {
        pushMergedRow(sec.title + ' (' + sec.rows.length + ')', 11, '#eff6ff', '#1e40af');
        emitTable(sec.columns, sec.rows);
        rowData.push({ values: [] });
      });
    } else if (SHEET.groups) {
      SHEET.groups.forEach(function(g) {
        pushMergedRow(g.label + ' (' + g.rows.length + ')', 11, '#eff6ff', '#1e40af');
        emitTable(SHEET.columns, g.rows);
        rowData.push({ values: [] });
      });
    } else {
      emitTable(SHEET.columns, SHEET.rows);
    }

    return {
      maxCols: maxCols,
      body: {
        properties: { title: fileName },
        sheets: [{
          properties: { title: 'Relatório', gridProperties: { frozenRowCount: frozenRowCount, hideGridlines: true } },
          data: [{ startRow: 0, startColumn: 0, rowData: rowData }],
          merges: merges,
        }],
      },
    };
  }

  function createFormattedSheet(token) {
    var built = buildSheetBody();
    return fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(built.body),
    }).then(function(res) {
      if (!res.ok) return res.json().then(function(e) { throw new Error((e && e.error && e.error.message) || ('HTTP ' + res.status)) });
      return res.json();
    }).then(function(sheet) {
      var sheetId = sheet.sheets[0].properties.sheetId;
      return fetch('https://sheets.googleapis.com/v4/spreadsheets/' + sheet.spreadsheetId + ':batchUpdate', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ autoResizeDimensions: { dimensions: { sheetId: sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: built.maxCols } } }] }),
      }).catch(function() {}).then(function() { return sheet; });
    });
  }

  window.exportToSheets = function() {
    var btn = document.getElementById('btnSheets');
    btn.disabled = true;
    setStatus('Conectando ao Google...');
    getToken().then(function(token) {
      setStatus('Criando planilha formatada...');
      return createFormattedSheet(token);
    }).then(function(sheet) {
      setStatus('✓ Planilha criada no Google Drive');
      window.open(sheet.spreadsheetUrl, '_blank');
    }).catch(function(err) {
      setStatus('Erro: ' + err.message, true);
    }).finally(function() { btn.disabled = false; });
  };

  window.exportToDocs = function() {
    var btn = document.getElementById('btnDocs');
    btn.disabled = true;
    setStatus('Conectando ao Google...');
    getToken().then(function(token) {
      setStatus('Enviando para o Google Drive...');
      return driveUpload(token, 'application/vnd.google-apps.document', 'text/html', docsHtml);
    }).then(function(file) {
      setStatus('✓ Documento criado no Google Drive');
      window.open(file.webViewLink, '_blank');
    }).catch(function(err) {
      setStatus('Erro: ' + err.message, true);
    }).finally(function() { btn.disabled = false; });
  };
})();
</script>` : ''}
</body>
</html>`

  const win = window.open('', '_blank')
  if (win) { win.document.write(html); win.document.close() }
}
