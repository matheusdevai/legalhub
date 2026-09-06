-- Fixes for critical/high findings from two independent security audits
-- (auth/authz and multi-tenant data isolation). See PR description for the
-- full finding list (F-1..F-6 in this migration; F-3 and F-7 are code-only
-- fixes in supabase/functions/create-user and delete-user; F-8 was already
-- applied directly to production in de60f91).

-- ---------------------------------------------------------------------------
-- F-1 [CRITICAL] profiles_update had no WITH CHECK: any authenticated user
-- could UPDATE their own profiles row and change role/tenant_id/client_id to
-- anything (self-promote to super_admin, or hijack another tenant/client).
-- Postgres only falls back to reusing USING as the check when no WITH CHECK
-- is given at all; here we add an explicit one with two disjoint branches:
--   1) self-update: id must stay the caller's own id, and role/tenant_id/
--      client_id must be unchanged (compared against the pre-update stored
--      value via a same-table subquery, which sees the pre-image because a
--      statement's snapshot never sees its own uncommitted row changes).
--   2) admin-of-another-user: only reachable (per USING) by an admin/
--      super_admin acting within their own tenant; the WITH CHECK additionally
--      pins the target row's tenant_id to the caller's tenant (no cross-tenant
--      reassignment) and blocks *newly assigning* 'admin' or 'super_admin' to
--      someone unless the caller already is 'super_admin' — mirrors the
--      create-user allowlist (F-3): a tenant 'admin' can no longer mint more
--      admins, only super_admin can. The target's role is allowed through
--      unchanged (compared against its own pre-update stored value) so a
--      tenant admin can still edit an existing colleague's name without
--      being blocked just because that colleague already happens to be an
--      admin.
DROP POLICY IF EXISTS "profiles_update" ON "public"."profiles";

CREATE POLICY "profiles_update" ON "public"."profiles"
FOR UPDATE
USING (
  ("id" = ( SELECT "auth"."uid"() AS "uid"))
  OR (
    (( SELECT "profiles_1"."role" FROM "public"."profiles" "profiles_1" WHERE ("profiles_1"."id" = ( SELECT "auth"."uid"() AS "uid"))) = ANY (ARRAY['admin'::"text", 'superadmin'::"text", 'super_admin'::"text"]))
    AND ("tenant_id" = ( SELECT "profiles_1"."tenant_id" FROM "public"."profiles" "profiles_1" WHERE ("profiles_1"."id" = ( SELECT "auth"."uid"() AS "uid"))))
  )
)
WITH CHECK (
  (
    "id" = ( SELECT "auth"."uid"() AS "uid")
    AND "role" IS NOT DISTINCT FROM ( SELECT "profiles_1"."role" FROM "public"."profiles" "profiles_1" WHERE ("profiles_1"."id" = ( SELECT "auth"."uid"() AS "uid")))
    AND "tenant_id" IS NOT DISTINCT FROM ( SELECT "profiles_1"."tenant_id" FROM "public"."profiles" "profiles_1" WHERE ("profiles_1"."id" = ( SELECT "auth"."uid"() AS "uid")))
    AND "client_id" IS NOT DISTINCT FROM ( SELECT "profiles_1"."client_id" FROM "public"."profiles" "profiles_1" WHERE ("profiles_1"."id" = ( SELECT "auth"."uid"() AS "uid")))
  )
  OR (
    "id" <> ( SELECT "auth"."uid"() AS "uid")
    AND (( SELECT "profiles_1"."role" FROM "public"."profiles" "profiles_1" WHERE ("profiles_1"."id" = ( SELECT "auth"."uid"() AS "uid"))) = ANY (ARRAY['admin'::"text", 'superadmin'::"text", 'super_admin'::"text"]))
    AND "tenant_id" = ( SELECT "profiles_1"."tenant_id" FROM "public"."profiles" "profiles_1" WHERE ("profiles_1"."id" = ( SELECT "auth"."uid"() AS "uid")))
    AND (
      "role" IS NOT DISTINCT FROM ( SELECT "profiles_2"."role" FROM "public"."profiles" "profiles_2" WHERE ("profiles_2"."id" = "profiles"."id"))
      OR ("role" <> ALL (ARRAY['admin'::"text", 'super_admin'::"text"]))
      OR ( SELECT "profiles_1"."role" FROM "public"."profiles" "profiles_1" WHERE ("profiles_1"."id" = ( SELECT "auth"."uid"() AS "uid"))) = 'super_admin'
    )
  )
);

