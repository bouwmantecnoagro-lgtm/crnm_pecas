-- =====================================================================
-- CRM Peças — Papel COORDENADOR ("ADM da boa")
-- =====================================================================
-- Rodar UMA VEZ no SQL Editor do Supabase, APÓS o deploy do código que
-- reconhece o papel COORDENADOR.
--
-- O que é o COORDENADOR:
--   • VÊ TODOS os dados comerciais (clientes, orçamentos, máquinas, ações),
--     como o admin.
--   • PODE criar / editar / concluir ações de QUALQUER vendedor.
--   • NÃO entra nos painéis de administração (Usuários, Fiscal de Adoção) e
--     NÃO gerencia usuários / não muda papéis — isso continua só do ADMIN.
--
-- Para promover alguém (ex.: o Douglas), use o botão no /admin/usuarios OU:
--   update public.profiles set role = 'COORDENADOR'
--   where email = 'douglas.togeski@bouwman.com.br';
-- =====================================================================

-- 1) Aceitar 'COORDENADOR' como papel válido
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('ADMIN', 'USER', 'PENDING', 'COORDENADOR'));

-- 2) Helper: "vê todos os dados" = ADMIN ou COORDENADOR.
--    is_admin() continua existindo e SEGUE valendo só para ADMIN (gestão de
--    usuários, painéis administrativos) — não mexer nele.
create or replace function public.user_sees_all()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('ADMIN', 'COORDENADOR')
  );
$$;

-- 3) Policies de SELECT em crm_*: troca o ramo "vê tudo" de is_admin() para
--    user_sees_all(). O ramo do vendedor (escopo por código/cliente) continua.

-- crm_clientes
drop policy if exists crm_clientes_select_scope on public.crm_clientes;
create policy crm_clientes_select_scope on public.crm_clientes
  for select to authenticated
  using (
    public.user_sees_all()
    or "VENDEDOR_RESP"::text = any(public.user_cod_vendedores())
  );

-- crm_orcamentos
drop policy if exists crm_orcamentos_select_scope on public.crm_orcamentos;
create policy crm_orcamentos_select_scope on public.crm_orcamentos
  for select to authenticated
  using (
    public.user_sees_all()
    or "ORC_CODIGO_VENDEDOR"::text = any(public.user_cod_vendedores())
  );

-- crm_parquemaquinas (escopo por cliente — vide sql/04)
drop policy if exists crm_parquemaquinas_select_scope on public.crm_parquemaquinas;
create policy crm_parquemaquinas_select_scope on public.crm_parquemaquinas
  for select to authenticated
  using (
    public.user_sees_all()
    or public.crm_parquemaquinas."COD_CLIENTE"::text = any(public.user_client_codes())
  );

-- crm_acoes
drop policy if exists crm_acoes_select_scope on public.crm_acoes;
create policy crm_acoes_select_scope on public.crm_acoes
  for select to authenticated
  using (
    public.user_sees_all()
    or vendedor_responsavel = any(public.user_cod_vendedores())
  );

-- =====================================================================
-- Verificação (como o Douglas, depois de promovido):
--   set local role authenticated;
--   set local request.jwt.claim.sub = '7dd...';  -- uuid do Douglas
--   select count(*) from public.crm_orcamentos;       -- deve ver a base toda
--   select count(*) from public.crm_parquemaquinas;   -- idem
-- =====================================================================
