-- Bug reportado pelo dono: o dropdown "Área do Direito" (ClientsPage.tsx) era um
-- <input list>/datalist de texto livre — cada variante/erro de digitação virava
-- uma sugestão nova pra sempre. O dono viu "Direito Previdenciario", "Direito
-- Previdenciário", "Direito Providenciaria" e "Previdenciário" coexistindo como
-- 4 opções distintas pra área que deveria ser uma só, enquanto Cível/Criminal/
-- Trabalhista/Tributário/Consumidor apareciam corretamente (1x cada, sem sinal
-- de problema — não mexidas aqui).
--
-- O código foi trocado por um <select> fechado (mesmo commit desta migration —
-- ver GRUPOS_ACAO/AREA_PREVIDENCIARIO em src/lib/utils.ts, compartilhado com
-- ProcessesPage), o que impede o problema de se repetir daqui pra frente. Esta
-- migration só limpa o que já tinha sido digitado antes do fix.
--
-- Normalização best-effort: sem acesso direto ao banco de produção pra
-- levantar a lista exata de variantes existentes, a regex abaixo cobre as 4
-- vistas pelo dono e outras plausíveis da mesma família (prefixo opcional
-- "Direito ", acento opcional, plural opcional, e a troca e→o que gerou
-- "Providenciaria" a partir de "Previdenciária/o"):
--   ^(direito\s+)?pr[eo]vid[eê]nci[aá]ri[ao]s?$    (case-insensitive via ~*)
-- Ex. cobertos: "previdenciario", "Previdenciário", "Direito Previdenciario",
-- "direito previdenciária", "Providenciaria", "Providenciário", plurais.
-- Se depois de aplicada ainda sobrar alguma variante mais exótica no dropdown
-- (typo não coberto por esta regex), é seguro rodar de novo com um padrão mais
-- amplo — o UPDATE é idempotente (só toca linhas que ainda não são exatamente
-- 'Previdenciário').
UPDATE public.clients
   SET area_direito = 'Previdenciário'
 WHERE area_direito IS NOT NULL
   AND area_direito IS DISTINCT FROM 'Previdenciário'
   AND TRIM(area_direito) ~* '^(direito\s+)?pr[eo]vid[eê]nci[aá]ri[ao]s?$';
