import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
}

const MNI_HOSTS: Record<string, string> = {
  tjac:'pje.tjac.jus.br', tjal:'pje.tjal.jus.br', tjam:'pje.tjam.jus.br',
  tjap:'pje.tjap.jus.br', tjba:'pje.tjba.jus.br', tjce:'pje.tjce.jus.br',
  tjdft:'pje.tjdft.jus.br', tjes:'pje.tjes.jus.br', tjgo:'pje.tjgo.jus.br',
  tjma:'pje.tjma.jus.br', tjmg:'pje.tjmg.jus.br', tjms:'pje.tjms.jus.br',
  tjmt:'pje.tjmt.jus.br', tjpa:'pje.tjpa.jus.br', tjpb:'pje.tjpb.jus.br',
  tjpe:'pje.tjpe.jus.br', tjpi:'pje.tjpi.jus.br', tjpr:'pje.tjpr.jus.br',
  tjrj:'tjrj.pje.jus.br', tjrn:'pje.tjrn.jus.br', tjro:'pje.tjro.jus.br',
  tjrr:'pje.tjrr.jus.br', tjrs:'pje.tjrs.jus.br', tjsc:'pje.tjsc.jus.br',
  tjse:'pje.tjse.jus.br', tjsp:'pje.tjsp.jus.br', tjto:'pje.tjto.jus.br',
  trf1:'pje1g.trf1.jus.br', trf2:'pje.trf2.jus.br', trf3:'pje.trf3.jus.br',
  trf4:'pje.trf4.jus.br', trf5:'pje.trf5.jus.br',
  trt1:'pje.trt1.jus.br', trt2:'pje.trt2.jus.br', trt3:'pje.trt3.jus.br',
  trt4:'pje.trt4.jus.br', trt5:'pje.trt5.jus.br', trt6:'pje.trt6.jus.br',
  trt7:'pje.trt7.jus.br', trt8:'pje.trt8.jus.br', trt9:'pje.trt9.jus.br',
  trt10:'pje.trt10.jus.br', trt11:'pje.trt11.jus.br', trt12:'pje.trt12.jus.br',
  trt13:'pje.trt13.jus.br', trt14:'pje.trt14.jus.br', trt15:'pje.trt15.jus.br',
  trt16:'pje.trt16.jus.br', trt17:'pje.trt17.jus.br', trt18:'pje.trt18.jus.br',
  trt19:'pje.trt19.jus.br', trt20:'pje.trt20.jus.br', trt21:'pje.trt21.jus.br',
  trt22:'pje.trt22.jus.br', trt23:'pje.trt23.jus.br', trt24:'pje.trt24.jus.br',
  stj:'pje.stj.jus.br', tst:'pje.tst.jus.br',
}

const MNI_PATHS = ['/pjemni/intercomunicacao', '/pje/intercomunicacao', '/intercomunicacao']
const MNI_NS = [
  'http://www.cnj.jus.br/servico-intercomunicacao-2.2.2/',
  'http://www.cnj.jus.br/servico-intercomunicacao-2.2.3/',
  'http://intercomunicacao.ws.pje.cnj.jus.br/',
]

function escapeXml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')
}

function buildSoap(cpf: string, senha: string, ns: string): string {
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns2="' + ns + '">' +
    '<S:Body>' +
    '<ns2:consultarAvisosPendentes>' +
    '<idConsultante>' + escapeXml(cpf) + '</idConsultante>' +
    '<senhaConsultante>' + escapeXml(senha) + '</senhaConsultante>' +
    '</ns2:consultarAvisosPendentes>' +
    '</S:Body>' +
    '</S:Envelope>'
}

