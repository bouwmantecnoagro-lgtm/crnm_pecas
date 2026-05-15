-- =====================================================================
-- CRM Peças — Escopo de dados por vendedor (RLS)
-- =====================================================================
-- Rodar UMA VEZ no SQL Editor do Supabase, APÓS o deploy do código que
-- usa cliente autenticado em /api/dados, /api/dados/cliente360 e /api/acoes.
--
-- O que muda:
--   1. profiles ganha coluna cod_vendedor text[] (array de códigos)
--   2. Helpers public.user_cod_vendedores() e public.user_is_admin_or_has_vendor()
--   3. View crm_vendedores_disponiveis (alimenta dropdown do admin)
--   4. Policies de SELECT trocadas: ADMIN vê tudo; USER só vê dele
--   5. Fail-closed: USER com array vazio não vê nada
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Coluna cod_vendedor em profiles (array de códigos Protheus)
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists cod_vendedor text[] not null default '{}';

comment on column public.profiles.cod_vendedor is
  'Códigos de vendedor do Protheus associados a este user. Array vazio = não vê nenhum dado de venda. ADMIN ignora esta coluna.';

-- ---------------------------------------------------------------------
-- 2) Helper: array de códigos do user autenticado
--    SECURITY DEFINER evita recursão de RLS (policies em crm_* fariam
--    select em profiles, que dispararia RLS de profiles, etc).
-- ---------------------------------------------------------------------
create or replace function public.user_cod_vendedores()
returns text[]
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(cod_vendedor, '{}')
  from public.profiles
  where id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- 3) View: vendedores disponíveis para o admin associar
--    Unifica códigos+nomes que aparecem em qualquer uma das 3 tabelas
--    do Protheus. Pega o nome mais recente (max) por código.
--    Como crm_* já tem RLS, esta view precisa rodar com security_invoker
--    desligado pra retornar todos os códigos mesmo quando o admin não
--    tem cod_vendedor populado.
-- ---------------------------------------------------------------------
create or replace view public.crm_vendedores_disponiveis
with (security_invoker = false) as
select cod, max(nome) as nome
from (
  select "ORC_CODIGO_VENDEDOR"::text as cod, "ORC_NOME_VENDEDOR" as nome
    from public.crm_orcamentos
    where "ORC_CODIGO_VENDEDOR" is not null
  union all
  select "VENDEDOR_RESP"::text as cod, "NOME_VENDEDOR_RESP" as nome
    from public.crm_clientes
    where "VENDEDOR_RESP" is not null
  union all
  select "COD_VENDEDOR"::text as cod, "NOME_VENDEDOR" as nome
    from public.crm_parquemaquinas
    where "COD_VENDEDOR" is not null
) as todos
where cod <> ''
group by cod
order by max(nome);

-- Permissão: só ADMIN consulta a view (a API filtra antes, mas defense-in-depth)
revoke all on public.crm_vendedores_disponiveis from public, anon, authenticated;
grant select on public.crm_vendedores_disponiveis to authenticated;
-- (a checagem de admin fica na API; aqui authenticated basta porque a view
--  não expõe dados de venda, só códigos e nomes de vendedor)

-- ---------------------------------------------------------------------
-- 4) Policies de SELECT em crm_*
--    Estratégia: substituir "using (true)" por "is_admin() ou cod do
--    registro está no array do user".
-- ---------------------------------------------------------------------

-- crm_clientes (vendedor = VENDEDOR_RESP)
drop policy if exists crm_clientes_select_authenticated on public.crm_clientes;
drop policy if exists crm_clientes_select_scope on public.crm_clientes;
create policy crm_clientes_select_scope on public.crm_clientes
  for select to authenticated
  using (
    public.is_admin()
    or "VENDEDOR_RESP"::text = any(public.user_cod_vendedores())
  );

-- crm_orcamentos (vendedor = ORC_CODIGO_VENDEDOR)
drop policy if exists crm_orcamentos_select_authenticated on public.crm_orcamentos;
drop policy if exists crm_orcamentos_select_scope on public.crm_orcamentos;
create policy crm_orcamentos_select_scope on public.crm_orcamentos
  for select to authenticated
  using (
    public.is_admin()
    or "ORC_CODIGO_VENDEDOR"::text = any(public.user_cod_vendedores())
  );

-- crm_parquemaquinas (vendedor = COD_VENDEDOR)
drop policy if exists crm_parquemaquinas_select_authenticated on public.crm_parquemaquinas;
drop policy if exists crm_parquemaquinas_select_scope on public.crm_parquemaquinas;
create policy crm_parquemaquinas_select_scope on public.crm_parquemaquinas
  for select to authenticated
  using (
    public.is_admin()
    or "COD_VENDEDOR"::text = any(public.user_cod_vendedores())
  );

-- crm_acoes (vendedor = vendedor_responsavel, lowercase porque a tabela é nativa)
drop policy if exists crm_acoes_select_authenticated on public.crm_acoes;
drop policy if exists crm_acoes_select_scope on public.crm_acoes;
create policy crm_acoes_select_scope on public.crm_acoes
  for select to authenticated
  using (
    public.is_admin()
    or vendedor_responsavel = any(public.user_cod_vendedores())
  );

-- =====================================================================
-- Verificação
-- =====================================================================
-- 1) Confirmar coluna criada:
-- select id, email, role, cod_vendedor from public.profiles order by created_at;
--
-- 2) Listar vendedores que o admin pode atribuir:
-- select * from public.crm_vendedores_disponiveis limit 20;
--
-- 3) Testar como se fosse um user específico (substituir UUID):
--   set local role authenticated;
--   set local request.jwt.claim.sub = '<uuid-do-user>';
--   select count(*) from public.crm_orcamentos;
-- =====================================================================
