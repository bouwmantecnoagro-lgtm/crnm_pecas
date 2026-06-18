-- =====================================================================
-- CRM Peças — Agregação dos KPIs de orçamento do Dashboard (server-side)
-- =====================================================================
-- Rodar no SQL Editor do Supabase.
--
-- Por quê: o dashboard baixava ~37 mil orçamentos (≈20 MB, ~38 requisições)
-- só pra somar/contar no navegador. O Postgres faz isso em milissegundos e
-- devolve ~1 KB. Esta função replica EXATAMENTE a lógica do page.tsx
-- (validada pelo oráculo check_dashboard_oracle.mjs), incluindo:
--   - status "vivo": ABERTO com validade vencida vira VENCIDO (igual à
--     crm_winrate_vendedor e ao getStatusVivo do front);
--   - exclusão do grupo Bouwman (mesmos CNPJ raiz / nome BOUWMAN%);
--   - janela de emissão default = últimos 365 dias (= o que o front carrega).
--
-- SECURITY INVOKER (padrão): respeita a RLS por vendedor — cada vendedor vê
-- só o agregado do escopo dele, igual ao comportamento atual (o front carrega
-- via cliente autenticado). NÃO usar security definer aqui (vazaria global).
--
-- Filtros (todos opcionais): vendedor (código), filial, intervalo de emissão,
-- excluir internos (default true). Devolve um JSON com os números prontos.
-- =====================================================================

create or replace function public.dashboard_orcamentos_kpis(
  p_vendedor          text    default null,
  p_filial            text    default null,
  p_emissao_ini       date    default null,
  p_emissao_fim       date    default null,
  p_excluir_internos  boolean default true
) returns jsonb
language sql
stable
as $$
  with params as (
    select coalesce(p_emissao_ini, current_date - 365) as emi_ini,
           coalesce(p_emissao_fim, current_date)        as emi_fim
  ),
  orc as (
    select
      o."ORC_NUMERO_ORCAMENTO"                              as numero,
      coalesce(o."ORC_VALOR_TOTAL", 0)                      as valor,
      nullif(o."ORC_DATA_ORCAMENTO"::text, '')::date        as validade,
      case
        when upper(trim(coalesce(nullif(trim(o."STATUS_OVERRIDE"), ''), o."Status"))) in ('ABERTO','EM ABERTO')
             and nullif(o."ORC_DATA_ORCAMENTO"::text, '')::date < current_date
          then 'VENCIDO'
        else upper(trim(coalesce(nullif(trim(o."STATUS_OVERRIDE"), ''), o."Status")))
      end                                                  as sv
    from crm_orcamentos o, params p
    where nullif(o."ORC_DATA_EMISSAO_ORCAMENTO"::text, '')::date between p.emi_ini and p.emi_fim
      and (p_vendedor is null or o."ORC_CODIGO_VENDEDOR"::text = p_vendedor)
      and (p_filial   is null or o."FILIAL_ORC"::text = p_filial)
      and (
        not p_excluir_internos
        or not exists (
          select 1 from crm_clientes c
          where c."CODIGO_CLIENTE" = o."CODIGO_CLIENTE"
            and c."LOJA_CLIENTE"   = o."LOJA_CLIENTE"
            and ( c."CNPJ_RAIZ" in ('44850269','79440152','44631608','34305665',
                                    '13727475','55590710','48963013','48826304')
                  or upper(c."NOME_CLIENTE") like 'BOUWMAN%' )
        )
      )
  )
  select jsonb_build_object(
    'abertos_valor',   coalesce(sum(valor) filter (where sv in ('ABERTO','EM ABERTO')), 0),
    'abertos_unicos',  count(distinct numero) filter (where sv in ('ABERTO','EM ABERTO')),
    'abertos_itens',   count(*)               filter (where sv in ('ABERTO','EM ABERTO')),
    'fat_qtd',         count(*)               filter (where sv = 'FATURADO'),
    'fat_valor',       coalesce(sum(valor)    filter (where sv = 'FATURADO'), 0),
    'can_qtd',         count(*)               filter (where sv = 'CANCELADO'),
    'can_valor',       coalesce(sum(valor)    filter (where sv = 'CANCELADO'), 0),
    'ven_qtd',         count(*)               filter (where sv = 'VENCIDO'),
    'ven_valor',       coalesce(sum(valor)    filter (where sv = 'VENCIDO'), 0),
    'ven30_qtd',       count(*)               filter (where sv = 'VENCIDO' and validade between current_date - 30 and current_date),
    'ven30_valor',     coalesce(sum(valor)    filter (where sv = 'VENCIDO' and validade between current_date - 30 and current_date), 0)
  )
  from orc;
$$;

revoke all on function public.dashboard_orcamentos_kpis(text, text, date, date, boolean) from public, anon;
grant execute on function public.dashboard_orcamentos_kpis(text, text, date, date, boolean) to authenticated, service_role;

-- Verificação (default, exclui Bouwman) — deve casar com o oráculo:
--   abertos_valor ~ 6.833.778 | abertos_unicos 464 | abertos_itens 1718
--   fat_qtd 27024 | ven30_qtd 1677 | ven30_valor ~ 6.717.058 | ven_valor ~ 7.494.616
-- select public.dashboard_orcamentos_kpis();
