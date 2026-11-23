-- Выполните этот код один раз в Supabase: SQL Editor → New query → вставить → Run.
-- Создаёт таблицу для данных Подхода. Каждый пользователь видит и меняет только свои строки.
create table if not exists public.podhod_docs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  coll text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, coll, id)
);

alter table public.podhod_docs enable row level security;

drop policy if exists "podhod read own" on public.podhod_docs;
drop policy if exists "podhod insert own" on public.podhod_docs;
drop policy if exists "podhod update own" on public.podhod_docs;
drop policy if exists "podhod delete own" on public.podhod_docs;

create policy "podhod read own" on public.podhod_docs for select to authenticated using (auth.uid() = user_id);
create policy "podhod insert own" on public.podhod_docs for insert to authenticated with check (auth.uid() = user_id);
create policy "podhod update own" on public.podhod_docs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "podhod delete own" on public.podhod_docs for delete to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on public.podhod_docs to authenticated;

-- ===== Ссылка для тренера (можно выполнять повторно) =====
create table if not exists public.podhod_coach_links (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_name text not null default '',
  created_at timestamptz not null default now()
);
alter table public.podhod_coach_links enable row level security;
drop policy if exists "coach links own" on public.podhod_coach_links;
create policy "coach links own" on public.podhod_coach_links for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.podhod_coach_links to authenticated;

create table if not exists public.podhod_coach_plans (
  token uuid not null references public.podhod_coach_links(token) on delete cascade,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (token, id)
);
alter table public.podhod_coach_plans enable row level security;
drop policy if exists "coach plans owner read" on public.podhod_coach_plans;
create policy "coach plans owner read" on public.podhod_coach_plans for select to authenticated
  using (exists (select 1 from public.podhod_coach_links l where l.token = podhod_coach_plans.token and l.user_id = auth.uid()));
grant select on public.podhod_coach_plans to authenticated;

-- Тренер работает без аккаунта: только через эти функции и только по своему токену.
create or replace function public.podhod_coach_info(p_token uuid) returns json
language sql security definer set search_path = public as $$
  select json_build_object('client', client_name) from podhod_coach_links where token = p_token
$$;

create or replace function public.podhod_coach_list(p_token uuid) returns table(id text, data jsonb)
language sql security definer set search_path = public as $$
  select p.id, p.data from podhod_coach_plans p where p.token = p_token
$$;

create or replace function public.podhod_coach_save(p_token uuid, p_id text, p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from podhod_coach_links where token = p_token) then
    raise exception 'Ссылка недействительна';
  end if;
  if length(p_id) > 100 or pg_column_size(p_data) > 200000 then
    raise exception 'План слишком большой';
  end if;
  if not exists (select 1 from podhod_coach_plans where token = p_token and id = p_id)
     and (select count(*) from podhod_coach_plans where token = p_token) >= 200 then
    raise exception 'Слишком много планов';
  end if;
  insert into podhod_coach_plans(token, id, data, updated_at) values (p_token, p_id, p_data, now())
  on conflict (token, id) do update set data = excluded.data, updated_at = now();
end
$$;

create or replace function public.podhod_coach_delete(p_token uuid, p_id text) returns void
language sql security definer set search_path = public as $$
  delete from podhod_coach_plans where token = p_token and id = p_id
$$;

revoke all on function public.podhod_coach_info(uuid) from public;
revoke all on function public.podhod_coach_list(uuid) from public;
revoke all on function public.podhod_coach_save(uuid, text, jsonb) from public;
revoke all on function public.podhod_coach_delete(uuid, text) from public;
grant execute on function public.podhod_coach_info(uuid) to anon, authenticated;
grant execute on function public.podhod_coach_list(uuid) to anon, authenticated;
grant execute on function public.podhod_coach_save(uuid, text, jsonb) to anon, authenticated;
grant execute on function public.podhod_coach_delete(uuid, text) to anon, authenticated;
