-- Calendário forense do Controle de Prazos (Fase 1). Três camadas:
--   national — mantida pelo LegalHub (os feriados nacionais por lei já vêm no
--              motor, src/lib/deadlines/engine.ts; aqui entram exceções nacionais)
--   court    — feriados, suspensões e expedientes alterados por tribunal/comarca,
--              mantidos pelo LegalHub, sempre com a fonte (portaria, resolução, lei)
--   tenant   — o que o escritório identificou e a base ainda não tem; só ele vê
-- Na dúvida, NÃO cadastrar: um dia não útil a mais adia o prazo (perigoso); um a
-- menos o antecipa (seguro). Ver o princípio no topo de engine.ts.

CREATE TABLE IF NOT EXISTS public.court_calendar (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope       text NOT NULL CHECK (scope IN ('national', 'court', 'tenant')),
  tenant_id   uuid REFERENCES public.tenants(id),
  court       text,            -- sigla do tribunal em minúsculas, como em profiles.oab_tribunais (ex.: 'tjpb', 'trt13', 'trf5')
  county      text,            -- comarca; nulo = vale para o tribunal todo
  date_from   date NOT NULL,
  date_to     date NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('holiday', 'no_court', 'outage', 'suspension', 'altered_hours')),
  label       text NOT NULL CHECK (length(trim(label)) > 0),
  source_ref  text,            -- ex.: 'Portaria GP nº 123/2026'
  source_url  text,
  version     integer NOT NULL DEFAULT 1,
  created_by  uuid DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CONSTRAINT court_calendar_range CHECK (date_to >= date_from AND date_to - date_from <= 366),
  CONSTRAINT court_calendar_tenant_scope CHECK ((scope = 'tenant') = (tenant_id IS NOT NULL)),
  CONSTRAINT court_calendar_court_needs_court CHECK (scope <> 'court' OR court IS NOT NULL),
  CONSTRAINT court_calendar_source CHECK (scope = 'tenant' OR length(trim(coalesce(source_ref, ''))) > 0)
);

CREATE INDEX IF NOT EXISTS court_calendar_lookup ON public.court_calendar (court, date_from) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS court_calendar_tenant ON public.court_calendar (tenant_id) WHERE deleted_at IS NULL;

-- Versão e data de alteração: toda mudança numa entrada vira nova versão
-- (o prazo grava calendar_version para saber com qual calendário foi calculado).
CREATE OR REPLACE FUNCTION public.court_calendar_bump_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  return new;
end;
$function$;
REVOKE EXECUTE ON FUNCTION public.court_calendar_bump_version() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_court_calendar_version ON public.court_calendar;
CREATE TRIGGER trg_court_calendar_version BEFORE UPDATE ON public.court_calendar
  FOR EACH ROW EXECUTE FUNCTION public.court_calendar_bump_version();

ALTER TABLE public.court_calendar ENABLE ROW LEVEL SECURITY;

-- Leitura: base nacional/tribunais para todos os usuários logados; camada do escritório só para ele.
CREATE POLICY court_calendar_read ON public.court_calendar FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND (scope IN ('national', 'court') OR tenant_id = public.current_tenant_id()));

-- Camada do escritório: administrador do próprio escritório.
CREATE POLICY court_calendar_tenant_insert ON public.court_calendar FOR INSERT TO authenticated
  WITH CHECK (scope = 'tenant' AND tenant_id = public.current_tenant_id() AND public.is_admin_user());
CREATE POLICY court_calendar_tenant_update ON public.court_calendar FOR UPDATE TO authenticated
  USING (scope = 'tenant' AND tenant_id = public.current_tenant_id() AND public.is_admin_user())
  WITH CHECK (scope = 'tenant' AND tenant_id = public.current_tenant_id() AND public.is_admin_user());

-- Base nacional/tribunais: só super_admin (equipe do LegalHub).
CREATE POLICY court_calendar_base_insert ON public.court_calendar FOR INSERT TO authenticated
  WITH CHECK (scope IN ('national', 'court') AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'superadmin'));
CREATE POLICY court_calendar_base_update ON public.court_calendar FOR UPDATE TO authenticated
  USING (scope IN ('national', 'court') AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'superadmin'))
  WITH CHECK (scope IN ('national', 'court') AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'superadmin'));

-- Sem DELETE: exclusão é lógica (deleted_at), como no resto do sistema.
REVOKE DELETE ON public.court_calendar FROM anon, authenticated;
