-- Controle de Prazos — Fase 2: triagem, prazo, dupla conferência e protocolo.
-- Ver a especificação (seções 3, 6, 9 e 10). As regras críticas ficam AQUI, no
-- banco, e não só na tela: transições de estado, protocolo obrigatório,
-- conferência por outra pessoa, volta para "calculado" se a data mudar depois
-- de conferida, histórico de auditoria só de inclusão.
--
-- A funcionalidade nasce DESLIGADA por escritório (deadline_settings.enabled =
-- false): o motor só é liberado depois da bateria de casos reais (Fase 1).

-- ── Configuração por escritório ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deadline_settings (
  tenant_id            uuid PRIMARY KEY REFERENCES public.tenants(id),
  enabled              boolean NOT NULL DEFAULT false,
  internal_margin_days integer NOT NULL DEFAULT 2 CHECK (internal_margin_days BETWEEN 0 AND 15),
  escalation_hour      integer NOT NULL DEFAULT 14 CHECK (escalation_hour BETWEEN 8 AND 18),
  triage_owner_id      uuid REFERENCES public.profiles(id),
  solo_mode            boolean NOT NULL DEFAULT false,
  updated_at           timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.deadline_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY deadline_settings_read ON public.deadline_settings FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
-- O admin ajusta margem/horário/solo; ligar e desligar (enabled) é só da equipe do LegalHub (trigger abaixo).
CREATE POLICY deadline_settings_admin_write ON public.deadline_settings FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() AND public.is_admin_user())
  WITH CHECK (tenant_id = public.current_tenant_id() AND public.is_admin_user());

CREATE OR REPLACE FUNCTION public.deadline_settings_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_role text;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if coalesce(auth.role(), '') in ('authenticated', 'anon')
     and coalesce(v_role, '') not in ('super_admin', 'superadmin')
     and new.enabled is distinct from (case when tg_op = 'UPDATE' then old.enabled else false end) then
    raise exception 'Somente a equipe do LegalHub liga ou desliga o Controle de Prazos' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$function$;
REVOKE EXECUTE ON FUNCTION public.deadline_settings_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_deadline_settings_guard BEFORE INSERT OR UPDATE ON public.deadline_settings
  FOR EACH ROW EXECUTE FUNCTION public.deadline_settings_guard();

-- super_admin precisa conseguir ligar para qualquer escritório (piloto).
CREATE POLICY deadline_settings_super_admin ON public.deadline_settings FOR ALL TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'superadmin'))
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'superadmin'));

