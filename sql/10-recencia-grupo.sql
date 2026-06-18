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
-- Considera TODOS os cadastros do mesmo CNPJ raiz (ativo, bloqueado ou inativo):
-- a pergunta é "quando essa empresa comprou pela última vez, em qualquer cadastro".
-- Ex.: DJC Comércio — cadastro F01 BLOQUEADO há 405d + cadastro F10 ATIVO há 27d:
-- o grupo comprou há 27d, então o cadastro bloqueado não deve parecer evasão.
-- (Se filtrasse só ATIVO, grupos com 1 ativo + 1 bloqueado ficavam de fora.)
--
-- Só grupos com 2+ cadastros entram (having count > 1). Cliente sem duplicata
-- não precisa de consolidação — a API cai no DIAS_SEM_COMPRA dele.
-- =====================================================================

create or replace view public.crm_recencia_grupo
with (security_invoker = false) as
select
  c."CNPJ_RAIZ"                                                        as cnpj_raiz,
  min(c."DIAS_SEM_COMPRA")                                             as dias_grupo,
  -- DATA_ULT_COMPRA às vezes vem no formato .NET do Protheus ("/Date(...)/"),
  -- que quebra o cast ::date e derruba o select inteiro da view. Só converte
  -- valores que realmente parecem data ISO (AAAA-MM-DD); o resto vira nulo.
  max(case when c."DATA_ULT_COMPRA"::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
           then (c."DATA_ULT_COMPRA"::text)::date end)                 as data_grupo,
  count(*)                                                             as qtd_cadastros,
  (array_agg(c."FILIAL" order by c."DIAS_SEM_COMPRA" asc nulls last))[1] as filial_recente
from public.crm_clientes c
where c."CNPJ_RAIZ" is not null
  and c."DIAS_SEM_COMPRA" is not null
group by c."CNPJ_RAIZ"
having count(*) > 1;

-- Defense-in-depth: nega anon, deixa só authenticated/service_role.
revoke all on public.crm_recencia_grupo from public, anon;
grant select on public.crm_recencia_grupo to authenticated, service_role;

-- Verificação:
--   Vaneila (2 ativos) -> dias_grupo = 49:
--   select * from public.crm_recencia_grupo where cnpj_raiz = '00891895906';
--   DJC (1 ativo + 1 bloqueado) -> dias_grupo = 27, filial_recente = 10:
--   select * from public.crm_recencia_grupo where cnpj_raiz = '30052511';
