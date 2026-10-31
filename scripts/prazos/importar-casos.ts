// Importa a bateria de casos reais (CSV preenchido por advogado) para
// src/lib/deadlines/casosReais.data.json, que o Vitest roda em todo deploy.
//
//   node scripts/prazos/importar-casos.ts "~/Desktop/LegalHub - Controle de Prazos/Bateria de casos — Controle de Prazos.csv"
//
// Node 24 executa TypeScript direto (só remove os tipos). Linhas com erro não
// entram e são listadas; linhas marcadas "EXEMPLO" em "conferido por" são puladas.
// Depois: `npx vitest run src/lib/deadlines/casosReais.test.ts`.
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { parseCasesCsv } from '../../src/lib/deadlines/casosImport.ts'

const arg = process.argv[2]
if (!arg) {
  console.error('Uso: node scripts/prazos/importar-casos.ts "<caminho do CSV>"')
  process.exit(1)
}
const path = resolve(arg.replace(/^~(?=\/)/, homedir()))
const { cases, errors, skipped } = parseCasesCsv(readFileSync(path, 'utf8'))
const out = resolve(import.meta.dirname, '../../src/lib/deadlines/casosReais.data.json')
writeFileSync(out, JSON.stringify(cases, null, 2) + '\n')

const penais = cases.filter(c => c.input.regime === 'penal').length
console.log(`${cases.length} caso(s) importado(s) (${cases.length - penais} cíveis/trabalhistas/administrativos, ${penais} penais); ${skipped} linha(s) de exemplo pulada(s).`)
if (errors.length) {
  console.log(`\n${errors.length} linha(s) com erro — corrija na planilha e rode de novo:`)
  for (const e of errors) console.log(`  • ${e}`)
  process.exitCode = 2
}
console.log(`\nGravado em ${out}\nAgora rode: npx vitest run src/lib/deadlines/casosReais.test.ts`)
