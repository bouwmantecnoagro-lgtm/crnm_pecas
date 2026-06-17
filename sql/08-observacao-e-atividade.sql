-- 08 — Observação do cliente + rastreamento de atividade (fiscal de adoção)
-- Rodar no SQL Editor do Supabase. "Success. No rows returned" é o esperado.

-- =====================================================================
-- 1) Observação livre do vendedor no cliente (o sync ERP→cloud NÃO toca nessas colunas)
-- =====================================================================
ALTER TABLE crm_clientes
  ADD COLUMN IF NOT EXISTS "OBSERVACAO_VENDEDOR" text,
  ADD COLUMN IF NOT EXISTS "DATA_OBSERVACAO" timestamptz,
  ADD COLUMN IF NOT EXISTS "QUEM_OBSERVOU" text;

COMMENT ON COLUMN crm_clientes."OBSERVACAO_VENDEDOR" IS
  'Observação livre do vendedor (ex.: cliente tem produto concorrente p/ o qual temos peças). Preenchida pelo app; sync não toca.';

CREATE INDEX IF NOT EXISTS idx_crm_clientes_observacao
  ON crm_clientes ("CODIGO_CLIENTE")
  WHERE "OBSERVACAO_VENDEDOR" IS NOT NULL;

-- =====================================================================
-- 2) Log de atividade — cada acesso e ação relevante do vendedor na ferramenta
-- =====================================================================
CREATE TABLE IF NOT EXISTS crm_atividade (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text,
  vendedor_cod text,
  evento text NOT NULL,          -- ACESSO, CRIAR_ACAO, CONCLUIR_ACAO, REAGENDAR_ACAO, OBSERVACAO_CLIENTE, etc.
  detalhe text,
  codigo_cliente text,
  numero_orcamento text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atividade_user_created   ON crm_atividade (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_atividade_evento_created ON crm_atividade (evento, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_atividade_created        ON crm_atividade (created_at DESC);

-- RLS ligada e SEM policies: acesso só pelo service role (admin client) no servidor.
-- O app nunca lê/escreve essa tabela com o cliente autenticado direto.
ALTER TABLE crm_atividade ENABLE ROW LEVEL SECURITY;