-- ── Intimações (caixa A triar) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.communications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants(id),
  process_id        uuid REFERENCES public.processes(id),
  source            text NOT NULL CHECK (source IN ('djen', 'datajud', 'escavador', 'jusbrasil', 'manual')),
  external_id       text,
  made_available_at date,
  published_at      date,
  delivery_method   text CHECK (delivery_method IN ('djen', 'sistema', 'mandado', 'audiencia', 'outro')),
  court             text,
  organ             text,
  title             text,
  content           text,
  assigned_to       uuid REFERENCES public.profiles(id),
  triage_status     text NOT NULL DEFAULT 'pending' CHECK (triage_status IN ('pending', 'deadline', 'no_deadline', 'duplicate')),
  triage_reason     text,
  triaged_by        uuid REFERENCES public.profiles(id),
  triaged_at        timestamptz,
  duplicate_of      uuid REFERENCES public.communications(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  CONSTRAINT communications_no_deadline_reason CHECK (triage_status <> 'no_deadline' OR length(trim(coalesce(triage_reason, ''))) > 0),
  CONSTRAINT communications_duplicate_of CHECK (triage_status <> 'duplicate' OR duplicate_of IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS communications_external ON public.communications (tenant_id, source, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS communications_pending ON public.communications (tenant_id, created_at) WHERE triage_status = 'pending' AND deleted_at IS NULL;
ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;
CREATE POLICY communications_tenant ON public.communications FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());
REVOKE DELETE ON public.communications FROM anon, authenticated;

-- ── Prazos ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deadlines (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL DEFAULT public.current_tenant_id() REFERENCES public.tenants(id),
  communication_id       uuid REFERENCES public.communications(id),
  process_id             uuid REFERENCES public.processes(id),
  act_type               text NOT NULL CHECK (length(trim(act_type)) > 0),
  regime                 text NOT NULL CHECK (regime IN ('civel', 'juizado', 'trabalhista', 'administrativo', 'fixado_juiz')),
  start_event            text NOT NULL CHECK (start_event IN ('djen', 'sistema_ciencia', 'sistema_tacita', 'juntada', 'audiencia', 'data_inicial')),
  start_date             date NOT NULL,
  amount                 integer NOT NULL CHECK (amount > 0),
  unit                   text NOT NULL CHECK (unit IN ('dias_uteis', 'dias_corridos', 'meses', 'anos')),
  doubled                boolean NOT NULL DEFAULT false,
  doubled_reason         text,
  apply_recess           boolean NOT NULL DEFAULT true,
  court                  text,
  county                 text,
  suggested_fatal_date   date NOT NULL,
  fatal_date             date NOT NULL,
  internal_date          date NOT NULL,
  manually_adjusted      boolean NOT NULL DEFAULT false,
  adjust_reason          text,
  calc_memory            jsonb NOT NULL DEFAULT '[]'::jsonb,
  rules_version          text NOT NULL,
  calendar_version       text,
  status                 text NOT NULL DEFAULT 'calculado' CHECK (status IN ('calculado', 'conferido', 'em_elaboracao', 'pronto', 'protocolado', 'cancelado', 'perdido')),
  responsible_id         uuid NOT NULL REFERENCES public.profiles(id),
  reviewer_id            uuid REFERENCES public.profiles(id),
  reviewed_at            timestamptz,
  review_note            text,
  protocol_at            timestamptz,
  protocol_number        text,
  protocol_file_url      text,
  closed_reason          text,
  task_id                uuid REFERENCES public.tasks(id),
  created_by             uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz,
  CONSTRAINT deadlines_internal_before_fatal CHECK (internal_date <= fatal_date),
  CONSTRAINT deadlines_doubled_reason CHECK (NOT doubled OR length(trim(coalesce(doubled_reason, ''))) > 0),
  CONSTRAINT deadlines_adjust_reason CHECK (NOT manually_adjusted OR length(trim(coalesce(adjust_reason, ''))) > 0),
  CONSTRAINT deadlines_protocol CHECK (status <> 'protocolado' OR (protocol_at IS NOT NULL AND (length(trim(coalesce(protocol_number, ''))) > 0 OR protocol_file_url IS NOT NULL))),
  CONSTRAINT deadlines_closed_reason CHECK (status NOT IN ('cancelado', 'perdido') OR length(trim(coalesce(closed_reason, ''))) > 0)
);
CREATE INDEX IF NOT EXISTS deadlines_open ON public.deadlines (tenant_id, fatal_date) WHERE deleted_at IS NULL AND status NOT IN ('protocolado', 'cancelado', 'perdido');
CREATE INDEX IF NOT EXISTS deadlines_reviewer ON public.deadlines (reviewer_id) WHERE status = 'calculado' AND deleted_at IS NULL;
ALTER TABLE public.deadlines ENABLE ROW LEVEL SECURITY;
CREATE POLICY deadlines_tenant ON public.deadlines FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());
REVOKE DELETE ON public.deadlines FROM anon, authenticated;

-- Regras de transição e conferência (espelhadas em src/lib/deadlines/workflow.ts para a tela)
CREATE OR REPLACE FUNCTION public.deadlines_enforce_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_solo boolean;
  v_calc_changed boolean;
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.status <> 'calculado' then
      raise exception 'Todo prazo nasce como calculado e precisa ser conferido' using errcode = '23514';
    end if;
    new.reviewed_at := null;
    return new;
  end if;

  if old.status in ('protocolado', 'cancelado', 'perdido') then
    raise exception 'Prazo encerrado não pode ser alterado' using errcode = '23514';
  end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.tenant_id := old.tenant_id;

  -- Mudou o cálculo depois de conferido → volta para calculado, precisa de nova conferência
  v_calc_changed := new.fatal_date is distinct from old.fatal_date
    or new.internal_date is distinct from old.internal_date
    or new.start_date is distinct from old.start_date
    or new.amount is distinct from old.amount
    or new.unit is distinct from old.unit
    or new.regime is distinct from old.regime
    or new.start_event is distinct from old.start_event
    or new.doubled is distinct from old.doubled;
  if v_calc_changed and old.status <> 'calculado' then
    new.status := 'calculado';
    new.reviewed_at := null;
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'calculado'     and new.status in ('conferido', 'cancelado', 'perdido')) or
      (old.status = 'conferido'     and new.status in ('em_elaboracao', 'pronto', 'protocolado', 'calculado', 'cancelado', 'perdido')) or
      (old.status = 'em_elaboracao' and new.status in ('pronto', 'protocolado', 'calculado', 'cancelado', 'perdido')) or
      (old.status = 'pronto'        and new.status in ('em_elaboracao', 'protocolado', 'calculado', 'cancelado', 'perdido'))
    ) then
      raise exception 'Transição de % para % não é permitida', old.status, new.status using errcode = '23514';
    end if;

    if new.status = 'conferido' then
      if auth.uid() is not null and new.reviewer_id is distinct from auth.uid() then
        raise exception 'Só o conferente designado pode conferir o prazo' using errcode = '42501';
      end if;
      select coalesce(solo_mode, false) into v_solo from public.deadline_settings where tenant_id = old.tenant_id;
      if new.reviewer_id = old.created_by then
        if not coalesce(v_solo, false) then
          raise exception 'A conferência precisa ser feita por outra pessoa' using errcode = '42501';
        end if;
        if (now() at time zone 'America/Sao_Paulo')::date <= (old.created_at at time zone 'America/Sao_Paulo')::date then
          raise exception 'Escritório solo: a reconferência só pode ser feita a partir do dia seguinte ao cadastro' using errcode = '42501';
        end if;
      end if;
      new.reviewed_at := now();
    end if;
  end if;
  return new;
