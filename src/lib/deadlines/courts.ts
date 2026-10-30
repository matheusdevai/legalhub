// Siglas de tribunal usadas no calendário forense (court_calendar.court) — em
// minúsculas, no mesmo formato de profiles.oab_tribunais.
const UFS = ['ac', 'al', 'am', 'ap', 'ba', 'ce', 'dft', 'es', 'go', 'ma', 'mg', 'ms', 'mt', 'pa', 'pb', 'pe', 'pi', 'pr', 'rj', 'rn', 'ro', 'rr', 'rs', 'sc', 'se', 'sp', 'to']

export const COURTS: { value: string; label: string }[] = [
  ...UFS.map(uf => ({ value: `tj${uf}`, label: `TJ${uf.toUpperCase()}` })),
  ...Array.from({ length: 24 }, (_, i) => ({ value: `trt${i + 1}`, label: `TRT da ${i + 1}ª Região` })),
  ...Array.from({ length: 6 }, (_, i) => ({ value: `trf${i + 1}`, label: `TRF da ${i + 1}ª Região` })),
  { value: 'tst', label: 'TST' },
  { value: 'stj', label: 'STJ' },
  { value: 'stf', label: 'STF' },
  { value: 'inss', label: 'INSS (administrativo)' },
  { value: 'outro', label: 'Outro' },
]

export const courtLabel = (v: string | null | undefined) => COURTS.find(c => c.value === v)?.label ?? (v ? v.toUpperCase() : '—')
