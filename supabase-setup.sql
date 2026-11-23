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
