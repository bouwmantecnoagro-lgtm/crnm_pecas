-- 09 — Indicações de Treinamento (ponte CRM de Peças → CRM de Treinamentos)
-- Rodar no SQL Editor do Supabase. "Success. No rows returned" é o esperado.
--
-- O vendedor de peças indica um cliente para treinamento (handoff p/ a Paola).
-- A linha nasce aqui (Supabase, base compartilhada). O CRM de Treinamentos (Hub,
-- Neon) importa as PENDENTES, cria a oportunidade no pipeline e escreve de volta
-- o status + o id da oportunidade — fechando o rastro até a comissão (R$ 50).
--
-- Mesma estratégia da crm_atividade: RLS LIGADA e SEM policies. Só o service role
-- (admin client, server-side) lê/escreve. Os dois apps acessam por lá; o browser
-- nunca toca nesta tabela.

CREATE TABLE IF NOT EXISTS crm_indicacoes_treinamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Snapshot do cliente indicado (denormalizado do crm_clientes no momento)
  codigo_cliente text,
  loja_cliente   text,
  nome_cliente   text NOT NULL,
  cidade         text,
  uf             text,
  telefone       text,
  email          text,

  -- Quem ganha a bonificação: o vendedor responsável pelo cliente
  vendedor_cod   text,
  vendedor_nome  text,
  -- Quem efetivamente registrou a indicação (auditoria; pode ser um gestor)
  indicado_por_email text,

  -- Conteúdo da indicação
  mensagem    text,                       -- handoff p/ a Paola (opcional)
  origem_tela text DEFAULT 'CLIENTE360',  -- de onde no CRM de Peças veio

  -- Ciclo de vida (espelha o pipeline de Treinamentos)
  --   PENDENTE   → ainda não importada pelo Hub
  --   CONVERTIDA → virou oportunidade no pipeline (oportunidade_id preenchido)
  --   CONCLUIDA  → treinamento fechado (gera comissão)
  --   PERDIDA    → descartada / sem interesse
  status          text NOT NULL DEFAULT 'PENDENTE',
  oportunidade_id text,  -- id da TreinamentoOportunidade no Neon (set no import)

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- O Hub busca as pendentes por aqui (status + ainda sem oportunidade)
CREATE INDEX IF NOT EXISTS idx_indic_treino_pendentes
  ON crm_indicacoes_treinamento (status)
  WHERE oportunidade_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_indic_treino_cliente
  ON crm_indicacoes_treinamento (codigo_cliente, loja_cliente);

CREATE INDEX IF NOT EXISTS idx_indic_treino_vendedor
  ON crm_indicacoes_treinamento (vendedor_cod);

CREATE INDEX IF NOT EXISTS idx_indic_treino_created
  ON crm_indicacoes_treinamento (created_at DESC);

-- Evita duas indicações ABERTAS para o mesmo cliente (defense-in-depth; a API
-- também checa antes de inserir). Indicações já encerradas não bloqueiam novas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_indic_treino_cliente_aberta
  ON crm_indicacoes_treinamento (codigo_cliente, loja_cliente)
  WHERE status IN ('PENDENTE', 'CONVERTIDA');

-- RLS ligada e SEM policies: acesso só pelo service role nos servidores.
ALTER TABLE crm_indicacoes_treinamento ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- Verificação
-- =====================================================================
-- select id, nome_cliente, vendedor_nome, status, oportunidade_id, created_at
--   from crm_indicacoes_treinamento order by created_at desc limit 20;
