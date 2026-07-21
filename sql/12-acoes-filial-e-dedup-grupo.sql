-- ============================================================================
-- 12: Ações — empresa/filial do cadastro + limpeza de resgates duplicados
--
-- Contexto (vídeo do Vanderlei, 07/07/2026 — caso OSMAR ANTONIO CASALI):
--   1. O robô criava 1 "Resgate de Inatividade" por CADASTRO; o mesmo CPF/CNPJ
--      cadastrado nas empresas 01/05/10/15 ganhava várias ações.
--   2. Ao concluir/cancelar, o robô recriava a ação no dia seguinte
--      ("está ficando quase todo dia para ligar para o mesmo cliente").
--   3. O card/modal da ação não mostrava de qual empresa era o cadastro.
--
-- Rodar no SQL Editor do Supabase ANTES do deploy do cron novo.
-- ============================================================================

-- 1) Nova coluna: de qual empresa/filial (01/05/10/15) é o cadastro da ação
alter table crm_acoes add column if not exists filial_cliente text;

-- 2) Backfill das ações existentes, onde o par (código, loja) resolve para
--    UMA única filial (se houver ambiguidade, fica null — o cron novo preenche daqui pra frente)
update crm_acoes a
set filial_cliente = c.filial
from (
  select "CODIGO_CLIENTE" as codigo, "LOJA_CLIENTE" as loja, min("FILIAL") as filial
  from crm_clientes
  group by 1, 2
  having count(distinct "FILIAL") = 1
) c
where a.filial_cliente is null
  and a.codigo_cliente::text = c.codigo::text
  and a.loja_cliente::text = c.loja::text;

-- 3) Dedup dos resgates automáticos ATIVOS: mantém 1 por grupo (CNPJ_RAIZ),
--    priorizando a que o vendedor já mexeu (EM_ANDAMENTO > REAGENDADA > PENDENTE)
--    e, no empate, a mais recente. Só apaga PENDENTE (nunca o que o vendedor tocou).
with mapa as (
  select distinct on ("CODIGO_CLIENTE", "LOJA_CLIENTE")
         "CODIGO_CLIENTE" as codigo, "LOJA_CLIENTE" as loja, nullif("CNPJ_RAIZ", '') as raiz
  from crm_clientes
),
resgates as (
  select a.id, a.status, a.created_at,
         coalesce(m.raiz, a.codigo_cliente || '_' || a.loja_cliente) as grupo
  from crm_acoes a
  left join mapa m
    on m.codigo::text = a.codigo_cliente::text
   and m.loja::text = a.loja_cliente::text
  where a.origem = 'SISTEMA_AUTO'
    and a.tipo = 'LIGAR'
    and a.status in ('PENDENTE', 'EM_ANDAMENTO', 'REAGENDADA')
),
ranqueado as (
  select id, status,
         row_number() over (
           partition by grupo
           order by case status when 'EM_ANDAMENTO' then 0 when 'REAGENDADA' then 1 else 2 end,
                    created_at desc
         ) as rn
  from resgates
)
delete from crm_acoes
where id in (select id from ranqueado where rn > 1 and status = 'PENDENTE');

-- 4) Cooldown retroativo (90 dias): apaga resgates automáticos ainda PENDENTES
--    de grupos em que o vendedor JÁ deu desfecho (concluiu/cancelou um resgate)
--    nos últimos 90 dias — ex.: Osmar tinha desfecho em 26/06 e pendente novo em 08/07.
with mapa as (
  select distinct on ("CODIGO_CLIENTE", "LOJA_CLIENTE")
         "CODIGO_CLIENTE" as codigo, "LOJA_CLIENTE" as loja, nullif("CNPJ_RAIZ", '') as raiz
  from crm_clientes
),
desfechos_recentes as (
  select distinct coalesce(m.raiz, a.codigo_cliente || '_' || a.loja_cliente) as grupo
  from crm_acoes a
  left join mapa m
    on m.codigo::text = a.codigo_cliente::text
   and m.loja::text = a.loja_cliente::text
  where a.origem = 'SISTEMA_AUTO'
    and a.tipo = 'LIGAR'
    and a.status in ('CONCLUIDA', 'CANCELADA')
    and greatest(
          coalesce(a.data_conclusao::timestamptz, 'epoch'::timestamptz),
          coalesce(a.updated_at::timestamptz, 'epoch'::timestamptz)
        ) >= now() - interval '90 days'
),
pendentes as (
  select a.id, coalesce(m.raiz, a.codigo_cliente || '_' || a.loja_cliente) as grupo
  from crm_acoes a
  left join mapa m
    on m.codigo::text = a.codigo_cliente::text
   and m.loja::text = a.loja_cliente::text
  where a.origem = 'SISTEMA_AUTO'
    and a.tipo = 'LIGAR'
    and a.status = 'PENDENTE'
)
delete from crm_acoes
where id in (
  select p.id
  from pendentes p
  join desfechos_recentes d on d.grupo = p.grupo
);

-- Conferência rápida (opcional): grupos que ainda têm mais de 1 resgate ativo — deve ser 0
-- with mapa as (
--   select distinct on ("CODIGO_CLIENTE", "LOJA_CLIENTE")
--          "CODIGO_CLIENTE" as codigo, "LOJA_CLIENTE" as loja, nullif("CNPJ_RAIZ", '') as raiz
--   from crm_clientes
-- )
-- select coalesce(m.raiz, a.codigo_cliente || '_' || a.loja_cliente) as grupo, count(*)
-- from crm_acoes a
-- left join mapa m on m.codigo::text = a.codigo_cliente::text and m.loja::text = a.loja_cliente::text
-- where a.origem = 'SISTEMA_AUTO' and a.tipo = 'LIGAR'
--   and a.status in ('PENDENTE', 'EM_ANDAMENTO', 'REAGENDADA')
-- group by 1 having count(*) > 1;
