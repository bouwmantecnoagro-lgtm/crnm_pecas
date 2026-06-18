-- =====================================================================
-- CRM Peças — Recência consolidada por grupo (CNPJ_RAIZ)
-- =====================================================================
-- Rodar UMA VEZ no SQL Editor do Supabase.
--
-- Problema: o mesmo cliente (mesmo CPF/CNPJ) aparece cadastrado em filiais
-- diferentes (matriz + filiais / parceiros na mesma base). Cada cadastro
-- tem seu próprio DIAS_SEM_COMPRA vindo do Protheus. Quem olha cadastro a
-- cadastro marca como "Evasão (>90d)" uma filial parada, mesmo que o cliente
-- tenha comprado ontem em OUTRA filial.
--   Ex.: VANEILA CRISTINA RAUBER (CPF 008.918.959-06)
--        filial 01 → 324 dias (última compra 29/07/2025)  ← falso churn
--        filial 15 →  49 dias (última compra 30/04/2026)  ← compra real
--
-- Esta view consolida a recência por CNPJ_RAIZ (a mesma coluna usada no
-- agrupamento por matriz+filiais — ver 06-cnpj-raiz.sql): devolve a MENOR
-- quantidade de dias sem compra do grupo (= compra mais recente) e qual
-- filial fez essa compra.
--
-- security_invoker = false: igual à crm_winrate_vendedor, a view ignora a
--   RLS por vendedor pra enxergar TODAS as filiais do grupo (16 grupos
--   cruzam vendedores diferentes — sem isso, cada vendedor só veria seu
--   próprio cadastro e a consolidação falharia). NÃO expõe linha crua de
--   cliente — só o agregado de recência por raiz.
--
-- Só grupos com 2+ cadastros ATIVOS entram (having count > 1). Cliente sem
-- duplicata não precisa de consolidação — a API cai no DIAS_SEM_COMPRA dele.
-- =====================================================================

create or replace view public.crm_recencia_grupo
with (security_invoker = false) as
select
  c."CNPJ_RAIZ"                                                        as cnpj_raiz,
  min(c."DIAS_SEM_COMPRA")                                             as dias_grupo,
  max(nullif(c."DATA_ULT_COMPRA"::text, '')::date)                     as data_grupo,
  count(*)                                                             as qtd_cadastros,
  (array_agg(c."FILIAL" order by c."DIAS_SEM_COMPRA" asc nulls last))[1] as filial_recente
from public.crm_clientes c
where c."STATUS_BASE" = 'ATIVO'
  and c."CNPJ_RAIZ" is not null
  and c."DIAS_SEM_COMPRA" is not null
group by c."CNPJ_RAIZ"
having count(*) > 1;

-- Defense-in-depth: nega anon, deixa só authenticated/service_role.
revoke all on public.crm_recencia_grupo from public, anon;
grant select on public.crm_recencia_grupo to authenticated, service_role;

-- Verificação (deve devolver dias_grupo = 49 para a raiz da Vaneila):
-- select * from public.crm_recencia_grupo where cnpj_raiz = '00891895906';
