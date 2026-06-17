// Categoria (origem/propósito) da ação comercial.
// Fase 1 da "agenda única": derivada de tipo+origem que já existem na crm_acoes.
// Centralizado aqui de propósito — quando virar coluna `categoria` no banco (fase 2),
// basta trocar a lógica desta função, sem mexer nos componentes.

export type CategoriaAcaoKey = 'COMERCIAL' | 'RETENCAO' | 'MANUAL';

export interface CategoriaAcao {
  key: CategoriaAcaoKey;
  label: string;
  chip: string; // classes Tailwind do chip (bg/text/border) no tema escuro do app
}

const CATS: Record<CategoriaAcaoKey, CategoriaAcao> = {
  COMERCIAL: { key: 'COMERCIAL', label: 'Comercial', chip: 'bg-sky-500/20 text-sky-300 border-sky-500/30' },
  RETENCAO:  { key: 'RETENCAO',  label: 'Retenção',  chip: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  MANUAL:    { key: 'MANUAL',    label: 'Manual',    chip: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
};

// Lista pra montar filtros, na ordem em que aparecem na UI.
export const CATEGORIAS_ACAO: CategoriaAcao[] = [CATS.COMERCIAL, CATS.RETENCAO, CATS.MANUAL];

export function getCategoriaAcao(acao: any): CategoriaAcao {
  const tipo = String(acao?.tipo || '').toUpperCase();
  const origem = String(acao?.origem || '').toUpperCase();

  // Retenção / Sucesso do Cliente: reativação de orçamento e resgate de churn (gerados pelo robô).
  if (tipo === 'REATIVACAO_ORCAMENTO') return CATS.RETENCAO;
  if (origem === 'SISTEMA_AUTO' && tipo === 'LIGAR') return CATS.RETENCAO; // resgate de inatividade (cron REGRA 1)

  // Comercial: ligado ao funil de orçamentos / cross-sell de peças.
  if (tipo === 'FOLLOW_UP_ORCAMENTO' || tipo === 'OFERTA_PECAS') return CATS.COMERCIAL;

  // Resto: ações ad-hoc criadas à mão pelo vendedor/gestor.
  return CATS.MANUAL;
}