function xmlVal(xml: string, tag: string): string {
  const m = xml.match(new RegExp('<(?:[\\w-]+:)?' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?' + tag + '>', 'i'))
  if (!m) return ''
  return m[1].replace(/<\!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim()
}

function xmlAll(xml: string, tag: string): string[] {
  const re = new RegExp('<(?:[\\w-]+:)?' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?' + tag + '>', 'gi')
  const out: string[] = []
  let m
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1].replace(/<\!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim())
  }
  return out
}

interface Aviso {
  idAviso: string; numeroProcesso: string; tipoAviso: string
  dataHora: string; orgao: string; nomeOrgao: string
  teor: string; parteAdversa: string; prazo: string
}

function parseAvisos(xml: string): Aviso[] {
  const blocos = xmlAll(xml, 'aviso')
  return blocos.map(b => ({
    idAviso: xmlVal(b, 'idAviso'), numeroProcesso: xmlVal(b, 'numeroProcesso'),
    tipoAviso: xmlVal(b, 'tipoAviso') || 'I',
    dataHora: xmlVal(b, 'dataDisponibilizacao') || xmlVal(b, 'dataEnvio') || '',
    orgao: xmlVal(b, 'siglaOrgaoJulgador'), nomeOrgao: xmlVal(b, 'nomeOrgaoJulgador') || xmlVal(b, 'orgaoJulgador'),
    teor: xmlVal(b, 'teor'), parteAdversa: xmlVal(b, 'nomeParteAdversa') || xmlVal(b, 'parteAdversa'),
    prazo: xmlVal(b, 'prazo'),
  })).filter(a => a.numeroProcesso)
}

const TIPO_NOME: Record<string, string> = { I: 'Intimacao', C: 'Citacao', R: 'Remessa Eletronica', A: 'Aviso' }

async function callMni(trib: string, cpf: string, senha: string): Promise<{ avisos: Aviso[]; endpoint: string; error: string | null }> {
  const host = MNI_HOSTS[trib]
  if (!host) return { avisos: [], endpoint: '', error: 'Host MNI nao mapeado para ' + trib }

  for (const path of MNI_PATHS) {
    for (const ns of MNI_NS) {
      const endpoint = 'https://' + host + path
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'text/xml; charset=UTF-8', 'SOAPAction': '"' + ns + 'consultarAvisosPendentes"' },
          body: buildSoap(cpf, senha, ns),
          signal: AbortSignal.timeout(20_000),
        })
        const xml = await resp.text()
        if (xml.includes('Fault') || xml.includes('fault')) {
          const msg = xmlVal(xml, 'faultstring') || xmlVal(xml, 'message') || 'SOAP Fault'
          if (msg.toLowerCase().includes('credencial') || msg.toLowerCase().includes('autentica') || msg.toLowerCase().includes('senha')) {
            return { avisos: [], endpoint, error: 'Credenciais invalidas para ' + trib + ': ' + msg }
          }
          continue
        }
        const sucesso = xmlVal(xml, 'sucesso')
        if (sucesso === 'false') {
          const msg = xmlVal(xml, 'mensagem') || 'Falha na consulta'
          if (msg.toLowerCase().includes('credencial') || msg.toLowerCase().includes('senha')) {
            return { avisos: [], endpoint, error: 'Credenciais invalidas para ' + trib }
          }
          continue
        }
        return { avisos: parseAvisos(xml), endpoint, error: null }
      } catch (e: any) {
        if (e?.name === 'TimeoutError') continue
        continue
      }
    }
  }
  return { avisos: [], endpoint: '', error: 'MNI inacessivel em ' + trib }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Unauthorized', total: 0, imported: 0, updated: 0, errors: [], tribunais_pesquisados: 0 }), { headers: CORS })
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace('Bearer ', ''))
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized', total: 0, imported: 0, updated: 0, errors: [], tribunais_pesquisados: 0 }), { headers: CORS })
    }

    const { data: profile } = await supabase.from('profiles').select('tenant_id, name').eq('user_id', user.id).single()
    if (!profile?.tenant_id) {
      return new Response(JSON.stringify({ error: 'Perfil nao encontrado', total: 0, imported: 0, updated: 0, errors: [], tribunais_pesquisados: 0 }), { headers: CORS })
    }

    const body = await req.json()
    const cpf: string = (body.cpf || '').trim().replace(/\D/g, '')
    const senha: string = (body.senha || '').trim()
    const tribunais: string[] = Array.isArray(body.tribunais) ? body.tribunais : []

    if (!cpf || !senha) {
      return new Response(JSON.stringify({ error: 'CPF e senha PJe obrigatorios', total: 0, imported: 0, updated: 0, errors: ['CPF e senha PJe obrigatorios'], tribunais_pesquisados: 0 }), { headers: CORS })
    }

    const allAvisos: (Aviso & { tribunal: string })[] = []
    const errors: string[] = []
    const endpoints_used: Record<string, string> = {}
    const now = new Date().toISOString()

    const CHUNK = 5
    for (let i = 0; i < tribunais.length; i += CHUNK) {
      const chunk = tribunais.slice(i, i + CHUNK)
      await Promise.all(chunk.map(async trib => {
        const { avisos, endpoint, error } = await callMni(trib, cpf, senha)
        if (error) errors.push(trib.toUpperCase() + ': ' + error)
        else { endpoints_used[trib] = endpoint; for (const a of avisos) allAvisos.push({ ...a, tribunal: trib }) }
      }))
    }

    let imported = 0, updated = 0
    const insert_errors: string[] = []

    for (const aviso of allAvisos) {
      const num = aviso.numeroProcesso
      if (!num) continue

      const movimento = {
        fonte: 'pje', idAviso: aviso.idAviso, nome: TIPO_NOME[aviso.tipoAviso] ?? 'Aviso',
        dataHora: aviso.dataHora, orgao: aviso.orgao, teor: aviso.teor,
        parteAdversa: aviso.parteAdversa, prazo: aviso.prazo,
      }

      const { data: ex } = await supabase.from('processes').select('id, movimentos')
        .eq('number', num).eq('tenant_id', profile.tenant_id).is('deleted_at', null).maybeSingle()

      if (ex) {
        const existing: any[] = Array.isArray(ex.movimentos) ? ex.movimentos : []
        if (!existing.some((m: any) => m.idAviso === aviso.idAviso)) {
          const { error: upErr } = await supabase.from('processes').update({ cnj_synced_at: now, movimentos: [...existing, movimento] }).eq('id', ex.id)
          if (upErr) insert_errors.push('update ' + num + ': ' + upErr.message)
          else updated++
        }
      } else {
        const { error: insErr } = await supabase.from('processes').insert({
          tenant_id: profile.tenant_id, number: num,
          title: aviso.parteAdversa ? (TIPO_NOME[aviso.tipoAviso] ?? 'Aviso') + ' - ' + aviso.parteAdversa : (TIPO_NOME[aviso.tipoAviso] ?? 'Processo PJe'),
          court: aviso.nomeOrgao || aviso.orgao || null, area: aviso.tribunal.toUpperCase(),
          status: 'active', priority: 'medium', cnj_source: true, cnj_synced_at: now, movimentos: [movimento],
        })
        if (insErr) insert_errors.push('insert ' + num + ': ' + insErr.message)
        else imported++
      }
    }

    return new Response(
      JSON.stringify({ total: allAvisos.length, imported, updated, errors: [...errors, ...insert_errors], tribunais_pesquisados: tribunais.length, endpoints_used }),
      { headers: CORS },
    )
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message, total: 0, imported: 0, updated: 0, errors: [e.message], tribunais_pesquisados: 0 }),
      { headers: CORS },
    )
  }
})
