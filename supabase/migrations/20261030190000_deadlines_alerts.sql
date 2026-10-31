-- Controle de Prazos — Fase 3: alertas, escalonamento e vigilância do sistema
-- (especificação, seções 7 e 8). A Edge Function `deadline-alerts` roda a cada
-- 15 min (pg_cron), avalia o cronograma (supabase/functions/_shared/deadlines/alerts.ts)
-- e grava cada aviso UMA vez aqui — a chave única é o que impede duplicar.

-- ── Prova de cada aviso enviado ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deadline_alerts (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id),
  subject_id       uuid NOT NULL,              -- prazo, intimação ou (resumo diário) o escritório
  deadline_id      uuid REFERENCES public.deadlines(id),
  communication_id uuid REFERENCES public.communications(id),
  rule             text NOT NULL,
  recipient_id     uuid NOT NULL REFERENCES public.profiles(id),
  channel          text NOT NULL CHECK (channel IN ('app', 'email', 'whatsapp')),
  critical         boolean NOT NULL DEFAULT false,
  title            text,
  sent_at          timestamptz NOT NULL DEFAULT now(),
  delivered        boolean,
  error            text,
  CONSTRAINT deadline_alerts_once UNIQUE (subject_id, rule, recipient_id, channel)
);
CREATE INDEX IF NOT EXISTS deadline_alerts_deadline ON public.deadline_alerts (deadline_id, sent_at);
CREATE INDEX IF NOT EXISTS deadline_alerts_tenant ON public.deadline_alerts (tenant_id, sent_at);
ALTER TABLE public.deadline_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY deadline_alerts_read ON public.deadline_alerts FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
REVOKE INSERT, UPDATE, DELETE ON public.deadline_alerts FROM anon, authenticated;

-- ── Vigilância: resultado diário de cada verificação ────────────────────────
CREATE TABLE IF NOT EXISTS public.health_checks (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id),
  check_key   text NOT NULL,                  -- 'sync_oab:<profile>', 'email', 'alertas'
  checked_on  date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  ok          boolean NOT NULL,
  detail      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT health_checks_daily UNIQUE (tenant_id, check_key, checked_on)
);
ALTER TABLE public.health_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY health_checks_read ON public.health_checks FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id()
         OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'superadmin'));
REVOKE INSERT, UPDATE, DELETE ON public.health_checks FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.health_checks_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at := now();
  new.created_at := old.created_at;
  return new;
end;
$function$;
REVOKE EXECUTE ON FUNCTION public.health_checks_touch() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_health_checks_touch BEFORE UPDATE ON public.health_checks
  FOR EACH ROW EXECUTE FUNCTION public.health_checks_touch();

-- ── "Conferi as fontes oficiais hoje" ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.source_checks (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   uuid NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants(id),
  checked_by  uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  checked_on  date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS source_checks_day ON public.source_checks (tenant_id, checked_on);
ALTER TABLE public.source_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY source_checks_read ON public.source_checks FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id()
         OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'superadmin'));
-- Só registra a si mesmo, no dia de hoje.
CREATE POLICY source_checks_insert ON public.source_checks FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id() AND checked_by = auth.uid()
              AND checked_on = (now() AT TIME ZONE 'America/Sao_Paulo')::date);
REVOKE UPDATE, DELETE ON public.source_checks FROM anon, authenticated;
CREATE TRIGGER trg_enforce_tenant_active BEFORE INSERT ON public.source_checks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_active();

-- super_admin vê as configurações de todos os escritórios (painel interno de saúde).
CREATE POLICY deadline_settings_super_admin_read ON public.deadline_settings FOR SELECT TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'superadmin'));

-- ── Recálculo para data MAIS CEDO → alerta crítico ao administrador ─────────
-- Imediato (trigger), sem esperar a rotina: é o caso mais perigoso — alguém
-- trabalha com uma data que deixou de valer.
CREATE OR REPLACE FUNCTION public.deadlines_alert_earlier()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_admin record;
  v_rule text := 'recalculo_mais_cedo:' || to_char(new.fatal_date, 'YYYY-MM-DD');
  v_title text := 'Prazo antecipado: ' || new.act_type;
  v_msg text := 'O prazo fatal mudou de ' || to_char(old.fatal_date, 'DD/MM/YYYY') || ' para ' || to_char(new.fatal_date, 'DD/MM/YYYY') || ' (data mais cedo). Confira o cálculo.';
begin
  if new.fatal_date >= old.fatal_date then return null; end if;
  for v_admin in
    select id from public.profiles
     where tenant_id = new.tenant_id and role in ('admin', 'super_admin', 'superadmin')
    union select new.responsible_id
  loop
    insert into public.deadline_alerts (tenant_id, subject_id, deadline_id, rule, recipient_id, channel, critical, title, delivered)
    values (new.tenant_id, new.id, new.id, v_rule, v_admin.id, 'app', true, v_title, true)
    on conflict on constraint deadline_alerts_once do nothing;
    if found then
      insert into public.notifications (user_id, type, title, message, read, link)
      values (v_admin.id, 'deadline', v_title, v_msg, false, '/prazos?prazo=' || new.id);
    end if;
  end loop;
  insert into public.deadline_events (tenant_id, deadline_id, communication_id, kind, actor_id, origin, before, after)
  values (new.tenant_id, new.id, new.communication_id, 'alerta:recalculo_mais_cedo', auth.uid(), 'rotina',
          jsonb_build_object('fatal_date', old.fatal_date), jsonb_build_object('fatal_date', new.fatal_date));
  return null;
end;
$function$;
REVOKE EXECUTE ON FUNCTION public.deadlines_alert_earlier() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_deadlines_alert_earlier AFTER UPDATE OF fatal_date ON public.deadlines
  FOR EACH ROW EXECUTE FUNCTION public.deadlines_alert_earlier();

-- ── Rotina: a cada 15 minutos ───────────────────────────────────────────────
-- Mesmo segredo dos outros crons (Vault 'lawfy_cron_secret', ver CLAUDE.md).
SELECT cron.schedule('lawfy-deadline-alerts', '*/15 * * * *', $cron$
  select net.http_post(
    url := 'https://bdpkkacfsavmpumwftsf.supabase.co/functions/v1/deadline-alerts',
    headers := public.lawfy_cron_headers(),
    body := '{}'::jsonb
  );
$cron$);