-- ---------------------------------------------------------------------------
-- F-2 [CRITICAL] handle_new_user() trusted role/tenant_id straight out of
-- auth.users.raw_user_meta_data, which is 100% client-controlled via
-- supabase.auth.signUp({ options: { data: { role: 'super_admin', ... } } }).
-- Combined with enable_signup=true (public self-registration), anyone could
-- sign up already as super_admin of an arbitrary tenant_id. Role now always
-- starts at the fixed minimum-privilege default ('lawyer') regardless of what
-- the client sent, and tenant_id is never taken from user metadata — it stays
-- NULL until a trusted server-side flow (invite / create-user Edge Function,
-- which already runs under service_role and sets tenant_id from the caller's
-- own verified profile) assigns it.
CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, user_id, name, display_name, email, role, tenant_id, city, avatar, created_at)
  VALUES (
    NEW.id,
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'lawyer',
    NULL,
    NEW.raw_user_meta_data->>'city',
    NULL,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    user_id   = EXCLUDED.user_id,
    name      = EXCLUDED.name,
    display_name = EXCLUDED.display_name,
    email     = EXCLUDED.email,
    city      = EXCLUDED.city;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Nunca falhar o signup por erro no profile
  RAISE WARNING 'handle_new_user error: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- F-4 [MEDIUM/HIGH] storage.objects policies for the 'avatars' bucket allowed
-- `to public` (i.e. unauthenticated) insert/update/delete with no ownership
-- check at all — anyone with no login could overwrite or delete any avatar of
-- any tenant. The only real usage today (ClientsPage.tsx uploadAvatar) writes
-- under `clients/...` with no tenant segment in the path, so we scope the
-- path to `clients/{tenant_id}/...` (ClientsPage.tsx updated in this same PR)
-- and require the caller's own current_tenant_id() to match that segment,
-- mirroring the tenant-isolation pattern already used correctly by the
-- 'documents' bucket. Public read (select) is left untouched — avatars are
-- meant to render via getPublicUrl without auth, and a public bucket serves
-- the object directly regardless of the storage.objects select policy.
DROP POLICY IF EXISTS "Avatars insert" ON "storage"."objects";
DROP POLICY IF EXISTS "Avatars update" ON "storage"."objects";
DROP POLICY IF EXISTS "Avatars delete" ON "storage"."objects";

CREATE POLICY "avatars_tenant_insert"
  ON "storage"."objects"
  AS permissive
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'clients'
    AND (storage.foldername(name))[2] = (public.current_tenant_id())::text
  );

CREATE POLICY "avatars_tenant_update"
  ON "storage"."objects"
  AS permissive
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'clients'
    AND (storage.foldername(name))[2] = (public.current_tenant_id())::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'clients'
    AND (storage.foldername(name))[2] = (public.current_tenant_id())::text
  );

CREATE POLICY "avatars_tenant_delete"
  ON "storage"."objects"
  AS permissive
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'clients'
    AND (storage.foldername(name))[2] = (public.current_tenant_id())::text
  );

-- ---------------------------------------------------------------------------
-- F-5 [CRITICAL] support_tickets/support_messages had GRANT ALL to `anon`
-- plus USING(true)/WITH CHECK(true) policies with no `TO authenticated`
-- restriction — anyone with no login could read or alter every office's
-- support tickets via the REST API directly. SupportChatWidget.tsx and
-- SupportPage.tsx only render behind <PrivateRoute> (see src/App.tsx), but
-- src/pages/auth/Login.tsx (the public /login route) has its own "Fale
-- conosco" widget (sendChat) that does a genuine anonymous INSERT into
-- support_tickets (tenant_id: null, user_id: null, no session) with a
-- mailto: fallback only on error — so an anon INSERT path is real and must
-- keep working. AdminPage.tsx (super_admin only, per AdminRoute) is
-- LegalHub's own cross-tenant support inbox — it deliberately reads tickets
-- from every tenant, so visibility is scoped by role (owner or super_admin),
-- not by tenant_id.
REVOKE ALL ON TABLE "public"."support_tickets" FROM "anon";
REVOKE ALL ON TABLE "public"."support_messages" FROM "anon";

-- Anon keeps INSERT only (never select/update/delete), and only for the
-- "loose" ticket shape the public site widget actually sends: no tenant_id,
-- no user_id (an anonymous visitor is never a member of a tenant or an
-- authenticated user, so both must stay NULL — this also blocks an anon
-- caller from ever attaching their ticket to a real tenant/user_id to try to
-- ride the owner-or-super_admin SELECT policy below).
GRANT INSERT ON TABLE "public"."support_tickets" TO "anon";

DROP POLICY IF EXISTS "tickets_insert" ON "public"."support_tickets";
DROP POLICY IF EXISTS "tickets_insert_anon" ON "public"."support_tickets";
DROP POLICY IF EXISTS "tickets_select" ON "public"."support_tickets";
DROP POLICY IF EXISTS "tickets_update" ON "public"."support_tickets";
DROP POLICY IF EXISTS "messages_insert" ON "public"."support_messages";
DROP POLICY IF EXISTS "messages_select" ON "public"."support_messages";
DROP POLICY IF EXISTS "messages_update" ON "public"."support_messages";

