// Recência consolidada por grupo (CNPJ_RAIZ).
//
// O mesmo cliente (mesmo CPF/CNPJ) pode estar cadastrado em filiais diferentes,
// cada uma com seu DIAS_SEM_COMPRA do Protheus. A "última compra real" do cliente
// é a mais recente entre TODAS as filiais — calculada no servidor pela view
// crm_recencia_grupo (ver sql/10-recencia-grupo.sql) e anexada como
// DIAS_SEM_COMPRA_EFETIVO pela API. Aqui só consumimos com fallback seguro
// (dados demo / cache antigo não têm o campo → cai no DIAS_SEM_COMPRA cru).

// Dias sem compra a usar para classificar churn/evasão. number | null
// (null = sem histórico de compra em nenhuma filial).
export function diasEf(c: any): number | null {
  const ef = c?.DIAS_SEM_COMPRA_EFETIVO;
  if (ef !== null && ef !== undefined) return ef;
  const own = c?.DIAS_SEM_COMPRA;
  return own === undefined ? null : own;
}

// true quando a compra mais recente veio de OUTRA filial do grupo
// (o cadastro local está mais "frio" que o grupo). Usado para o selo.
export function recenciaDeOutraFilial(c: any): boolean {
  return (
    c?.DIAS_SEM_COMPRA_EFETIVO != null &&
    c?.DIAS_SEM_COMPRA != null &&
    c.DIAS_SEM_COMPRA_EFETIVO < c.DIAS_SEM_COMPRA
  );
}