end;
$function$;
REVOKE EXECUTE ON FUNCTION public.deadlines_enforce_rules() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_deadlines_rules BEFORE INSERT OR UPDATE ON public.deadlines
  FOR EACH ROW EXECUTE FUNCTION public.deadlines_enforce_rules();

-- ── Histórico de auditoria (só inclusão) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deadline_events (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id        uuid NOT NULL REFERENCES public.tenants(id),
  deadline_id      uuid REFERENCES public.deadlines(id),
  communication_id uuid REFERENCES public.communications(id),
  kind             text NOT NULL,
  actor_id         uuid,
  origin           text NOT NULL DEFAULT 'tela',
  before           jsonb,
  after            jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deadline_events_deadline ON public.deadline_events (deadline_id, created_at);
ALTER TABLE public.deadline_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY deadline_events_read ON public.deadline_events FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());
-- Ninguém escreve direto: só os triggers abaixo (SECURITY DEFINER).
REVOKE INSERT, UPDATE, DELETE ON public.deadline_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.deadlines_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_kind text;
  v_origin text := case when auth.uid() is null then 'rotina' else 'tela' end;
  v_keys text[] := array['status','fatal_date','internal_date','suggested_fatal_date','manually_adjusted','adjust_reason',
                         'responsible_id','reviewer_id','review_note','protocol_at','protocol_number','protocol_file_url',
                         'closed_reason','regime','start_event','start_date','amount','unit','doubled'];
  v_before jsonb; v_after jsonb;
begin
  if tg_table_name = 'deadlines' then
    if tg_op = 'INSERT' then
      insert into public.deadline_events (tenant_id, deadline_id, communication_id, kind, actor_id, origin, after)
      values (new.tenant_id, new.id, new.communication_id, 'criado', auth.uid(), v_origin,
              (select jsonb_object_agg(k, to_jsonb(new) -> k) from unnest(v_keys) k));
      return new;
    end if;
    select jsonb_object_agg(k, to_jsonb(old) -> k), jsonb_object_agg(k, to_jsonb(new) -> k)
      into v_before, v_after
      from unnest(v_keys) k where (to_jsonb(old) -> k) is distinct from (to_jsonb(new) -> k);
    if v_after is null then return new; end if;
    v_kind := case
      when new.status is distinct from old.status then 'status:' || new.status
      when new.fatal_date is distinct from old.fatal_date then 'data_alterada'
      when new.responsible_id is distinct from old.responsible_id or new.reviewer_id is distinct from old.reviewer_id then 'responsaveis'
      else 'alterado' end;
    insert into public.deadline_events (tenant_id, deadline_id, communication_id, kind, actor_id, origin, before, after)
    values (new.tenant_id, new.id, new.communication_id, v_kind, auth.uid(), v_origin, v_before, v_after);
  else
    if tg_op = 'UPDATE' and new.triage_status is distinct from old.triage_status then
      insert into public.deadline_events (tenant_id, communication_id, kind, actor_id, origin, before, after)
      values (new.tenant_id, new.id, 'triagem:' || new.triage_status, auth.uid(), v_origin,
              jsonb_build_object('triage_status', old.triage_status),
              jsonb_build_object('triage_status', new.triage_status, 'triage_reason', new.triage_reason, 'duplicate_of', new.duplicate_of));
    elsif tg_op = 'INSERT' then
      insert into public.deadline_events (tenant_id, communication_id, kind, actor_id, origin, after)
      values (new.tenant_id, new.id, 'capturada', auth.uid(), v_origin, jsonb_build_object('source', new.source, 'external_id', new.external_id));
    end if;
  end if;
  return new;
