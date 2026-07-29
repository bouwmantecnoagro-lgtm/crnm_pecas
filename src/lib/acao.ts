// Categoria (origem/propósito) da ação comercial.
// Fase 1 da "agenda única": derivada de tipo+origem que já existem na crm_acoes.
// Centralizado aqui de propósito — quando virar coluna `categoria` no banco (fase 2),
// basta trocar a lógica desta função, sem mexer nos componentes.

// Vínculo ação ↔ cliente. Dois detalhes que já morderam:
//
// 1. crm_clientes guarda o código como TEXTO com zeros à esquerda ('003193', loja '01') e
//    crm_acoes.codigo_cliente é coluna INTEIRA, que come o zero no insert (3193, loja 1).
//    Comparar os dois crus não casa nunca.
// 2. O código do cliente é único POR FILIAL, não global: o par (000038, 01) é LAERTE JOEL
//    ALFLEN na filial 01 e RODRIGO BAGATINI na filial 10. São 414 pares repetidos na base.
//    Casar só por código+loja mistura clientes de filiais diferentes.
//
// Por isso o índice abaixo, e não uma comparação solta: quando o par é único ele resolve
// direto; quando repete entre filiais, só casa se a ação souber de qual filial é
// (crm_acoes.filial_cliente). Na dúvida devolve null — melhor não vincular do que vincular
// no cliente errado.
export function chaveCliente(codigo: any, loja: any): string {
  return `${String(codigo ?? '').trim().padStart(6, '0')}_${String(loja ?? '').trim().padStart(2, '0')}`;
}

/**
 * Filial em 2 dígitos. Aceita o formato do cadastro ('01', e alguns poucos '1') e os
 * códigos compostos do Protheus, onde a filial são os 2 primeiros dígitos:
 * orçamento FILIAL_ORC '010206' → '01'; máquina FILIAL '100101' → '10'.
 */
export function filialDe(v: any): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  return (s.length > 2 ? s.slice(0, 2) : s).padStart(2, '0');
}

const padFilial = (f: any) => filialDe(f) ?? '';

export interface IndiceClientes {
  /** Cadastro dono da ação, ou null se a ação não tem cliente ou a chave é ambígua. */
  clienteDaAcao(acao: any): any | null;
  /** A ação pertence a este cadastro? */
  ehDoCliente(acao: any, cliente: any): boolean;
}

export function buildIndiceClientes(clientes: any[]): IndiceClientes {
  const porPar = new Map<string, any[]>();
  for (const c of clientes) {
    const k = chaveCliente(c.CODIGO_CLIENTE, c.LOJA_CLIENTE);
    const lista = porPar.get(k);
    if (lista) lista.push(c); else porPar.set(k, [c]);
  }

  const clienteDaAcao = (acao: any) => {
    if (acao?.codigo_cliente == null) return null;
    const cands = porPar.get(chaveCliente(acao.codigo_cliente, acao.loja_cliente));
    if (!cands?.length) return null;
    if (cands.length === 1) return cands[0];
    const fil = padFilial(acao.filial_cliente);
    if (!acao.filial_cliente) return null;
    return cands.find((c) => padFilial(c.FILIAL) === fil) || null;
  };

  return {
    clienteDaAcao,
    ehDoCliente(acao, cliente) {
      const c = clienteDaAcao(acao);
      if (!c || !cliente) return false;
      return chaveCliente(c.CODIGO_CLIENTE, c.LOJA_CLIENTE) === chaveCliente(cliente.CODIGO_CLIENTE, cliente.LOJA_CLIENTE)
        && padFilial(c.FILIAL) === padFilial(cliente.FILIAL);
    },
  };
}

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
