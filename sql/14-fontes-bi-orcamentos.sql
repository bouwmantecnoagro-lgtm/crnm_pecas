-- =====================================================================
-- CRM Peças — colunas novas para a troca de fonte dos orçamentos
--
-- CONTEXTO: a view única [dbo].[ORCAMENTO] (campo STATUS congelado no
-- momento da extração) será substituída por 3 views de BI, uma por
-- estado (e-mail do Edilson/TI de 27/08/2026):
--   V_BI_SUPRIMENTOS_ORCAMENTOS  → ABERTO
--   V_BI_ORCAMENTOS_CANCELADOS   → CANCELADO (com motivo/data/usuário)
--   V_BI_SUPRIMENTOS_VENDAS      → FATURADO (linhas com nº de orçamento)
--
-- O status passa a ser derivado da view de origem — o cancelamento
-- finalmente chega ao CRM (caso 010203/00008543: cancelado no Protheus,
-- eternamente ABERTO aqui porque a view antiga não refletia).
--
-- Colunas novas (todas opcionais, não quebram o app atual):
--   ORC_TIPO_OPERACAO    — vem da view de abertos (ex.: VENDA, REMESSA EM
--                          GARANTIA). Guardada para o filtro de funil que
--                          o produto ainda vai definir.
--   MOTIVO_CANCELAMENTO  — Descricao_motivo da view de cancelados.
--   DATA_CANCELAMENTO    — Data_Cancelamento (1900-01-01 = sem data → null).
--
-- Rodar no Supabase SQL Editor (projeto "Intranet"). Idempotente.
-- =====================================================================

alter table public.crm_orcamentos
  add column if not exists "ORC_TIPO_OPERACAO" text,
  add column if not exists "MOTIVO_CANCELAMENTO" text,
  add column if not exists "DATA_CANCELAMENTO" date;