end;
$function$;
REVOKE EXECUTE ON FUNCTION public.deadlines_audit() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_deadlines_audit AFTER INSERT OR UPDATE ON public.deadlines
  FOR EACH ROW EXECUTE FUNCTION public.deadlines_audit();
CREATE TRIGGER trg_communications_audit AFTER INSERT OR UPDATE ON public.communications
  FOR EACH ROW EXECUTE FUNCTION public.deadlines_audit();

-- Triagem registra quem e quando
CREATE OR REPLACE FUNCTION public.communications_triage_stamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.triage_status is distinct from old.triage_status and new.triage_status <> 'pending' then
    new.triaged_by := auth.uid();
    new.triaged_at := now();
  end if;
  return new;
end;
$function$;
REVOKE EXECUTE ON FUNCTION public.communications_triage_stamp() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_communications_triage BEFORE UPDATE ON public.communications
  FOR EACH ROW EXECUTE FUNCTION public.communications_triage_stamp();

-- ── Tarefa espelho (Agenda, Dashboard, caixa "Prazo fatal") ─────────────────
-- Cada prazo mantém uma tarefa type='deadline': due_date = prazo interno,
-- deadline_date = fatal, responsável = responsável do prazo. O trigger de tasks
-- já leva a tarefa para a agenda.
CREATE OR REPLACE FUNCTION public.deadlines_sync_task()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_task uuid;
  v_status text := case new.status
    when 'protocolado' then 'done'
    when 'cancelado' then 'cancelled'
    when 'perdido' then 'cancelled'
    when 'em_elaboracao' then 'in_progress'
    when 'pronto' then 'in_progress'
    else 'pending' end;
  v_name text;
begin
  select coalesce(display_name, name) into v_name from public.profiles where id = new.responsible_id;
  if new.task_id is null then
    insert into public.tasks (tenant_id, title, description, process_id, assigned_to, assigned_name, due_date, deadline_date, priority, status, type, created_by)
    values (new.tenant_id, 'Prazo: ' || new.act_type, 'Controle de Prazos — prazo fatal ' || to_char(new.fatal_date, 'DD/MM/YYYY') || '.',
            new.process_id, new.responsible_id, v_name, new.internal_date, new.fatal_date, 'urgent', v_status, 'deadline', new.created_by)
    returning id into v_task;
    update public.deadlines set task_id = v_task where id = new.id;
  else
    update public.tasks
       set title = 'Prazo: ' || new.act_type,
           description = 'Controle de Prazos — prazo fatal ' || to_char(new.fatal_date, 'DD/MM/YYYY') || '.',
           process_id = new.process_id, assigned_to = new.responsible_id, assigned_name = v_name,
           due_date = new.internal_date, deadline_date = new.fatal_date, status = v_status,
           deleted_at = new.deleted_at
     where id = new.task_id;
  end if;
  return null;
end;
$function$;
REVOKE EXECUTE ON FUNCTION public.deadlines_sync_task() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_deadlines_sync_task AFTER INSERT OR UPDATE OF status, act_type, process_id, responsible_id, internal_date, fatal_date, deleted_at ON public.deadlines
  FOR EACH ROW EXECUTE FUNCTION public.deadlines_sync_task();

-- Escritório em modo somente leitura (teste vencido / assinatura inativa) não altera prazos nem triagem.
CREATE TRIGGER trg_enforce_tenant_active BEFORE INSERT OR UPDATE OR DELETE ON public.communications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_active();
CREATE TRIGGER trg_enforce_tenant_active BEFORE INSERT OR UPDATE OR DELETE ON public.deadlines
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_active();
