-- =====================================================================
-- CRM Peças — Correção de acesso: Orçamentos/Pipeline (lentidão/timeout)
--                                 + Parque de Máquinas (escopo vazio)
-- =====================================================================
-- Rodar UMA VEZ no SQL Editor do Supabase.
--
-- CONTEXTO (o que vendedores reportaram não conseguir abrir):
--   • TABELA DE ORÇAMENTOS e PIPELINE COMERCIAL: a tabela crm_orcamentos tem
--     ~162 mil linhas e a RLS compara "ORC_CODIGO_VENDEDOR"::text = any(...).
--     O cast ::text impede o uso de índice → toda consulta varre as 162k linhas.
--     O count completo já estoura o statement_timeout (8s → erro 500) e o
--     carregamento normal fica em ~6s, à beira do timeout. Resultado: a tela
--     fica lenta/instável e às vezes não carrega.
--
--   • PARQUE DE MÁQUINAS: a coluna crm_parquemaquinas."COD_VENDEDOR" usa um
--     esquema de código ANTIGO (ex.: '003', '018', 'CO0077') que NÃO existe nos
--     cadastros de vendedor atuais (PVxxxx). Por isso a RLS por COD_VENDEDOR
--     devolve ZERO para TODOS os vendedores. As máquinas, porém, têm COD_CLIENTE
--     preenchido em 100% das linhas → dá pra escopar pelo CLIENTE da carteira.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PARTE 1 — Performance de Orçamentos
-- Índice na MESMA expressão usada pela RLS (com o ::text), tornando a
-- comparação sargável. Com isso a consulta passa a buscar só as ~1,5–3 mil
-- linhas do vendedor por índice, em vez de varrer 162k.
-- ---------------------------------------------------------------------
create index if not exists idx_orcamentos_cod_vendedor_text
  on public.crm_orcamentos ((("ORC_CODIGO_VENDEDOR")::text));

-- Índice na data de emissão (filtro "últimos 365 dias" do painel).
create index if not exists idx_orcamentos_data_emissao
  on public.crm_orcamentos ("ORC_DATA_EMISSAO_ORCAMENTO");

analyze public.crm_orcamentos;


-- ---------------------------------------------------------------------
-- PARTE 2 — Escopo do Parque de Máquinas por CLIENTE
-- Troca a regra "máquina é do vendedor X" (código defasado) por
-- "máquina é de um cliente da carteira do vendedor". Alinha com o
-- propósito do bloco (cross-sell na base instalada do vendedor).
-- ---------------------------------------------------------------------

-- Helper: códigos de cliente da carteira do user autenticado.
-- SECURITY DEFINER (igual user_cod_vendedores) evita recursão de RLS e
-- é avaliado uma vez por consulta (stable).
create or replace function public.user_client_codes()
returns text[]
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(array_agg(distinct "CODIGO_CLIENTE"::text), '{}')
  from public.crm_clientes
  where "VENDEDOR_RESP"::text = any(public.user_cod_vendedores());
$$;

-- Nova policy de SELECT em crm_parquemaquinas: admin vê tudo; vendedor vê as
-- máquinas cujo COD_CLIENTE está na carteira dele.
drop policy if exists crm_parquemaquinas_select_authenticated on public.crm_parquemaquinas;
drop policy if exists crm_parquemaquinas_select_scope on public.crm_parquemaquinas;
create policy crm_parquemaquinas_select_scope on public.crm_parquemaquinas
  for select to authenticated
  using (
    public.is_admin()
    or public.crm_parquemaquinas."COD_CLIENTE"::text = any(public.user_client_codes())
  );


-- =====================================================================
-- Verificação (rodar como o próprio vendedor, trocando o UUID):
--   set local role authenticated;
--   set local request.jwt.claim.sub = '<uuid-do-user>';
--   select count(*) from public.crm_orcamentos;      -- deve responder rápido
--   select count(*) from public.crm_parquemaquinas;  -- deve ser > 0
-- Esperado (medido via service role):
--   Nedson (PV5003)  -> ~577 máquinas
--   Emerson (PV1001) -> ~977 máquinas
--   Vinicius (PV1502)-> ~578 máquinas
-- =====================================================================
