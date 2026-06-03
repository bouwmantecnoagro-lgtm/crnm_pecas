-- =====================================================================
-- CRM Peças — Win Rate comparativo por vendedor (agregado server-side)
-- =====================================================================
-- Rodar UMA VEZ no SQL Editor do Supabase.
-- Alimenta o painel "Performance Comparativa do Vendedor" no dashboard.
--
-- Por que view agregada (e não carregar linhas no front):
--   "taxa histórica do vendedor" = todo o histórico (~157 mil orçamentos).
--   O Postgres conta isso em milissegundos e devolve ~N linhas (1 por vendedor).
--   Carregar tudo no navegador não escala. A API /api/dados corta em 365d justamente
--   por isso — esta view contorna o corte SÓ pra agregados, sem expor linha crua.
--
-- security_invoker = false: a view ignora a RLS por vendedor pra calcular a média
--   do grupo. NÃO expõe orçamento/cliente cru — só contagem de status por vendedor
--   (mesmo nível dos rankings já existentes). Acesso restrito a ADMIN na API.
--
-- Win Rate = FATURADO / (FATURADO + CANCELADO + VENCIDO), por CONTAGEM DE ITENS
--   (consistente com o Ranking de Eficácia). Status "vivo": ABERTO cuja validade já
--   passou conta como VENCIDO. Exclui grupo Bouwman (vendas internas), igual ao
--   default do dashboard. Janelas por ORC_DATA_EMISSAO_ORCAMENTO.
-- =====================================================================

create or replace view public.crm_winrate_vendedor
with (security_invoker = false) as
with base as (
  select
    o."ORC_CODIGO_VENDEDOR"::text         as cod,
    o."ORC_NOME_VENDEDOR"                 as nome,
    o."ORC_DATA_EMISSAO_ORCAMENTO"::date  as emissao,
    case
      when upper(trim(coalesce(nullif(trim(o."STATUS_OVERRIDE"), ''), o."Status"))) in ('ABERTO','EM ABERTO')
           and o."ORC_DATA_ORCAMENTO"::date < current_date then 'VENCIDO'
      else upper(trim(coalesce(nullif(trim(o."STATUS_OVERRIDE"), ''), o."Status")))
    end as status_vivo
  from public.crm_orcamentos o
  where o."ORC_CODIGO_VENDEDOR" is not null
    -- exclui grupo Bouwman (mesma regra de src/lib/vendas-internas.ts)
    and not exists (
      select 1 from public.crm_clientes c
      where c."CODIGO_CLIENTE" = o."CODIGO_CLIENTE"
        and c."LOJA_CLIENTE"   = o."LOJA_CLIENTE"
        and ( c."CNPJ_RAIZ" in ('44850269','79440152','44631608','34305665',
                                '13727475','55590710','48963013','48826304')
              or upper(c."NOME_CLIENTE") like 'BOUWMAN%' )
    )
)
select
  cod,
  max(nome) as nome,
  count(*) filter (where status_vivo in ('FATURADO','CANCELADO','VENCIDO'))                                  as fechados_hist,
  count(*) filter (where status_vivo = 'FATURADO')                                                            as faturados_hist,
  count(*) filter (where status_vivo in ('FATURADO','CANCELADO','VENCIDO') and emissao >= current_date - 365) as fechados_12m,
  count(*) filter (where status_vivo = 'FATURADO'                          and emissao >= current_date - 365) as faturados_12m,
  count(*) filter (where status_vivo in ('FATURADO','CANCELADO','VENCIDO') and emissao >= current_date - 90)  as fechados_90d,
  count(*) filter (where status_vivo = 'FATURADO'                          and emissao >= current_date - 90)  as faturados_90d,
  count(*) filter (where status_vivo in ('FATURADO','CANCELADO','VENCIDO') and emissao >= current_date - 30)  as fechados_30d,
  count(*) filter (where status_vivo = 'FATURADO'                          and emissao >= current_date - 30)  as faturados_30d
from base
group by cod;

-- Defense-in-depth: API já checa ADMIN; aqui negamos anon e deixamos só authenticated/service_role.
revoke all on public.crm_winrate_vendedor from public, anon;
grant select on public.crm_winrate_vendedor to authenticated, service_role;

-- Verificação:
-- select cod, nome, faturados_30d, fechados_30d, faturados_hist, fechados_hist
--   from public.crm_winrate_vendedor order by fechados_hist desc limit 20;
