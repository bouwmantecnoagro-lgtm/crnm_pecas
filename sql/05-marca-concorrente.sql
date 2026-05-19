-- =====================================================================
-- CRM Peças — Marca e modelo concorrentes
-- =====================================================================
-- Rodar UMA VEZ no SQL Editor do Supabase.
--
-- Motivo: quando o vendedor faz uma ação e descobre que o cliente usa
-- máquina de outra marca (concorrente), essa info precisa persistir no
-- cadastro do cliente — pra oferecer consumíveis compatíveis depois e
-- pra ser filtrável na listagem de clientes.
--
-- Esses campos NÃO vêm do Protheus — são escritos pelo app via API
-- /api/acoes/[id] quando o resultado for MAQUINA_OUTRA_MARCA.
-- =====================================================================

ALTER TABLE crm_clientes
  ADD COLUMN IF NOT EXISTS "MARCA_CONCORRENTE" text,
  ADD COLUMN IF NOT EXISTS "MODELO_CONCORRENTE" text,
  ADD COLUMN IF NOT EXISTS "DATA_MARCA_CONCORRENTE" timestamptz;

COMMENT ON COLUMN crm_clientes."MARCA_CONCORRENTE" IS
  'Marca de máquina concorrente identificada via ação MAQUINA_OUTRA_MARCA. Texto livre digitado pelo vendedor.';
COMMENT ON COLUMN crm_clientes."MODELO_CONCORRENTE" IS
  'Modelo da máquina concorrente. Texto livre.';
COMMENT ON COLUMN crm_clientes."DATA_MARCA_CONCORRENTE" IS
  'Quando essa informação foi registrada pela última vez.';

CREATE INDEX IF NOT EXISTS idx_crm_clientes_marca_concorrente
  ON crm_clientes ("MARCA_CONCORRENTE")
  WHERE "MARCA_CONCORRENTE" IS NOT NULL;
