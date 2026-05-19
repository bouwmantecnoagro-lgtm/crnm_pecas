// Helper único para o status efetivo do orçamento.
// STATUS_OVERRIDE é setado pelo CRM (ex: ação "Sem Interesse" cancela) e
// prevalece sobre STATUS vindo do ERP. Sync nunca toca STATUS_OVERRIDE.
export function getStatusOrcamento(o: any): string {
  const raw = o?.STATUS_OVERRIDE || o?.Status || o?.STATUS || '';
  return String(raw).toUpperCase().trim();
}

export const STATUS_FECHADOS = new Set(['FATURADO', 'CANCELADO', 'VENCIDO']);
