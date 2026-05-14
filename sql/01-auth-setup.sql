-- =====================================================================
-- CRM Peças — Setup de autenticação (Supabase + Microsoft Entra ID)
-- =====================================================================
-- Rodar este script UMA VEZ no SQL Editor do Supabase, após habilitar o
-- provider Azure em Authentication → Providers.
--
-- O que ele faz:
--   1. Cria a tabela public.profiles (espelho de auth.users com role)
--   2. Cria trigger que popula profiles automaticamente no primeiro login
--   3. Habilita RLS em profiles e nas tabelas crm_* existentes
--   4. Define policies: leitura para usuários autenticados, escrita só ADMIN
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tabela profiles
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  nome text,
  role text not null default 'USER' check (role in ('ADMIN', 'USER')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2) Trigger: cria profile no primeiro login
--    fabiano.luz@bouwman.com.br nasce como ADMIN; demais nascem USER.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nome, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
    case
      when lower(new.email) = 'fabiano.luz@bouwman.com.br' then 'ADMIN'
      else 'USER'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 3) Helper: is_admin() — usado pelas policies
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'ADMIN'
  );
$$;

-- ---------------------------------------------------------------------
-- 4) RLS em profiles
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_self_nome" on public.profiles;
create policy "profiles_update_self_nome"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));
-- ↑ usuário pode atualizar o próprio profile mas NÃO pode mudar a própria role

drop policy if exists "profiles_admin_full" on public.profiles;
create policy "profiles_admin_full"
  on public.profiles for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 5) RLS nas tabelas crm_*
--    Estratégia: qualquer usuário autenticado pode LER. Escritas (insert/
--    update/delete) ficam bloqueadas para clientes — só passam via
--    service_role (sync do Protheus, cron, APIs internas). Quando precisar
--    abrir escrita por usuário no front, adicionar policy específica.
--
--    Também removemos a policy legada "allow_all_v1" da crm_acoes, que
--    permitia tudo para todos (inclusive anon) e tornava a RLS inútil.
-- ---------------------------------------------------------------------

-- crm_clientes
alter table public.crm_clientes enable row level security;
drop policy if exists crm_clientes_select_authenticated on public.crm_clientes;
create policy crm_clientes_select_authenticated on public.crm_clientes
  for select to authenticated using (true);

-- crm_orcamentos
alter table public.crm_orcamentos enable row level security;
drop policy if exists crm_orcamentos_select_authenticated on public.crm_orcamentos;
create policy crm_orcamentos_select_authenticated on public.crm_orcamentos
  for select to authenticated using (true);

-- crm_parquemaquinas
alter table public.crm_parquemaquinas enable row level security;
drop policy if exists crm_parquemaquinas_select_authenticated on public.crm_parquemaquinas;
create policy crm_parquemaquinas_select_authenticated on public.crm_parquemaquinas
  for select to authenticated using (true);

-- crm_acoes (já tinha RLS ativa, mas com a policy "porta aberta" allow_all_v1)
alter table public.crm_acoes enable row level security;
drop policy if exists allow_all_v1 on public.crm_acoes;
drop policy if exists crm_acoes_select_authenticated on public.crm_acoes;
create policy crm_acoes_select_authenticated on public.crm_acoes
  for select to authenticated using (true);

-- =====================================================================
-- Verificação rápida (pode rodar separadamente para conferir)
-- =====================================================================
-- select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' and tablename in
--     ('profiles', 'crm_clientes', 'crm_orcamentos', 'crm_parquemaquinas', 'crm_acoes');
--
-- select * from public.profiles;
