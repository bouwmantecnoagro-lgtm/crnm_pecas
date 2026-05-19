-- =====================================================================
-- CRM Peças — CNPJ raiz para agrupamento de clientes
-- =====================================================================
-- Rodar UMA VEZ no SQL Editor do Supabase.
--
-- Motivo: empresas com vários CNPJs (matriz + filiais) aparecem como
-- clientes separados. O Vanderlei pediu agrupamento por CPF/CNPJ raiz
-- (primeiros 8 dígitos do CNPJ = "raiz" da empresa; CPF = 11 dígitos).
--
-- CNPJ_CPF já vem do Protheus, então NÃO precisa alterar o script
-- sync_erp_bouwman.ps1 — usamos uma coluna GENERATED ALWAYS calculada
-- pelo Postgres a partir de CNPJ_CPF. Zero código de sync.
-- =====================================================================

ALTER TABLE crm_clientes
  ADD COLUMN IF NOT EXISTS "CNPJ_RAIZ" text
  GENERATED ALWAYS AS (
    CASE
      WHEN regexp_replace(COALESCE("CNPJ_CPF", ''), '\D', '', 'g') = '' THEN NULL
      -- CNPJ (14 dígitos) → raiz = primeiros 8 (identifica a empresa-mãe)
      WHEN length(regexp_replace("CNPJ_CPF", '\D', '', 'g')) = 14
        THEN substring(regexp_replace("CNPJ_CPF", '\D', '', 'g'), 1, 8)
      -- CPF (11 dígitos) → usa o número inteiro
      WHEN length(regexp_replace("CNPJ_CPF", '\D', '', 'g')) = 11
        THEN regexp_replace("CNPJ_CPF", '\D', '', 'g')
      ELSE NULL
    END
  ) STORED;

COMMENT ON COLUMN crm_clientes."CNPJ_RAIZ" IS
  'Raiz do CNPJ (8 dígitos) ou CPF inteiro (11 dígitos). Coluna gerada — agrupa filiais da mesma empresa.';

CREATE INDEX IF NOT EXISTS idx_crm_clientes_cnpj_raiz
  ON crm_clientes ("CNPJ_RAIZ")
  WHERE "CNPJ_RAIZ" IS NOT NULL;