CREATE POLICY "tickets_insert" ON "public"."support_tickets"
  FOR INSERT TO "authenticated"
  WITH CHECK ("user_id" = ( SELECT "auth"."uid"() AS "uid"));

CREATE POLICY "tickets_insert_anon" ON "public"."support_tickets"
  FOR INSERT TO "anon"
  WITH CHECK ("tenant_id" IS NULL AND "user_id" IS NULL);

CREATE POLICY "tickets_select" ON "public"."support_tickets"
  FOR SELECT TO "authenticated"
  USING (
    "user_id" = ( SELECT "auth"."uid"() AS "uid")
    OR EXISTS ( SELECT 1 FROM "public"."profiles" "p" WHERE "p"."id" = ( SELECT "auth"."uid"() AS "uid") AND "p"."role" = 'super_admin')
  );

CREATE POLICY "tickets_update" ON "public"."support_tickets"
  FOR UPDATE TO "authenticated"
  USING ( EXISTS ( SELECT 1 FROM "public"."profiles" "p" WHERE "p"."id" = ( SELECT "auth"."uid"() AS "uid") AND "p"."role" = 'super_admin') )
  WITH CHECK ( EXISTS ( SELECT 1 FROM "public"."profiles" "p" WHERE "p"."id" = ( SELECT "auth"."uid"() AS "uid") AND "p"."role" = 'super_admin') );

CREATE POLICY "messages_insert" ON "public"."support_messages"
  FOR INSERT TO "authenticated"
  WITH CHECK (
    "sender_id" = ( SELECT "auth"."uid"() AS "uid")
    AND EXISTS (
      SELECT 1 FROM "public"."support_tickets" "t"
      WHERE "t"."id" = "support_messages"."ticket_id"
      AND (
        "t"."user_id" = ( SELECT "auth"."uid"() AS "uid")
        OR EXISTS ( SELECT 1 FROM "public"."profiles" "p" WHERE "p"."id" = ( SELECT "auth"."uid"() AS "uid") AND "p"."role" = 'super_admin')
      )
    )
  );

CREATE POLICY "messages_select" ON "public"."support_messages"
  FOR SELECT TO "authenticated"
  USING (
    EXISTS (
      SELECT 1 FROM "public"."support_tickets" "t"
      WHERE "t"."id" = "support_messages"."ticket_id"
      AND (
        "t"."user_id" = ( SELECT "auth"."uid"() AS "uid")
        OR EXISTS ( SELECT 1 FROM "public"."profiles" "p" WHERE "p"."id" = ( SELECT "auth"."uid"() AS "uid") AND "p"."role" = 'super_admin')
      )
    )
  );

CREATE POLICY "messages_update" ON "public"."support_messages"
  FOR UPDATE TO "authenticated"
  USING (
    EXISTS (
      SELECT 1 FROM "public"."support_tickets" "t"
      WHERE "t"."id" = "support_messages"."ticket_id"
      AND (
        "t"."user_id" = ( SELECT "auth"."uid"() AS "uid")
        OR EXISTS ( SELECT 1 FROM "public"."profiles" "p" WHERE "p"."id" = ( SELECT "auth"."uid"() AS "uid") AND "p"."role" = 'super_admin')
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "public"."support_tickets" "t"
      WHERE "t"."id" = "support_messages"."ticket_id"
      AND (
        "t"."user_id" = ( SELECT "auth"."uid"() AS "uid")
        OR EXISTS ( SELECT 1 FROM "public"."profiles" "p" WHERE "p"."id" = ( SELECT "auth"."uid"() AS "uid") AND "p"."role" = 'super_admin')
      )
    )
  );

-- ---------------------------------------------------------------------------
-- F-6 [CRITICAL/HIGH, orphan tables] user_roles/has_role() and
-- categories/custom_columns/items/stock_entries/stock_movements are leftovers
-- from another scaffold: GRANT ALL to anon+authenticated with either no
-- tenant scoping at all, or `TO authenticated USING (true)` (cross-tenant
-- read/write for any logged-in user of any office). Confirmed via
-- repo-wide grep that no file under src/ references any of these six tables
-- (or has_role/user_roles) — there is no UI wired to them today. Per explicit
-- instruction, tables are kept (not dropped) but locked down to service_role
-- only by revoking the anon/authenticated grants; RLS policies are left in
-- place (harmless once the underlying GRANT is gone — PostgREST/PostgreSQL
-- deny access at the privilege level before RLS is ever evaluated).
REVOKE ALL ON TABLE "public"."user_roles" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."categories" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."custom_columns" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."items" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."stock_entries" FROM "anon", "authenticated";
REVOKE ALL ON TABLE "public"."stock_movements" FROM "anon", "authenticated";
