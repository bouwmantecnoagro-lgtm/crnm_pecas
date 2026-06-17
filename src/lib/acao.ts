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

  // 1) Ações do robô (origem SISTEMA_AUTO) — pela regra que as gerou.
  if (tipo === 'REATIVACAO_ORCAMENTO') return CATS.RETENCAO;            // cron REGRA 3
  if (origem === 'SISTEMA_AUTO') {
    if (tipo === 'LIGAR') return CATS.RETENCAO;                          // resgate de churn (REGRA 1)
    if (tipo === 'FOLLOW_UP_ORCAMENTO') return CATS.COMERCIAL;           // follow-up de orçamento (REGRA 2)
  }

  // 2) Ações manuais — pela aba/origem em que o vendedor criou (origemTela do CriarAcaoModal).
  if (origem === 'CARTEIRA') return CATS.RETENCAO;                       // CS Pipeline (Retenção)
  if (origem === 'PIPELINE') return CATS.COMERCIAL;                      // Pipeline Comercial

  // 3) Pelo propósito do tipo (ex.: criada no Cliente360 ou no Painel de Ações).
  if (tipo === 'FOLLOW_UP_ORCAMENTO' || tipo === 'OFERTA_PECAS') return CATS.COMERCIAL;

  // 4) Resto: ações ad-hoc (ligar/whatsapp/visita/outro) criadas à mão.
  return CATS.MANUAL;
}
