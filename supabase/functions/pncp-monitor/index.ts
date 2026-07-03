import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const palavras: string[] = (body.palavrasChave || body.keywords || [])
      .map((s: string) => s.toLowerCase().trim()).filter(Boolean);
    const uf: string = body.uf || '';
    const diasFuturos: number = body.dias || 15;

    const hoje = new Date();
    const fim = new Date(hoje.getTime() + diasFuturos * 86400000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

    const modalidade = body.modalidade || 6;
    const params = new URLSearchParams({
      dataInicial: fmt(hoje),
      dataFinal: fmt(fim),
      codigoModalidadeContratacao: String(modalidade),
      pagina: '1',
      tamanhoPagina: '50',
    });
    if (uf) params.set('uf', uf);

    const url = `https://pncp.gov.br/api/consulta/v1/contratacoes/proposta?${params}`;
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: 'PNCP indisponível', status: resp.status, resultados: [] }),
        { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const json = await resp.json();
    const registros = json.data || json.items || [];

    const pad = (n: any, l: number) => String(n ?? '').padStart(l, '0');

    const resultados = registros
      .map((r: any) => {
        const numCompra = r.numeroCompra || r.numeroCompraPncp || null;
        const anoCompra = r.anoCompra || (r.dataPublicacaoPncp ? r.dataPublicacaoPncp.slice(0, 4) : '');
        const siglaMod = (r.modalidadeNome || '').toLowerCase().includes('pregão') ? 'PE'
          : (r.modalidadeNome || '').toLowerCase().includes('concorr') ? 'CC'
          : (r.modalidadeNome || '').toLowerCase().includes('dispensa') ? 'DL'
          : (r.modalidadeNome || '').toLowerCase().includes('tomada') ? 'TP' : 'ED';
        const editalFmt = numCompra
          ? `${siglaMod} ${pad(numCompra, 5)}/${anoCompra}`
          : (r.numeroControlePNCP || '—');
        return {
          edital: editalFmt,
          numeroCompra: numCompra,
          anoCompra,
          processo: r.processo || r.numeroProcesso || null,
          orgao: r.orgaoEntidade?.razaoSocial || r.unidadeOrgao?.nomeUnidade || '—',
          objeto: r.objetoCompra || r.objeto || '',
          modalidade: r.modalidadeNome || 'Pregão Eletrônico',
          valorEstimado: r.valorTotalEstimado || 0,
          dataAbertura: r.dataAberturaProposta || r.dataPublicacaoPncp || null,
          dataEncerramento: r.dataEncerramentoProposta || null,
          uf: r.unidadeOrgao?.ufSigla || '',
          municipio: r.unidadeOrgao?.municipioNome || '',
          numeroControle: r.numeroControlePNCP || '',
          link: r.numeroControlePNCP
            ? `https://pncp.gov.br/app/editais/${r.numeroControlePNCP}` : null,
        };
      })
      .filter((r: any) => {
        if (!palavras.length) return true;
        const txt = (r.objeto + ' ' + r.orgao).toLowerCase();
        return palavras.some((p) => txt.includes(p));
      })
      .slice(0, 30);

    return new Response(JSON.stringify({
      total: resultados.length,
      consultadoEm: new Date().toISOString(),
      filtros: { palavras, uf, dias: diasFuturos },
      resultados,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e), resultados: [] }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
