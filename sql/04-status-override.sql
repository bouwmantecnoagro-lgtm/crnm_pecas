-- =====================================================================
-- CRM Peças — STATUS_OVERRIDE em orçamentos
-- =====================================================================
-- Rodar UMA VEZ no SQL Editor do Supabase.
--
-- Motivo: o sync ERP→Supabase é unidirecional e faz UPSERT, sobrescrevendo
-- o STATUS na próxima rodada. Quando o vendedor marca uma ação como
-- "Sem Interesse", precisamos cancelar o orçamento SÓ no Supabase
-- (sem mexer no Protheus). Esse campo NÃO é tocado pelo sync — o front
-- lê como STATUS_OVERRIDE || STATUS.
-- =====================================================================

ALTER TABLE crm_orcamentos
  ADD COLUMN IF NOT EXISTS "STATUS_OVERRIDE" text;

COMMENT ON COLUMN crm_orcamentos."STATUS_OVERRIDE" IS
  'Status definido pelo CRM (não pelo ERP). Quando preenchido, prevalece sobre STATUS na visualização. Usado quando ação "Sem Interesse" cancela o orçamento.';

CREATE INDEX IF NOT EXISTS idx_crm_orcamentos_status_override
  ON crm_orcamentos ("STATUS_OVERRIDE")
  WHERE "STATUS_OVERRIDE" IS NOT NULL;
