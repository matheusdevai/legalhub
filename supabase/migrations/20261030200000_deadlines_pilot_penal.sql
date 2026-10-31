-- Controle de Prazos — piloto (fase 4) e regime penal (fase 5).
--
-- Piloto: os escritórios voluntários usam o controle novo em paralelo ao que já
-- têm por 30 dias. Cada prazo pode guardar a data fatal anotada no controle
-- atual do escritório; qualquer diferença avisa o administrador na hora e
-- precisa de explicação — critério de saída: zero divergência sem explicação.
-- Cada divergência investigada vira caso novo na bateria (casosReais).

-- ── Regime penal (CPP, art. 798) ────────────────────────────────────────────
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'public.deadlines'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%regime%fixado_juiz%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE public.deadlines DROP CONSTRAINT %I', c); END IF;
END $$;
ALTER TABLE public.deadlines ADD CONSTRAINT deadlines_regime_check
  CHECK (regime IN ('civel', 'juizado', 'trabalhista', 'administrativo', 'fixado_juiz', 'penal'));

-- ── Piloto ──────────────────────────────────────────────────────────────────
ALTER TABLE public.deadline_settings ADD COLUMN IF NOT EXISTS pilot_mode boolean NOT NULL DEFAULT false;
ALTER TABLE public.deadlines ADD COLUMN IF NOT EXISTS pilot_reference_date date;
ALTER TABLE public.deadlines ADD COLUMN IF NOT EXISTS pilot_divergence_note text;

-- Ligar/desligar o piloto é da equipe do LegalHub, como ligar a funcionalidade.
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
     and (new.enabled is distinct from (case when tg_op = 'UPDATE' then old.enabled else false end)
          or new.pilot_mode is distinct from (case when tg_op = 'UPDATE' then old.pilot_mode else false end)) then
    raise exception 'Somente a equipe do LegalHub liga ou desliga o Controle de Prazos e o piloto' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

-- Prazo encerrado continua imutável — exceto a explicação da divergência do
-- piloto, que muitas vezes só se descobre depois do protocolo.
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
    if (to_jsonb(new) - 'pilot_divergence_note' - 'updated_at') = (to_jsonb(old) - 'pilot_divergence_note' - 'updated_at') then
      return new;
    end if;
    raise exception 'Prazo encerrado não pode ser alterado' using errcode = '23514';
  end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.tenant_id := old.tenant_id;

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

-- Histórico: inclui as datas do piloto
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
                         'closed_reason','regime','start_event','start_date','amount','unit','doubled',
                         'pilot_reference_date','pilot_divergence_note'];
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
      when new.pilot_reference_date is distinct from old.pilot_reference_date or new.pilot_divergence_note is distinct from old.pilot_divergence_note then 'piloto'
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

-- Divergência do piloto → alerta imediato ao administrador (uma vez por data informada)
CREATE OR REPLACE FUNCTION public.deadlines_alert_pilot_divergence()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_admin record;
  v_title text := 'Piloto: data diferente do controle atual — ' || new.act_type;
  v_msg text := 'O sistema calculou ' || to_char(new.fatal_date, 'DD/MM/YYYY') || ' e o controle atual do escritório tem '
                || to_char(new.pilot_reference_date, 'DD/MM/YYYY') || '. Descubra qual está certa e registre a explicação na ficha.';
begin
  if new.pilot_reference_date is null or new.pilot_reference_date = new.fatal_date then return null; end if;
  if tg_op = 'UPDATE' and new.pilot_reference_date is not distinct from old.pilot_reference_date
     and new.fatal_date is not distinct from old.fatal_date then return null; end if;
  for v_admin in
    select id from public.profiles where tenant_id = new.tenant_id and role in ('admin', 'super_admin', 'superadmin')
  loop
    insert into public.deadline_alerts (tenant_id, subject_id, deadline_id, rule, recipient_id, channel, critical, title, delivered)
    values (new.tenant_id, new.id, new.id, 'divergencia_piloto:' || to_char(new.fatal_date, 'YYYY-MM-DD') || ':' || to_char(new.pilot_reference_date, 'YYYY-MM-DD'),
            v_admin.id, 'app', true, v_title, true)
    on conflict on constraint deadline_alerts_once do nothing;
    if found then
      insert into public.notifications (user_id, type, title, message, read, link)
      values (v_admin.id, 'deadline', v_title, v_msg, false, '/prazos?prazo=' || new.id);
    end if;
  end loop;
  return null;
end;
$function$;
REVOKE EXECUTE ON FUNCTION public.deadlines_alert_pilot_divergence() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_deadlines_alert_pilot AFTER INSERT OR UPDATE OF pilot_reference_date, fatal_date ON public.deadlines
  FOR EACH ROW EXECUTE FUNCTION public.deadlines_alert_pilot_divergence();

-- Painel interno: a equipe do LegalHub acompanha as divergências dos escritórios do piloto.
CREATE POLICY deadlines_super_admin_pilot_read ON public.deadlines FOR SELECT TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('super_admin', 'superadmin')
         AND pilot_reference_date IS NOT NULL);
