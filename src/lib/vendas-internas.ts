// Vendas internas: orçamentos/faturamento destinados a outras empresas do grupo
// Bouwman. Inflam KPIs comerciais porque não são "venda externa" real.
// Identificadas em 2026-05-21 via investigação no Supabase (check_vendas_internas.mjs).
//
// Critério: o cliente cadastrado tem CNPJ_RAIZ em CNPJS_RAIZ_INTERNOS, OU o nome
// do cliente cadastrado começa com "BOUWMAN" (fallback pra casos sem CNPJ_RAIZ).
// Comparação contra o orçamento usa o par (CODIGO_CLIENTE, LOJA_CLIENTE).

export const CNPJS_RAIZ_INTERNOS = new Set<string>([
  '44850269', // BOUWMAN & DJC LTDA
  '79440152', // BOUWMAN TECNOLOGIA AGROPECUARIA LTDA
  '44631608', // BOUWMAN & PAULS LTDA-COMERCIAL
  '34305665', // BOUWMAN INVESTIMENTOS LTDA
  '13727475', // BOUWMAN BRASIL LTDA
  '55590710', // BOUWMAN TOLEDO LTDA-POS VENDAS
  '48963013', // BOUWMAN PARTICIPACOES SOCIETARIAS LTDA
  '48826304', // BOUWMAN TREINAMENTOS LTDA
]);

// Constrói o índice de chaves (CODIGO_CLIENTE_LOJA_CLIENTE) que correspondem a
// clientes do grupo. Use `useMemo` no componente passando `clientes` como dep.
export function buildIndiceVendasInternas(clientes: any[]): Set<string> {
  const set = new Set<string>();
  for (const c of clientes) {
    const raiz = String(c?.CNPJ_RAIZ || '').trim();
    const nome = String(c?.NOME_CLIENTE || '').trim().toUpperCase();
    const isInterno = (raiz && CNPJS_RAIZ_INTERNOS.has(raiz)) || /^BOUWMAN/.test(nome);
    if (isInterno && c.CODIGO_CLIENTE && c.LOJA_CLIENTE) {
      set.add(`${c.CODIGO_CLIENTE}_${c.LOJA_CLIENTE}`);
    }
  }
  return set;
}

// True se o orçamento é para um cliente do grupo Bouwman.
export function isOrcamentoInterno(o: any, indice: Set<string>): boolean {
  if (!o?.CODIGO_CLIENTE || !o?.LOJA_CLIENTE) return false;
  return indice.has(`${o.CODIGO_CLIENTE}_${o.LOJA_CLIENTE}`);
}
