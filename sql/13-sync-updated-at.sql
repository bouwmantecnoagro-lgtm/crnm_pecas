-- =====================================================================
-- CRM Peças — updated_at vivo nas tabelas sincronizadas com o ERP
--
-- CONTEXTO: updated_at nessas tabelas tinha só DEFAULT now() (momento do
-- INSERT) e nenhum trigger — o upsert do /api/sync não move a coluna. Duas
-- consequências:
--   1. O selo "Última sync" da Visão Geral (max de updated_at no
--      DataContext) só anda quando entra linha NOVA. Com o sync passando
--      de 1x/dia para a cada 3h, cargas sem linha nova pareceriam
--      "não ter rodado".
--   2. Não dá pra distinguir registro vivo (ainda vem na carga) de
--      registro congelado (o ERP parou de enviar — ex.: orçamento
--      010203_00008426, parado como ABERTO desde 16/04/2026).
--
-- Este trigger (moddatetime, extensão padrão do Supabase) carimba
-- updated_at em todo UPDATE — o upsert da carga passa a "tocar" cada
-- linha enviada pelo ERP. updated_at vira "última vez visto na carga".
--
-- Rodar no Supabase SQL Editor. Idempotente.
-- =====================================================================

create extension if not exists moddatetime with schema extensions;

drop trigger if exists trg_sync_updated_at on public.crm_clientes;
create trigger trg_sync_updated_at
  before update on public.crm_clientes
  for each row execute function extensions.moddatetime(updated_at);

drop trigger if exists trg_sync_updated_at on public.crm_orcamentos;
create trigger trg_sync_updated_at
  before update on public.crm_orcamentos
  for each row execute function extensions.moddatetime(updated_at);

drop trigger if exists trg_sync_updated_at on public.crm_parquemaquinas;
create trigger trg_sync_updated_at
  before update on public.crm_parquemaquinas
  for each row execute function extensions.moddatetime(updated_at);
