import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
}

const ESCAVADOR_BASE = "https://api.escavador.com/api/v2"

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS })

  const ok = (data: object) => new Response(JSON.stringify(data), { headers: CORS })

  try {
    const token = Deno.env.get("ESCAVADOR_API_KEY") ?? ""
    if (!token) {
      return ok({
        error: "ESCAVADOR_API_KEY nao configurada. Obtenha em api.escavador.com e adicione nas secrets do Supabase.",
        total: 0, imported: 0, updated: 0, errors: [], source: "escavador",
      })
    }

    const auth = req.headers.get("Authorization") ?? ""
    if (!auth) return ok({ error: "Unauthorized", total: 0, imported: 0, updated: 0, errors: [], source: "escavador" })

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace("Bearer ", ""))
    if (authErr || !user) return ok({ error: "Unauthorized", total: 0, imported: 0, updated: 0, errors: [], source: "escavador" })

    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id, oab_number, oab_seccional, name")
      .eq("user_id", user.id)
      .single()

    if (!profile?.tenant_id) return ok({ error: "Perfil nao encontrado", total: 0, imported: 0, updated: 0, errors: [], source: "escavador" })

    const body = await req.json().catch(() => ({}))
    const oabNum   = (body.oab_number    || profile.oab_number    || "").trim().replace(/\D/g, "")
    const oabState = (body.oab_seccional || profile.oab_seccional || "").trim().toUpperCase()

    if (!oabNum || !oabState) return ok({ error: "OAB nao configurada", total: 0, imported: 0, updated: 0, errors: [], source: "escavador" })

    const escHeaders = {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    }

    // Busca paginada — ate 500 processos (5 paginas de 100)
    const allProcesses: any[] = []
    const errors: string[] = []
    let nextUrl: string | null =
      `${ESCAVADOR_BASE}/advogado/processos?oab_numero=${oabNum}&oab_estado=${oabState}&limit=100`
    let pageCount = 0

    while (nextUrl && pageCount < 5) {
      const r = await fetch(nextUrl, {
        headers: escHeaders,
        signal: AbortSignal.timeout(20_000),
      }).catch((e: any) => { errors.push(`fetch: ${e.message}`); return null })

      if (!r) break

      if (r.status === 401) { errors.push("Token Escavador invalido ou expirado"); break }
      if (r.status === 429) { errors.push("Rate limit Escavador atingido"); break }
      if (!r.ok) { errors.push(`HTTP ${r.status}`); break }

      const data = await r.json().catch(() => null)
      if (!data?.sucesso) {
        errors.push(data?.mensagem || data?.message || "Resposta invalida")
        break
      }

      const items: any[] = data?.resposta?.items ?? []
      allProcesses.push(...items)

      nextUrl = data?.resposta?.links?.next ?? null
      pageCount++
    }

    // Upsert no banco em lotes de 10
    const now = new Date().toISOString()
    let imported = 0, updated = 0

    const BATCH = 10
    for (let i = 0; i < allProcesses.length; i += BATCH) {
      const batch = allProcesses.slice(i, i + BATCH)
      await Promise.all(batch.map(async (proc: any) => {
        const num = proc.numero_cnj?.replace(/[^\d\-\.]/g, "") || ""
        if (!num) return

        const { data: ex } = await supabase
          .from("processes")
          .select("id")
          .eq("number", num)
          .eq("tenant_id", profile.tenant_id)
          .is("deleted_at", null)
          .maybeSingle()

        const title =
          proc.titulo_polo_ativo ||
          proc.titulo_polo_passivo ||
          `Processo ${num}`

        const court =
          proc.unidade_origem?.nome ||
          proc.estado_origem?.nome ||
          null

        if (ex) {
          const { error: upErr } = await supabase
            .from("processes")
            .update({ cnj_synced_at: now, ...(court ? { court } : {}) })
            .eq("id", ex.id)
          if (upErr) errors.push(`update ${num}: ${upErr.message}`)
          else updated++
        } else {
          const { error: insErr } = await supabase
            .from("processes")
            .insert({
              tenant_id: profile.tenant_id,
              number: num,
              title,
              court,
              status: "active",
              priority: "medium",
              data_protocolo: proc.data_inicio?.slice(0, 10) ?? null,
              cnj_source: true,
              cnj_synced_at: now,
            })
          if (insErr) errors.push(`insert ${num}: ${insErr.message}`)
          else imported++
        }
      }))
    }

    return ok({
      total: allProcesses.length,
      imported,
      updated,
      errors,
      oab: `${oabNum}/${oabState}`,
      source: "escavador",
    })
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: e.message, total: 0, imported: 0, updated: 0, errors: [e.message], source: "escavador" }),
      { headers: CORS },
    )
  }
})
