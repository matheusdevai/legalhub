import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { texto } = await req.json();
    if (!texto || texto.length < 30) {
      return new Response(JSON.stringify({ error: 'Texto do edital muito curto.' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }

    const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY');

    if (ANTHROPIC_KEY) {
      const prompt = `Você é um especialista em licitações públicas brasileiras (Lei 14.133/21). Analise o edital abaixo e responda APENAS com um JSON válido no formato:
{"resumo":"...","orgao":"...","objeto":"...","modalidade":"...","valorEstimado":"...","datas":[{"evento":"...","data":"..."}],"documentosHabilitacao":{"juridica":[],"fiscal":[],"tecnica":[],"economica":[]},"riscos":[],"checklist":[]}

EDITAL:
${texto.slice(0, 12000)}`;

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      const data = await r.json();
      const txt = data?.content?.[0]?.text || '';
      const match = txt.match(/\{[\s\S]*\}/);
      if (match) {
        return new Response(JSON.stringify({ fonte: 'ia', ...JSON.parse(match[0]) }),
          { headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
    }

    // Fallback heurístico
    const t = texto.toLowerCase();
    const datas: any[] = [];
    const dRe = /(\d{1,2})[\/](\d{1,2})[\/](\d{2,4})/g;
    const todasDatas = texto.match(dRe) || [];
    if (todasDatas.length) {
      datas.push({ evento: 'Data encontrada no edital', data: todasDatas[0] });
      if (todasDatas[1]) datas.push({ evento: 'Outra data relevante', data: todasDatas[1] });
    }

    const docMencoes = { juridica: [] as string[], fiscal: [] as string[], tecnica: [] as string[], economica: [] as string[] };
    if (t.includes('contrato social') || t.includes('estatuto')) docMencoes.juridica.push('Contrato Social / Estatuto');
    if (t.includes('cnpj')) docMencoes.juridica.push('Comprovante de inscrição CNPJ');
    if (t.includes('certidão') && t.includes('federal')) docMencoes.fiscal.push('Certidão Negativa Federal');
    if (t.includes('fgts')) docMencoes.fiscal.push('Certificado de Regularidade do FGTS');
    if (t.includes('trabalhista') || t.includes('cndt')) docMencoes.fiscal.push('Certidão Negativa de Débitos Trabalhistas');
    if (t.includes('estadual')) docMencoes.fiscal.push('Certidão Negativa Estadual');
    if (t.includes('municipal')) docMencoes.fiscal.push('Certidão Negativa Municipal');
    if (t.includes('atestado') && t.includes('capacidade')) docMencoes.tecnica.push('Atestado de Capacidade Técnica');
    if (t.includes('acervo')) docMencoes.tecnica.push('Acervo Técnico (CAT/CREA)');
    if (t.includes('balanço')) docMencoes.economica.push('Balanço Patrimonial');
    if (t.includes('falência') || t.includes('concordata')) docMencoes.economica.push('Certidão Negativa de Falência');

    const riscos: string[] = [];
    if (t.includes('visita técnica') || t.includes('vistoria')) riscos.push('Exige visita técnica / vistoria ao local');
    if (t.includes('garantia')) riscos.push('Exige garantia de proposta ou contratual');
    if (t.includes('amostra')) riscos.push('Pode exigir apresentação de amostras');
    if (t.includes('consorcio') && t.includes('vedad')) riscos.push('Veda participação em consórcio');
    if (t.includes('me/epp') || t.includes('microempresa')) riscos.push('Há benefícios/exclusividade para ME/EPP');

    const modalidade = t.includes('pregão eletrônico') ? 'Pregão Eletrônico'
      : t.includes('concorrência') ? 'Concorrência'
      : t.includes('tomada de preços') ? 'Tomada de Preços'
      : t.includes('dispensa') ? 'Dispensa' : 'Não identificada';

    const valorM = texto.match(/R\$\s?[\d.,]+/);
    const checklist = [
      ...docMencoes.juridica, ...docMencoes.fiscal, ...docMencoes.tecnica, ...docMencoes.economica,
      'Proposta comercial assinada', 'Declaração de cumprimento dos requisitos de habilitação',
      'Declaração de inexistência de fatos impeditivos', 'Declaração de trabalho de menores (art. 7º XXXIII CF)',
    ];

    return new Response(JSON.stringify({
      fonte: 'heuristica',
      resumo: 'Análise automática baseada em palavras-chave. Para análise detalhada com IA, configure ANTHROPIC_API_KEY.',
      modalidade,
      valorEstimado: valorM ? valorM[0] : 'Não identificado',
      datas,
      documentosHabilitacao: docMencoes,
      riscos: riscos.length ? riscos : ['Nenhum risco óbvio detectado — revise o edital manualmente'],
      checklist,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
