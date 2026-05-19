// Helper único para o status efetivo do orçamento.
// STATUS_OVERRIDE é setado pelo CRM (ex: ação "Sem Interesse" cancela) e
// prevalece sobre STATUS vindo do ERP. Sync nunca toca STATUS_OVERRIDE.
export function getStatusOrcamento(o: any): string {
  const raw = o?.STATUS_OVERRIDE || o?.Status || o?.STATUS || '';
  return String(raw).toUpperCase().trim();
}

export const STATUS_FECHADOS = new Set(['FATURADO', 'CANCELADO', 'VENCIDO']);

// Mapeamento nome técnico (ERP) → nome comercial (UI).
// O ERP entrega FATURADO/CANCELADO/VENCIDO/ABERTO; o vendedor lê como GANHO/PERDIDO/VENCIDO/ABERTO.
// Use SEMPRE este helper ao renderizar badges, options de filtro, headers de tabela e subtítulos de KPI.
// Lógica interna (Win Rate, STATUS_FECHADOS, queries) continua usando o nome técnico.
export function labelStatusOrcamento(status: string): string {
  const s = String(status || '').toUpperCase().trim();
  if (s === 'FATURADO') return 'GANHO';
  if (s === 'CANCELADO') return 'PERDIDO';
  if (s === 'VENCIDO') return 'VENCIDO';
  if (s === 'ABERTO' || s === 'EM ABERTO' || s === '') return 'ABERTO';
  return s;
}
